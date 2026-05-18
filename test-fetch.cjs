const endpoint = 'http://localhost:3000/api/login';
const bodyPayload = { email: 'admin@valentina.com', password: 'admin' };

fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(bodyPayload)
}).then(res => res.text()).then(data => {
  console.log("RESPONSE:", data);
  console.log("LENGTH:", data.length);
}).catch(err => console.error(err));
