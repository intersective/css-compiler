const express = require('express');
const app = express();
const gulp = require('gulp');
const sass = require('gulp-sass');
const https = require("https");
const rename = require('gulp-rename');
const cleanCss = require('gulp-clean-css');
const AWS = require('aws-sdk');
AWS.config.update({region: 'ap-southeast-2'});
const async = require('async');
const eachSeries = require('async/eachSeries');
const fs = require('fs');
const shell = require('shelljs');
const s3 = new AWS.S3();
const directoryPath = '/repos/jazzmind/practera-app/contents/scss';
// github token used to access front-end codebase
let gitToken = process.env.GITHUB_TOKEN || '';
// distribution id of cloudfront 'css.practera.app'
let DISTRIBUTION_ID = process.env.DISTRIBUTION_ID || '';
// root dir path
let tmpDir = '/tmp';
// env
const ENV = app.get('env');
if (ENV === 'local') {
	tmpDir = __dirname + '/tmp'
}
const configFile = tmpDir + '/source/scss/config.json';
const scssDir = tmpDir + '/source/scss';



/**
 * Get the CSS according to program id & experience id & domain
 * 
 * @param  {Object} query The query data including program id & experience id & domain
 * @param  {Object} res   Tesponse object
 * @return 
 */
const getCss = (query, res) => {
	async.waterfall([
		(callback) => {
			// use program wide css, go to next step if not found
			let fileName = query.domain.replace(/\./g, '_').toLowerCase() + 
					'-program-' + query.program_id  + '.css';
			checkCss(fileName, (url) => {
				if (url) {
					return res.status(200).json({
					    'success': true,
					    'url': url
					});
				} else {
					callback()
				}
			});
		},

		(callback) => {
			// use experience wide css, go to next step if not found
			fileName = query.domain.replace(/\./g, '_').toLowerCase() + 
					'-experience-' + query.experience_id  + '.css';
			checkCss(fileName, (url) => {
				if (url) {
					return res.status(200).json({
					    'success': true,
					    'url': url
					});
				} else {
					callback()
				}
			});
		},

		(callback) => {
			// use default css, go to next step if not found
			if (query.domain == 'app.practera.com') {
				// app.practera.com still use the old styling
				fileName = 'practera.css';
			} else {
				// app-dev.practera.com & practera.app use the new styling
				fileName = 'practera-v1.4.css';
			}
			checkCss(fileName, (url) => {
				if (url) {
					return res.status(200).json({
					    'success': true,
					    'url': url
					});
				} else {
					callback()
				}
			});
		},

		(callback) => {
			// return error if no css file found
			return res.status(200).json({
			    'success': false,
			    'error': 'no css file found'
			});
		}
	])
}

/**
 * Try to get CSS file
 * Return the signed url if file found
 * Return false if not found
 * 
 * @param  {String}   fileName  The file name to check for
 * @param  {Function} callback  Callback function
 * @return {Function}            Return callback function
 */
const checkCss = (fileName, callback) => {
	var params = {
		Bucket: "css.practera.com",
		Key: "appv1/css/" + fileName
	}
	s3.headObject(params, function (err, metadata) {  
	  if (err && err.code === 'NotFound') {  
	    return callback(false)
	  } else {  
	  	// // signed url will be expire after 1 week
	  	// params.Expires = 3600 * 24 * 7
	   //  return callback(s3.getSignedUrl('getObject', params));
	   
	   // return the link directly since it's public
	   return callback('https://css.practera.app/appv1/css/' + fileName)
	  }
	});
}

/** 
 * Update one CSS file
 * 
 * @param  {Object}   body     [Body parameter]
 * @param  {Function} callback [Callback function]
 * @return 
 */
const update = (body, callback) => {
	async.waterfall([
		// update SASS files
		(callback) => {
			console.log('getSass() started...')
			getSass(body, callback)
		},

		// compile SASS files
		(callback) => {
			console.log('compile() started...')
			compile(body, callback)
		}
	], callback)
}

