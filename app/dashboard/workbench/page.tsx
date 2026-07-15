"use client";

import { useState, useEffect } from "react";
import {
    Cpu,
    Server,
    Loader2,
    Play,
    AlertCircle,
    CheckCircle2,
    RefreshCw,
    Shield,
    Volume2,
    Video,
    Image,
    Save,
    Trash2,
    ExternalLink,
    Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

type Pod = {
    id: string;
    name: string;
    gpuName: string;
    status: string;
    runtimeSeconds: number;
    costPerHr: number;
};

type QueueSizes = {
    genJobs: number;
    ugcJobs: number;
    podcasts: number;
};

type RunPodConfig = {
    hasApiKey: boolean;
    volumeId: string;
    templateId: string;
    gpuType: string;
    cloudType: string;
    volumeSize: number;
    dockerArgs?: string;
    hasGitToken?: boolean;
};

export default function WorkbenchPage() {
    const [config, setConfig] = useState<RunPodConfig | null>(null);
    const [activePods, setActivePods] = useState<Pod[]>([]);
    const [queueSizes, setQueueSizes] = useState<QueueSizes>({ genJobs: 0, ugcJobs: 0, podcasts: 0 });
    const [connectionOk, setConnectionOk] = useState(false);

    // Form inputs
    const [apiKey, setApiKey] = useState("");
    const [volumeId, setVolumeId] = useState("");
    const [templateId, setTemplateId] = useState("");
    const [gpuType, setGpuType] = useState("ambient-rtx-4090");
    const [cloudType, setCloudType] = useState("ALL");
    const [volumeSize, setVolumeSize] = useState<number>(100);
    const [dockerArgs, setDockerArgs] = useState("");
    const [gitToken, setGitToken] = useState("");

    // UX states
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [acting, setActing] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Load server status & details
    const loadStatus = async (showLoading = false) => {
        if (showLoading) setLoading(true);
        try {
            const res = await fetch("/api/runpod/control");
            if (res.ok) {
                const data = await res.json();
                setConfig(data.config);
                setActivePods(data.activePods);
                setQueueSizes(data.queueSizes || { genJobs: 0, ugcJobs: 0, podcasts: 0 });
                setConnectionOk(data.connectionOk);

                // Pre-populate form elements only if we haven't typed yet
                if (data.config) {
                    setVolumeId(prev => prev || data.config.volumeId || "");
                    setTemplateId(prev => prev || data.config.templateId || "");
                    setGpuType(prev => prev || data.config.gpuType || "ambient-rtx-4090");
                    setCloudType(prev => prev || data.config.cloudType || "ALL");
                    setVolumeSize(prev => prev || data.config.volumeSize || 100);
                    setDockerArgs(prev => prev || data.config.dockerArgs || "");
                }
            }
        } catch (err: any) {
            console.error("Failed to load workbench status:", err);
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    useEffect(() => {
        loadStatus(true);
    }, []);

    // Dynamic Polling Loop: refresh pod status and active queue sizes every 6 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            loadStatus(false);
        }, 6000);
        return () => clearInterval(interval);
    }, []);

    // Save Settings Handler
    const handleSaveSettings = async () => {
        setSaving(true);
        setError("");
        setSuccess("");
        try {
            const res = await fetch("/api/runpod/control", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    apiKey: apiKey.trim() || undefined, // Only send if edited
                    volumeId: volumeId.trim(),
                    templateId: templateId.trim(),
                    gpuType: gpuType.trim(),
                    cloudType,
                    volumeSize: Number(volumeSize),
                    dockerArgs: dockerArgs.trim(),
                    gitToken: gitToken.trim() || undefined // Only send if edited
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update configurations");

            setSuccess("Configurations saved successfully.");
            setApiKey(""); // Reset password input
            setGitToken(""); // Reset password input
            loadStatus(false);
        } catch (err: any) {
            setError(err.message || "Failed to save settings.");
        } finally {
            setSaving(false);
        }
    };

    // GPU start/stop action triggers
    const handleServerAction = async (action: "start" | "stop", podId?: string) => {
        setActing(true);
        setError("");
        setSuccess("");
        try {
            const res = await fetch("/api/runpod/control", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, podId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Server action failed`);

            setSuccess(action === "start" ? "GPU launch request dispatched." : "GPU termination request completed.");
            loadStatus(false);
        } catch (err: any) {
            setError(err.message || `GPU server ${action} failed.`);
        } finally {
            setActing(false);
        }
    };

    // Formatting helper
    const formatTime = (secs: number) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    };

    const totalQueueCount = queueSizes.genJobs + queueSizes.ugcJobs + queueSizes.podcasts;
    const isServerOnline = activePods.length > 0;
    const activePod = activePods[0];

    return (
        <div className="space-y-6 pb-12 font-sans">
            {/* Header */}
            <div className="border-b border-gray-800 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2">
                        <Cpu className="w-8 h-8 text-violet-500" /> GPU Workbench
                    </h1>
                    <p className="text-gray-400 mt-1 text-sm">
                        Manage your RunPod GPU servers, view real-time rendering queues, and configure persistent Network Volumes.
                    </p>
                </div>
                <button onClick={() => loadStatus(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 border border-gray-800 hover:bg-gray-850 hover:text-white text-gray-300 text-xs font-bold rounded-xl transition-all cursor-pointer">
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh Dashboard
                </button>
            </div>

            {/* Banners */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-400 text-xs flex items-start gap-2 leading-relaxed">
                    <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {success && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl text-emerald-400 text-xs flex items-start gap-2 leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>{success}</span>
                </div>
            )}

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                    <span className="text-xs text-gray-550">Scanning RunPod API & local database...</span>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    
                    {/* ─── LEFT COLUMN: COCKPIT & QUEUE STATUS (7/12 width) ─── */}
                    <div className="lg:col-span-7 space-y-6">
                        
                        {/* Server Status Cockpit */}
                        <div className="bg-gray-950 border border-gray-850 p-6 rounded-3xl space-y-6 relative overflow-hidden">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                    <Server className="w-4.5 h-4.5 text-violet-400" /> GPU Server Status
                                </h2>
                                <span className={cn(
                                    "px-3 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider flex items-center gap-1.5",
                                    isServerOnline
                                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20 animate-pulse"
                                        : "text-red-400 bg-red-500/10 border-red-500/20"
                                )}>
                                    <span className={cn("w-1.5 h-1.5 rounded-full", isServerOnline ? "bg-emerald-400" : "bg-red-400")} />
                                    {isServerOnline ? "Online (Processing)" : "Offline (Asleep)"}
                                </span>
                            </div>

                            {/* Active Pod Details */}
                            {isServerOnline && activePod ? (
                                <div className="bg-gray-900/60 border border-gray-850 p-5 rounded-2xl space-y-3.5">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <span className="text-[10px] text-gray-500 font-sans block">GPU Model in Use</span>
                                            <span className="text-xs font-bold text-white font-mono mt-0.5 block">{activePod.gpuName || "Unknown Card"}</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-gray-500 font-sans block">Instance ID</span>
                                            <span className="text-xs font-bold text-gray-400 font-mono mt-0.5 block">#{activePod.id}</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-gray-500 font-sans block">Server Active Time</span>
                                            <span className="text-xs font-bold text-white font-mono mt-0.5 block">
                                                {formatTime(activePod.runtimeSeconds)}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-gray-500 font-sans block">Hourly Billing Rate</span>
                                            <span className="text-xs font-bold text-emerald-400 font-mono mt-0.5 block">
                                                ${(activePod.costPerHr || 0).toFixed(2)}/hr
                                            </span>
                                        </div>
                                    </div>
                                    <div className="border-t border-gray-850/40 pt-3 flex items-center justify-between">
                                        <span className="text-[10px] text-gray-550 font-sans">Accumulated Cost (This Session):</span>
                                        <span className="text-xs font-bold text-emerald-400 font-mono">
                                            ${((activePod.runtimeSeconds / 3600) * (activePod.costPerHr || 0)).toFixed(3)}
                                        </span>
                                    </div>
                                    <div className="border-t border-gray-850/40 pt-3 flex flex-col gap-2">
                                        <span className="text-[10px] text-gray-550 font-sans block">Jupyter Notebook Server:</span>
                                        <a href={`https://${activePod.id}-8888.proxy.runpod.net/`} target="_blank" rel="noopener noreferrer"
                                           className="flex items-center justify-center gap-1.5 py-2 px-4 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl transition-all shadow cursor-pointer text-center font-sans">
                                            <ExternalLink className="w-3.5 h-3.5" /> Open Jupyter Notebook Proxy
                                        </a>
                                        <span className="text-[9px] text-gray-650 leading-normal font-sans">
                                            *Exposed via port 8888. If connection fails, wait 10-15s for the container start script to initialize.
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-10 bg-black/10 border border-dashed border-gray-850 rounded-2xl">
                                    <Cpu className="w-10 h-10 text-gray-800 mx-auto mb-2" />
                                    <h4 className="text-xs font-bold text-gray-400">Server is turned off</h4>
                                    <p className="text-[11px] text-gray-550 font-sans mt-1 max-w-xs mx-auto">
                                        No active instances are currently running on your RunPod account. You are not paying for any active GPU runtime.
                                    </p>
                                </div>
                            )}

                            {/* Control Actions */}
                            <div className="flex gap-4 pt-1">
                                {isServerOnline ? (
                                    <button onClick={() => handleServerAction("stop", activePod.id)} disabled={acting}
                                        className="w-full flex items-center justify-center gap-1.5 py-3 bg-red-955/20 hover:bg-red-955/40 disabled:opacity-40 text-red-400 border border-red-900/20 text-xs font-bold rounded-2xl transition-all shadow cursor-pointer uppercase tracking-wider font-sans">
                                        {acting ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Trash2 className="w-4.5 h-4.5" />}
                                        Terminate GPU Server
                                    </button>
                                ) : (
                                    <button onClick={() => handleServerAction("start")} disabled={acting || !config?.hasApiKey || !config?.templateId}
                                        className="w-full flex items-center justify-center gap-1.5 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold rounded-2xl transition-all shadow cursor-pointer uppercase tracking-wider font-sans">
                                        {acting ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Play className="w-4.5 h-4.5" />}
                                        Start GPU Server
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Setup Guide for Empty/New persistent volumes */}
                        {isServerOnline && activePod && (
                            <div className="bg-gray-950 border border-gray-850 p-6 rounded-3xl space-y-4 font-sans">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="w-4.5 h-4.5 text-violet-400" />
                                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Empty Volume Setup Guide</h3>
                                </div>
                                <p className="text-[11px] text-gray-400 leading-relaxed">
                                    If you mounted a new network volume or a clean storage area, the volume starts empty. You must copy the worker scripts to the pod for it to run.
                                </p>
                                <div className="space-y-3.5 pt-1">
                                    <div>
                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Easy Setup Command:</span>
                                        <p className="text-[9px] text-gray-550 mb-1.5 font-sans">Open Jupyter Notebook, click **New &gt; Terminal**, and paste the following command to download the worker and run it:</p>
                                        <div className="relative">
                                            <pre className="bg-gray-900 border border-gray-850 p-3 rounded-xl text-[10px] font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap select-all leading-normal">
                                                {`git clone https://github.com/ai-pulsepage/YoutubeShortsslicer.git /workspace/slicer && cp -r /workspace/slicer/runpod-worker/* /workspace/ && rm -rf /workspace/slicer && pip install -r requirements.txt && python worker.py`}
                                            </pre>
                                        </div>
                                    </div>
                                    <div className="bg-violet-950/10 border border-violet-900/20 p-3 rounded-xl text-[10px] text-gray-500 leading-normal flex items-start gap-2">
                                        <AlertCircle className="w-3.5 h-3.5 text-violet-400 mt-0.5 flex-shrink-0" />
                                        <span>Once run, the worker script will connect to Redis and wait for animation, UGC, or podcast generation jobs.</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Active Queue status */}
                        <div className="bg-gray-950 border border-gray-850 p-6 rounded-3xl space-y-4">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Queue Metrics</h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-gray-900/40 border border-gray-850 p-4 rounded-2xl space-y-2 flex flex-col justify-between">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider font-sans">AI Films / Stories</span>
                                        <Video className="w-4 h-4 text-sky-400" />
                                    </div>
                                    <span className="text-2xl font-bold text-white font-mono">{queueSizes.genJobs} <span className="text-xs text-gray-500 font-sans">jobs</span></span>
                                </div>

                                <div className="bg-gray-900/40 border border-gray-850 p-4 rounded-2xl space-y-2 flex flex-col justify-between">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider font-sans">AI UGC Studio</span>
                                        <Volume2 className="w-4 h-4 text-violet-400" />
                                    </div>
                                    <span className="text-2xl font-bold text-white font-mono">{queueSizes.ugcJobs} <span className="text-xs text-gray-500 font-sans">jobs</span></span>
                                </div>

                                <div className="bg-gray-900/40 border border-gray-850 p-4 rounded-2xl space-y-2 flex flex-col justify-between">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider font-sans">AI Podcasts</span>
                                        <Volume2 className="w-4 h-4 text-emerald-400" />
                                    </div>
                                    <span className="text-2xl font-bold text-white font-mono">{queueSizes.podcasts} <span className="text-xs text-gray-500 font-sans">episodes</span></span>
                                </div>
                            </div>

                            {/* Batch queue auto-shutdown helper description */}
                            {totalQueueCount > 0 && !isServerOnline && (
                                <div className="bg-violet-600/10 border border-violet-500/15 p-4 rounded-2xl text-violet-300 text-xs leading-relaxed flex items-start gap-2 font-sans mt-2">
                                    <AlertCircle className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <span className="font-bold block text-white mb-0.5">You have {totalQueueCount} jobs backlogged!</span>
                                        Click **"Start GPU Server"** to boot the RunPod instance. It will automatically process all pending tasks and then terminate itself immediately when finished, keeping your costs strictly controlled.
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>

                    {/* ─── RIGHT COLUMN: RUNPOD CONFIGURATION SETTINGS (5/12 width) ─── */}
                    <div className="lg:col-span-5 space-y-6">
                        <div className="bg-gray-950 border border-gray-850 p-6 rounded-3xl space-y-4">
                            <h2 className="text-sm font-bold text-white uppercase tracking-wider">RunPod Settings</h2>
                            
                            <div className="space-y-4">
                                
                                {/* API Key */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">RunPod API Key</label>
                                    <input type="password" placeholder={config?.hasApiKey ? "••••••••••••••••••••••••" : "Enter RunPod API Key"} value={apiKey} onChange={e => setApiKey(e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-800 focus:border-violet-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none transition-all font-sans" />
                                </div>

                                {/* Template ID */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">RunPod Template ID</label>
                                    <input type="text" placeholder="e.g. template-id-xyz" value={templateId} onChange={e => setTemplateId(e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-800 focus:border-violet-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none transition-all font-mono" />
                                </div>

                                {/* Volume ID */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Network Volume ID (Optional)</label>
                                    <input type="text" placeholder="e.g. vol-id-abc" value={volumeId} onChange={e => setVolumeId(e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-800 focus:border-violet-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none transition-all font-mono" />
                                    <span className="text-[9px] text-gray-600 font-sans block mt-0.5 leading-snug">Attaches your persistent volume containing downloaded weights for instant boot-ups.</span>
                                </div>

                                {/* Volume Size */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Default Volume Disk Size (GB)</label>
                                    <input type="number" min="50" max="1000" placeholder="100" value={volumeSize} onChange={e => setVolumeSize(Number(e.target.value))}
                                        className="w-full bg-gray-900 border border-gray-800 focus:border-violet-500 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none transition-all font-sans" />
                                    <span className="text-[9px] text-gray-600 font-sans block mt-0.5 leading-snug">Volume size allocated for models and cache. 100GB+ recommended for video weights.</span>
                                </div>

                                {/* Cloud Type */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Cloud Marketplace</label>
                                    <select value={cloudType} onChange={e => setCloudType(e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-800 focus:border-violet-500 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none transition-all font-sans">
                                        <option value="ALL">All Clouds (Highly Available)</option>
                                        <option value="SECURE">Secure Cloud Only (Premium Data Centers)</option>
                                        <option value="COMMUNITY">Community Cloud Only (Decentralized/Affordable)</option>
                                    </select>
                                </div>

                                {/* GPU Type */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">GPU Type String (RunPod ID)</label>
                                    <input type="text" placeholder="e.g. ambient-rtx-6000-ada" value={gpuType} onChange={e => setGpuType(e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-800 focus:border-violet-500 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none transition-all font-mono" />
                                    <div className="bg-gray-900/40 p-2.5 rounded-lg border border-gray-850 mt-1 space-y-1 text-[9px] text-gray-550 leading-relaxed font-sans">
                                        <span className="font-bold text-gray-400 block">Common GPU Type IDs:</span>
                                        <ul className="list-disc list-inside space-y-0.5">
                                            <li><code className="text-violet-400">ambient-rtx-6000-ada</code> (RTX 6000 Ada - 48GB)</li>
                                            <li><code className="text-violet-400">ambient-rtx-4090</code> (GeForce RTX 4090 - 24GB)</li>
                                            <li><code className="text-violet-400">ambient-rtx-3090</code> (GeForce RTX 3090 - 24GB)</li>
                                            <li><code className="text-violet-400">ambient-a100-80gb</code> (NVIDIA A100 - 80GB)</li>
                                        </ul>
                                    </div>
                                </div>

                                {/* Git Token */}
                                <div className="space-y-1 font-sans">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">GitHub Access Token (PAT) (Optional)</label>
                                    <input type="password" placeholder={config?.hasGitToken ? "••••••••••••••••••••••••" : "Enter Git Token for Private Repo"} value={gitToken} onChange={e => setGitToken(e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-800 focus:border-violet-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none transition-all" />
                                    <span className="text-[9px] text-gray-600 block mt-0.5 leading-snug">Required to clone the private workspace slicer repository on new volumes.</span>
                                </div>

                                {/* Custom Docker args (Startup Command) */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Docker Startup Command (Override)</label>
                                    <textarea placeholder="Leave empty for auto-bootstrap command" value={dockerArgs} onChange={e => setDockerArgs(e.target.value)} rows={3}
                                        className="w-full bg-gray-900 border border-gray-800 focus:border-violet-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none transition-all font-mono leading-normal resize-none" />
                                    <span className="text-[9px] text-gray-600 font-sans block mt-0.5 leading-snug">Overrides default boot command. Leave empty to auto-bootstrap your slicer git repo.</span>
                                </div>

                                <button onClick={handleSaveSettings} disabled={saving || !templateId.trim()}
                                    className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-gray-900 border border-gray-800 hover:bg-gray-850 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-all shadow cursor-pointer font-sans mt-2">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-violet-400" />}
                                    Save Configurations
                                </button>

                            </div>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}
