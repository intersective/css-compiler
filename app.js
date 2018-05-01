const express = require('express');
const http = require('http');
const app = express();
const gulp = require('gulp');
const sass = require('gulp-sass');
const cleanCss = require('gulp-clean-css');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

const port = process.env.PORT || 8888;

app.get('/', function(req, res) {
  res.send({
    "Output": "This is the get request"
  });
});

app.post('/', function(req, res) {
	var params = {
	  	Bucket: "css.practera.com"
 	};
 // 	s3.listObjects(params, function(err, data) {
	//    	if (err) {
	// 		return console.log(err, err.stack); 
	//    	}
	//    	console.log(data);
	// });
  // gulp.src(['./source/scss/practera.scss'])
  //   .pipe(sass())
  //   .pipe(cleanCss({
  //     keepSpecialComments: 0
  //   }))
  //   .pipe(gulp.dest('./www/css/'))
  res.status(200).json({
    status: 'success'
  });
});

if (app.get('env') === 'local') {
  	const server = http.createServer(app).listen(port, () => {
    	console.log('Server listening on port', port);
  	});
} else {
	// use Lambda function to handle the web requests instead of TCP port
	module.exports = app;
}
