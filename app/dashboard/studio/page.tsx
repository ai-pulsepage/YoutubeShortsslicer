"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import {
    Wand2,
    Film,
    Play,
    Loader2,
    ChevronLeft,
    CheckCircle,
    XCircle,
    Clock,
    Download,
    Send,
    Scissors,
    Type,
    Sparkles,
    Volume2,
    RefreshCw,
    Save,
    Trash2,
    Plus,
    GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

type Video = {
    id: string;
    title: string | null;
    status: string;
    duration: number | null;
    thumbnail: string | null;
    sourceUrl: string;
};

type Segment = {
    id: string;
    videoId: string;
    title: string | null;
    startTime: number;
    endTime: number;
    aiScore: number | null;
    hookStrength: number | null;
    status: string;
    hookText: string | null;
    hookFontSize: number | null;
    hookFont: string | null;
    hookBoxColor: string | null;
    hookFontColor: string | null;
    hookUppercase: boolean | null;
    subFont: string | null;
    subFontSize: number | null;
    subColor: string | null;
    subHighlightColor: string | null;
    subAnimation: string | null;
    subPosition: string | null;
    effects: AppliedEffect[] | null;
    shortVideo: {
        id: string;
        status: string;
        storagePath: string | null;
    } | null;
};

type AppliedEffect = {
    type: string;
    params: Record<string, any>;
};

const EFFECT_PRESETS = [
    { id: "blur_background", label: "Blur Background", icon: "🔲", desc: "Blurred BG + sharp center", category: "layout" },
    { id: "warm_cinematic", label: "Warm Cinematic", icon: "🌅", desc: "Warm orange tone", category: "color" },
    { id: "cool_blue", label: "Cool Blue", icon: "❄️", desc: "Cold blue grade", category: "color" },
    { id: "film_grain", label: "Film Grain", icon: "🎞️", desc: "Analog grain texture", category: "texture" },
    { id: "vignette", label: "Vignette", icon: "🔅", desc: "Dark corner fade", category: "texture" },
    { id: "letterbox", label: "Letterbox", icon: "⬛", desc: "Cinematic bars", category: "layout" },
    { id: "fade_inout", label: "Fade In/Out", icon: "🎬", desc: "Smooth black fade", category: "transition" },
    { id: "slow_mo", label: "Slow Motion", icon: "⏱️", desc: "Half speed", category: "speed" },
    { id: "speed_up", label: "Speed Up", icon: "⏩", desc: "1.5x speed", category: "speed" },
];

const FONT_OPTIONS = ["Montserrat", "Arial", "Impact", "Helvetica", "Georgia", "Comic Sans MS", "Courier New"];
const ANIMATION_OPTIONS = ["word-highlight", "fade", "pop", "slide-up"];
const POSITION_OPTIONS = ["bottom", "center", "top"];

