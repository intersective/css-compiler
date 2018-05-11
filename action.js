const express = require('express');
const app = express();
const gulp = require('gulp');
const sass = require('gulp-sass');
const rename = require('gulp-rename');
const cleanCss = require('gulp-clean-css');
const AWS = require('aws-sdk');
AWS.config.update({region: 'ap-southeast-2'});
const async = require('async');
const eachSeries = require('async/eachSeries');
const fs = require('fs');
const shell = require('shelljs');
const s3 = new AWS.S3();

// root dir path
let tmpDir = '/tmp'
// env
const ENV = app.get('env')
if (ENV === 'local') {
	tmpDir = __dirname + '/tmp'
}
const configFile = tmpDir + '/source/scss/config.json'
const scssDir = tmpDir + '/source/scss'

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
			fileName = 'practera.css';
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
	  	// signed url will be expire after 10 minutes
	  	params.Expires = 600
	    return callback(s3.getSignedUrl('getObject', params));
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
			getSass(callback)
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
	let fileName = body.domain.replace(/\./g, '_').toLowerCase() + '-' + 
				body.model.toLowerCase() + '-' + body.model_id  + '.css';
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
			console.log('uploading css file...')
			fs.readFile(filePath, function (err, data) {
			  if (err) { 
			  	throw err; 
			  }

			  let base64data = new Buffer(data, 'binary');

			  s3.putObject({
			    Bucket: 'css.practera.com',
			    Key: 'appv1/css/' + fileName,
			    Body: base64data
			  }, callback);

			});
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
const updateAll = (callback) => {
	async.waterfall([
		// update SASS files
		(callback) => {
			getSass(callback)
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
const getSass = (callback) => {
	async.waterfall([
		// create SASS ionic directory if not exist
		(callback) => {
			console.log('creating SCSS directory...')
			if (!fs.existsSync(scssDir + '/ionic/ionicons')){
			    shell.mkdir('-p', scssDir + '/ionic/ionicons')
			    console.log('"' + scssDir + '/ionic/ionicons" created...')
			} 
			callback()
		},

		// get SASS files to local
		(callback) => {
			console.log('getting SCSS files...')
			var params = {
				Bucket: "sass.practera.com"
			}
			s3.listObjects(params, (err, data) => {
			   	eachSeries(data.Contents, (obj, callback) => {
			   		let key = obj.Key
			   		let fileName = key.replace(/appv1/, '')
			   		// don't download config.json for local
					if (fileName == '/' || 
						(ENV === 'local' && fileName == '/config.json')) {
						callback()
					} else {
						let file = fs.createWriteStream(scssDir + fileName)
						s3.getObject({
						    Bucket: "sass.practera.com",
						    Key: key
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

				  s3.putObject({
				    Bucket: 'sass.practera.com',
				    Key: 'appv1/config.json',
				    Body: base64data
				  }, callback);
				});
			}
		}

	], callback)
}

// this is for test only
const test = (callback) => {
	// var params = {
	// 	Bucket: "sass.practera.com",
	// 	Delimiter: 'appv1/ionic'
	// };
	// let file = fs.createWriteStream('./tmp/test.scss')
	// s3.getObject({
	//     Bucket: "sass.practera.com",
	//     Key: 'appv1/list.scss'
	// })
	// .createReadStream()
	// .pipe(file)
	s3.getObject({
	    Bucket: "sass.practera.com",
	    Key: 'appv1/list.scss'
	}, callback);
}

module.exports = {
  getCss: getCss,
  update: update,
  updateAll: updateAll,
  test: test
}


