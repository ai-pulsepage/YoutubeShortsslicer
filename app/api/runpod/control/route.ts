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
        const gpuType = await getDbConfig("runpod_gpu_type") || "NVIDIA GeForce RTX 4090";
        const cloudType = await getDbConfig("runpod_cloud_type") || "ALL";
        const volumeSize = await getDbConfig("runpod_volume_size") || "100";
        const dockerArgs = await getDbConfig("runpod_docker_args");
        const gitToken = await getDbConfig("runpod_git_token");

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
                      costPerHr
                      desiredStatus
                      machine {
                        gpuTypeId
                      }
                      runtime {
                        uptimeInSeconds
                      }
                    }
                  }
                }`;
                const data = await queryRunPod(apiKey, query);
                const rawPods = data?.myself?.pods || [];
                activePods = rawPods.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    gpuName: p.machine?.gpuTypeId || "NVIDIA GeForce RTX 4090",
                    status: p.desiredStatus || "UNKNOWN",
                    runtimeSeconds: p.runtime?.uptimeInSeconds || 0,
                    costPerHr: p.costPerHr || 0
                }));
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

        // Return config status
        return NextResponse.json({
            config: {
                hasApiKey: !!apiKey,
                apiKey,
                volumeId,
                templateId,
                gpuType,
                cloudType,
                volumeSize: parseInt(volumeSize, 10) || 100,
                dockerArgs,
                hasGitToken: !!gitToken,
                gitToken,
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
        const { apiKey, volumeId, templateId, gpuType, cloudType, volumeSize, dockerArgs, gitToken } = body;

        if (apiKey !== undefined) await setDbConfig("runpod_api_key", apiKey);
        if (volumeId !== undefined) await setDbConfig("runpod_volume_id", volumeId);
        if (templateId !== undefined) await setDbConfig("runpod_template_id", templateId);
        if (gpuType !== undefined) await setDbConfig("runpod_gpu_type", gpuType);
        if (cloudType !== undefined) await setDbConfig("runpod_cloud_type", cloudType);
        if (volumeSize !== undefined) await setDbConfig("runpod_volume_size", String(volumeSize));
        if (dockerArgs !== undefined) await setDbConfig("runpod_docker_args", dockerArgs);
        if (gitToken !== undefined) await setDbConfig("runpod_git_token", gitToken);

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
            const gpuType = await getDbConfig("runpod_gpu_type") || "NVIDIA GeForce RTX 4090";
            const cloudType = await getDbConfig("runpod_cloud_type") || "ALL";
            const volumeSizeStr = await getDbConfig("runpod_volume_size") || "100";
            const volumeSize = parseInt(volumeSizeStr, 10) || 100;
            const dockerArgsSetting = await getDbConfig("runpod_docker_args");
            const gitToken = await getDbConfig("runpod_git_token");
            const activeRedisUrl = process.env.REDIS_URL || "";

            // Construct active docker start command
            let activeDockerArgs = dockerArgsSetting;
            if (!activeDockerArgs) {
                let defaultUrl = "https://github.com/ai-pulsepage/YoutubeShortsslicer.git";
                if (gitToken) {
                    defaultUrl = `https://${gitToken}@github.com/ai-pulsepage/YoutubeShortsslicer.git`;
                }
                activeDockerArgs = `bash -c "if [ ! -f /workspace/YoutubeShortsslicer/worker.py ]; then git clone ${defaultUrl} /workspace/slicer_temp && mkdir -p /workspace/YoutubeShortsslicer && cp -r /workspace/slicer_temp/runpod-worker/* /workspace/YoutubeShortsslicer/ && rm -rf /workspace/slicer_temp; fi && cd /workspace/YoutubeShortsslicer && pip install -r requirements.txt && python3 worker.py"`;
            }

            // Build environment variables array to inject database and credentials
            const envArgs = [
                { key: "REDIS_URL", value: activeRedisUrl },
                { key: "DATABASE_URL", value: process.env.DATABASE_URL || "" },
                { key: "R2_ACCESS_KEY_ID", value: process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY || "" },
                { key: "R2_ACCESS_KEY", value: process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY || "" },
                { key: "R2_SECRET_ACCESS_KEY", value: process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY || "" },
                { key: "R2_SECRET_KEY", value: process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY || "" },
                { key: "R2_BUCKET_NAME", value: process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || "" },
                { key: "R2_BUCKET", value: process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || "" },
                { key: "R2_ENDPOINT", value: process.env.R2_ENDPOINT || "" },
                { key: "DEEPSEEK_API_KEY", value: process.env.DEEPSEEK_API_KEY || "" },
                { key: "NEXTAUTH_SECRET", value: process.env.NEXTAUTH_SECRET || "" },
                { key: "YOUTUBEVIDEOS", value: "{{ RUNPOD_SECRET_YOUTUBEVIDEOS }}" }
            ].filter(env => {
                if (!env.value) return false;
                // Avoid passing internal URLs that cannot resolve on RunPod
                if (env.value.includes(".internal") || env.value.includes("railway.internal")) {
                    return false;
                }
                return true;
            });

            const mutation = `
            mutation DeployPod($input: PodFindAndDeployOnDemandInput!) {
              podFindAndDeployOnDemand(input: $input) {
                id
              }
            }`;

            const primaryGpu = gpuType || "NVIDIA GeForce RTX 4090";
            const fallbackGpus = [
                "NVIDIA GeForce RTX 4090",
                "NVIDIA RTX 6000 Ada Generation",
                "NVIDIA GeForce RTX 3090",
                "NVIDIA RTX 5000 Ada Generation",
                "NVIDIA A100 80GB PCIe",
                "NVIDIA A100-SXM4-80GB"
            ];

            // Deduplicate, keeping preferred GPU first
            const gpuList = Array.from(new Set([primaryGpu, ...fallbackGpus]));

            const baseInput: any = {
                cloudType: cloudType === "SECURE" ? "SECURE" : cloudType === "COMMUNITY" ? "COMMUNITY" : "ALL",
                gpuCount: 1,
                ports: "8888/http,22/tcp,8000/http",
            };

            if (templateId) {
                baseInput.templateId = templateId;
                if (dockerArgsSetting) {
                    baseInput.dockerArgs = dockerArgsSetting;
                }
                if (volumeId) {
                    baseInput.networkVolumeId = volumeId;
                    baseInput.volumeInGb = volumeSize;
                    baseInput.volumeMountPath = "/workspace";
                }
                // Do not send volumeInGb or volumeMountPath by default for template mode.
                // This lets RunPod use the template's native pre-configured volume size.
            } else {
                baseInput.dockerArgs = activeDockerArgs;
                baseInput.env = envArgs;
                baseInput.imageName = "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04";
                baseInput.containerDiskInGb = 40;
                baseInput.volumeInGb = volumeSize || 50;
                baseInput.volumeMountPath = "/workspace";
            }

            let pod = null;
            let lastError = null;

            for (const currentGpu of gpuList) {
                try {
                    const variables = {
                        input: {
                            ...baseInput,
                            gpuTypeId: currentGpu
                        }
                    };

                    console.log(`[RunPod Action POST] Attempting deploy on GPU: "${currentGpu}" with variables:`, JSON.stringify(variables, null, 2));

                    const data = await queryRunPod(apiKey, mutation, variables);
                    pod = data?.podFindAndDeployOnDemand;
                    if (pod?.id) {
                        console.log(`[RunPod Action POST] Successfully deployed pod: ${pod.id} on GPU: "${currentGpu}"`);
                        break;
                    }
                } catch (err: any) {
                    lastError = err;
                    console.warn(`[RunPod Action POST] Deployment failed on GPU "${currentGpu}": ${err.message}`);

                    const isResourceError =
                        err.message.includes("does not have the resources") ||
                        err.message.includes("capacity") ||
                        err.message.includes("out of") ||
                        err.message.includes("resource");

                    if (!isResourceError) {
                        throw err;
                    }
                }
            }

            if (!pod) {
                throw lastError || new Error("Failed to deploy pod on any compatible GPU type");
            }

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
