import pg from 'pg';
const client = new pg.Client(process.env.DATABASE_URL);
await client.connect();

const res = await client.query(`
  SELECT s.id, s."startTime", s."endTime", s."title", s.status 
  FROM "Segment" s
  WHERE s."videoId" = 'cmn21l7zh00000eq8uqjpffw7'
  ORDER BY s."startTime" 
  LIMIT 5
`);
console.log("=== Segment timestamps ===");
res.rows.forEach(r => {
  const duration = r.endTime - r.startTime;
  console.log(`${r.id}: start=${r.startTime}s end=${r.endTime}s dur=${duration}s title="${r.title}" status=${r.status}`);
});

await client.end();
