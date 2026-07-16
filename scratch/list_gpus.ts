import { prisma } from "../lib/prisma";
import dotenv from "dotenv";
dotenv.config();

async function getDbConfig(key: string): Promise<string> {
    try {
        const row = await prisma.apiKey.findUnique({ where: { service: key } });
        if (row?.key) {
            return Buffer.from(row.key, "base64").toString("utf8");
        }
    } catch {}
    return "";
}

async function main() {
    let apiKey = process.env.RUNPOD_API_KEY;
    if (!apiKey) {
        apiKey = await getDbConfig("runpod_api_key");
    }

    if (!apiKey) {
        console.error("RUNPOD_API_KEY is not set in env or DB");
        return;
    }

    console.log("Using RunPod API Key:", apiKey.substring(0, 8) + "...");

    const query = `
    query {
      gpuTypes {
        id
        displayName
      }
    }`;

    const res = await fetch(`https://api.runpod.io/graphql?api_key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
    });

    if (!res.ok) {
        console.error("HTTP Error:", res.status, await res.text());
        return;
    }

    const json = await res.json();
    if (json.errors) {
        console.error("GraphQL Errors:", json.errors);
        return;
    }

    console.log("Available GPU Types on RunPod:");
    console.log(JSON.stringify(json.data?.gpuTypes, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
