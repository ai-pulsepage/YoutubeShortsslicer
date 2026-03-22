import pg from 'pg';
const client = new pg.Client(process.env.DATABASE_URL);
await client.connect();

const videoId = 'cmn1vcej500040es1jgtxl1sd';

// Reset back to FAILED so user can use the Retry button  
await client.query(`UPDATE "Video" SET status = 'FAILED', "errorMsg" = 'Ready for retry with Groq' WHERE id = $1`, [videoId]);
await client.query(`UPDATE "ClipProject" SET status = 'FAILED' WHERE "videoId" = $1`, [videoId]);
console.log("✅ Reset to FAILED — use the Retry button in the UI now");

await client.end();
