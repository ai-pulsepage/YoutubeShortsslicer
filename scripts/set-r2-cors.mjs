/**
 * One-time script to set CORS on the R2 bucket
 * so browsers can upload directly via presigned URLs.
 *
 * Run: node scripts/set-r2-cors.mjs
 */
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const BUCKET = process.env.R2_BUCKET_NAME || "youtubeshorts";

const corsConfig = {
    CORSRules: [
        {
            AllowedOrigins: [
                "https://www.vaidyadigital.com",
                "https://vaidyadigital.com",
                "https://youtubeshortsslicer-production.up.railway.app",
                "http://localhost:3000",
            ],
            AllowedMethods: ["GET", "PUT", "POST", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag", "Content-Length"],
            MaxAgeSeconds: 3600,
        },
    ],
};

async function setCors() {
    try {
        await s3.send(
            new PutBucketCorsCommand({
                Bucket: BUCKET,
                CORSConfiguration: corsConfig,
            })
        );
        console.log(`✅ CORS configured on bucket "${BUCKET}"`);
        console.log("Allowed origins:", corsConfig.CORSRules[0].AllowedOrigins.join(", "));
    } catch (err) {
        console.error("❌ Failed to set CORS:", err.message);
        process.exit(1);
    }
}

setCors();
