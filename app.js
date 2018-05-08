const express = require('express');
const http = require('http');
const util = require('util');
const app = express();
const bodyParser = require('body-parser');
const async = require('async');
const action = require('./action');

const port = process.env.PORT || 8888;
app.use(bodyParser.json());

app.get('/', function(req, res) {
	action.getSass(res)
	// action.saveConfig({"model":"Program","model_id":4,"domain":"app.practera.com","color":"#ffe600","card":"memphis-light.png"})
  // res.send({
  //   "Output": "This is the get request ",
  //   "action" : action
  // });
});

app.post('/', function(req, res) {
	async.waterfall([
		// (callback) => {
		// 	action.getSass(callback)
		// },
		
		(callback) => {
			if (req.body && 
				req.body.model && 
				req.body.model_id && 
				req.body.domain && 
				req.body.color && 
				req.body.card) {
				// update one css
				action.compile(req.body);
			} else {
				// update all css
			}
		}
	])
	

	return res.status(200).json({
	    'status': 'success'
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
