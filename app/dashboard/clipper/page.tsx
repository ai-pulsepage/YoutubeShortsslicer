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
    Briefcase,
    Type,
    Pencil,
    ChevronDown,
    ChevronUp,
    Save,
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
    hookText: string | null;
    hookFontSize: number | null;
    hookFont: string | null;
    editedWords: Array<{ text: string; start: number; end: number }> | null;
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
    const [briefs, setBriefs] = useState<{id: string; name: string; brand: string | null; cpmRate: number | null; targetPlatforms: string[]; watermarkRequired: boolean; disclosureRequired: boolean; onScreenSuggestions: string[]}[]>([]);
    const [campaignName, setCampaignName] = useState("");
    const [campaignCpm, setCampaignCpm] = useState("");
    const [captionStyle, setCaptionStyle] = useState("word-highlight");
    const [faceTrack, setFaceTrack] = useState(true);
    const [ctaText, setCtaText] = useState("Follow for more");

    // Earnings calculator
    const [viewCount, setViewCount] = useState("");

    // Campaign assignment on existing projects
    const [assigningCampaign, setAssigningCampaign] = useState<string | null>(null);

    // Subtitle settings for render
    const [subAnimation, setSubAnimation] = useState("word-highlight");
    const [subFont, setSubFont] = useState("Montserrat");
    const [subPosition, setSubPosition] = useState("bottom");
    const [subColor, setSubColor] = useState("#FFFFFF");
    const [subFontSize, setSubFontSize] = useState(48);

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
                body: JSON.stringify({ all: true, subtitleStyle: { animation: subAnimation, font: subFont, position: subPosition, color: subColor, fontSize: subFontSize } }),
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
                body: JSON.stringify({ segmentIds: [segmentId], subtitleStyle: { animation: subAnimation, font: subFont, position: subPosition, color: subColor, fontSize: subFontSize } }),
            });

            if (!res.ok) {
                const err = await res.json();
                alert(err.error || "Render failed to queue");
                setRendering((prev) => { const n = new Set(prev); n.delete(segmentId); return n; });
                return;
            }

            // Poll for completion — check every 5s for up to 3 minutes
            const pollInterval = 5000;
            const maxPolls = 36;
            let polls = 0;
            let sawRendering = false; // Must see RENDERING state first before accepting RENDERED

            const poll = async () => {
                polls++;
                try {
                    const detailRes = await fetch(`/api/clipper/${projectId}`);
                    if (detailRes.ok) {
                        const detail = await detailRes.json();
                        const allClips = [...(detail.renderedClips || []), ...(detail.pendingClips || [])];
                        const seg = allClips.find((c: any) => c.id === segmentId);

                        // Track: must see RENDERING before we accept RENDERED as "done"
                        if (seg?.status === "RENDERING") {
                            sawRendering = true;
                        }

                        if (sawRendering && seg?.status === "RENDERED") {
                            // Render actually completed (transitioned RENDERING → RENDERED)
                            setRendering((prev) => { const n = new Set(prev); n.delete(segmentId); return n; });
                            // Force clean refresh
                            await fetchProjectDetail(projectId);
                            return;
                        }
                    }
                } catch { }

                if (polls < maxPolls) {
                    setTimeout(poll, pollInterval);
                } else {
                    setRendering((prev) => { const n = new Set(prev); n.delete(segmentId); return n; });
                    await fetchProjectDetail(projectId);
                }
            };

            // Start polling after render API returns (segment is already set to RENDERING)
            setTimeout(poll, pollInterval);

        } catch (err) {
            console.error("Render error:", err);
            setRendering((prev) => { const n = new Set(prev); n.delete(segmentId); return n; });
        }
    };

    const handleAssignCampaign = async (projectId: string, briefId: string) => {
        setAssigningCampaign(projectId);
        try {
            const res = await fetch(`/api/clipper/${projectId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ briefId: briefId || null }),
            });
            if (res.ok) {
                await fetchProjects();
            } else {
                const err = await res.json();
                alert(err.error || "Failed to assign campaign");
            }
        } catch (err) {
            console.error("Assign error:", err);
        } finally {
            setAssigningCampaign(null);
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
                                            <div className="flex items-center gap-2 mt-1">
                                                <Briefcase className="w-3 h-3 text-violet-400 flex-shrink-0" />
                                                <select
                                                    value={briefs.find(b => b.name === project.campaignName)?.id || ""}
                                                    onChange={(e) => handleAssignCampaign(project.id, e.target.value)}
                                                    disabled={assigningCampaign === project.id}
                                                    className="text-xs bg-transparent border border-gray-700/50 rounded px-1.5 py-0.5 text-violet-400 focus:border-violet-500 focus:outline-none cursor-pointer max-w-[200px] truncate"
                                                >
                                                    <option value="">No campaign</option>
                                                    {briefs.map(b => (
                                                        <option key={b.id} value={b.id}>
                                                            {b.name}{b.cpmRate ? ` · $${b.cpmRate}/1k` : ""}
                                                        </option>
                                                    ))}
                                                </select>
                                                {assigningCampaign === project.id && (
                                                    <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                                                )}
                                                {project.campaignCpm && (
                                                    <span className="text-[10px] text-emerald-400">${project.campaignCpm}/1k</span>
                                                )}
                                            </div>
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
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Font Size</label>
                                    <select
                                        value={subFontSize}
                                        onChange={(e) => setSubFontSize(parseInt(e.target.value))}
                                        className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:border-violet-500 focus:outline-none"
                                    >
                                        <option value={28}>28 (Small)</option>
                                        <option value={36}>36 (Medium)</option>
                                        <option value={48}>48 (Default)</option>
                                        <option value={56}>56 (Large)</option>
                                        <option value={64}>64 (XL)</option>
                                    </select>
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
                                            subFont={subFont}
                                            subFontSize={subFontSize}
                                            hookSuggestions={briefs.find(b => b.name === selectedProject.campaignName)?.onScreenSuggestions || []}
                                            onClipUpdate={(updatedClip) => {
                                                setSelectedProject(prev => {
                                                    if (!prev) return prev;
                                                    return {
                                                        ...prev,
                                                        renderedClips: prev.renderedClips.map(c => c.id === updatedClip.id ? { ...c, ...updatedClip } : c),
                                                        pendingClips: prev.pendingClips.map(c => c.id === updatedClip.id ? { ...c, ...updatedClip } : c),
                                                    };
                                                });
                                            }}
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
                                            subFont={subFont}
                                            subFontSize={subFontSize}
                                            hookSuggestions={briefs.find(b => b.name === selectedProject.campaignName)?.onScreenSuggestions || []}
                                            onClipUpdate={(updatedClip) => {
                                                setSelectedProject(prev => {
                                                    if (!prev) return prev;
                                                    return {
                                                        ...prev,
                                                        pendingClips: prev.pendingClips.map(c => c.id === updatedClip.id ? { ...c, ...updatedClip } : c),
                                                        renderedClips: prev.renderedClips.map(c => c.id === updatedClip.id ? { ...c, ...updatedClip } : c),
                                                    };
                                                });
                                            }}
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
    subFont,
    subFontSize,
    hookSuggestions = [],
    onClipUpdate,
}: {
    clip: Segment;
    projectId: string;
    onRender: (projectId: string, segmentId: string) => void;
    isRendering: boolean;
    isRendered?: boolean;
    subFont?: string;
    subFontSize?: number;
    hookSuggestions?: string[];
    onClipUpdate?: (updatedClip: Partial<Segment> & { id: string }) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [hookText, setHookText] = useState(clip.hookText || "");
    const [hookFontSize, setHookFontSize] = useState(clip.hookFontSize || 24);
    const [hookFont, setHookFont] = useState(clip.hookFont || "Montserrat");
    const [editedWords, setEditedWords] = useState<Array<{ text: string; start: number; end: number }>>(clip.editedWords || []);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [editingWordIdx, setEditingWordIdx] = useState<number | null>(null);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/clipper/${projectId}/segments/${clip.id}/edit`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    hookText: hookText || null,
                    hookFontSize: hookFontSize || 24,
                    hookFont: hookFont || "Montserrat",
                    editedWords: editedWords.length > 0 ? editedWords : null,
                }),
            });
            if (res.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
                onClipUpdate?.({ id: clip.id, hookText, hookFontSize, hookFont, editedWords });
            }
        } catch (err) {
            console.error("Save error:", err);
        } finally {
            setSaving(false);
        }
    };

    const handleWordEdit = (idx: number, newText: string) => {
        setEditedWords(prev => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], text: newText };
            return updated;
        });
    };

    return (
        <div
            className={`rounded-xl border transition-colors ${
                isRendering
                    ? "bg-amber-900/10 border-amber-500/50 animate-pulse"
                    : isRendered
                        ? "bg-emerald-900/10 border-emerald-800/30"
                        : "bg-gray-800/40 border-gray-800 hover:border-gray-700"
            }`}
        >
            {/* Rendering Banner */}
            {isRendering && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-600/20 border-b border-amber-600/30 rounded-t-xl">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    <span className="text-xs font-medium text-amber-400">Rendering in progress... This may take 1-2 minutes.</span>
                </div>
            )}
            {/* Main Row */}
            <div className="flex items-center gap-4 p-3">
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
                        {clip.hookText && (
                            <span className="text-violet-400 flex items-center gap-0.5">
                                <Type className="w-3 h-3" />
                                Hook set
                            </span>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex-shrink-0 flex items-center gap-2">
                    {/* Expand toggle */}
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                        title="Edit hook text & words"
                    >
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                    </button>

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
                            <button
                                onClick={() => onRender(projectId, clip.id)}
                                disabled={isRendering}
                                className="p-2 rounded-lg bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 disabled:opacity-50 transition-colors"
                                title="Re-render with updated settings"
                            >
                                {isRendering ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <RefreshCw className="w-4 h-4" />
                                )}
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

            {/* Expanded Edit Panel */}
            {expanded && (
                <div className="border-t border-gray-800/50 p-4 space-y-4">
                    {/* Hook Text Picker */}
                    <div>
                        <label className="block text-xs font-semibold text-violet-400 mb-2 flex items-center gap-1.5">
                            <Type className="w-3.5 h-3.5" />
                            Hook Text (on-screen title)
                        </label>

                        {/* Campaign Suggestions */}
                        {hookSuggestions.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {hookSuggestions.map((suggestion, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setHookText(suggestion)}
                                        className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                                            hookText === suggestion
                                                ? "bg-violet-600/30 border-violet-500 text-violet-300"
                                                : "bg-gray-800/60 border-gray-700/50 text-gray-400 hover:border-violet-500/50 hover:text-violet-400"
                                        }`}
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        )}

                        <input
                            type="text"
                            value={hookText}
                            onChange={(e) => setHookText(e.target.value)}
                            placeholder="e.g. JoeWo Shreds in Black Ops Royale First Look"
                            className="w-full px-3 py-2 bg-gray-800/60 border border-gray-700/50 rounded-lg text-white placeholder-gray-600 focus:border-violet-500 focus:outline-none text-sm"
                        />

                        {/* Hook Font Controls */}
                        <div className="flex gap-3 mt-2">
                            <div className="flex-1">
                                <label className="block text-[10px] text-gray-500 mb-1">Hook Font</label>
                                <select
                                    value={hookFont}
                                    onChange={(e) => setHookFont(e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-gray-800/60 border border-gray-700/50 rounded-lg text-xs text-white focus:border-violet-500 focus:outline-none"
                                >
                                    <option value="Montserrat">Montserrat</option>
                                    <option value="Inter">Inter</option>
                                    <option value="Bebas Neue">Bebas Neue</option>
                                    <option value="Impact">Impact</option>
                                    <option value="Arial Black">Arial Black</option>
                                </select>
                            </div>
                            <div className="flex-1">
                                <label className="block text-[10px] text-gray-500 mb-1">Hook Size</label>
                                <select
                                    value={hookFontSize}
                                    onChange={(e) => setHookFontSize(parseInt(e.target.value))}
                                    className="w-full px-2.5 py-1.5 bg-gray-800/60 border border-gray-700/50 rounded-lg text-xs text-white focus:border-violet-500 focus:outline-none"
                                >
                                    <option value={16}>16 (XS)</option>
                                    <option value={20}>20 (Small)</option>
                                    <option value={24}>24 (Default)</option>
                                    <option value={28}>28 (Medium)</option>
                                    <option value={32}>32 (Large)</option>
                                    <option value={36}>36 (XL)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Editable Transcript Words */}
                    {editedWords.length > 0 && (
                        <div>
                            <label className="block text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
                                <Pencil className="w-3.5 h-3.5" />
                                Editable Transcript ({editedWords.length} words)
                            </label>
                            <div className="flex flex-wrap gap-1 bg-gray-900/50 rounded-lg p-3 max-h-40 overflow-y-auto">
                                {editedWords.map((word, i) => (
                                    <span key={i} className="inline-block">
                                        {editingWordIdx === i ? (
                                            <input
                                                type="text"
                                                value={word.text}
                                                onChange={(e) => handleWordEdit(i, e.target.value)}
                                                onBlur={() => setEditingWordIdx(null)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") setEditingWordIdx(null);
                                                    if (e.key === "Tab") {
                                                        e.preventDefault();
                                                        setEditingWordIdx(i + 1 < editedWords.length ? i + 1 : null);
                                                    }
                                                }}
                                                autoFocus
                                                className="px-1.5 py-0.5 bg-violet-600/30 border border-violet-500 rounded text-xs text-white focus:outline-none w-auto"
                                                style={{ width: Math.max(30, word.text.length * 8) }}
                                            />
                                        ) : (
                                            <button
                                                onClick={() => setEditingWordIdx(i)}
                                                className="px-1.5 py-0.5 rounded text-xs text-gray-300 hover:bg-gray-700/50 hover:text-white transition-colors cursor-text"
                                                title={`${word.start.toFixed(1)}s → ${word.end.toFixed(1)}s · click to edit`}
                                            >
                                                {word.text}
                                            </button>
                                        )}
                                    </span>
                                ))}
                            </div>
                            <p className="text-[10px] text-gray-600 mt-1">Click any word to edit it. Changes affect rendered subtitles.</p>
                        </div>
                    )}

                    {/* Visual Preview */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-2">Preview</label>
                        <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: "9/16", maxHeight: 200 }}>
                            {/* Hook text preview at top */}
                            {hookText && (
                                <div className="absolute top-4 left-0 right-0 text-center px-3 z-10">
                                    <span className="text-white font-bold leading-tight" style={{
                                        fontFamily: hookFont || "Montserrat",
                                        fontSize: `${Math.max(6, Math.round((hookFontSize || 24) * 0.35))}px`,
                                        textShadow: "1px 1px 2px rgba(0,0,0,0.9)",
                                        display: "-webkit-box",
                                        WebkitLineClamp: 3,
                                        WebkitBoxOrient: "vertical" as any,
                                        overflow: "hidden",
                                    }}>
                                        {hookText}
                                    </span>
                                </div>
                            )}

                            {/* Subtitle preview at bottom */}
                            <div className="absolute bottom-3 left-0 right-0 text-center px-2 z-10">
                                <span className="text-white font-bold leading-tight inline" style={{
                                    fontFamily: subFont || "Montserrat",
                                    fontSize: `${Math.max(5, Math.round((subFontSize || 48) * 0.2))}px`,
                                    textShadow: "1px 1px 2px rgba(0,0,0,0.9)",
                                }}>
                                    {editedWords.length > 0 ? (
                                        editedWords.slice(0, (subFontSize || 48) > 48 ? 3 : 5).map((w, i) => (
                                            <span key={i} className={i === 1 ? "text-yellow-400" : ""}>
                                                {w.text}{" "}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-gray-500 italic">No transcript words loaded</span>
                                    )}
                                </span>
                            </div>

                            {/* Dark placeholder */}
                            <div className="w-full h-full bg-gradient-to-b from-gray-800/50 to-gray-900/80 flex items-center justify-center">
                                <Film className="w-8 h-8 text-gray-700" />
                            </div>
                        </div>
                    </div>

                    {/* Save + Re-render Buttons */}
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] text-gray-600">
                            Hook text and word edits are saved per clip and used in rendering
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className={`py-1.5 px-4 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                                    saved
                                        ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30"
                                        : "bg-violet-600 hover:bg-violet-500 text-white"
                                }`}
                            >
                                {saving ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                ) : saved ? (
                                    <CheckCircle2 className="w-3 h-3" />
                                ) : (
                                    <Save className="w-3 h-3" />
                                )}
                                {saved ? "Saved!" : "Save Changes"}
                            </button>
                            {isRendered && (
                                <button
                                    onClick={() => onRender(projectId, clip.id)}
                                    disabled={isRendering}
                                    className="py-1.5 px-4 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white transition-all flex items-center gap-1.5"
                                >
                                    {isRendering ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                        <RefreshCw className="w-3 h-3" />
                                    )}
                                    Re-render
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