/**
 * 1. Compile SASS to CSS
 * 2. Save the CSS in local 
 * 3. Upload CSS to S3
 * 
 * @param  {Object} body [Body parameter including domain & model & model_id & color & card]
 * @return 
 */
const compile = (body, callback) => {
	let fileName = '';
	if (body.file_name) {
		fileName = body.file_name;
	} else {
		fileName = body.domain.replace(/\./g, '_').toLowerCase() + '-' + 
					body.model.toLowerCase() + '-' + body.model_id  + '.css';
	}
	let filePath = tmpDir + '/www/css/' + fileName;

	async.waterfall([
		// change customised variables
		(callback) => {
			console.log('--------' + fileName + '--------')
			console.log('changing customised variables...')
			let variables = "$primary: " + body.color + ";" + 
				"$cardImage: url('../img/backgrounds/" + body.card + "');"
		  	fs.writeFile(tmpDir + '/source/scss/custom-variables.scss', variables, callback)
	    },

		// compile
		(callback) => {
			console.log('compiling...')
		  	gulp.src([tmpDir + '/source/scss/practera.scss'])
		    	.pipe(sass())
		    	.pipe(cleanCss({
		      		keepSpecialComments: 0
		    	}))
		    	.pipe(rename(fileName))
		    	.pipe(gulp.dest(tmpDir + '/www/css/'))
		    	.on('end', callback)

			// save config to local file
			saveConfig(body)
	    },

		// upload css file to S3
		(callback) => {
			if (ENV == 'local') {
				callback()
			} else {
				console.log('uploading css file...')
				fs.readFile(filePath, function (err, data) {
				  if (err) { 
				  	throw err; 
				  }

				  let base64data = new Buffer(data, 'binary');

				  s3.putObject({
				    Bucket: 'css.practera.com',
				    Key: 'appv1/css/' + fileName,
				    Body: base64data,
				    ContentType: 'text/css',
				    CacheControl: 'max-age=0',	// do not cache it for cloudfront
				    ACL: 'public-read'		// make the css file public
				  }, callback)
				 //  () => {
				 //  	console.log('invalidating cloudfront...')
				 //  	// invalidate the cloudfront
				 //  	let cloudfront = new AWS.CloudFront();
				 //  	cloudfront.createInvalidation({
					//   DistributionId: DISTRIBUTION_ID, 
					//   InvalidationBatch: { 
					//     CallerReference: Date.now(), 
					//     Paths: { 
					//       Quantity: 1,
					//       Items: [
					//         'appv1/css/' + fileName
					//       ]
					//     }
					//   }
					// }, callback)
				  // })
				})
			}
		}

	], callback)
}

/**
 * Update all css files
 *
 * 1. Update SASS files from S3 bucket
 * 2. Re-compile all CSS files based on the configuration in config.json
 * 3. Upload those CSS files to S3 bucket [included in compile()]
 * 
 * @return {[type]} [description]
 */
const updateAll = (body, callback) => {
	async.waterfall([
		// update SASS files
		(callback) => {
			getSass(body, callback)
		},

		// re-compile all CSS files based on config.json
		(callback) => {
			fs.readFile(configFile, (err, data) => {
				let config = JSON.parse(data)
				eachSeries(config, (modelObj, callback) => {
					eachSeries(modelObj, (modelIdObj, callback) => {
						eachSeries(modelIdObj, (bodyData, callback) => {
							compile(bodyData, callback)
						}, callback)
					}, callback)
				}, callback)
			})
		}
	], callback)
}

/**
 * Get Sass files from S3 bucket, store them in tmp/source/scss/
 * 
 * @param  {Function} callback [Callback function]
 * @return 
 */
