import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Helpers to read/write encrypted/encoded configs in ApiKey
async function getDbConfig(key: string): Promise<string> {
    try {
        const row = await prisma.apiKey.findUnique({ where: { service: key } });
        if (row?.key) {
            return Buffer.from(row.key, "base64").toString("utf8");
        }
    } catch {}
    return "";
}

async function setDbConfig(key: string, val: string) {
    const encoded = Buffer.from(val).toString("base64");
    await prisma.apiKey.upsert({
        where: { service: key },
        update: { key: encoded },
        create: { service: key, key: encoded }
    });
}

// GraphQL client helper for RunPod API
async function queryRunPod(apiKey: string, query: string, variables: any = {}) {
    const res = await fetch(`https://api.runpod.io/graphql?api_key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables })
    });
    if (!res.ok) {
        throw new Error(`RunPod API HTTP error: ${res.status} ${await res.text()}`);
    }
    const json = await res.json();
    if (json.errors) {
        throw new Error(json.errors.map((e: any) => e.message).join(", "));
    }
    return json.data;
}

export async function GET() {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const apiKey = await getDbConfig("runpod_api_key");
        const volumeId = await getDbConfig("runpod_volume_id");
        const templateId = await getDbConfig("runpod_template_id");
        const gpuType = await getDbConfig("runpod_gpu_type") || "ambient-rtx-4090";
        const cloudType = await getDbConfig("runpod_cloud_type") || "ALL";

        let activePods: any[] = [];
        let connectionOk = false;

        if (apiKey) {
            try {
                const query = `
                query {
                  myself {
                    pods {
                      id
                      name
                      gpuName
                      status
                      runtimeSeconds
                      costPerHr
                    }
                  }
                }`;
                const data = await queryRunPod(apiKey, query);
                activePods = data?.myself?.pods || [];
                connectionOk = true;
            } catch (err: any) {
                console.warn("[RunPod GET] API list pods failed:", err.message);
            }
        }

        // Query queue counts
        const genJobQueue = await prisma.genJob.count({
            where: { status: { in: ["QUEUED", "PROCESSING"] } }
        });
        const ugcJobQueue = await prisma.uGCJob.count({
            where: { status: { in: ["PENDING", "GENERATING_SCRIPT", "GENERATING_VIDEO", "COMPOSITING"] } }
        });
        const podcastJobQueue = await prisma.podcastEpisode.count({
            where: { status: { in: ["SCRIPTING", "RECORDING", "ASSEMBLING"] } }
        });

        // Return config status (hide secret key)
        return NextResponse.json({
            config: {
                hasApiKey: !!apiKey,
                volumeId,
                templateId,
                gpuType,
                cloudType,
            },
            connectionOk,
            activePods,
            queueSizes: {
                genJobs: genJobQueue,
                ugcJobs: ugcJobQueue,
                podcasts: podcastJobQueue
            }
        });

    } catch (err: any) {
        return NextResponse.json({ error: "Failed to load RunPod status", details: err.message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json();
        const { apiKey, volumeId, templateId, gpuType, cloudType } = body;

        if (apiKey !== undefined) await setDbConfig("runpod_api_key", apiKey);
        if (volumeId !== undefined) await setDbConfig("runpod_volume_id", volumeId);
        if (templateId !== undefined) await setDbConfig("runpod_template_id", templateId);
        if (gpuType !== undefined) await setDbConfig("runpod_gpu_type", gpuType);
        if (cloudType !== undefined) await setDbConfig("runpod_cloud_type", cloudType);

        return NextResponse.json({ success: true, message: "Settings saved successfully" });
    } catch (err: any) {
        return NextResponse.json({ error: "Failed to save settings", details: err.message }, { status: 550 });
    }
}

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { action, podId } = await req.json();
        const apiKey = await getDbConfig("runpod_api_key");
        if (!apiKey) {
            return NextResponse.json({ error: "RunPod API Key is not configured" }, { status: 400 });
        }

        if (action === "start") {
            const volumeId = await getDbConfig("runpod_volume_id");
            const templateId = await getDbConfig("runpod_template_id");
            const gpuType = await getDbConfig("runpod_gpu_type") || "ambient-rtx-4090";
            const cloudType = await getDbConfig("runpod_cloud_type") || "ALL";

            if (!templateId) {
                return NextResponse.json({ error: "RunPod Template ID is required to start a pod" }, { status: 400 });
            }

            // Build environment variables array to inject database and credentials
            const envArgs = [
                { key: "REDIS_URL", value: process.env.REDIS_URL || "" },
                { key: "DATABASE_URL", value: process.env.DATABASE_URL || "" },
                { key: "R2_ACCESS_KEY_ID", value: process.env.R2_ACCESS_KEY_ID || "" },
                { key: "R2_SECRET_ACCESS_KEY", value: process.env.R2_SECRET_ACCESS_KEY || "" },
                { key: "R2_BUCKET_NAME", value: process.env.R2_BUCKET_NAME || "" },
                { key: "R2_ENDPOINT", value: process.env.R2_ENDPOINT || "" },
                { key: "DEEPSEEK_API_KEY", value: process.env.DEEPSEEK_API_KEY || "" },
                { key: "NEXTAUTH_SECRET", value: process.env.NEXTAUTH_SECRET || "" },
                { key: "YOUTUBEVIDEOS", value: "{{ RUNPOD_SECRET_YOUTUBEVIDEOS }}" }
            ].filter(env => env.value !== "");

            const mutation = `
            mutation DeployPod($input: PodFindAndDeployOnDemandInput!) {
              podFindAndDeployOnDemand(input: $input) {
                id
                status
              }
            }`;

            const variables = {
                input: {
                    cloudType: cloudType === "SECURE" ? "SECURE" : cloudType === "COMMUNITY" ? "COMMUNITY" : "ALL",
                    gpuCount: 1,
                    volumeInGb: 50,
                    volumeMountPath: "/workspace",
                    gpuTypeId: gpuType,
                    networkVolumeId: volumeId || undefined,
                    templateId: templateId,
                    env: envArgs
                }
            };

            const data = await queryRunPod(apiKey, mutation, variables);
            const pod = data?.podFindAndDeployOnDemand;

            return NextResponse.json({
                success: true,
                message: "GPU instance deployment request dispatched",
                pod
            });

        } else if (action === "stop") {
            if (!podId) {
                return NextResponse.json({ error: "Missing active podId to terminate" }, { status: 400 });
            }

            const mutation = `
            mutation TerminatePod($input: PodTerminateInput!) {
              podTerminate(input: $input)
            }`;

            const variables = {
                input: {
                    podId
                }
            };

            await queryRunPod(apiKey, mutation, variables);

            return NextResponse.json({
                success: true,
                message: "GPU instance termination request completed"
            });

        } else {
            return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }

    } catch (err: any) {
        console.error("[RunPod Action POST] failed:", err.message);
        return NextResponse.json({ error: "Action failed", details: err.message }, { status: 500 });
    }
}
