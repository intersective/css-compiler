const gulp = require('gulp');
const sass = require('gulp-sass');
const cleanCss = require('gulp-clean-css');
const AWS = require('aws-sdk');
AWS.config.update({region: 'ap-southeast-2'});
const async = require('async');
const fs = require('fs');
const s3 = new AWS.S3();

// Get Sass files from S3 bucket, store them in ./source/scss/
const getSass = (res) => {
	var params = {
		Bucket: "css.practera.com",
		Key: "appv1/css/practera.css"
		// Bucket: "sass.practera.com",
		// Key: "appv1/variables.scss"
	  	// Bucket: "sydney-store-4",
	  	// Key: "testDir/rc.jpg"
	};
	s3.getObject(params, function(err, data) {
	   	if (err) {
	   		return res.json(err)
	   	}
	   	return res.json(data)
	});
	
}

// Compile SASS to CSS
const compile = (body) => {
	let fileName = body.domain.replace(/\./g, '_').toLowerCase() + '-' + 
				body.model.toLowerCase() + '-' + body.model_id  + '.css';
	let filePath = './www/css/' + fileName;

	async.waterfall([
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
			fs.renameSync('./www/css/practera.css', filePath, callback)
		}

	])
}


// Save the config to local file
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
  getSass: getSass,
  compile: compile,
  saveConfig: saveConfig
}