const getSass = (body, callback) => {
	async.waterfall([
		// create SASS ionic directory if not exist
		(callback) => {
			console.log('creating SCSS directory...')
			if (!fs.existsSync(scssDir + '/ionic/ionicons')){
			    shell.mkdir('-p', scssDir )
			    if (ENV != 'local') {
				    shell.cp('-R', __dirname + '/tmp/source/scss/ionic/', scssDir + '/ionic/')
				}
			} 
			callback()
		},

		// get SASS files to local
		(callback) => {
			console.log('getting SCSS files...')
			let params = {
				Bucket: "sass.practera.com",
				Delimiter: (body.domain == 'appdev.practera.com') ? 'appv1/develop/ionic' : 'appv1/live/ionic'
			}
			console.log(params)
			s3.listObjects(params, (err, data) => {
				console.log('no. of keys:', data.Contents.length)
				if (err) {
					return console.err(err)
				}
			   	eachSeries(data.Contents, (obj, callback) => {
			   		let fileName = obj.Key
			   		let reqEnv = ''
			   		if (body.domain == 'appdev.practera.com') {
			   			reqEnv = 'develop'
			   		} else {
			   			reqEnv = 'live'
			   		}
			   		let regx = new RegExp("^appv1\/" + reqEnv + "\/");
			   		// don't download config.json for local
					if (!fileName.match(regx) ||
						fileName == 'appv1/' + reqEnv + '/' ||
						(ENV === 'local' && fileName == 'appv1/' + reqEnv + '/config.json')) {
						callback()
					} else {
						fileName = fileName.replace(regx, '/')
						console.log('getting "' + fileName + '" ...')
						let file = fs.createWriteStream(scssDir + fileName)
						s3.getObject({
						    Bucket: "sass.practera.com",
						    Key: obj.Key
						})
						.createReadStream()
						.pipe(file)
						.on('error', (e) => {
							console.error(e)
						})
						.on('finish', callback)
					}
				}, callback)
			})
		}

	], callback)
}

/**
 * Save the config to local file (config.json)
 * 
 * @param  {Object} body  [Body parameter including domain & model & model_id]
 * @return 
 */
const saveConfig = (body, callback) => {
	async.waterfall([
		// create config.json if not exist
		(callback) => {
			console.log('creating config.json file...')
			fs.access(configFile, (err) => {
			  if (err) {
			    fs.writeFile(configFile, '{}', callback)
			  } else {
			  	callback()
			  }
			})
		},

		// update config.json file
		(callback) => {
			console.log('updating config.json file...')
			fs.readFile(configFile, (err, data) => {
				let config = JSON.parse(data)
				if (!config.hasOwnProperty(body.domain)) {
					config[body.domain] = {
						[body.model]: {
							[body.model_id]: body
						}
					}
				} else if (!config[body.domain].hasOwnProperty(body.model)) {
					config[body.domain][body.model] = {
						[body.model_id]: body
					}
				} else {
					config[body.domain][body.model][body.model_id] = body;
				}
				
				fs.writeFile(configFile, JSON.stringify(config), callback);
			})
		},

		// upload config.json back to S3 (if it's not local)
		(callback) => {
			if (ENV === 'local') {
				callback()
			} else {
				console.log('uploading config.json file...')
				fs.readFile(configFile, function (err, data) {
				  if (err) { 
				  	throw err; 
				  }

				  let base64data = new Buffer(data, 'binary');

				  if (body.domain === 'appdev.practera.com') {
				  	reqEnv = 'develop'
				  } else {
				  	reqEnv = 'live'
				  }

				  s3.putObject({
				    Bucket: 'sass.practera.com',
				    Key: 'appv1/' + reqEnv + '/config.json',
				    Body: base64data
				  }, callback);
				});
			}
		}

	], callback)
}
/**
 * - Checks github for changes in the contents/scss folder against the scss folder in the S3 bucket
 * - If a change is found, the changed file is replaced in the S3 folder and then the CSS is compiled
 *
 * @param body (domain)
 * @param callback
 */
