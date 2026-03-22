import pg from 'pg';
const client = new pg.Client(process.env.DATABASE_URL);
await client.connect();

const res = await client.query(`
  SELECT id, duration, status, "storagePath" 
  FROM "Video" 
  WHERE id = 'cmn21l7zh00000eq8uqjpffw7'
`);
console.log("=== Video record ===");
console.log(JSON.stringify(res.rows[0], null, 2));

await client.end();
