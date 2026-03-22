import pg from 'pg';
const client = new pg.Client(process.env.DATABASE_URL);
await client.connect();

// Duration from ffmpeg output: 00:45:21.09
const duration = 45 * 60 + 21; // 2721 seconds

await client.query(`UPDATE "Video" SET duration = $1 WHERE id = 'cmn21l7zh00000eq8uqjpffw7'`, [duration]);
console.log(`✅ Set video duration to ${duration}s (45:21)`);

// Delete old bad segments so re-segmentation creates correct ones
const deleted = await client.query(`DELETE FROM "Segment" WHERE "videoId" = 'cmn21l7zh00000eq8uqjpffw7' RETURNING id`);
console.log(`🗑️  Deleted ${deleted.rowCount} bad segments (had endTime=0)`);

// Set status to TRANSCRIBING so the worker re-runs segmentation on retry
await client.query(`UPDATE "Video" SET status = 'FAILED' WHERE id = 'cmn21l7zh00000eq8uqjpffw7'`);
await client.query(`UPDATE "ClipProject" SET status = 'FAILED' WHERE "videoId" = 'cmn21l7zh00000eq8uqjpffw7'`);
console.log("✅ Set to FAILED — click Retry to re-segment with correct duration");

await client.end();
