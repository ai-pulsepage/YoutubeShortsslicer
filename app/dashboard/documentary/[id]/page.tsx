"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    FileText,
    Grid3X3,
    Image,
    Activity,
    Play,
    Film,
    Send,
    Loader2,
    Save,
    Sparkles,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Clock,
    Camera,
    Palette,
    Sun,
    Move,
    Layers,
    Trash2,
    Eye,
    Wrench,
    ChevronDown,
    Maximize2,
    X,
    AlertCircle,
    RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TabId = "script" | "shots" | "assets" | "progress" | "preview" | "assembly" | "publish";

const TABS: { id: TabId; label: string; icon: any }[] = [
    { id: "script", label: "Script", icon: FileText },
    { id: "shots", label: "Shot Matrix", icon: Grid3X3 },
    { id: "assets", label: "Assets", icon: Image },
    { id: "progress", label: "Progress", icon: Activity },
    { id: "preview", label: "Preview", icon: Play },
    { id: "assembly", label: "Assembly", icon: Film },
    { id: "publish", label: "Publish", icon: Send },
];

export default function DocumentaryDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [doc, setDoc] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabId>("script");

    const fetchDoc = useCallback(async () => {
        const res = await fetch(`/api/documentary/${id}`);
        if (!res.ok) { router.push("/dashboard/documentary"); return; }
        const data = await res.json();
        setDoc(data);
        setLoading(false);
    }, [id, router]);

    useEffect(() => { fetchDoc(); }, [fetchDoc]);

    // Auto-refresh during active states + sync Redis results
    useEffect(() => {
        if (!doc || !["GENERATING", "ASSEMBLING", "SCENES_PLANNED"].includes(doc.status)) return;
        const interval = setInterval(async () => {
            // Sync results from Redis → DB before refreshing
            await fetch("/api/documentary/jobs/sync", { method: "POST" }).catch(() => { });
            fetchDoc();
        }, 5000);
        return () => clearInterval(interval);
    }, [doc, fetchDoc]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (!doc) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button
                    onClick={() => router.push("/dashboard/documentary")}
                    className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-bold text-white truncate">
                        {doc.title || "Untitled Documentary"}
                    </h1>
                    <p className="text-sm text-gray-500">
                        {doc.sourceUrls.length} sources • {doc.scenes?.length || 0} scenes • {doc.assets?.length || 0} assets
                    </p>
                </div>
                <StatusBadge status={doc.status} />
                <PipelineActions doc={doc} onRefresh={fetchDoc} />
            </div>

            {/* Error Banner */}
            {doc.errorMsg && (
                <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-red-400">Pipeline Error</p>
                        <p className="text-xs text-red-300/70 mt-0.5 break-words">{doc.errorMsg}</p>
                    </div>
                </div>
            )}

            {/* Generating indicator with stuck detection */}
            {doc.status === "GENERATING" && (
                <GeneratingBanner doc={doc} onRefresh={fetchDoc} />
            )}

            {/* Pipeline Overview */}
            <PipelineOverview doc={doc} />

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-gray-900/50 border border-gray-800 rounded-xl p-1">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                            activeTab === tab.id
                                ? "bg-violet-500/15 text-violet-400 shadow-sm"
                                : "text-gray-500 hover:text-white hover:bg-gray-800/60"
                        )}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="min-h-[500px]">
                {activeTab === "script" && <ScriptTab doc={doc} onRefresh={fetchDoc} />}
                {activeTab === "shots" && <ShotMatrixTab doc={doc} onRefresh={fetchDoc} />}
                {activeTab === "assets" && <AssetsTab doc={doc} onRefresh={fetchDoc} />}
                {activeTab === "progress" && <ProgressTab doc={doc} onRefresh={fetchDoc} />}
                {activeTab === "preview" && <PreviewTab doc={doc} onRefresh={fetchDoc} />}
                {activeTab === "assembly" && <AssemblyTab doc={doc} onRefresh={fetchDoc} />}
                {activeTab === "publish" && <PublishTab doc={doc} />}
            </div>
        </div>
    );
}

/* ────── Status Badge ────── */
function StatusBadge({ status }: { status: string }) {
    const config: Record<string, { label: string; class: string }> = {
        DRAFT: { label: "Draft", class: "bg-gray-500/15 text-gray-400" },
        SCENES_PLANNED: { label: "Scenes Planned", class: "bg-blue-500/15 text-blue-400" },
        ASSETS_READY: { label: "Assets Ready", class: "bg-cyan-500/15 text-cyan-400" },
        GENERATING: { label: "Generating...", class: "bg-violet-500/15 text-violet-400" },
        ASSEMBLING: { label: "Assembling...", class: "bg-amber-500/15 text-amber-400" },
        REVIEW: { label: "Ready for Review", class: "bg-yellow-500/15 text-yellow-400" },
        APPROVED: { label: "Approved", class: "bg-emerald-500/15 text-emerald-400" },
        PUBLISHED: { label: "Published", class: "bg-green-500/15 text-green-400" },
        FAILED: { label: "Failed", class: "bg-red-500/15 text-red-400" },
    };
    const c = config[status] || config.DRAFT;
    return <span className={cn("text-xs font-medium px-3 py-1.5 rounded-full", c.class)}>{c.label}</span>;
}

