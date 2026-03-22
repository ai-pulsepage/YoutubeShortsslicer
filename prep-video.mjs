/**
 * Local Video Prep Script for Clip Studio
 * 
 * Compresses large video files for upload to Clip Studio.
 * Reduces 8GB → ~400-500MB with minimal quality loss.
 * 
 * Usage: node prep-video.mjs "path/to/CODPOD EP10 Final 6.mp4"
 */
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const inputFile = process.argv[2];
if (!inputFile) {
    console.error("Usage: node prep-video.mjs <input-video-path>");
    process.exit(1);
}

if (!fs.existsSync(inputFile)) {
    console.error(`File not found: ${inputFile}`);
    process.exit(1);
}

const stats = fs.statSync(inputFile);
const sizeMB = (stats.size / 1024 / 1024).toFixed(0);
const outputFile = path.join(
    path.dirname(inputFile),
    `compressed_${path.basename(inputFile, path.extname(inputFile))}.mp4`
);

console.log(`\n🎬 Clip Studio — Video Prep`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Input:  ${inputFile} (${sizeMB} MB)`);
console.log(`Output: ${outputFile}`);
console.log(`\n⏳ Compressing... (this may take 5-15 minutes for large files)\n`);

try {
    // Compress: 720p, CRF 28 (good quality for clipping), fast preset
    // Audio at 128k (plenty for speech/podcast)
    execSync(
        `ffmpeg -i "${inputFile}" -vf "scale=-2:720" -c:v libx264 -preset fast -crf 28 -c:a aac -b:a 128k -movflags +faststart "${outputFile}" -y`,
        { stdio: "inherit", timeout: 1800000 } // 30 min timeout
    );

    const outStats = fs.statSync(outputFile);
    const outMB = (outStats.size / 1024 / 1024).toFixed(0);
    const ratio = ((1 - outStats.size / stats.size) * 100).toFixed(0);

    console.log(`\n✅ Done!`);
    console.log(`   ${sizeMB} MB → ${outMB} MB (${ratio}% smaller)`);
    console.log(`\n📤 Now upload "${path.basename(outputFile)}" to Clip Studio → Upload File tab`);
} catch (err) {
    console.error(`\n❌ Compression failed:`, err.message);
    process.exit(1);
}
