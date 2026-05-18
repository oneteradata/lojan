const pg = require('pg');

async function test() {
  const client = new pg.Pool(); // won't connect, just wanna see query building
  try {
    const q = { text: 'SELECT $1', values: [NaN] };
    const res = await client.query(q); // wait this requires connection
    console.log("Success");
  } catch(e) {
    console.error("ERROR!!", e);
  }
}
test();
