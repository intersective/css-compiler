const gulp = require('gulp');
const sass = require('gulp-sass');
const cleanCss = require('gulp-clean-css');
const AWS = require('aws-sdk');
AWS.config.update({region: 'ap-southeast-2'});
const async = require('async');
const fs = require('fs');
const s3 = new AWS.S3();

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

// Get Sass files from S3 bucket, store them in ./source/scss/
const getSass = (res) => {
	var params = {
		Bucket: "sass.practera.com",
		MaxKeys: 10
	};
	s3.listObjects(params, function(err, data) {
	   	if (err) {
	   		return res.json(err)
	   	}
	   	var files = [];
		data.Contents.forEach((element) => {
		  files.push(element.Key);
		});
	   	return res.send({
	   		"files" : files
	   	})
	});
}


/**
 * 1. Compile SASS to CSS
 * 2. Save the CSS in local 
 * 3. Rename the css file to the correct name
 * 4. Upload CSS to S3
 * 
 * @param  {Object} body [Body parameter including domain & model & model_id & color & card]
 * @return 
 */
const compile = (body) => {
	let fileName = body.domain.replace(/\./g, '_').toLowerCase() + '-' + 
				body.model.toLowerCase() + '-' + body.model_id  + '.css';
	let filePath = './www/css/' + fileName;

	async.waterfall([
		// change customised variables
		(callback) => {
			let variables = "$primary: " + body.color + " !default;" + 
				"$cardImg: url('../img/backgrounds/" + body.card + "') !default;"
		  	fs.writeFile('./source/scss/custom-variables.scss', variables, callback)
	    },

		// compile
		(callback) => {
		  	gulp.src(['./source/scss/practera.scss'])
		    	.pipe(sass())
		    	.pipe(cleanCss({
		      		keepSpecialComments: 0
		    	}))
		    	.pipe(gulp.dest('./www/css/'))
		    	.on('end', callback)

			// save config to local file
			saveConfig(body)
	    },

    	 // delete file if exist
	    (callback) => {
	    	fs.exists(filePath, function (exists) {
				if (exists) {
					fs.unlink(filePath, callback)
				} else {
					callback()
				}
			})
	    },

		// rename file
		(callback) => {
			fs.rename('./www/css/practera.css', filePath, callback)
		},

		// upload css file to S3
		(callback) => {
			fs.readFile(filePath, function (err, data) {
			  if (err) { 
			  	throw err; 
			  }

			  let base64data = new Buffer(data, 'binary');

			  s3.putObject({
			    Bucket: 'sass.practera.com',
			    Key: 'appv1/css/' + fileName,
			    Body: base64data
			  }, callback);

			});
		}

	])
}

const updateAll = () => {

}


/**
 * Save the config to local file (config.json)
 * 
 * @param  {Object} body  [Body parameter including domain & model & model_id]
 * @return 
 */
const saveConfig = (body) => {
	let filePath = './source/config.json';
	
	async.waterfall([
		// create config.json if not exist
		(callback) => {
			fs.access(filePath, (err) => {
			  if (err) {
			    fs.writeFile(filePath, '{}', callback)
			  } else {
			  	callback()
			  }
			})
		},

		// update config.json file
		(callback) => {
			fs.readFile(filePath, (err, data) => {
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
				
				fs.writeFile(filePath, JSON.stringify(config), callback);
			})
		}

	])
}

module.exports = {
  getCss: getCss,
  compile: compile,
  updateAll: updateAll
}