const checkDeployedSass = (body, callback) => {

	const isDevelop = body.domain === 'appdev.practera.com';
	let s3Folder = isDevelop ? 'develop' : 'live';
	let branch = isDevelop ? 'develop' : 'release/V1';

	console.log('checking deployment for ' + body.domain + '...')

    getDirectoryFromGithub(directoryPath, branch, function (directory) {
    	let compareFile = function (file) {
            const fileName = file.name;
            const filePath = directoryPath + '/' + fileName;
            const s3FilePath = 'appv1/'+ s3Folder + '/'  + fileName;
            return new Promise(function (resolve, reject) {
                //skip the folder 'ionic'
                if(fileName !== 'ionic'){
                    return getFileFromGithub(filePath, branch).then(function(gitFile) {
                        return getFileFromS3(s3FilePath).then(function(data) {
                            const s3File = data.Body.toString();

                            if (s3File !== gitFile) {
                            	console.log('s3File: ',s3File);
                            	console.log('gitFile: ',gitFile);
                                console.log('A file did change. File name: ', fileName);
                                return putFileInS3({
                                    Bucket: 'sass.practera.com',
                                    Key: s3FilePath,
                                    Body: gitFile
                                }).then(function () {
                                    resolve(true);
                                });
                            } else {
                                resolve(false);
                            }
                        })
                    });
                } else {
                	resolve(false);
				}
            });
        };

        let files = directory.map(compareFile);
        let results = Promise.all(files);

        results.then(function (data) {
        	let compile = false;
            console.log('data:', data);
        	data.find(function (element) {
        		compile = element ? true : element;
            });
            if (compile) {
            	console.log('we do need to compile');
                updateAll(body, callback);
			}
            else {
                callback();
			}
        });

    });
};

function getDirectoryFromGithub(path, ref, callback) {
	let options = {
        host: 'api.github.com',
        path: path + '?ref=' + ref,
        headers: {
            'Authorization': 'token ' + gitToken,
            'Accept': 'application/vnd.github.v3.raw',
            'User-Agent': 'http://developer.github.com/v3/#user-agent-required)'
        }

    };

    https.get(options, function (result) {
        let body = '';
        result.on('data', function(d) {
            body += d;
        });
        result.on('end', function() {
        	callback(JSON.parse(body));
        });
    }).on('error', function (err) {
        console.log('Error, with: ' + err.message);
    });
}

function getFileFromGithub(path, ref) {
    let options = {
        host: 'api.github.com',
        path: path + '?ref=' + ref,
		params: {
            'ref': ref
		},
        headers: {
            'Authorization': 'token ' + gitToken,
            'Accept': 'application/vnd.github.v3.raw',
            'User-Agent': 'http://developer.github.com/v3/#user-agent-required)'
        }
    };

    return new Promise(function (resolve, reject) {
        https.get(options, function (result) {
            let body = '';
            result.on('data', function(d) {
                body += d;
            });
            result.on('end', function() {
                resolve(body);
            });
        }).on('error', function (err) {
            reject('Error, with: ' + err.message);
        });
    });


}

function getFileFromS3(key) {
	const params = {
        Bucket: "sass.practera.com",
        Key: key
	};
	return s3.getObject(params, function (err) {
        if (err)
        	console.log(err, err.stack); // an error occurred
	}).promise();
}

function putFileInS3(params) {
	return s3.putObject(params, function (err) {
        if (err)
            console.log(err, err.stack); // an error occurred
    }).promise();
}

// this is for test only
const test = (callback) => {
	// let params = {
	//     Bucket: "sass.practera.com",
	//     Delimiter: 'appv1/develop/ionic'
	// }
	// s3.listObjects(params, (err, data) => {
	// 	console.log('no. of keys:', data.Contents.length)
	// 	callback(err, data)
	// });
	callback(null, {
		"GitHub_Token": process.env.GITHUB_TOKEN
	})
}

module.exports = {
    getCss: getCss,
    update: update,
    updateAll: updateAll,
    test: test,
    checkDeployedSass: checkDeployedSass
}


