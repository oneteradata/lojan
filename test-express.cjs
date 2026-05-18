const express = require('express');
const app = express();

app.use(express.json());

app.post('/test', (req, res) => res.send('ok'));

const server = app.listen(3002, () => {
  const http = require('http');
  const req = http.request({
    hostname: 'localhost',
    port: 3002,
    path: '/test',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      console.log(`STATUS: ${res.statusCode}`);
      console.log(`LENGTH: ${data.length}`);
      console.log(`BODY:\n${data}`);
      server.close();
    });
  });
  req.write('{ bad json ');
  req.end();
});
