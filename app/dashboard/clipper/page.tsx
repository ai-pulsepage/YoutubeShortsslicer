"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
    Scissors,
    Play,
    Download,
    Loader2,
    Sparkles,
    Flame,
    Zap,
    RefreshCw,
    ExternalLink,
    DollarSign,
    TrendingUp,
    CheckCircle2,
    AlertCircle,
    Film,
    Share2,
    Clock,
    Eye,
    Upload,
    FileVideo,
    Trash2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────

interface ClipProject {
    id: string;
    videoId: string;
    campaignName: string | null;
    campaignCpm: number | null;
    campaignPlatforms: string[];
    captionStyle: string;
    faceTrack: boolean;
    hookOverlay: boolean;
    ctaOverlay: boolean;
    ctaText: string | null;
    status: string;
    clipCount: number;
    createdAt: string;
    video: {
        id: string;
        title: string | null;
        thumbnail: string | null;
        duration: number | null;
        status: string;
        sourceUrl: string;
    };
    totalSegments: number;
    renderedClips: number;
}

interface Segment {
    id: string;
    title: string | null;
    description: string | null;
    startTime: number;
    endTime: number;
    duration: number;
    viralScore: number | null;
    hookStrength: number | null;
    emotionalArc: string | null;
    status: string;
    shortVideo: {
        id: string;
        storagePath: string | null;
        duration: number | null;
        status: string;
    } | null;
}

interface ProjectDetail {
    id: string;
    campaignName: string | null;
    campaignCpm: number | null;
    status: string;
    video: {
        title: string | null;
        duration: number | null;
    };
    renderedClips: Segment[];
    pendingClips: Segment[];
    totalClips: number;
    renderedCount: number;
}

// ─── Helper Components ───────────────────────────────────

function ViralScoreBadge({ score }: { score: number | null }) {
    if (!score) return null;
    const color =
        score >= 9
            ? "bg-red-500/20 text-red-400 border-red-500/30"
            : score >= 7
            ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
            : score >= 5
            ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
            : "bg-gray-500/20 text-gray-400 border-gray-500/30";

    const icon = score >= 9 ? Flame : score >= 7 ? Zap : Sparkles;
    const Icon = icon;

    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${color}`}
        >
            <Icon className="w-3 h-3" />
            {score}/10
        </span>
    );
}

function StatusBadge({ status }: { status: string }) {
    const colors: Record<string, string> = {
        DOWNLOADING: "bg-blue-500/20 text-blue-400",
        TRANSCRIBING: "bg-purple-500/20 text-purple-400",
        SEGMENTING: "bg-orange-500/20 text-orange-400",
        READY: "bg-emerald-500/20 text-emerald-400",
        FAILED: "bg-red-500/20 text-red-400",
        RENDERING: "bg-yellow-500/20 text-yellow-400",
        RENDERED: "bg-emerald-500/20 text-emerald-400",
        AI_SUGGESTED: "bg-violet-500/20 text-violet-400",
    };

    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                colors[status] || "bg-gray-500/20 text-gray-400"
            }`}
        >
            {status === "DOWNLOADING" || status === "TRANSCRIBING" || status === "SEGMENTING" || status === "RENDERING" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
            ) : status === "READY" || status === "RENDERED" ? (
                <CheckCircle2 className="w-3 h-3" />
            ) : status === "FAILED" ? (
                <AlertCircle className="w-3 h-3" />
            ) : null}
            {status.replace(/_/g, " ")}
        </span>
    );
}

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Main Page ───────────────────────────────────────────

