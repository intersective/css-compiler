const express = require('express');
const app = express();
const http = require('http');
const util = require('util');
const bodyParser = require('body-parser');
const async = require('async');
const action = require(__dirname + '/action');

const port = process.env.PORT || 8888;
app.use(bodyParser.json());

app.get('/', function(req, res) {
	// set header for CORS
	console.log('it works!');
	console.log(req.query);
	res.set({
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
        'Access-Control-Allow-Headers':'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,appkey'
    })
	if (req.query.test) {
		return action.test((err, data) => {
			if (err) {
				res.status(401).json({
				    'success': false,
				    'err': err
				})
			}
			res.status(200).json({
			    'success': true,
			    'data': data
			})
		})
	}

	if (req.query.deployCheck) {
		console.log('is it here?');
        return action.checkDeployedSass();
    }

	// check query data
	if (!req.query.domain || !req.query.experience_id || !req.query.program_id) {
		return res.status(401).json({
		    'status': 'error',
		    'msg': 'missing parameters'
		});
	} else {
        action.getCss(req.query, res)
    }
});

app.post('/', function(req, res) {
	// set header for CORS
	res.set({
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
        'Access-Control-Allow-Headers':'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,appkey'
    })
	if (req.body && 
		req.body.model && 
		req.body.model_id && 
		req.body.domain && 
		req.body.color && 
		req.body.card) {
		// update one css
		action.update(req.body, (err, data) => {
			// if (err) {
			// 	return res.status(401).json({
			// 	    'success': false,
			// 	    'err': err
			// 	})
			// }
			// return res.status(200).json({
			//     'success': true,
			//     'data': data
			// })
		})
		return res.status(200).json({
		    'success': true
		})
	} else if (req.body.domain) {
		// update all css based on configurations stored
		action.updateAll(req.body, (err, data) => {
			// if (err) {
			// 	return res.status(401).json({
			// 	    'success': false,
			// 	    'err': err
			// 	})
			// }
			// return res.status(200).json({
			//     'success': true,
			//     'data': data
			// })
		})
		return res.status(200).json({
		    'success': true
		})
	} else {
		return res.status(401).json({
		    'success': false,
		    'err': 'invalid post data'
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