/* ────── Pipeline Overview ────── */
function PipelineOverview({ doc }: { doc: any }) {
    const articles = doc.rawArticles ? (Array.isArray(doc.rawArticles) ? doc.rawArticles : []) : [];
    const scriptWords = doc.script ? doc.script.split(/\s+/).length : 0;
    const sceneCount = doc.scenes?.length || 0;
    const assetCount = doc.assets?.length || 0;
    const jobs = doc.genJobs || [];

    const assetJobs = jobs.filter((j: any) => j.jobType === "ref_image");
    const clipJobs = jobs.filter((j: any) => j.jobType === "shot_video");
    const completedAssets = assetJobs.filter((j: any) => j.status === "COMPLETED").length;
    const failedAssets = assetJobs.filter((j: any) => j.status === "FAILED").length;
    const completedClips = clipJobs.filter((j: any) => j.status === "COMPLETED").length;

    // Determine step states
    type StepState = "done" | "active" | "pending" | "failed";
    const STATUS_ORDER = ["DRAFT", "GENERATING", "SCENES_PLANNED", "ASSETS_READY", "ASSEMBLING", "REVIEW", "APPROVED", "PUBLISHED"];
    const statusIdx = STATUS_ORDER.indexOf(doc.status);

    const getStepState = (stepMinStatus: string, activeCheck?: boolean): StepState => {
        if (doc.status === "FAILED") return "failed";
        const minIdx = STATUS_ORDER.indexOf(stepMinStatus);
        if (statusIdx > minIdx) return "done";
        if (statusIdx === minIdx || activeCheck) return "active";
        return "pending";
    };

    const steps: { label: string; icon: any; state: StepState; detail: string }[] = [
        {
            label: "Research",
            icon: Sparkles,
            state: articles.length > 0 ? "done" : (doc.status === "GENERATING" ? "active" : "pending"),
            detail: articles.length > 0 ? `${articles.length} articles synthesized` : "Waiting to start",
        },
        {
            label: "Script",
            icon: FileText,
            state: doc.script ? "done" : (doc.status === "GENERATING" && articles.length > 0 ? "active" : "pending"),
            detail: doc.script ? `${scriptWords.toLocaleString()} words • ~${Math.round(scriptWords / 150)} min` : "Pending research",
        },
        {
            label: "Scenes",
            icon: Grid3X3,
            state: sceneCount > 0 ? "done" : (doc.status === "GENERATING" && doc.script ? "active" : "pending"),
            detail: sceneCount > 0 ? `${sceneCount} scenes planned` : "Pending script",
        },
        {
            label: "Assets",
            icon: Image,
            state: assetJobs.length > 0
                ? (completedAssets === assetJobs.length ? "done" : (completedAssets > 0 || doc.status === "SCENES_PLANNED" ? "active" : "pending"))
                : (sceneCount > 0 ? "pending" : "pending"),
            detail: assetJobs.length > 0
                ? `${completedAssets}/${assetJobs.length} images${failedAssets > 0 ? ` • ${failedAssets} failed` : ""}`
                : (assetCount > 0 ? `${assetCount} assets defined` : "Pending scenes"),
        },
        {
            label: "Clips",
            icon: Film,
            state: clipJobs.length > 0
                ? (completedClips === clipJobs.length ? "done" : "active")
                : "pending",
            detail: clipJobs.length > 0 ? `${completedClips}/${clipJobs.length} clips` : "After assets",
        },
        {
            label: "Assembly",
            icon: Wrench,
            state: getStepState("ASSEMBLING"),
            detail: doc.finalVideoPath ? "Complete" : (doc.status === "ASSEMBLING" ? "In progress..." : "Final step"),
        },
    ];

    const stateColors: Record<StepState, string> = {
        done: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30",
        active: "text-violet-400 bg-violet-500/15 border-violet-500/30",
        pending: "text-gray-600 bg-gray-800/50 border-gray-700/30",
        failed: "text-red-400 bg-red-500/15 border-red-500/30",
    };

    const stateIcons: Record<StepState, any> = {
        done: CheckCircle2,
        active: Loader2,
        pending: Clock,
        failed: XCircle,
    };

    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-violet-400" />
                Pipeline
            </h3>

            {/* Step indicators */}
            <div className="flex items-start gap-2">
                {steps.map((step, i) => {
                    const StateIcon = stateIcons[step.state];
                    return (
                        <div key={step.label} className="flex items-start flex-1 min-w-0">
                            <div className="flex flex-col items-center flex-1 min-w-0">
                                <div className={cn(
                                    "w-9 h-9 rounded-xl border flex items-center justify-center mb-2",
                                    stateColors[step.state]
                                )}>
                                    {step.state === "active" ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : step.state === "done" ? (
                                        <CheckCircle2 className="w-4 h-4" />
                                    ) : step.state === "failed" ? (
                                        <XCircle className="w-4 h-4" />
                                    ) : (
                                        <step.icon className="w-4 h-4" />
                                    )}
                                </div>
                                <p className={cn("text-xs font-medium mb-0.5 text-center",
                                    step.state === "done" ? "text-emerald-400" :
                                        step.state === "active" ? "text-violet-400" :
                                            step.state === "failed" ? "text-red-400" : "text-gray-500"
                                )}>{step.label}</p>
                                <p className="text-[10px] text-gray-600 text-center leading-tight">{step.detail}</p>
                            </div>
                            {i < steps.length - 1 && (
                                <div className={cn(
                                    "w-6 h-px mt-[18px] flex-shrink-0",
                                    steps[i + 1].state !== "pending" ? "bg-emerald-500/40" : "bg-gray-700"
                                )} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Job Activity Feed — show when there are active jobs */}
            {jobs.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                    <p className="text-xs font-medium text-gray-400 mb-2">Job Activity</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                        {jobs.slice(0, 12).map((job: any) => (
                            <div key={job.id} className="flex items-center gap-2 text-xs py-1">
                                {job.status === "COMPLETED" && <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
                                {job.status === "PROCESSING" && <Loader2 className="w-3 h-3 text-violet-400 animate-spin flex-shrink-0" />}
                                {job.status === "QUEUED" && <Clock className="w-3 h-3 text-gray-500 flex-shrink-0" />}
                                {job.status === "FAILED" && <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />}
                                <span className={cn("truncate flex-1",
                                    job.status === "COMPLETED" ? "text-gray-400" :
                                        job.status === "FAILED" ? "text-red-400" :
                                            job.status === "PROCESSING" ? "text-violet-300" : "text-gray-500"
                                )}>
                                    {job.jobType === "ref_image" ? "🖼️" : "🎬"} {job.prompt?.slice(0, 60) || "Job"}...
                                </span>
                                <span className={cn("text-[10px] flex-shrink-0",
                                    job.status === "COMPLETED" ? "text-emerald-500" :
                                        job.status === "FAILED" ? "text-red-500" :
                                            job.status === "PROCESSING" ? "text-violet-500" : "text-gray-600"
                                )}>
                                    {job.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ────── Generating Banner with Stuck Detection ────── */
function GeneratingBanner({ doc, onRefresh }: { doc: any; onRefresh: () => void }) {
    const [elapsed, setElapsed] = useState(0);
    const [resetting, setResetting] = useState(false);

    useEffect(() => {
        const start = new Date(doc.updatedAt).getTime();
        const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [doc.updatedAt]);

    // Check if jobs are actively running
    const jobs = doc.genJobs || [];
    const completed = jobs.filter((j: any) => j.status === "COMPLETED").length;
    const failed = jobs.filter((j: any) => j.status === "FAILED").length;
    const queued = jobs.filter((j: any) => j.status === "QUEUED" || j.status === "PROCESSING").length;
    const hasJobs = jobs.length > 0;
    const jobsActive = hasJobs && queued > 0;

    // Only stuck if: no jobs and >2min, OR all jobs done/failed and >2min
    const isStuck = !jobsActive && elapsed > 120;

    const forceReset = async () => {
        setResetting(true);
        await fetch(`/api/documentary/${doc.id}/generate-story`, { method: "POST" });
        setTimeout(onRefresh, 1000);
    };

    // Show progress message based on state
    let message: string;
    if (jobsActive) {
        message = `Generating assets... ${completed}/${jobs.length} images complete${failed > 0 ? `, ${failed} failed` : ''} (${queued} remaining)`;
    } else if (isStuck && !hasJobs) {
        message = `Pipeline appears stuck (${Math.floor(elapsed / 60)}m ${elapsed % 60}s). The server may have restarted mid-run.`;
    } else if (isStuck) {
        message = `All jobs finished but status wasn't updated. Click Force Retry to reset.`;
    } else {
        message = `AI is generating your documentary script and planning scenes... (${elapsed}s)`;
    }

    return (
        <div className={`flex items-center gap-3 p-3 rounded-xl ${jobsActive ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-violet-500/10 border border-violet-500/20'}`}>
            <Loader2 className={`w-4 h-4 animate-spin flex-shrink-0 ${jobsActive ? 'text-blue-400' : 'text-violet-400'}`} />
            <p className={`text-sm flex-1 ${jobsActive ? 'text-blue-300' : 'text-violet-300'}`}>
                {message}
            </p>
            {isStuck && (
                <button
                    onClick={forceReset}
                    disabled={resetting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 transition-colors flex-shrink-0"
                >
                    {resetting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                    Force Retry
                </button>
            )}
        </div>
    );
}

/* ────── Pipeline Action Buttons ────── */
function PipelineActions({ doc, onRefresh }: { doc: any; onRefresh: () => void }) {
    const [running, setRunning] = useState(false);

    const runAction = async (endpoint: string) => {
        setRunning(true);
        await fetch(`/api/documentary/${doc.id}/${endpoint}`, { method: "POST" });
        setTimeout(onRefresh, 1000);
        setRunning(false);
    };

    return (
        <div className="flex items-center gap-2">
            {doc.status === "DRAFT" && (
                <button onClick={() => runAction("generate-story")} disabled={running}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors">
                    {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Generate Story
                </button>
            )}
            {doc.status === "SCENES_PLANNED" && (
                <button onClick={() => runAction("generate-assets")} disabled={running}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors">
                    {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
                    Generate Assets
                </button>
            )}
            {doc.status === "ASSETS_READY" && (
                <button onClick={() => runAction("generate-clips")} disabled={running}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 transition-colors">
                    {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                    Generate Clips
                </button>
            )}
            {(doc.status === "GENERATING" || doc.status === "ASSETS_READY") && (
                <button onClick={() => runAction("assemble")} disabled={running}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 transition-colors">
                    {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                    Assemble
                </button>
            )}
            {(doc.status === "FAILED" || doc.status === "GENERATING") && (
                <button onClick={() => runAction("generate-story")} disabled={running}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-500 text-white disabled:opacity-50 transition-colors">
                    {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {doc.status === "GENERATING" ? "Force Retry" : "Retry"}
                </button>
            )}
            {doc.status === "GENERATING" && doc.genJobs?.some((j: any) => j.jobType === "shot_video" && j.status === "QUEUED") && (
                <button onClick={() => runAction("generate-clips")} disabled={running}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 transition-colors">
                    {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                    Retry Clips
                </button>
            )}
        </div>
    );
}

/* ────── Tab 1: Script Editor ────── */
function ScriptTab({ doc, onRefresh }: { doc: any; onRefresh: () => void }) {
    const [script, setScript] = useState(doc.script || "");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [regenerating, setRegenerating] = useState(false);

    const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
    const estMinutes = Math.round((wordCount / 150) * 10) / 10; // ~150 wpm narration pace

    const handleSave = async () => {
        setSaving(true);
        await fetch(`/api/documentary/${doc.id}/script`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ script }),
        });
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleRegenerate = async () => {
        if (!confirm("Regenerate the script? This will overwrite the current script and re-plan scenes.")) return;
        setRegenerating(true);
        await fetch(`/api/documentary/${doc.id}/generate-story`, { method: "POST" });
        setTimeout(() => { onRefresh(); setRegenerating(false); }, 2000);
    };

    if (!doc.script) {
        return (
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center">
                <FileText className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">No script yet</h3>
                <p className="text-xs text-gray-500">Click &ldquo;Generate Story&rdquo; to create the script from your source articles.</p>
            </div>
        );
    }

    // Render script with highlighted [VISUAL:...] markers
    const renderScript = (text: string) => {
        const parts = text.split(/(\[VISUAL:[^\]]*\])/g);
        return parts.map((part, i) => {
            if (part.match(/^\[VISUAL:/)) {
                return (
                    <span key={i} className="inline-block bg-violet-500/15 text-violet-300 rounded px-1.5 py-0.5 text-[11px] font-semibold border border-violet-500/30 mx-0.5">
                        🎬 {part.replace(/^\[VISUAL:\s*/, "").replace(/\]$/, "")}
                    </span>
                );
            }
            return <span key={i}>{part}</span>;
        });
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-4">
                    <h3 className="text-sm font-semibold text-white">Narration Script</h3>
                    <span className="text-xs text-gray-500">
                        {wordCount.toLocaleString()} words • ~{estMinutes} min
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleRegenerate} disabled={regenerating}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 disabled:opacity-50 transition-colors">
                        {regenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Regenerate
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 text-white disabled:opacity-50 transition-colors">
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <Save className="w-3 h-3" />}
                        {saved ? "Saved!" : "Save"}
                    </button>
                </div>
            </div>

            {/* Read-only preview with highlighted visual markers */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-3 text-sm text-gray-300 leading-relaxed max-h-32 overflow-y-auto">
                {renderScript(script.substring(0, 500))}
                {script.length > 500 && <span className="text-gray-600">...</span>}
            </div>

            {/* Editable textarea */}
            <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                rows={22}
                className="w-full bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors font-mono leading-relaxed resize-none"
            />
        </div>
    );
}

/* ────── Tab 2: Shot Matrix ────── */
function ShotMatrixTab({ doc, onRefresh }: { doc: any; onRefresh: () => void }) {
    const [editingShot, setEditingShot] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<any>({});
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [saving, setSaving] = useState(false);

    if (!doc.scenes || doc.scenes.length === 0) {
        return (
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center">
                <Grid3X3 className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">No scenes planned</h3>
                <p className="text-xs text-gray-500">Generate the story first to create the shot matrix.</p>
            </div>
        );
    }

    const startEdit = (shot: any) => {
        setEditingShot(shot.id);
        setEditForm({
            shotType: shot.shotType || "",
            cameraAngle: shot.cameraAngle || "",
            cameraMovement: shot.cameraMovement || "",
            action: shot.action || "",
            mood: shot.mood || "",
            lighting: shot.lighting || "",
            duration: shot.duration || 5,
        });
    };

    const saveEdit = async () => {
        if (!editingShot) return;
        setSaving(true);
        await fetch(`/api/documentary/shots/${editingShot}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(editForm),
        });
        setSaving(false);
        setEditingShot(null);
        onRefresh();
    };

    const deleteShot = async (shotId: string) => {
        if (!confirm("Delete this shot?")) return;
        await fetch(`/api/documentary/shots/${shotId}`, { method: "DELETE" });
        onRefresh();
    };

    const toggleScene = (sceneId: string) => {
        setCollapsed((prev) => ({ ...prev, [sceneId]: !prev[sceneId] }));
    };

    return (
        <div className="space-y-4">
            {doc.scenes.map((scene: any) => (
                <div key={scene.id} className="bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden">
                    {/* Scene header — clickable accordion */}
                    <button
                        onClick={() => toggleScene(scene.id)}
                        className="w-full px-5 py-3 border-b border-gray-800 bg-gray-900/80 flex items-center justify-between hover:bg-gray-800/60 transition-colors"
                    >
                        <h4 className="text-sm font-semibold text-white text-left">
                            Scene {scene.sceneIndex + 1}: {scene.title || "Untitled"}
                        </h4>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-500">
                                {scene.shots?.length || 0} shots • {scene.duration ? `${Math.round(scene.duration)}s` : "?"}
                            </span>
                            <ChevronDown className={cn("w-4 h-4 text-gray-500 transition-transform", collapsed[scene.id] && "-rotate-90")} />
                        </div>
                    </button>

                    {/* Shots grid — collapsible */}
                    {!collapsed[scene.id] && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-gray-800">
                                        <th className="px-4 py-2 text-left text-gray-500 font-medium">#</th>
                                        <th className="px-4 py-2 text-left text-gray-500 font-medium">
                                            <Camera className="w-3 h-3 inline mr-1" />Shot
                                        </th>
                                        <th className="px-4 py-2 text-left text-gray-500 font-medium">
                                            <Eye className="w-3 h-3 inline mr-1" />Angle
                                        </th>
                                        <th className="px-4 py-2 text-left text-gray-500 font-medium">
                                            <Move className="w-3 h-3 inline mr-1" />Movement
                                        </th>
                                        <th className="px-4 py-2 text-left text-gray-500 font-medium">Action</th>
                                        <th className="px-4 py-2 text-left text-gray-500 font-medium">
                                            <Palette className="w-3 h-3 inline mr-1" />Mood
                                        </th>
                                        <th className="px-4 py-2 text-left text-gray-500 font-medium">
                                            <Sun className="w-3 h-3 inline mr-1" />Light
                                        </th>
                                        <th className="px-4 py-2 text-left text-gray-500 font-medium">Dur</th>
                                        <th className="px-4 py-2 text-left text-gray-500 font-medium">Status</th>
                                        <th className="px-4 py-2 text-left text-gray-500 font-medium"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(scene.shots || []).map((shot: any) => (
                                        editingShot === shot.id ? (
                                            <tr key={shot.id} className="border-b border-gray-800/50 bg-violet-500/5">
                                                <td className="px-4 py-2 text-gray-500">{shot.shotIndex + 1}</td>
                                                <td className="px-2 py-1.5">
                                                    <input value={editForm.shotType} onChange={(e) => setEditForm({ ...editForm, shotType: e.target.value })}
                                                        className="w-full min-w-[80px] bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500" />
                                                </td>
                                                <td className="px-2 py-1.5">
                                                    <input value={editForm.cameraAngle} onChange={(e) => setEditForm({ ...editForm, cameraAngle: e.target.value })}
                                                        className="w-full min-w-[80px] bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500" />
                                                </td>
                                                <td className="px-2 py-1.5">
                                                    <input value={editForm.cameraMovement} onChange={(e) => setEditForm({ ...editForm, cameraMovement: e.target.value })}
                                                        className="w-full min-w-[80px] bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500" />
                                                </td>
                                                <td className="px-2 py-1.5">
                                                    <textarea value={editForm.action} onChange={(e) => setEditForm({ ...editForm, action: e.target.value })}
                                                        rows={3}
                                                        className="w-full min-w-[200px] bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500 resize-y" />
                                                </td>
                                                <td className="px-2 py-1.5">
                                                    <input value={editForm.mood} onChange={(e) => setEditForm({ ...editForm, mood: e.target.value })}
                                                        className="w-full min-w-[80px] bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500" />
                                                </td>
                                                <td className="px-2 py-1.5">
                                                    <input value={editForm.lighting} onChange={(e) => setEditForm({ ...editForm, lighting: e.target.value })}
                                                        className="w-full min-w-[80px] bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500" />
                                                </td>
                                                <td className="px-2 py-1.5">
                                                    <input type="number" value={editForm.duration} onChange={(e) => setEditForm({ ...editForm, duration: Number(e.target.value) })}
                                                        className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500" />
                                                </td>
                                                <td className="px-2 py-1.5" colSpan={2}>
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={saveEdit} disabled={saving}
                                                            className="px-2 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-medium disabled:opacity-50">
                                                            {saving ? "..." : "Save"}
                                                        </button>
                                                        <button onClick={() => setEditingShot(null)}
                                                            className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-[10px]">
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            <tr key={shot.id}
                                                className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors cursor-pointer"
                                                onClick={() => startEdit(shot)}
                                            >
                                                <td className="px-4 py-2.5 text-gray-500">{shot.shotIndex + 1}</td>
                                                <td className="px-4 py-2.5 text-white capitalize">{shot.shotType}</td>
                                                <td className="px-4 py-2.5 text-gray-300">{shot.cameraAngle || "-"}</td>
                                                <td className="px-4 py-2.5 text-gray-300">{shot.cameraMovement || "static"}</td>
                                                <td className="px-4 py-2.5 text-gray-300">{shot.action || "-"}</td>
                                                <td className="px-4 py-2.5">
                                                    <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">{shot.mood || "-"}</span>
                                                </td>
                                                <td className="px-4 py-2.5 text-gray-300">{shot.lighting || "-"}</td>
                                                <td className="px-4 py-2.5 text-gray-400">{shot.duration || 5}s</td>
                                                <td className="px-4 py-2.5">
                                                    {shot.clipPath ? (
                                                        <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                                                    ) : (
                                                        <Clock className="w-3.5 h-3.5 text-gray-600" />
                                                    )}
                                                </td>
                                                <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                                                    <button onClick={() => deleteShot(shot.id)}
                                                        className="p-1 rounded hover:bg-red-500/20 text-gray-600 hover:text-red-400 transition-colors">
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

/* ────── Tab 3: Assets Gallery ────── */
function AssetsTab({ doc, onRefresh }: { doc: any; onRefresh: () => void }) {
    const [modalImage, setModalImage] = useState<string | null>(null);
    const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());

    if (!doc.assets || doc.assets.length === 0) {
        return (
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center">
                <Image className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">No assets yet</h3>
                <p className="text-xs text-gray-500">Assets will be created after scene planning.</p>
            </div>
        );
    }

    const handleRegenerate = async (assetId: string) => {
        setRegeneratingIds((prev) => new Set(prev).add(assetId));
        await fetch(`/api/documentary/assets/${assetId}/regenerate`, { method: "POST" });
        setTimeout(() => {
            onRefresh();
            setRegeneratingIds((prev) => { const next = new Set(prev); next.delete(assetId); return next; });
        }, 2000);
    };

    const grouped = doc.assets.reduce((acc: Record<string, any[]>, a: any) => {
        const key = a.type;
        if (!acc[key]) acc[key] = [];
        acc[key].push(a);
        return acc;
    }, {} as Record<string, any[]>);

    return (
        <>
            <div className="space-y-6">
                {Object.entries(grouped).map(([type, assets]) => (
                    <div key={type}>
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                            {type} ({(assets as any[]).length})
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                            {(assets as any[]).map((asset: any) => (
                                <div key={asset.id} className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors group">
                                    <div className="aspect-square bg-gray-800 relative cursor-pointer"
                                        onClick={() => asset.imagePath && setModalImage(asset.imagePath)}>
                                        {asset.imagePath && !regeneratingIds.has(asset.id) ? (
                                            <img src={asset.imagePath} alt={asset.label} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
                                            </div>
                                        )}
                                        {asset.imagePath && !regeneratingIds.has(asset.id) && (
                                            <>
                                                <div className="absolute top-1.5 right-1.5">
                                                    <CheckCircle2 className="w-4 h-4 text-green-400 drop-shadow" />
                                                </div>
                                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                    <Maximize2 className="w-5 h-5 text-white" />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div className="p-2.5 flex items-center justify-between gap-1">
                                        <div className="min-w-0">
                                            <p className="text-xs font-medium text-white truncate">{asset.label}</p>
                                            {asset.attire && (
                                                <p className="text-[10px] text-gray-500 truncate mt-0.5">{asset.attire}</p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleRegenerate(asset.id)}
                                            disabled={regeneratingIds.has(asset.id)}
                                            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-violet-500/20 text-gray-500 hover:text-violet-400 transition-colors disabled:opacity-50"
                                            title="Regenerate"
                                        >
                                            <RotateCcw className={cn("w-3 h-3", regeneratingIds.has(asset.id) && "animate-spin")} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Full-size image modal */}
            {modalImage && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8"
                    onClick={() => setModalImage(null)}>
                    <button className="absolute top-4 right-4 p-2 rounded-full bg-gray-800 hover:bg-gray-700 text-white">
                        <X className="w-5 h-5" />
                    </button>
                    <img src={modalImage} alt="" className="max-w-full max-h-full rounded-xl object-contain" />
                </div>
            )}
        </>
    );
}

/* ────── Tab 4: Generation Progress ────── */
function ProgressTab({ doc, onRefresh }: { doc: any; onRefresh: () => void }) {
    const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
    const jobs = doc.genJobs || [];
    const stats = {
        total: jobs.length,
        queued: jobs.filter((j: any) => j.status === "QUEUED").length,
        processing: jobs.filter((j: any) => j.status === "PROCESSING").length,
        completed: jobs.filter((j: any) => j.status === "COMPLETED").length,
        failed: jobs.filter((j: any) => j.status === "FAILED").length,
    };
    const pct = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;
    const remaining = stats.queued + stats.processing;
    const estMinRemaining = remaining > 0 ? Math.ceil(remaining * 2.5) : 0; // ~2.5min avg per job

    const retryJob = async (job: any) => {
        setRetryingIds((prev) => new Set(prev).add(job.id));
        // Determine which regenerate API to call based on job type
        if (job.jobType === "ref_image" && job.assetId) {
            await fetch(`/api/documentary/assets/${job.assetId}/regenerate`, { method: "POST" });
        } else if (job.shotId) {
            await fetch(`/api/documentary/shots/${job.shotId}/regenerate`, { method: "POST" });
        }
        setTimeout(() => {
            onRefresh();
            setRetryingIds((prev) => { const next = new Set(prev); next.delete(job.id); return next; });
        }, 2000);
    };

    return (
        <div className="space-y-6">
            {/* Stats bar */}
            <div className="grid grid-cols-5 gap-3">
                {[
                    { label: "Total", value: stats.total, color: "text-white" },
                    { label: "Queued", value: stats.queued, color: "text-gray-400" },
                    { label: "Processing", value: stats.processing, color: "text-blue-400" },
                    { label: "Completed", value: stats.completed, color: "text-green-400" },
                    { label: "Failed", value: stats.failed, color: "text-red-400" },
                ].map((s) => (
                    <div key={s.label} className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-center">
                        <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
                        <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* Progress bar + ETA */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-white font-medium">Overall Progress</span>
                    <div className="flex items-center gap-3">
                        {estMinRemaining > 0 && (
                            <span className="text-xs text-gray-500">~{estMinRemaining} min remaining</span>
                        )}
                        <span className="text-sm text-violet-400 font-mono">{pct}%</span>
                    </div>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>

            {/* Job list */}
            <div className="space-y-1">
                {jobs.slice(0, 50).map((job: any) => (
                    <div key={job.id} className="flex items-center gap-3 px-4 py-2 bg-gray-900/30 border border-gray-800/50 rounded-lg text-xs">
                        {job.status === "COMPLETED" && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
                        {job.status === "FAILED" && <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                        {job.status === "PROCESSING" && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />}
                        {job.status === "QUEUED" && <Clock className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />}
                        <span className="text-gray-400 capitalize">{job.jobType.replace("_", " ")}</span>
                        <span className="flex-1 text-gray-600 truncate font-mono">{job.id.slice(0, 12)}</span>
                        {job.errorMsg && <span className="text-red-400 truncate max-w-[200px]">{job.errorMsg}</span>}
                        {job.status === "FAILED" && (
                            <button
                                onClick={() => retryJob(job)}
                                disabled={retryingIds.has(job.id)}
                                className="px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 text-[10px] font-medium disabled:opacity-50 transition-colors"
                            >
                                {retryingIds.has(job.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : "Retry"}
                            </button>
                        )}
                    </div>
                ))}
                {jobs.length === 0 && (
                    <div className="text-center py-8 text-gray-500 text-sm">No generation jobs yet</div>
                )}
            </div>
        </div>
    );
}

/* ────── Tab 5: Scene Preview ────── */
function PreviewTab({ doc, onRefresh }: { doc: any; onRefresh: () => void }) {
    const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());
    const r2Base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "https://pub-1dd40b8f57a8493ebc23552a93ea62bd.r2.dev";
    const r2Url = (path: string | null) => path ? (path.startsWith("http") ? path : `${r2Base}/${path}`) : "";

    // Gather all shots with their scene info
    const allShots = (doc.scenes || []).flatMap((scene: any) =>
        (scene.shots || []).map((shot: any) => ({
            ...shot,
            sceneTitle: scene.title || `Scene ${scene.sceneIndex + 1}`,
            sceneIndex: scene.sceneIndex,
            narration: scene.narrationText,
        }))
    );

    const shotsWithClips = allShots.filter((s: any) => s.clipPath);

    if (allShots.length === 0) {
        return (
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center">
                <Play className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">No shots to preview</h3>
                <p className="text-xs text-gray-500">Generate scenes first, then clips will appear here.</p>
            </div>
        );
    }

    const handleRegenerate = async (shot: any) => {
        setRegeneratingIds((prev) => new Set(prev).add(shot.id));
        await fetch(`/api/documentary/shots/${shot.id}/regenerate`, { method: "POST" });
        setTimeout(() => {
            onRefresh();
            setRegeneratingIds((prev) => { const next = new Set(prev); next.delete(shot.id); return next; });
        }, 2000);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                    Scene Clips ({shotsWithClips.length}/{allShots.length} ready)
                </h3>
            </div>

            {/* Shot-by-shot preview */}
            {allShots.map((shot: any) => (
                <div key={shot.id} className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="flex flex-col md:flex-row">
                        {/* Video/placeholder */}
                        <div className="md:w-1/2 aspect-video bg-black relative">
                            {shot.clipPath && !regeneratingIds.has(shot.id) ? (
                                <video
                                    src={r2Url(shot.clipPath)}
                                    controls
                                    className="w-full h-full object-contain"
                                    preload="metadata"
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                                    {regeneratingIds.has(shot.id) ? (
                                        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
                                    ) : (
                                        <Film className="w-8 h-8 text-gray-700" />
                                    )}
                                    <p className="text-xs text-gray-600">
                                        {regeneratingIds.has(shot.id) ? "Regenerating..." : "Clip not yet generated"}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Shot info + script */}
                        <div className="md:w-1/2 p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-gray-500">{shot.sceneTitle}</p>
                                    <p className="text-sm font-medium text-white capitalize">
                                        {shot.shotType} — {shot.cameraAngle || "eye level"} ({shot.cameraMovement || "static"})
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleRegenerate(shot)}
                                    disabled={regeneratingIds.has(shot.id)}
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 text-[10px] font-medium disabled:opacity-50 transition-colors"
                                >
                                    <RotateCcw className={cn("w-3 h-3", regeneratingIds.has(shot.id) && "animate-spin")} />
                                    Regen
                                </button>
                            </div>
                            {shot.action && (
                                <p className="text-xs text-gray-400">{shot.action}</p>
                            )}
                            <div className="flex items-center gap-3 text-[10px] text-gray-500">
                                <span>🎭 {shot.mood || "neutral"}</span>
                                <span>💡 {shot.lighting || "natural"}</span>
                                <span>⏱ {shot.duration || 5}s</span>
                            </div>
                            {shot.narration && (
                                <div className="mt-2 p-2 bg-gray-800/50 rounded-lg border border-gray-700/50">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Narration</p>
                                    <p className="text-xs text-gray-300 leading-relaxed">
                                        {shot.narration}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ────── Tab 6: Final Assembly ────── */
function AssemblyTab({ doc, onRefresh }: { doc: any; onRefresh: () => void }) {
    const [assembling, setAssembling] = useState(false);
    const [fillerMode, setFillerMode] = useState(doc.fillerMode || "kenburns");
    const [savingMode, setSavingMode] = useState(false);
    const r2Base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "https://pub-1dd40b8f57a8493ebc23552a93ea62bd.r2.dev";

    const fillerOptions = [
        { value: "kenburns", label: "Ken Burns", desc: "Slow zoom/pan on asset images" },
        { value: "procedural", label: "Abstract Animations", desc: "Procedural fractal/particle effects" },
        { value: "stock", label: "Stock Video (Pexels)", desc: "Context-matched stock footage" },
        { value: "kenburns+stock", label: "Ken Burns + Stock", desc: "Mix of assets and stock footage" },
    ];

    const updateFillerMode = async (mode: string) => {
        setFillerMode(mode);
        setSavingMode(true);
        await fetch(`/api/documentary/${doc.id}/settings`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fillerMode: mode }),
        });
        setSavingMode(false);
    };

    const triggerAssembly = async () => {
        setAssembling(true);
        await fetch(`/api/documentary/${doc.id}/assemble`, { method: "POST" });
        setTimeout(onRefresh, 1500);
        setAssembling(false);
    };

    const videoUrl = doc.finalVideoPath
        ? (doc.finalVideoPath.startsWith("http") ? doc.finalVideoPath : `${r2Base}/${doc.finalVideoPath}`)
        : null;

    // Filler mode selector component
    const FillerSelector = () => (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 mb-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Visual Fill Mode {savingMode && <Loader2 className="w-3 h-3 inline animate-spin ml-1" />}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {fillerOptions.map((opt) => (
                    <button
                        key={opt.value}
                        onClick={() => updateFillerMode(opt.value)}
                        className={cn(
                            "text-left p-3 rounded-lg border transition-all",
                            fillerMode === opt.value
                                ? "border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-500/30"
                                : "border-gray-700 bg-gray-800/50 hover:bg-gray-800"
                        )}
                    >
                        <p className={cn(
                            "text-xs font-semibold",
                            fillerMode === opt.value ? "text-amber-400" : "text-white"
                        )}>
                            {opt.label}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{opt.desc}</p>
                    </button>
                ))}
            </div>
        </div>
    );

    // Show video player if final video exists
    if (videoUrl) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Final Documentary</h3>
                    {doc.totalDuration && (
                        <span className="text-xs text-gray-500">
                            {Math.floor(doc.totalDuration / 60)}m {Math.round(doc.totalDuration % 60)}s
                        </span>
                    )}
                </div>
                <div className="bg-black rounded-xl overflow-hidden aspect-video">
                    <video
                        controls
                        className="w-full h-full"
                        src={videoUrl}
                    >
                        Your browser does not support video playback.
                    </video>
                </div>
                <FillerSelector />
                <div className="flex items-center gap-3">
                    <button
                        onClick={triggerAssembly}
                        disabled={assembling}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gray-800 hover:bg-gray-700 text-white disabled:opacity-50 transition-colors"
                    >
                        <RefreshCw className={cn("w-4 h-4", assembling && "animate-spin")} />
                        Re-assemble
                    </button>
                </div>
            </div>
        );
    }

    // Show assemble trigger
    if (doc.status === "ASSEMBLING") {
        return (
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center">
                <Loader2 className="w-10 h-10 text-amber-400 mx-auto mb-3 animate-spin" />
                <h3 className="text-sm font-semibold text-white mb-1">Assembling Documentary...</h3>
                <p className="text-xs text-gray-500">Generating narration, creating filler visuals, and mixing audio. This may take several minutes.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <FillerSelector />
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center">
                <Film className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">Final Assembly</h3>
                <p className="text-xs text-gray-500 max-w-md mx-auto mb-4">
                    Scene clips will be interleaved with {fillerMode === "kenburns" ? "Ken Burns animations on asset images" : fillerMode === "stock" ? "Pexels stock footage" : fillerMode === "kenburns+stock" ? "a mix of Ken Burns and stock footage" : "abstract procedural animations"} to fill the full narration duration.
                </p>
                <button
                    onClick={triggerAssembly}
                    disabled={assembling}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 transition-colors"
                >
                    {assembling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                    Assemble Documentary
                </button>
            </div>
        </div>
    );
}

/* ────── Tab 7: Publish ────── */
function PublishTab({ doc }: { doc: any }) {
    const [platform, setPlatform] = useState("YOUTUBE");
    const [title, setTitle] = useState(doc.title || "");
    const [description, setDescription] = useState("");
    const [hashtags, setHashtags] = useState("");
    const [generating, setGenerating] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [published, setPublished] = useState(doc.status === "PUBLISHED");

    const generateDescriptions = async () => {
        setGenerating(true);
        const res = await fetch(`/api/documentary/${doc.id}/publish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "generate", platform }),
        });
        const data = await res.json();
        setTitle(data.title || "");
        setDescription(data.description || "");
        setHashtags((data.hashtags || []).join(" "));
        setGenerating(false);
    };

    const handleApprove = async () => {
        await fetch(`/api/documentary/${doc.id}/publish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "approve" }),
        });
    };

    const handlePublish = async () => {
        setPublishing(true);
        await fetch(`/api/documentary/${doc.id}/publish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "publish" }),
        });
        setPublishing(false);
        setPublished(true);
    };

    if (published) {
        return (
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">Published!</h3>
                <p className="text-xs text-gray-500">This documentary has been published.</p>
            </div>
        );
    }

    if (!doc.finalVideoPath) {
        return (
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center">
                <Send className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">Not Ready</h3>
                <p className="text-xs text-gray-500">Assemble the documentary first before publishing.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Platform selector + generate */}
            <div className="flex items-center gap-3">
                <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
                >
                    <option value="YOUTUBE">YouTube</option>
                    <option value="INSTAGRAM">Instagram</option>
                    <option value="TIKTOK">TikTok</option>
                    <option value="GENERIC">Generic</option>
                </select>
                <button
                    onClick={generateDescriptions}
                    disabled={generating}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
                >
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Generate AI Description
                </button>
            </div>

            {/* Editable fields */}
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Title</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Description</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={4}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors resize-none"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Hashtags</label>
                    <input
                        type="text"
                        value={hashtags}
                        onChange={(e) => setHashtags(e.target.value)}
                        placeholder="#documentary #science #ai"
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-2">
                <button
                    onClick={handleApprove}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                >
                    <CheckCircle2 className="w-4 h-4" />
                    Approve
                </button>
                <button
                    onClick={handlePublish}
                    disabled={publishing}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white disabled:opacity-50 transition-all shadow-lg shadow-violet-500/20"
                >
                    {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Publish
                </button>
            </div>
        </div>
    );
}