export default function ClipStudioPage() {
    const [projects, setProjects] = useState<ClipProject[]>([]);
    const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [rendering, setRendering] = useState<Set<string>>(new Set());

    // Form state
    const [inputMode, setInputMode] = useState<"url" | "upload">("url");
    const [url, setUrl] = useState("");
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadProgress, setUploadProgress] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedBriefId, setSelectedBriefId] = useState("");
    const [briefs, setBriefs] = useState<{id: string; name: string; brand: string | null; cpmRate: number | null; targetPlatforms: string[]; watermarkRequired: boolean; disclosureRequired: boolean}[]>([]);
    const [campaignName, setCampaignName] = useState("");
    const [campaignCpm, setCampaignCpm] = useState("");
    const [captionStyle, setCaptionStyle] = useState("word-highlight");
    const [faceTrack, setFaceTrack] = useState(true);
    const [ctaText, setCtaText] = useState("Follow for more");

    // Earnings calculator
    const [viewCount, setViewCount] = useState("");

    // Subtitle settings for render
    const [subAnimation, setSubAnimation] = useState("word-highlight");
    const [subFont, setSubFont] = useState("Montserrat");
    const [subPosition, setSubPosition] = useState("bottom");
    const [subColor, setSubColor] = useState("#FFFFFF");

    // ─── Data Fetching ───────────────────────────────────

    const fetchProjects = useCallback(async () => {
        try {
            const res = await fetch("/api/clipper");
            if (res.ok) {
                const data = await res.json();
                setProjects(data);
            }
        } catch (err) {
            console.error("Failed to fetch projects:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchProjectDetail = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/clipper/${id}`);
            if (res.ok) {
                const data = await res.json();
                setSelectedProject(data);
            }
        } catch (err) {
            console.error("Failed to fetch project:", err);
        }
    }, []);

    useEffect(() => {
        fetchProjects();
        // Fetch campaign briefs for selector
        fetch("/api/briefs").then(r => r.ok ? r.json() : []).then(data => {
            if (Array.isArray(data)) setBriefs(data);
        }).catch(() => {});
        // Auto-refresh every 10 seconds for processing updates
        const interval = setInterval(fetchProjects, 10000);
        return () => clearInterval(interval);
    }, [fetchProjects]);

    // ─── Actions ─────────────────────────────────────────

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();

        if (inputMode === "upload" && uploadFile) {
            // Two-step presigned URL upload: init → upload to R2 → finalize
            setCreating(true);
            setUploadProgress("Initializing...");
            try {
                // Step 1: Init — get presigned R2 URL
                const initRes = await fetch("/api/clipper/upload", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "init",
                        fileName: uploadFile.name,
                        fileSize: uploadFile.size,
                        contentType: uploadFile.type || "video/mp4",
                        title: uploadFile.name.replace(/\.[^.]+$/, ""),
                        briefId: selectedBriefId || null,
                        campaignName: campaignName || null,
                        campaignCpm: campaignCpm || null,
                        captionStyle,
                        faceTrack,
                    }),
                });

                if (!initRes.ok) {
                    const err = await initRes.json();
                    throw new Error(err.error || "Init failed");
                }

                const { videoId, projectId, uploadUrl, r2Key } = await initRes.json();
                setUploadProgress("Uploading to cloud...");

                // Step 2: Upload directly to R2 (bypasses Railway proxy)
                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open("PUT", uploadUrl, true);
                    xhr.setRequestHeader("Content-Type", uploadFile!.type || "video/mp4");

                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) {
                            const pct = Math.round((e.loaded / e.total) * 100);
                            setUploadProgress(`Uploading... ${pct}% (${(e.loaded / 1024 / 1024).toFixed(0)}MB / ${(e.total / 1024 / 1024).toFixed(0)}MB)`);
                        }
                    };

                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) resolve();
                        else reject(new Error(`R2 upload failed: HTTP ${xhr.status}`));
                    };
                    xhr.onerror = () => reject(new Error("R2 upload network error"));
                    xhr.ontimeout = () => reject(new Error("R2 upload timed out"));
                    xhr.timeout = 3600000; // 1 hour

                    xhr.send(uploadFile);
                });

                setUploadProgress("Starting AI analysis...");

                // Step 3: Finalize — start transcription pipeline
                const finalRes = await fetch("/api/clipper/upload", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "finalize", videoId, projectId, r2Key }),
                });

                if (!finalRes.ok) {
                    const err = await finalRes.json();
                    throw new Error(err.error || "Finalize failed");
                }

                setUploadFile(null);
                setCampaignName("");
                setCampaignCpm("");
                setUploadProgress("");
                if (fileInputRef.current) fileInputRef.current.value = "";
                await fetchProjects();
            } catch (err: any) {
                console.error("Upload error:", err);
                alert(`Upload failed: ${err.message}`);
            } finally {
                setCreating(false);
                setUploadProgress("");
            }
            return;
        }

        // URL mode
        if (!url.trim()) return;

        setCreating(true);
        try {
            const res = await fetch("/api/clipper", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sourceUrl: url.trim(),
                    briefId: selectedBriefId || null,
                    campaignName: campaignName || null,
                    campaignCpm: campaignCpm || null,
                    captionStyle,
                    faceTrack,
                    ctaText: ctaText || "Follow for more",
                }),
            });

            if (res.ok) {
                setUrl("");
                setCampaignName("");
                setCampaignCpm("");
                await fetchProjects();
            } else {
                const err = await res.json();
                alert(err.error || "Failed to create project");
            }
        } catch (err) {
            console.error("Create error:", err);
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteProject = async (projectId: string) => {
        if (!confirm("Delete this project? This cannot be undone.")) return;
        try {
            const res = await fetch(`/api/clipper/${projectId}`, { method: "DELETE" });
            if (res.ok) {
                setProjects((prev) => prev.filter((p) => p.id !== projectId));
                if (selectedProject?.id === projectId) setSelectedProject(null);
            }
        } catch (err) {
            console.error("Delete error:", err);
        }
    };

    const handleRetryProject = async (projectId: string) => {
        try {
            const res = await fetch(`/api/clipper/${projectId}/retry`, { method: "POST" });
            if (res.ok) {
                alert("🔄 Retrying transcription — check back in a few minutes");
                await fetchProjects();
            } else {
                const err = await res.json();
                alert(err.error || "Retry failed");
            }
        } catch (err) {
            console.error("Retry error:", err);
        }
    };

    const handleRenderAll = async (projectId: string) => {
        setRendering((prev) => new Set(prev).add(projectId));
        try {
            const res = await fetch(`/api/clipper/${projectId}/render`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ all: true, subtitleStyle: { animation: subAnimation, font: subFont, position: subPosition, color: subColor } }),
            });

            if (res.ok) {
                const data = await res.json();
                alert(`🎬 ${data.message}`);
                await fetchProjects();
                if (selectedProject?.id === projectId) {
                    await fetchProjectDetail(projectId);
                }
            }
        } catch (err) {
            console.error("Render error:", err);
        } finally {
            setRendering((prev) => {
                const next = new Set(prev);
                next.delete(projectId);
                return next;
            });
        }
    };

    const handleRenderSegment = async (projectId: string, segmentId: string) => {
        setRendering((prev) => new Set(prev).add(segmentId));
        try {
            const res = await fetch(`/api/clipper/${projectId}/render`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ segmentIds: [segmentId], subtitleStyle: { animation: subAnimation, font: subFont, position: subPosition, color: subColor } }),
            });

            if (res.ok) {
                if (selectedProject) {
                    await fetchProjectDetail(selectedProject.id);
                }
            }
        } catch (err) {
            console.error("Render error:", err);
        } finally {
            setRendering((prev) => {
                const next = new Set(prev);
                next.delete(segmentId);
                return next;
            });
        }
    };

    // ─── Render ──────────────────────────────────────────

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500">
                            <Scissors className="w-7 h-7 text-white" />
                        </div>
                        Clip Studio
                    </h1>
                    <p className="text-gray-400 mt-1">
                        Paste a URL → Get viral clips → Post & earn
                    </p>
                </div>
                <button
                    onClick={fetchProjects}
                    className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                    title="Refresh"
                >
                    <RefreshCw className="w-5 h-5" />
                </button>
            </div>

            {/* Create New Project */}
            <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-gray-800 p-6">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-violet-400" />
                    New Clip Project
                </h2>
                <form onSubmit={handleCreateProject} className="space-y-4">
                    {/* Input Mode Toggle */}
                    <div className="flex items-center gap-1 bg-gray-800/60 rounded-lg p-1 w-fit">
                        <button
                            type="button"
                            onClick={() => setInputMode("url")}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${inputMode === "url" ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white"}`}
                        >
                            Paste URL
                        </button>
                        <button
                            type="button"
                            onClick={() => setInputMode("upload")}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${inputMode === "upload" ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white"}`}
                        >
                            <Upload className="w-3.5 h-3.5" />
                            Upload File
                        </button>
                    </div>

                    {/* URL Input */}
                    {inputMode === "url" ? (
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                            Video URL
                        </label>
                        <input
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://youtube.com/watch?v=... or TikTok / Twitch URL"
                            className="w-full px-4 py-3 bg-gray-800/80 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none text-lg"
                            required
                        />
                    </div>
                    ) : (
                    /* File Upload */
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                            Video File
                        </label>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-violet-500"); }}
                            onDragLeave={(e) => { e.currentTarget.classList.remove("border-violet-500"); }}
                            onDrop={(e) => {
                                e.preventDefault();
                                e.currentTarget.classList.remove("border-violet-500");
                                const dropped = e.dataTransfer.files[0];
                                if (dropped) setUploadFile(dropped);
                            }}
                            className="w-full px-4 py-8 bg-gray-800/80 border-2 border-dashed border-gray-700 rounded-xl text-center cursor-pointer hover:border-violet-500/50 transition-colors"
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".mp4,.mov,.webm,.mkv,video/*"
                                className="hidden"
                                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                            />
                            {uploadFile ? (
                                <div className="flex items-center justify-center gap-3">
                                    <FileVideo className="w-8 h-8 text-violet-400" />
                                    <div className="text-left">
                                        <p className="text-white font-medium">{uploadFile.name}</p>
                                        <p className="text-gray-500 text-xs">{(uploadFile.size / 1024 / 1024).toFixed(1)} MB</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setUploadFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                                        className="ml-4 text-gray-500 hover:text-red-400"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <Upload className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                                    <p className="text-gray-400">Drag & drop a video file or click to browse</p>
                                    <p className="text-gray-600 text-xs mt-1">MP4, MOV, WebM, MKV — up to 2GB</p>
                                </>  
                            )}
                        </div>
                    </div>
                    )}

                    {/* Campaign Brief Selector */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">
                                Campaign Brief
                            </label>
                            <select
                                value={selectedBriefId}
                                onChange={(e) => {
                                    setSelectedBriefId(e.target.value);
                                    const brief = briefs.find(b => b.id === e.target.value);
                                    if (brief) {
                                        setCampaignName(brief.name);
                                        setCampaignCpm(brief.cpmRate?.toString() || "");
                                    } else {
                                        setCampaignName("");
                                        setCampaignCpm("");
                                    }
                                }}
                                className="w-full px-3 py-2 bg-gray-800/60 border border-gray-700/50 rounded-lg text-white focus:border-violet-500 focus:outline-none text-sm"
                            >
                                <option value="">No campaign (manual)</option>
                                {briefs.map(b => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}{b.cpmRate ? ` · $${b.cpmRate}/1k` : ""}
                                    </option>
                                ))}
                            </select>
                            {selectedBriefId && (() => {
                                const brief = briefs.find(b => b.id === selectedBriefId);
                                if (!brief) return null;
                                return (
                                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                                        {brief.targetPlatforms.map(p => (
                                            <span key={p} className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400">{p}</span>
                                        ))}
                                        {brief.watermarkRequired && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400">Watermark</span>}
                                        {brief.disclosureRequired && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">Disclosure</span>}
                                    </div>
                                );
                            })()}
                            <a
                                href="/dashboard/campaigns"
                                className="text-[10px] text-violet-400 hover:text-violet-300 mt-1.5 inline-flex items-center gap-1"
                            >
                                {briefs.length === 0 ? "→ Create your first campaign" : "→ Manage campaigns"}
                            </a>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">
                                Campaign Name {selectedBriefId ? "(from brief)" : "(optional)"}
                            </label>
                            <input
                                type="text"
                                value={campaignName}
                                onChange={(e) => setCampaignName(e.target.value)}
                                placeholder="e.g. Call of Duty BO7"
                                readOnly={!!selectedBriefId}
                                className={`w-full px-3 py-2 bg-gray-800/60 border border-gray-700/50 rounded-lg text-white placeholder-gray-600 focus:border-violet-500 focus:outline-none text-sm ${selectedBriefId ? "opacity-60" : ""}`}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">
                                CTA Text
                            </label>
                            <input
                                type="text"
                                value={ctaText}
                                onChange={(e) => setCtaText(e.target.value)}
                                placeholder="Follow for more"
                                className="w-full px-3 py-2 bg-gray-800/60 border border-gray-700/50 rounded-lg text-white placeholder-gray-600 focus:border-violet-500 focus:outline-none text-sm"
                            />
                        </div>
                    </div>

                    {/* Options Row */}
                    <div className="flex flex-wrap items-center gap-6">
                        {/* Caption Style */}
                        <div className="flex items-center gap-2">
                            <label className="text-sm text-gray-400">Captions:</label>
                            <select
                                value={captionStyle}
                                onChange={(e) => setCaptionStyle(e.target.value)}
                                className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:border-violet-500 focus:outline-none"
                            >
                                <option value="word-highlight">Word Highlight (Karaoke)</option>
                                <option value="pop">Pop Animation</option>
                                <option value="fade">Fade In/Out</option>
                                <option value="slide-up">Slide Up</option>
                            </select>
                        </div>

                        {/* Face Track Toggle */}
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={faceTrack}
                                onChange={(e) => setFaceTrack(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-violet-500 focus:ring-violet-500"
                            />
                            <span className="text-sm text-gray-300">Face Tracking</span>
                        </label>
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={creating || (inputMode === "url" ? !url.trim() : !uploadFile)}
                        className="w-full py-3 px-6 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-lg shadow-lg shadow-violet-500/25"
                    >
                        {creating ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                {uploadProgress || "Processing..."}
                            </>
                        ) : (
                            <>
                                {inputMode === "upload" ? <Upload className="w-5 h-5" /> : <Scissors className="w-5 h-5" />}
                                {inputMode === "upload" ? "Upload & Find Clips" : "Find Viral Clips"}
                            </>
                        )}
                    </button>
                </form>
            </div>

            {/* Earnings Calculator */}
            {projects.some((p) => p.campaignCpm) && (
                <div className="bg-gradient-to-r from-emerald-900/30 to-green-900/20 border border-emerald-800/40 rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                        <DollarSign className="w-4 h-4" />
                        Earnings Calculator
                    </h3>
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <input
                                type="number"
                                value={viewCount}
                                onChange={(e) => setViewCount(e.target.value)}
                                placeholder="Enter total views"
                                className="w-full px-3 py-2 bg-gray-900/60 border border-emerald-800/40 rounded-lg text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none text-sm"
                            />
                        </div>
                        {viewCount && (
                            <div className="text-right">
                                {projects
                                    .filter((p) => p.campaignCpm)
                                    .map((p) => (
                                        <div key={p.id} className="text-sm">
                                            <span className="text-gray-400">{p.campaignName || "Campaign"}:</span>{" "}
                                            <span className="text-emerald-400 font-bold text-lg">
                                                ${((parseInt(viewCount) / 1000) * (p.campaignCpm || 0)).toFixed(2)}
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Projects Grid */}
            <div>
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Film className="w-5 h-5 text-gray-400" />
                    Your Projects
                    {projects.length > 0 && (
                        <span className="text-sm text-gray-500 font-normal">
                            ({projects.length})
                        </span>
                    )}
                </h2>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
                    </div>
                ) : projects.length === 0 ? (
                    <div className="text-center py-16 bg-gray-900/40 rounded-2xl border border-gray-800/50">
                        <Scissors className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-400">No projects yet</p>
                        <p className="text-gray-500 text-sm mt-1">
                            Paste a URL or upload a video file above to get started
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {projects.map((project) => (
                            <div
                                key={project.id}
                                className="bg-gray-900/60 backdrop-blur border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors"
                            >
                                {/* Project Header */}
                                <div className="p-4">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-white font-medium truncate">
                                                {project.video.title || "Untitled Video"}
                                            </h3>
                                            {project.campaignName && (
                                                <p className="text-violet-400 text-xs font-medium mt-0.5">
                                                    📋 {project.campaignName}
                                                    {project.campaignCpm && ` · $${project.campaignCpm}/1k views`}
                                                </p>
                                            )}
                                        </div>
                                        <StatusBadge status={project.status} />
                                    </div>

                                    {/* Stats Row */}
                                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                                        <span className="flex items-center gap-1">
                                            <Film className="w-3.5 h-3.5" />
                                            {project.totalSegments} clips found
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                            {project.renderedClips} rendered
                                        </span>
                                        {project.video.duration && (
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3.5 h-3.5" />
                                                {formatDuration(project.video.duration)}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="border-t border-gray-800/50 px-4 py-3 flex items-center gap-2">
                                    <button
                                        onClick={() => fetchProjectDetail(project.id)}
                                        className="flex-1 py-1.5 px-3 bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                                    >
                                        <Eye className="w-4 h-4" />
                                        View Clips
                                    </button>

                                    {project.status === "READY" && project.totalSegments > 0 && (
                                        <button
                                            onClick={() => handleRenderAll(project.id)}
                                            disabled={rendering.has(project.id)}
                                            className="flex-1 py-1.5 px-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm text-white rounded-lg transition-colors flex items-center justify-center gap-1.5"
                                        >
                                            {rendering.has(project.id) ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Sparkles className="w-4 h-4" />
                                            )}
                                            Render All
                                        </button>
                                    )}

                                    {project.status === "FAILED" && (
                                        <button
                                            onClick={() => handleRetryProject(project.id)}
                                            className="flex-1 py-1.5 px-3 bg-amber-600/80 hover:bg-amber-500/80 text-sm text-white rounded-lg transition-colors flex items-center justify-center gap-1.5"
                                        >
                                            <RefreshCw className="w-4 h-4" />
                                            Retry
                                        </button>
                                    )}

                                    <button
                                        onClick={() => handleDeleteProject(project.id)}
                                        className="py-1.5 px-3 bg-red-900/30 hover:bg-red-800/50 text-sm text-red-400 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                                        title="Delete project"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Project Detail Modal */}
            {selectedProject && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center pt-8 overflow-y-auto">
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-4xl mx-4 mb-8">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-6 border-b border-gray-800">
                            <div>
                                <h2 className="text-xl font-bold text-white">
                                    {selectedProject.video.title || "Clip Project"}
                                </h2>
                                <p className="text-gray-400 text-sm mt-1">
                                    {selectedProject.totalClips} clips found · {selectedProject.renderedCount} rendered
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedProject(null)}
                                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Subtitle Settings */}
                        <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/50">
                            <h3 className="text-sm font-semibold text-violet-400 mb-3 flex items-center gap-2">
                                <Sparkles className="w-4 h-4" />
                                Subtitle Settings
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Animation</label>
                                    <select
                                        value={subAnimation}
                                        onChange={(e) => setSubAnimation(e.target.value)}
                                        className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:border-violet-500 focus:outline-none"
                                    >
                                        <option value="word-highlight">Word Highlight (Karaoke)</option>
                                        <option value="pop">Pop Animation</option>
                                        <option value="fade">Fade In/Out</option>
                                        <option value="slide-up">Slide Up</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Font</label>
                                    <select
                                        value={subFont}
                                        onChange={(e) => setSubFont(e.target.value)}
                                        className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:border-violet-500 focus:outline-none"
                                    >
                                        <option value="Montserrat">Montserrat</option>
                                        <option value="Inter">Inter</option>
                                        <option value="Bebas Neue">Bebas Neue</option>
                                        <option value="Impact">Impact</option>
                                        <option value="Arial Black">Arial Black</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Position</label>
                                    <select
                                        value={subPosition}
                                        onChange={(e) => setSubPosition(e.target.value)}
                                        className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:border-violet-500 focus:outline-none"
                                    >
                                        <option value="bottom">Bottom</option>
                                        <option value="center">Center</option>
                                        <option value="top">Top</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Color</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={subColor}
                                            onChange={(e) => setSubColor(e.target.value)}
                                            className="w-8 h-8 rounded border border-gray-700 bg-transparent cursor-pointer"
                                        />
                                        <span className="text-xs text-gray-400">{subColor}</span>
                                    </div>
                                </div>
                            </div>
                            {/* Live preview strip */}
                            <div className="mt-3 bg-black rounded-lg p-3 flex items-center justify-center" style={{ minHeight: 48 }}>
                                <span
                                    className="text-lg font-bold tracking-wide"
                                    style={{
                                        fontFamily: subFont,
                                        color: subColor,
                                        textShadow: "2px 2px 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.5)",
                                    }}
                                >
                                    Sample subtitle text
                                </span>
                            </div>
                        </div>

                        {/* Clips List */}
                        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
                            {/* Rendered Clips */}
                            {selectedProject.renderedClips.length > 0 && (
                                <>
                                    <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4" />
                                        Rendered Clips ({selectedProject.renderedClips.length})
                                    </h3>
                                    {selectedProject.renderedClips.map((clip) => (
                                        <ClipCard
                                            key={clip.id}
                                            clip={clip}
                                            projectId={selectedProject.id}
                                            onRender={handleRenderSegment}
                                            isRendering={rendering.has(clip.id)}
                                            isRendered
                                        />
                                    ))}
                                </>
                            )}

                            {/* Pending Clips */}
                            {selectedProject.pendingClips.length > 0 && (
                                <>
                                    <h3 className="text-sm font-semibold text-violet-400 flex items-center gap-2 mt-4">
                                        <Sparkles className="w-4 h-4" />
                                        AI-Suggested Clips ({selectedProject.pendingClips.length})
                                    </h3>
                                    {selectedProject.pendingClips.map((clip) => (
                                        <ClipCard
                                            key={clip.id}
                                            clip={clip}
                                            projectId={selectedProject.id}
                                            onRender={handleRenderSegment}
                                            isRendering={rendering.has(clip.id)}
                                        />
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Compliance Info */}
            <div className="bg-amber-900/20 border border-amber-800/30 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-amber-400 mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Campaign Requirements Reminder
                </h3>
                <ul className="text-xs text-amber-200/70 space-y-1">
                    <li>• Minimum <strong>0.20% engagement rate</strong> (2 likes per 1k views)</li>
                    <li>• Likes must be <strong>public</strong> — hidden likes = rejection</li>
                    <li>• Posts must stay live for <strong>30+ days</strong></li>
                    <li>• Audience must be <strong>Tier 1-2 countries</strong> (&gt;70%)</li>
                    <li>• Space posts <strong>2-3 hours apart</strong> to avoid spam flags</li>
                </ul>
            </div>
        </div>
    );
}

// ─── Clip Card Component ─────────────────────────────────

function ClipCard({
    clip,
    projectId,
    onRender,
    isRendering,
    isRendered,
}: {
    clip: Segment;
    projectId: string;
    onRender: (projectId: string, segmentId: string) => void;
    isRendering: boolean;
    isRendered?: boolean;
}) {
    return (
        <div
            className={`flex items-center gap-4 p-3 rounded-xl border transition-colors ${
                isRendered
                    ? "bg-emerald-900/10 border-emerald-800/30"
                    : "bg-gray-800/40 border-gray-800 hover:border-gray-700"
            }`}
        >
            {/* Score */}
            <div className="flex-shrink-0">
                <ViralScoreBadge score={clip.viralScore} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                    {clip.title || "Untitled Clip"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {clip.description}
                </p>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span>
                        {formatDuration(clip.startTime)} → {formatDuration(clip.endTime)}
                    </span>
                    <span>{formatDuration(clip.duration)}</span>
                    {clip.hookStrength && (
                        <span className="text-orange-400">
                            Hook: {clip.hookStrength}/10
                        </span>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="flex-shrink-0 flex items-center gap-2">
                {isRendered && clip.shortVideo?.storagePath ? (
                    <>
                        <button
                            onClick={async () => {
                                try {
                                    const res = await fetch(`/api/shorts/${clip.shortVideo!.id}/stream`);
                                    if (!res.ok) throw new Error("Download failed");
                                    const blob = await res.blob();
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = `${clip.title || "short"}.mp4`;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);
                                } catch (err) {
                                    console.error("Download error:", err);
                                    alert("Download failed. Please try again.");
                                }
                            }}
                            className="p-2 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors"
                            title="Download"
                        >
                            <Download className="w-4 h-4" />
                        </button>
                        <button
                            onClick={async () => {
                                try {
                                    if (navigator.share) {
                                        const res = await fetch(`/api/shorts/${clip.shortVideo!.id}/stream`);
                                        const blob = await res.blob();
                                        const file = new File([blob], `${clip.title || "short"}.mp4`, { type: "video/mp4" });
                                        await navigator.share({ title: clip.title || "Short", files: [file] });
                                    } else {
                                        await navigator.clipboard.writeText(clip.title || "Short clip");
                                        alert("Title copied! Download the video and share it on your preferred platform.");
                                    }
                                } catch (err: any) {
                                    if (err.name !== "AbortError") {
                                        console.error("Share error:", err);
                                    }
                                }
                            }}
                            className="p-2 rounded-lg bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 transition-colors"
                            title="Share to social"
                        >
                            <Share2 className="w-4 h-4" />
                        </button>
                    </>
                ) : clip.status === "RENDERING" ? (
                    <span className="text-xs text-yellow-400 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Rendering...
                    </span>
                ) : (
                    <button
                        onClick={() => onRender(projectId, clip.id)}
                        disabled={isRendering}
                        className="py-1.5 px-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs text-white rounded-lg transition-colors flex items-center gap-1.5"
                    >
                        {isRendering ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                            <Play className="w-3 h-3" />
                        )}
                        Render
                    </button>
                )}
            </div>
        </div>
    );
}
