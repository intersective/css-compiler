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
	// check query data
	if (!req.query.domain || !req.query.experience_id || !req.query.program_id) {
		return res.status(401).json({
		    'status': 'error',
		    'msg': 'missing parameters'
		});
	}
	action.getCss(req.query, res)
});

app.post('/', function(req, res) {
	if (req.body && 
		req.body.model && 
		req.body.model_id && 
		req.body.domain && 
		req.body.color && 
		req.body.card) {
		// update one css
		action.compile(req.body, (err, data) => {
			if (err) {
				return res.status(401).json({
				    'success': false,
				    'err': err
				})
			}
			return res.status(200).json({
			    'success': true,
			    'data': data
			})
		})
	} else {
		// update all css based on configurations stored
		action.updateAll((err, data) => {
			if (err) {
				return res.status(401).json({
				    'success': false,
				    'err': err
				})
			}
			return res.status(200).json({
			    'success': true,
			    'data': data
			})
		})
	}
	
});

if (app.get('env') === 'local') {
  	const server = http.createServer(app).listen(port, () => {
    	console.log('Server listening on port', port);
  	});
} else {
	// use Lambda function to handle the web requests instead of TCP port
	module.exports = app;
}
