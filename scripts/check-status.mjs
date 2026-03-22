import pg from 'pg';
const client = new pg.Client(process.env.DATABASE_URL);
await client.connect();

const res = await client.query(`
  SELECT cp.id as project_id, cp.status as project_status, 
         v.id as video_id, v.status as video_status, 
         v."storagePath" as r2_path, 
         LEFT(v."errorMsg", 100) as error
  FROM "ClipProject" cp
  JOIN "Video" v ON v.id = cp."videoId"
  ORDER BY cp."createdAt" DESC
  LIMIT 5
`);
console.log("=== Recent Clip Projects ===");
res.rows.forEach(r => console.log(JSON.stringify(r)));

await client.end();
