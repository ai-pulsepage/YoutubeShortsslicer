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

    const [video, setVideo] = useState<Video | null>(null);
    const [segments, setSegments] = useState<Segment[]>([]);
    const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"style" | "effects" | "hooks">("style");
    const [loading, setLoading] = useState(true);
    const [videos, setVideos] = useState<Video[]>([]);
    const [renderingIds, setRenderingIds] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);
    const [playingSegId, setPlayingSegId] = useState<string | null>(null);

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

    // Poll for render status
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

    // No video selected — show video picker
    if (!videoId) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Studio</h1>
                    <p className="text-gray-400 text-sm mt-1">Select a video to open in the editor</p>
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
                            <Link key={v.id} href={`/dashboard/studio?video=${v.id}`}
                                className="bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden hover:border-violet-500/50 transition-all group">
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
                                    <h3 className="text-sm font-medium text-white truncate">{v.title || "Untitled"}</h3>
                                    <p className="text-xs text-gray-500 mt-1">{v.duration ? formatTime(v.duration) : "--:--"}</p>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Video selected — full Studio view
    const approvedCount = segments.filter(s => s.status === "APPROVED").length;
    const renderedCount = segments.filter(s => s.status === "RENDERED" || s.shortVideo?.status === "RENDERED").length;

    return (
        <div className="flex h-[calc(100vh-4rem)] gap-4">
            {/* Left: Segment List */}
            <div className="w-72 flex-shrink-0 flex flex-col bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800">
                    <div className="flex items-center gap-2 mb-2">
                        <Link href="/dashboard/library" className="p-1 text-gray-400 hover:text-white transition-colors">
                            <ChevronLeft className="w-4 h-4" />
                        </Link>
                        <h2 className="text-sm font-semibold text-white truncate flex-1">{video?.title || "Untitled"}</h2>
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
                                {/* Approve / Reject */}
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
                                {selectedSegment.status === "APPROVED" && (
                                    <button onClick={() => renderSegment(selectedSegment.id)} disabled={renderingIds.has(selectedSegment.id)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50">
                                        {renderingIds.has(selectedSegment.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Film className="w-3 h-3" />}
                                        Render
                                    </button>
                                )}
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
                                    </div>
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
                                            {selectedSegment.effects!.length}
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
    const [applied, setApplied] = useState<AppliedEffect[]>(segment.effects || []);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        setApplied(segment.effects || []);
        setDirty(false);
    }, [segment.id]);

    const addEffect = (effectId: string) => {
        // Don't add duplicate
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
        onSave({ effects: applied.length > 0 ? applied : null });
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
