const fs = require("fs");
const path = "c:/Users/Administrator/Downloads/YoutubeShortsslicer/app/dashboard/animated/page.tsx";

const content = fs.readFileSync(path, "utf-8");
const lines = content.split("\n");

console.log("Searching for polling loop in project editor...");
lines.forEach((line, idx) => {
    if (line.includes("setInterval") || line.includes("jobIds") || line.includes("/poll")) {
        console.log(`L${idx + 1}: ${line.trim()}`);
        for (let i = idx - 2; i <= idx + 20; i++) {
            console.log(`  L${i+1}: ${lines[i]}`);
        }
    }
});
