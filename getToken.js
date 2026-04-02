require('dotenv').config();
const https = require('https');

const email = process.env.SURGE_EMAIL;
const password = process.env.SURGE_PASSWORD;

const req = https.request({
  hostname: 'api.surge.sh',
  path: '/token',
  method: 'POST',
  headers: {
    'Authorization': 'Basic ' + Buffer.from(email + ':' + password).toString('base64')
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Token/Response:', data.trim());
  });
});

req.on('error', (e) => {
  console.error(e);
});

req.end();
