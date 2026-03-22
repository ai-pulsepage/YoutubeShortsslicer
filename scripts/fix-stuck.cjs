const pg = require("pg");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
    const r = await pool.query(
        'UPDATE "ClipProject" SET status = \'FAILED\' WHERE status NOT IN (\'READY\', \'FAILED\')'
    );
    console.log("ClipProjects marked FAILED:", r.rowCount);

    // Also make sure the good video has storagePath linked to all its projects
    const r2 = await pool.query(
        'UPDATE "Video" SET "storagePath" = \'videos/cmmcbgeje00001dqn8yqa6abw/cmn1r3uhc00020ephhlqqh4kd/source.mp4\' WHERE "sourceUrl" LIKE \'upload://%\' AND "storagePath" IS NULL'
    );
    console.log("Videos given R2 path:", r2.rowCount);

    // Show final state
    const rows = await pool.query(
        'SELECT cp.id, cp.status, v.id as vid, v.status as vstatus, v."storagePath" IS NOT NULL as has_r2 FROM "ClipProject" cp JOIN "Video" v ON v.id = cp."videoId" ORDER BY cp."createdAt" DESC LIMIT 10'
    );
    for (const r of rows.rows) {
        console.log(`  project=${r.id} status=${r.status} video=${r.vstatus} r2=${r.has_r2}`);
    }

    await pool.end();
})();
