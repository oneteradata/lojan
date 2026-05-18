const express = require('express');
const app = express();
app.use(express.json({ limit: '250mb' }));
app.post('/test', (req, res) => res.json(req.body));
const server = app.listen(3003, () => {
  const http = require('http');
  const req = http.request({
    hostname: 'localhost', port: 3003, path: '/test', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      console.log(`STATUS: ${res.statusCode}`);
      console.log(`BODY:\n${data}`);
      server.close();
    });
  });
  req.write('{"email": "admin"}');
  req.end();
});
