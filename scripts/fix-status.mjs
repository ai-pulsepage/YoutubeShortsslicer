import pg from 'pg';
const client = new pg.Client(process.env.DATABASE_URL);
await client.connect();

// Fix ClipProject status to READY
const r1 = await client.query(
  `UPDATE "ClipProject" SET status = 'READY' WHERE "videoId" = 'cmn21l7zh00000eq8uqjpffw7' RETURNING id, status`
);
console.log('ClipProject updated:', r1.rows);

// Check video status
const r2 = await client.query(`SELECT status, duration FROM "Video" WHERE id = 'cmn21l7zh00000eq8uqjpffw7'`);
console.log('Video:', r2.rows);

// Verify segments have correct endTimes
const r3 = await client.query(
  `SELECT count(*) as cnt, min("endTime") as min_end, max("endTime") as max_end FROM "Segment" WHERE "videoId" = 'cmn21l7zh00000eq8uqjpffw7'`
);
console.log('Segments:', r3.rows);

// Show a few example segments
const r4 = await client.query(
  `SELECT id, "startTime", "endTime", title FROM "Segment" WHERE "videoId" = 'cmn21l7zh00000eq8uqjpffw7' ORDER BY "startTime" LIMIT 3`
);
console.log('Sample segments:');
r4.rows.forEach(r => console.log(`  ${r.startTime}s → ${r.endTime}s: "${r.title}"`));

await client.end();