function StudioContent() {
    const searchParams = useSearchParams();
    const videoId = searchParams.get("video");

    const [video, setVideo] = useState<(Video & { transcript?: { content: string } | null; description?: string | null }) | null>(null);
    const [segments, setSegments] = useState<Segment[]>([]);
    const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"style" | "layout" | "effects" | "hooks">("style");
    const [loading, setLoading] = useState(true);
    const [videos, setVideos] = useState<Video[]>([]);
    const [renderingIds, setRenderingIds] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);
    const [playingSegId, setPlayingSegId] = useState<string | null>(null);

    // Global layout defaults stored in state
    const [globalAspect, setGlobalAspect] = useState<"9:16" | "1:1" | "16:9">("9:16");
    const [globalCropMode, setGlobalCropMode] = useState<string>("letterbox");

    const [pollingVideo, setPollingVideo] = useState(false);

    const selectedSegment = segments.find(s => s.id === selectedSegmentId);

    // Load video list if no video selected
    useEffect(() => {
        if (!videoId) {
            fetch("/api/videos?status=READY&limit=50")
                .then(r => r.json())
                .then(data => {
                    setVideos(data.videos || []);
                    setLoading(false);
                })
                .catch(() => setLoading(false));
        }
    }, [videoId]);

    // Load specific video + segments
    useEffect(() => {
        if (!videoId) return;
        setLoading(true);
        Promise.all([
            fetch(`/api/videos/${videoId}`).then(r => r.json()),
            fetch(`/api/videos/${videoId}/segment`).then(r => r.json()),
        ]).then(([videoData, segData]) => {
            setVideo(videoData);
            const segs = Array.isArray(segData) ? segData : segData.segments || [];
            setSegments(segs);
            if (segs.length > 0 && !selectedSegmentId) {
                setSelectedSegmentId(segs[0].id);
            }
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [videoId]);

    // Poll for status of video if generating/transcribing
    useEffect(() => {
        if (!videoId || !video || (video.status !== "SEGMENTING" && video.status !== "TRANSCRIBING")) {
            setPollingVideo(false);
            return;
        }

        setPollingVideo(true);
        const interval = setInterval(() => {
            Promise.all([
                fetch(`/api/videos/${videoId}`).then(r => r.json()),
                fetch(`/api/videos/${videoId}/segment`).then(r => r.json()),
            ]).then(([videoData, segData]) => {
                setVideo(videoData);
                const segs = Array.isArray(segData) ? segData : segData.segments || [];
                setSegments(segs);
                if (videoData.status !== "SEGMENTING" && videoData.status !== "TRANSCRIBING") {
                    setPollingVideo(false);
                    if (segs.length > 0 && !selectedSegmentId) {
                        setSelectedSegmentId(segs[0].id);
                    }
                    clearInterval(interval);
                }
            }).catch(err => {
                console.error("Polling error:", err);
            });
        }, 4000);

        return () => clearInterval(interval);
    }, [videoId, video?.status]);

    // Poll for segment rendering status
    useEffect(() => {
        if (renderingIds.size === 0) return;
        const interval = setInterval(() => {
            if (!videoId) return;
            fetch(`/api/videos/${videoId}/segment`)
                .then(r => r.json())
                .then(data => {
                    const segs = Array.isArray(data) ? data : data.segments || [];
                    setSegments(segs);
                    const stillRendering = new Set<string>();
                    for (const seg of segs) {
                        if (renderingIds.has(seg.id) && (seg.status === "RENDERING" || seg.shortVideo?.status === "RENDERING")) {
                            stillRendering.add(seg.id);
                        }
                    }
                    setRenderingIds(stillRendering);
                })
                .catch(() => {});
        }, 5000);
        return () => clearInterval(interval);
    }, [renderingIds, videoId]);

    // Save segment changes
    const saveSegment = useCallback(async (segId: string, data: Partial<Segment>) => {
        setSaving(true);
        try {
            const res = await fetch(`/api/videos/${videoId}/segment/${segId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (res.ok) {
                const updated = await res.json();
                setSegments(prev => prev.map(s => s.id === segId ? { ...s, ...updated } : s));
            } else {
                const err = await res.json().catch(() => ({}));
                alert(`Save failed: ${err.error || res.statusText}`);
            }
        } catch (err: any) {
            alert(`Save failed: ${err.message}`);
        } finally {
            setSaving(false);
        }
    }, [videoId]);

    // Approve/reject segment
    const setSegmentStatus = async (segId: string, status: string) => {
        await saveSegment(segId, { status } as any);
    };

    // Render single segment
    const renderSegment = async (segmentId: string) => {
        setRenderingIds(prev => new Set([...prev, segmentId]));
        try {
            await fetch(`/api/videos/${videoId}/render`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ segmentIds: [segmentId] }),
            });
        } catch (err) {
            console.error("Render failed:", err);
            setRenderingIds(prev => {
                const next = new Set(prev);
                next.delete(segmentId);
                return next;
            });
        }
    };

    // Render all approved segments
    const renderAllApproved = async () => {
        const approved = segments.filter(s => s.status === "APPROVED");
        const ids = approved.map(s => s.id);
        setRenderingIds(new Set(ids));
        try {
            await fetch(`/api/videos/${videoId}/render`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ segmentIds: ids }),
            });
        } catch (err) {
            console.error("Render all failed:", err);
        }
    };

    // Delete a video and associated data
    const handleDeleteVideo = async (e: React.MouseEvent | null, id: string) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (!confirm("Are you sure you want to delete this video? All clips, transcripts, and storage assets will be permanently deleted.")) {
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
            if (res.ok) {
                if (videoId === id) {
                    window.location.href = "/dashboard/studio";
                } else {
                    setVideos(prev => prev.filter(v => v.id !== id));
                    setLoading(false);
                }
            } else {
                const err = await res.json().catch(() => ({}));
                alert(`Delete failed: ${err.error || res.statusText}`);
                setLoading(false);
            }
        } catch (err: any) {
            alert(`Delete failed: ${err.message}`);
            setLoading(false);
        }
    };

    // Trigger AI clipping generation
    const handleGenerateClips = async (minDuration: number, maxDuration: number, segmentMode: string) => {
        setPollingVideo(true);
        setVideo(prev => prev ? { ...prev, status: "SEGMENTING" } : null);
        try {
            const res = await fetch(`/api/videos/${videoId}/segment/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    minDuration,
                    maxDuration,
                    segmentMode,
                    defaultLayout: {
                        aspectRatio: globalAspect,
                        cropMode: globalCropMode,
                    }
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(`Failed to trigger generation: ${err.error || res.statusText}`);
                setVideo(prev => prev ? { ...prev, status: "READY" } : null);
                setPollingVideo(false);
            }
        } catch (err: any) {
            alert(`Failed to trigger generation: ${err.message}`);
            setVideo(prev => prev ? { ...prev, status: "READY" } : null);
            setPollingVideo(false);
        }
    };

    // Apply layout settings of one segment to all segments of this video
    const handleApplyToAll = async (
        aspectRatio: string,
        cropMode: string,
        manualXOffset: number,
        gameplayLoop: string,
        cuts: any[]
    ) => {
        if (!confirm("Apply these layout settings to all segments of this video?")) {
            return;
        }
        setSaving(true);
        try {
            const promises = segments.map(seg => {
                const otherEffects = (seg.effects || []).filter(e => e.type !== "layout");
                const nextEffects = [...otherEffects, {
                    type: "layout",
                    params: { aspectRatio, cropMode, manualXOffset, gameplayLoop, cuts }
                }];
                return fetch(`/api/videos/${videoId}/segment/${seg.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ effects: nextEffects }),
                });
            });
            await Promise.all(promises);
            // Reload segments
            const res = await fetch(`/api/videos/${videoId}/segment`);
            const data = await res.json();
            setSegments(Array.isArray(data) ? data : data.segments || []);
            alert("Applied layout settings to all segments successfully!");
        } catch (err: any) {
            alert(`Apply to all failed: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    const statusBadge = (status: string) => {
        const map: Record<string, { icon: any; class: string }> = {
            AI_SUGGESTED: { icon: Sparkles, class: "text-blue-400 bg-blue-500/10" },
            APPROVED: { icon: CheckCircle, class: "text-emerald-400 bg-emerald-500/10" },
            REJECTED: { icon: XCircle, class: "text-red-400 bg-red-500/10" },
            RENDERING: { icon: Loader2, class: "text-amber-400 bg-amber-500/10" },
            RENDERED: { icon: CheckCircle, class: "text-violet-400 bg-violet-500/10" },
            FAILED: { icon: XCircle, class: "text-red-400 bg-red-500/10" },
        };
        const s = map[status] || map.AI_SUGGESTED;
        const Icon = s.icon;
        return (
            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium", s.class)}>
                <Icon className={cn("w-3 h-3", status === "RENDERING" && "animate-spin")} />
                {status.replace("_", " ")}
            </span>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            </div>
        );
    }

    // Polling / processing view
    if (video && (pollingVideo || video.status === "SEGMENTING" || video.status === "TRANSCRIBING")) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-gray-950/20 rounded-2xl border border-gray-900/50">
                <Loader2 className="w-12 h-12 text-violet-400 animate-spin mb-4" />
                <h2 className="text-xl font-bold text-white mb-2">
                    {video.status === "TRANSCRIBING" ? "Transcribing Video..." : "Generating AI Clips..."}
                </h2>
                <p className="text-sm text-gray-400 max-w-md">
                    {video.status === "TRANSCRIBING"
                        ? "Whisper is transcribing the video audio and extracting word-level timestamps."
                        : "Gemini is analyzing the transcript to detect hooks, calculate engagement scores, and slice segments."}
                </p>
                <p className="text-xs text-gray-500 mt-4 animate-pulse">This process may take 1-2 minutes. Please keep this page open.</p>
            </div>
        );
    }

    // No video selected — show video picker with Global defaults card
    if (!videoId) {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Studio</h1>
                        <p className="text-gray-400 text-sm mt-1">Select a video to open in the editor</p>
                    </div>

                    {/* Global Layout Default configuration card */}
                    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4 w-80 space-y-3">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Global Clip Defaults</h3>
                        <div className="space-y-2">
                            <div>
                                <label className="text-[10px] text-gray-500 mb-1 block">Default Aspect Ratio</label>
                                <select value={globalAspect} onChange={e => setGlobalAspect(e.target.value as any)}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none">
                                    <option value="9:16">9:16 Vertical (Shorts)</option>
                                    <option value="1:1">1:1 Square</option>
                                    <option value="16:9">16:9 Landscape</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] text-gray-500 mb-1 block">Default Crop Mode</label>
                                <select value={globalCropMode} onChange={e => setGlobalCropMode(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none">
                                    <option value="letterbox">Letterbox (Fit)</option>
                                    <option value="center">Center Crop (Zoom)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {videos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Wand2 className="w-12 h-12 text-gray-600 mb-4" />
                        <h2 className="text-lg font-semibold text-white mb-2">No videos ready</h2>
                        <p className="text-gray-400 text-sm mb-4">Add a video to your library first.</p>
                        <Link href="/dashboard/library" className="text-sm text-violet-400 hover:text-violet-300">Go to Library →</Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {videos.map(v => (
                            <div key={v.id} className="relative bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden hover:border-violet-500/50 transition-all group">
                                <Link href={`/dashboard/studio?video=${v.id}`} className="block">
                                    <div className="aspect-video bg-gray-800 relative">
                                        {v.thumbnail ? (
                                            <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center"><Film className="w-10 h-10 text-gray-600" /></div>
                                        )}
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                            <Wand2 className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        <h3 className="text-sm font-medium text-white truncate pr-6">{v.title || "Untitled"}</h3>
                                        <p className="text-xs text-gray-500 mt-1">{v.duration ? formatTime(v.duration) : "--:--"}</p>
                                    </div>
                                </Link>
                                <button
                                    onClick={(e) => handleDeleteVideo(e, v.id)}
                                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-red-600 text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 transition-all z-10"
                                    title="Delete Video"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Video is ready but has 0 segments — show Video Preparation View
    if (segments.length === 0 && video) {
        return (
            <VideoPreparationView
                video={video}
                onGenerate={handleGenerateClips}
                generating={pollingVideo}
                onDelete={() => handleDeleteVideo(null, video.id)}
            />
        );
    }

    // Video selected with segments — standard Studio view
    const approvedCount = segments.filter(s => s.status === "APPROVED").length;
    const renderedCount = segments.filter(s => s.status === "RENDERED" || s.shortVideo?.status === "RENDERED").length;

    return (
        <div className="flex h-[calc(100vh-4rem)] gap-4">
            {/* Left: Segment List */}
            <div className="w-72 flex-shrink-0 flex flex-col bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800">
                    <div className="flex items-center gap-2 mb-2">
                        <Link href="/dashboard/studio" className="p-1 text-gray-400 hover:text-white transition-colors">
                            <ChevronLeft className="w-4 h-4" />
                        </Link>
                        <h2 className="text-sm font-semibold text-white truncate flex-1">{video?.title || "Untitled"}</h2>
                        <button onClick={(e) => video && handleDeleteVideo(null, video.id)} className="p-1 text-gray-400 hover:text-red-400 transition-colors" title="Delete Video">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">{approvedCount} approved</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400">{renderedCount} rendered</span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {segments.map((seg, i) => (
                        <button key={seg.id} onClick={() => { setSelectedSegmentId(seg.id); setPlayingSegId(null); }}
                            className={cn(
                                "w-full text-left px-3 py-2.5 rounded-xl transition-all text-sm",
                                selectedSegmentId === seg.id ? "bg-violet-500/15 border border-violet-500/20" : "hover:bg-gray-800/60 border border-transparent"
                            )}>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-gray-500">#{i + 1}</span>
                                {statusBadge(seg.status)}
                            </div>
                            <p className="text-white font-medium truncate text-xs">{seg.title || "Untitled"}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                                {formatTime(seg.startTime)} — {formatTime(seg.endTime)}
                                {seg.aiScore && <span className="ml-1.5 text-amber-400">★ {seg.aiScore.toFixed(1)}</span>}
                            </p>
                        </button>
                    ))}
                </div>

                {approvedCount > 0 && (
                    <div className="p-3 border-t border-gray-800">
                        <button onClick={renderAllApproved} disabled={renderingIds.size > 0}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50">
                            {renderingIds.size > 0 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                            Render All Approved ({approvedCount})
                        </button>
                    </div>
                )}
            </div>

            {/* Right: Editor Panel */}
            <div className="flex-1 flex flex-col bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden">
                {selectedSegment ? (
                    <>
                        {/* Segment header + actions */}
                        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-semibold text-white truncate">{selectedSegment.title || "Untitled Segment"}</h3>
                                <p className="text-xs text-gray-500">
                                    {formatTime(selectedSegment.startTime)} — {formatTime(selectedSegment.endTime)}
                                    {" · "}{((selectedSegment.endTime - selectedSegment.startTime)).toFixed(1)}s
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {saving && <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />}
                                {statusBadge(selectedSegment.status)}
                                {/* Approve / Reject — AI_SUGGESTED */}
                                {selectedSegment.status === "AI_SUGGESTED" && (
                                    <div className="flex gap-1">
                                        <button onClick={() => setSegmentStatus(selectedSegment.id, "APPROVED")}
                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
                                            <CheckCircle className="w-3 h-3" /> Approve
                                        </button>
                                        <button onClick={() => setSegmentStatus(selectedSegment.id, "REJECTED")}
                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600/80 hover:bg-red-500 text-white transition-colors">
                                            <XCircle className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                                {/* REJECTED — allow reconsider */}
                                {selectedSegment.status === "REJECTED" && (
                                    <button onClick={() => setSegmentStatus(selectedSegment.id, "AI_SUGGESTED")}
                                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-600 hover:bg-gray-500 text-white transition-colors">
                                        <RefreshCw className="w-3 h-3" /> Reconsider
                                    </button>
                                )}
                                {/* APPROVED — render + reject */}
                                {selectedSegment.status === "APPROVED" && (
                                    <div className="flex gap-1">
                                        <button onClick={() => renderSegment(selectedSegment.id)} disabled={renderingIds.has(selectedSegment.id)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50">
                                            {renderingIds.has(selectedSegment.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Film className="w-3 h-3" />}
                                            Render
                                        </button>
                                        <button onClick={() => setSegmentStatus(selectedSegment.id, "REJECTED")}
                                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-red-600/60 hover:bg-red-500 text-white transition-colors">
                                            <XCircle className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                                {/* RENDERED — preview, download, re-render */}
                                {(selectedSegment.status === "RENDERED" || selectedSegment.shortVideo?.status === "RENDERED") && selectedSegment.shortVideo && (
                                    <div className="flex gap-1">
                                        <button onClick={() => setPlayingSegId(playingSegId === selectedSegment.id ? null : selectedSegment.id)}
                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors">
                                            <Play className="w-3 h-3" /> Preview
                                        </button>
                                        <a href={`/api/shorts/${selectedSegment.shortVideo.id}/stream`} download
                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
                                            <Download className="w-3 h-3" /> Download
                                        </a>
                                        <button onClick={() => renderSegment(selectedSegment.id)} disabled={renderingIds.has(selectedSegment.id)}
                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50"
                                            title="Re-render with updated style/effects">
                                            {renderingIds.has(selectedSegment.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                            Re-render
                                        </button>
                                    </div>
                                )}
                                {/* RENDERING — spinner */}
                                {selectedSegment.status === "RENDERING" && (
                                    <span className="flex items-center gap-1.5 text-xs text-amber-400">
                                        <Loader2 className="w-3 h-3 animate-spin" /> Rendering…
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Video preview */}
                        {playingSegId === selectedSegment.id && selectedSegment.shortVideo && (
                            <div className="bg-black flex items-center justify-center" style={{ height: 320 }}>
                                <video
                                    src={`/api/shorts/${selectedSegment.shortVideo.id}/stream`}
                                    controls autoPlay
                                    className="h-full"
                                    style={{ aspectRatio: "9/16" }}
                                    onEnded={() => setPlayingSegId(null)}
                                />
                            </div>
                        )}

                        {/* Tabs */}
                        <div className="flex border-b border-gray-800">
                            {([
                                { key: "style" as const, label: "Style", icon: Type },
                                { key: "layout" as const, label: "Layout & Sizing", icon: Film },
                                { key: "effects" as const, label: "Effects", icon: Sparkles },
                                { key: "hooks" as const, label: "Hooks", icon: Wand2 },
                            ]).map(tab => (
                                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                    className={cn(
                                        "flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2",
                                        activeTab === tab.key ? "text-violet-400 border-violet-400" : "text-gray-400 border-transparent hover:text-white"
                                    )}>
                                    <tab.icon className="w-4 h-4" />
                                    {tab.label}
                                    {tab.key === "effects" && (selectedSegment.effects?.length || 0) > 0 && (
                                        <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400">
                                            {selectedSegment.effects!.filter((e: any) => e.type !== "layout").length}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-y-auto p-5">
                            {activeTab === "style" && (
                                <StyleTab segment={selectedSegment} onSave={(data) => saveSegment(selectedSegment.id, data)} />
                            )}
                            {activeTab === "layout" && (
                                <LayoutTab 
                                    segment={selectedSegment} 
                                    onSave={(data) => saveSegment(selectedSegment.id, data)}
                                    onApplyToAll={handleApplyToAll}
                                />
                            )}
                            {activeTab === "effects" && (
                                <EffectsTab segment={selectedSegment} onSave={(data) => saveSegment(selectedSegment.id, data)} />
                            )}
                            {activeTab === "hooks" && (
                                <HooksTab segment={selectedSegment} onSave={(data) => saveSegment(selectedSegment.id, data)} />
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <Scissors className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                            <p className="text-sm text-gray-400">Select a segment from the left panel</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Style Tab ───────────────────────────────────────────

function StyleTab({ segment, onSave }: { segment: Segment; onSave: (data: any) => void }) {
    const [font, setFont] = useState(segment.subFont || "Montserrat");
    const [fontSize, setFontSize] = useState(segment.subFontSize || 64);
    const [color, setColor] = useState(segment.subColor || "#FFFFFF");
    const [hlColor, setHlColor] = useState(segment.subHighlightColor || "#00CCFF");
    const [animation, setAnimation] = useState(segment.subAnimation || "word-highlight");
    const [position, setPosition] = useState(segment.subPosition || "bottom");
    const [dirty, setDirty] = useState(false);

    // Reset when segment changes
    useEffect(() => {
        setFont(segment.subFont || "Montserrat");
        setFontSize(segment.subFontSize || 64);
        setColor(segment.subColor || "#FFFFFF");
        setHlColor(segment.subHighlightColor || "#00CCFF");
        setAnimation(segment.subAnimation || "word-highlight");
        setPosition(segment.subPosition || "bottom");
        setDirty(false);
    }, [segment.id]);

    const handleSave = () => {
        onSave({ subFont: font, subFontSize: fontSize, subColor: color, subHighlightColor: hlColor, subAnimation: animation, subPosition: position });
        setDirty(false);
    };

    const change = (setter: Function) => (val: any) => { setter(val); setDirty(true); };

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Subtitle Style</h4>
                {dirty && (
                    <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors">
                        <Save className="w-3 h-3" /> Save
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Font Family</label>
                    <select value={font} onChange={e => change(setFont)(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none">
                        {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Font Size: {fontSize}px</label>
                    <input type="range" min={24} max={200} value={fontSize} onChange={e => change(setFontSize)(parseInt(e.target.value))}
                        className="w-full accent-violet-500" />
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Text Color</label>
                    <div className="flex items-center gap-2">
                        <input type="color" value={color} onChange={e => change(setColor)(e.target.value)}
                            className="w-8 h-8 rounded-lg border border-gray-700 cursor-pointer bg-transparent" />
                        <input type="text" value={color} onChange={e => change(setColor)(e.target.value)}
                            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-violet-500 focus:outline-none" />
                    </div>
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Highlight Color</label>
                    <div className="flex items-center gap-2">
                        <input type="color" value={hlColor} onChange={e => change(setHlColor)(e.target.value)}
                            className="w-8 h-8 rounded-lg border border-gray-700 cursor-pointer bg-transparent" />
                        <input type="text" value={hlColor} onChange={e => change(setHlColor)(e.target.value)}
                            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-violet-500 focus:outline-none" />
                    </div>
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Animation</label>
                    <select value={animation} onChange={e => change(setAnimation)(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none">
                        {ANIMATION_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Position</label>
                    <select value={position} onChange={e => change(setPosition)(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none">
                        {POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
            </div>
        </div>
    );
}

// ─── Effects Tab ─────────────────────────────────────────

function EffectsTab({ segment, onSave }: { segment: Segment; onSave: (data: any) => void }) {
    const [applied, setApplied] = useState<AppliedEffect[]>([]);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        const nonLayout = (segment.effects || []).filter(e => e.type !== "layout");
        setApplied(nonLayout);
        setDirty(false);
    }, [segment.id, segment.effects]);

    const addEffect = (effectId: string) => {
        if (applied.find(e => e.type === effectId)) return;
        const next = [...applied, { type: effectId, params: {} }];
        setApplied(next);
        setDirty(true);
    };

    const removeEffect = (index: number) => {
        const next = applied.filter((_, i) => i !== index);
        setApplied(next);
        setDirty(true);
    };

    const handleSave = () => {
        const layoutEffect = (segment.effects || []).find(e => e.type === "layout");
        const nextEffects = [...applied];
        if (layoutEffect) {
            nextEffects.push(layoutEffect);
        }
        onSave({ effects: nextEffects.length > 0 ? nextEffects : null });
        setDirty(false);
    };

    const appliedIds = new Set(applied.map(e => e.type));

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Video Effects</h4>
                {dirty && (
                    <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors">
                        <Save className="w-3 h-3" /> Save
                    </button>
                )}
            </div>

            {/* Applied effects */}
            {applied.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs text-gray-400 font-medium">Applied ({applied.length})</p>
                    {applied.map((effect, i) => {
                        const preset = EFFECT_PRESETS.find(p => p.id === effect.type);
                        return (
                            <div key={`${effect.type}-${i}`} className="flex items-center gap-3 bg-violet-500/10 border border-violet-500/20 rounded-xl px-3 py-2">
                                <span className="text-lg">{preset?.icon || "🎬"}</span>
                                <div className="flex-1">
                                    <p className="text-xs font-medium text-white">{preset?.label || effect.type}</p>
                                    <p className="text-[10px] text-gray-500">{preset?.desc}</p>
                                </div>
                                <button onClick={() => removeEffect(i)} className="p-1 text-gray-400 hover:text-red-400 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Available presets */}
            <div>
                <p className="text-xs text-gray-400 font-medium mb-2">Available Presets</p>
                <div className="grid grid-cols-3 gap-2">
                    {EFFECT_PRESETS.map(preset => {
                        const isApplied = appliedIds.has(preset.id);
                        return (
                            <button key={preset.id} onClick={() => addEffect(preset.id)} disabled={isApplied}
                                className={cn(
                                    "border rounded-xl p-3 text-left transition-all",
                                    isApplied
                                        ? "bg-violet-500/10 border-violet-500/30 opacity-50 cursor-not-allowed"
                                        : "bg-gray-800/50 border-gray-700 hover:border-violet-500/50 hover:bg-violet-500/5"
                                )}>
                                <div className="text-xl mb-1.5">{preset.icon}</div>
                                <p className="text-xs font-medium text-white">{preset.label}</p>
                                <p className="text-[10px] text-gray-500 mt-0.5">{preset.desc}</p>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ─── Hooks Tab ───────────────────────────────────────────

function HooksTab({ segment, onSave }: { segment: Segment; onSave: (data: any) => void }) {
    const [hookText, setHookText] = useState(segment.hookText || "");
    const [fontSize, setFontSize] = useState(segment.hookFontSize || 96);
    const [boxColor, setBoxColor] = useState(segment.hookBoxColor || "#FFFF00");
    const [fontColor, setFontColor] = useState(segment.hookFontColor || "#FFFFFF");
    const [uppercase, setUppercase] = useState(segment.hookUppercase !== false);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        setHookText(segment.hookText || "");
        setFontSize(segment.hookFontSize || 96);
        setBoxColor(segment.hookBoxColor || "#FFFF00");
        setFontColor(segment.hookFontColor || "#FFFFFF");
        setUppercase(segment.hookUppercase !== false);
        setDirty(false);
    }, [segment.id]);

    const handleSave = () => {
        onSave({
            hookText: hookText || null,
            hookFontSize: fontSize,
            hookBoxColor: boxColor,
            hookFontColor: fontColor,
            hookUppercase: uppercase,
        });
        setDirty(false);
    };

    const change = (setter: Function) => (val: any) => { setter(val); setDirty(true); };

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Hook Text Overlay</h4>
                {dirty && (
                    <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors">
                        <Save className="w-3 h-3" /> Save
                    </button>
                )}
            </div>

            <div className="space-y-4">
                <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Hook Text</label>
                    <textarea value={hookText} onChange={e => change(setHookText)(e.target.value)} rows={3}
                        placeholder="Enter on-screen hook text..."
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none resize-none" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-gray-500 mb-1.5 block">Font Size: {fontSize}px</label>
                        <input type="range" min={32} max={200} value={fontSize} onChange={e => change(setFontSize)(parseInt(e.target.value))}
                            className="w-full accent-violet-500" />
                    </div>
                    <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={uppercase} onChange={e => change(setUppercase)(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-700 bg-gray-800 accent-violet-500" />
                            <span className="text-xs text-gray-300">UPPERCASE</span>
                        </label>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-gray-500 mb-1.5 block">Box Color</label>
                        <div className="flex items-center gap-2">
                            <input type="color" value={boxColor} onChange={e => change(setBoxColor)(e.target.value)}
                                className="w-8 h-8 rounded-lg border border-gray-700 cursor-pointer bg-transparent" />
                            <input type="text" value={boxColor} onChange={e => change(setBoxColor)(e.target.value)}
                                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-violet-500 focus:outline-none" />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 mb-1.5 block">Font Color</label>
                        <div className="flex items-center gap-2">
                            <input type="color" value={fontColor} onChange={e => change(setFontColor)(e.target.value)}
                                className="w-8 h-8 rounded-lg border border-gray-700 cursor-pointer bg-transparent" />
                            <input type="text" value={fontColor} onChange={e => change(setFontColor)(e.target.value)}
                                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-violet-500 focus:outline-none" />
                        </div>
                    </div>
                </div>

                {/* Preview */}
                {hookText && (
                    <div className="bg-gray-800 rounded-xl p-4 text-center">
                        <p className="text-xs text-gray-500 mb-2">Preview</p>
                        <div className="inline-block px-5 py-2 rounded" style={{ backgroundColor: boxColor + "D9" }}>
                            <span style={{ color: fontColor, fontSize: Math.min(fontSize / 3, 28), fontWeight: "bold" }}>
                                {uppercase ? hookText.toUpperCase() : hookText}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Layout & Sizing Tab ─────────────────────────────────

function LayoutTab({
    segment,
    onSave,
    onApplyToAll,
}: {
    segment: Segment;
    onSave: (data: any) => void;
    onApplyToAll: (aspectRatio: string, cropMode: string, manualXOffset: number, gameplayLoop: string, cuts: any[]) => void;
}) {
    const layoutEffect = (segment.effects || []).find(e => e.type === "layout");
    const layoutParams = layoutEffect?.params || {};

    const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9">(layoutParams.aspectRatio || "9:16");
    const [cropMode, setCropMode] = useState<"letterbox" | "center" | "manual" | "smart" | "multicam" | "split">(layoutParams.cropMode || "letterbox");
    const [manualXOffset, setManualXOffset] = useState<number>(layoutParams.manualXOffset !== undefined ? layoutParams.manualXOffset : 50);
    const [gameplayLoop, setGameplayLoop] = useState<"minecraft" | "gta5" | "subway_surfers">(layoutParams.gameplayLoop || "minecraft");
    const [cuts, setCuts] = useState<{ time: number; angle: "left" | "right" | "center" }[]>(layoutParams.cuts || []);

    const [newCutTime, setNewCutTime] = useState<string>("0");
    const [newCutAngle, setNewCutAngle] = useState<"left" | "right" | "center">("center");
    const [dirty, setDirty] = useState(false);

    const segmentDuration = segment.endTime - segment.startTime;

    useEffect(() => {
        const eff = (segment.effects || []).find(e => e.type === "layout");
        const p = eff?.params || {};
        setAspectRatio(p.aspectRatio || "9:16");
        setCropMode(p.cropMode || "letterbox");
        setManualXOffset(p.manualXOffset !== undefined ? p.manualXOffset : 50);
        setGameplayLoop(p.gameplayLoop || "minecraft");
        setCuts(p.cuts || []);
        setDirty(false);
    }, [segment.id, segment.effects]);

    const handleSave = () => {
        const otherEffects = (segment.effects || []).filter(e => e.type !== "layout");
        const nextEffects = [...otherEffects, {
            type: "layout",
            params: { aspectRatio, cropMode, manualXOffset, gameplayLoop, cuts }
        }];
        onSave({ effects: nextEffects });
        setDirty(false);
    };

    const addCut = () => {
        const t = parseFloat(newCutTime);
        if (isNaN(t) || t < 0 || t > segmentDuration) {
            alert(`Cut time must be between 0 and ${segmentDuration.toFixed(1)} seconds`);
            return;
        }
        const newCuts = [...cuts, { time: t, angle: newCutAngle }].sort((a, b) => a.time - b.time);
        setCuts(newCuts);
        setDirty(true);
        setNewCutTime("");
    };

    const removeCut = (index: number) => {
        setCuts(cuts.filter((_, i) => i !== index));
        setDirty(true);
    };

    const change = (setter: Function) => (val: any) => {
        setter(val);
        setDirty(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Layout & Sizing</h4>
                <div className="flex gap-2">
                    <button
                        onClick={() => onApplyToAll(aspectRatio, cropMode, manualXOffset, gameplayLoop, cuts)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 text-white transition-colors border border-gray-700"
                    >
                        Apply to All
                    </button>
                    {dirty && (
                        <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors">
                            <Save className="w-3.5 h-3.5" /> Save Layout
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                {/* Aspect Ratio */}
                <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Aspect Ratio</label>
                    <select value={aspectRatio} onChange={e => change(setAspectRatio)(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none">
                        <option value="9:16">9:16 Vertical (Shorts/Reels)</option>
                        <option value="1:1">1:1 Square (Instagram/Post)</option>
                        <option value="16:9">16:9 Landscape (Widescreen)</option>
                    </select>
                </div>

                {/* Crop Mode */}
                <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">Framing & Crop Mode</label>
                    <select value={cropMode} onChange={e => change(setCropMode)(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none">
                        <option value="letterbox">Letterbox (Fit with bars)</option>
                        <option value="center">Center Crop (Zoom to fill)</option>
                        <option value="manual">Manual X-Offset</option>
                        <option value="smart">Smart Auto-Crop (Face tracking)</option>
                        {aspectRatio === "9:16" && <option value="multicam">Virtual Multi-Cam Cuts</option>}
                        {aspectRatio === "9:16" && <option value="split">Split-Screen Layout (Gameplay Stack)</option>}
                    </select>
                </div>
            </div>

            {/* Manual X-Offset Slider */}
            {cropMode === "manual" && (
                <div className="bg-gray-800/30 border border-gray-800 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between text-xs text-gray-400">
                        <span>Horizontal Offset: {manualXOffset}%</span>
                        <span>0% (Left) — 100% (Right)</span>
                    </div>
                    <input type="range" min={0} max={100} value={manualXOffset} onChange={e => change(setManualXOffset)(parseInt(e.target.value))}
                        className="w-full accent-violet-500" />
                </div>
            )}

            {/* Gameplay Loop Select */}
            {cropMode === "split" && aspectRatio === "9:16" && (
                <div className="bg-gray-800/30 border border-gray-800 rounded-xl p-4 space-y-3">
                    <label className="text-xs text-gray-400 font-medium block">Gameplay Loop Background</label>
                    <select value={gameplayLoop} onChange={e => change(setGameplayLoop)(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none">
                        <option value="minecraft">Minecraft Parkour</option>
                        <option value="gta5">GTA 5 Stunts</option>
                        <option value="subway_surfers">Subway Surfers</option>
                    </select>
                    <p className="text-[10px] text-gray-500">A royalty-free gameplay loop video will stack underneath the main talking head content.</p>
                </div>
            )}

            {/* Virtual Multi-Cam Cuts Editor */}
            {cropMode === "multicam" && aspectRatio === "9:16" && (
                <div className="bg-gray-800/30 border border-gray-800 rounded-xl p-4 space-y-4">
                    <label className="text-xs text-gray-400 font-medium block">Virtual Director Camera Cuts</label>

                    {/* Cuts List */}
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                        {cuts.length === 0 ? (
                            <p className="text-xs text-gray-500 italic">No camera cuts added. Video will default to center angle.</p>
                        ) : (
                            cuts.map((cut, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-1.5 text-xs text-white">
                                    <span>Cut #{idx+1} at <span className="font-semibold text-violet-400">{cut.time.toFixed(1)}s</span> → <span className="capitalize">{cut.angle} Speaker</span></span>
                                    <button onClick={() => removeCut(idx)} className="text-gray-400 hover:text-red-400 transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Add Cut Controls */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-800">
                        <div>
                            <label className="text-[10px] text-gray-500 mb-1 block">Time (seconds)</label>
                            <input type="number" step="0.1" min="0" max={segmentDuration} value={newCutTime} onChange={e => setNewCutTime(e.target.value)}
                                placeholder="0.0" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none" />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-500 mb-1 block">Angle / Speaker</label>
                            <select value={newCutAngle} onChange={e => setNewCutAngle(e.target.value as any)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none">
                                <option value="left">Left Speaker</option>
                                <option value="center">Center / Wide</option>
                                <option value="right">Right Speaker</option>
                            </select>
                        </div>
                        <div className="flex items-end">
                            <button onClick={addCut}
                                className="w-full bg-violet-600 hover:bg-violet-500 text-white rounded-lg py-1.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1">
                                <Plus className="w-3.5 h-3.5" /> Add
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Video Preparation View ──────────────────────────────

function VideoPreparationView({
    video,
    onGenerate,
    generating,
    onDelete,
}: {
    video: Video & { transcript?: { content: string } | null; description?: string | null };
    onGenerate: (minDuration: number, maxDuration: number, segmentMode: string) => void;
    generating: boolean;
    onDelete: () => void;
}) {
    const [minDuration, setMinDuration] = useState(30);
    const [maxDuration, setMaxDuration] = useState(60);
    const [segmentMode, setSegmentMode] = useState("standard");

    return (
        <div className="flex-1 flex gap-6 p-6 overflow-hidden h-[calc(100vh-4rem)]">
            {/* Left: Video Player + Transcript & Synopsis */}
            <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <Link href="/dashboard/studio" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors mb-2">
                            <ChevronLeft className="w-4 h-4" /> Back to Studio
                        </Link>
                        <h1 className="text-2xl font-bold text-white">{video.title || "Untitled Video"}</h1>
                    </div>
                    <button onClick={onDelete} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-red-950/30 border border-red-900/30 text-red-400 hover:bg-red-900/20 transition-all">
                        <Trash2 className="w-4 h-4" /> Delete Video
                    </button>
                </div>

                {/* Video Player */}
                <div className="aspect-video bg-black rounded-2xl border border-gray-800 overflow-hidden relative group">
                    <video src={`/api/videos/${video.id}/stream`} controls className="w-full h-full" />
                </div>

                {/* AI Synopsis */}
                {video.description && (
                    <div className="bg-gray-900/30 border border-gray-800 rounded-2xl p-5">
                        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-violet-400" />
                            AI Synopsis
                        </h3>
                        <p className="text-sm text-gray-300 leading-relaxed">{video.description}</p>
                    </div>
                )}

                {/* Transcript */}
                <div className="bg-gray-900/30 border border-gray-800 rounded-2xl p-5 flex-1 min-h-[200px] flex flex-col">
                    <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                        <Type className="w-4 h-4 text-violet-400" />
                        Full Transcript
                    </h3>
                    <div className="flex-1 overflow-y-auto max-h-[300px] text-sm text-gray-400 leading-relaxed pr-2 font-light">
                        {video.transcript?.content || "No transcript available for this video."}
                    </div>
                </div>
            </div>

            {/* Right: Settings & Actions */}
            <div className="w-96 bg-gray-900/50 border border-gray-800 rounded-2xl p-6 flex flex-col justify-between h-fit gap-6">
                <div className="space-y-6">
                    <div>
                        <h2 className="text-lg font-bold text-white mb-1">Generate AI Clips</h2>
                        <p className="text-xs text-gray-400">Configure parameters for Gemini to find the most engaging segments of your video.</p>
                    </div>

                    {/* Form Fields */}
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs text-gray-500 mb-1.5 block">Min Duration: {minDuration}s</label>
                            <input type="range" min={15} max={90} step={5} value={minDuration} onChange={e => setMinDuration(parseInt(e.target.value))}
                                className="w-full accent-violet-500" />
                        </div>

                        <div>
                            <label className="text-xs text-gray-500 mb-1.5 block">Max Duration: {maxDuration}s</label>
                            <input type="range" min={minDuration} max={120} step={5} value={maxDuration} onChange={e => setMaxDuration(parseInt(e.target.value))}
                                className="w-full accent-violet-500" />
                        </div>

                        <div>
                            <label className="text-xs text-gray-500 mb-1.5 block">Clipping Focus Style</label>
                            <select value={segmentMode} onChange={e => setSegmentMode(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:border-violet-500 focus:outline-none">
                                <option value="standard">Standard (General Highlights)</option>
                                <option value="high_drama">High Drama (Tension & Conflicts)</option>
                                <option value="educational">Educational / Explainer (Informative)</option>
                                <option value="funny">Funny (Humor & Comedy)</option>
                                <option value="suspense">Suspense (Thrills & Mystery)</option>
                                <option value="storytelling">Storytelling (Narrative Arc)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-gray-800">
                    <button
                        onClick={() => onGenerate(minDuration, maxDuration, segmentMode)}
                        disabled={generating}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-all disabled:opacity-50 shadow-lg shadow-violet-500/20"
                    >
                        {generating ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Analyzing & Clipping…
                            </>
                        ) : (
                            <>
                                <Wand2 className="w-4 h-4" />
                                Generate AI Clips
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function StudioPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            </div>
        }>
            <StudioContent />
        </Suspense>
    );
}
