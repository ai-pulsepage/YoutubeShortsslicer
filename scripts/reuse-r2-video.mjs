import pg from 'pg';
const client = new pg.Client(process.env.DATABASE_URL);
await client.connect();

// Find the new project/video
const res = await client.query(`
  SELECT cp.id as project_id, cp.status as project_status,
         v.id as video_id, v.status as video_status, v."storagePath"
  FROM "ClipProject" cp
  JOIN "Video" v ON v.id = cp."videoId"
  ORDER BY cp."createdAt" DESC
  LIMIT 3
`);
console.log("=== Current projects ===");
res.rows.forEach(r => console.log(JSON.stringify(r)));

// The existing R2 path from the old upload
const existingR2Path = "videos/cmmcbgeje00001dqn8yqa6abw/cmn1r3uhc00020ephhlqqh4kd/source.mp4";

// Update the newest video to point to the existing R2 file
const newest = res.rows[0];
if (newest) {
  await client.query(`
    UPDATE "Video" 
    SET "storagePath" = $1, status = 'TRANSCRIBING', "errorMsg" = NULL 
    WHERE id = $2
  `, [existingR2Path, newest.video_id]);
  
  await client.query(`
    UPDATE "ClipProject" 
    SET status = 'TRANSCRIBING' 
    WHERE id = $1
  `, [newest.project_id]);
  
  console.log(`\n✅ Updated video ${newest.video_id} to use existing R2 path: ${existingR2Path}`);
  console.log(`✅ Set status to TRANSCRIBING — worker should pick it up`);
} else {
  console.log("❌ No projects found");
}

await client.end();
