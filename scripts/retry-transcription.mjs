import pg from 'pg';
const client = new pg.Client(process.env.DATABASE_URL);
await client.connect();

const videoId = 'cmn21l7zh00000eq8uqjpffw7';

// Reset to FAILED so user can hit Retry button which goes through Railway's Redis
await client.query(`UPDATE "Video" SET status = 'FAILED', "errorMsg" = 'Ready for retry with Groq' WHERE id = $1`, [videoId]);
await client.query(`UPDATE "ClipProject" SET status = 'FAILED' WHERE "videoId" = $1`, [videoId]);
console.log("✅ Set to FAILED — click Retry in the Clip Studio UI now!");
console.log("The worker will download from R2, transcribe with Groq, and segment.");

await client.end();
