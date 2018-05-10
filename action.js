const gulp = require('gulp');
const sass = require('gulp-sass');
const rename = require('gulp-rename');
const cleanCss = require('gulp-clean-css');
const AWS = require('aws-sdk');
AWS.config.update({region: 'ap-southeast-2'});
const async = require('async');
const eachSeries = require('async/eachSeries');
const fs = require('fs');
const s3 = new AWS.S3();

const configFile = __dirname + '/source/config.json'

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
	let filePath = __dirname + '/www/css/' + fileName;

	async.waterfall([
		// change customised variables
		(callback) => {
			let variables = "$primary: " + body.color + " !default;" + 
				"$cardImg: url('../img/backgrounds/" + body.card + "') !default;"
		  	fs.writeFile(__dirname + '/source/scss/custom-variables.scss', variables, callback)
	    },

		// compile
		(callback) => {
		  	gulp.src([__dirname + '/source/scss/practera.scss'])
		    	.pipe(sass())
		    	.pipe(cleanCss({
		      		keepSpecialComments: 0
		    	}))
		    	.pipe(rename(fileName))
		    	.pipe(gulp.dest(__dirname + '/www/css/'))
		    	.on('end', callback)

			// save config to local file
			saveConfig(body)
	    },

		// upload css file to S3
		(callback) => {
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
		// (callback) => {
		// 	getSass(callback)
		// },

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

// Get Sass files from S3 bucket, store them in ./source/scss/
const getSass = (callback) => {
	var params = {
		Bucket: "sass.practera.com",
		MaxKeys: 10
	};
	s3.listObjects(params, function(err, data) {
	   	if (err) {
	   		
	   	}
	   	var files = [];
		data.Contents.forEach((element) => {
		  files.push(element.Key);
		});
	});
}

/**
 * Save the config to local file (config.json)
 * 
 * @param  {Object} body  [Body parameter including domain & model & model_id]
 * @return 
 */
const saveConfig = (body) => {
	async.waterfall([
		// create config.json if not exist
		(callback) => {
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
		}

	])
}

module.exports = {
  getCss: getCss,
  compile: compile,
  updateAll: updateAll
}


