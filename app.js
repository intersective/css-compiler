var express = require('express');
var app = express();

app.get('/', function(req, res) {
  res.send({
    "Output": "Hello World!"
  });
});

app.post('/', function(req, res) {
  res.send({
    "Output": "Hello World!"
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
