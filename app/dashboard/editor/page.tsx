"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Scissors,
    Merge,
    Check,
    X,
    ChevronLeft,
    ChevronRight,
    Volume2,
    VolumeX,
    Mic,
    Star,
    Sparkles,
    Info,
    Trash2,
    Plus,
    Keyboard,
    Loader2,
    RefreshCw,
    ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Segment = {
    id: string;
    start: number;
    end: number;
    title: string;
    description: string | null;
    aiScore: number | null;
    status: string;
    voiceoverEnabled: boolean;
};

type Video = {
    id: string;
    title: string | null;
    status: string;
    duration: number | null;
    thumbnail: string | null;
    storagePath: string | null;
    platform: string;
};

export default function EditorPage() {
    const searchParams = useSearchParams();
    const videoId = searchParams.get("video");

    const [video, setVideo] = useState<Video | null>(null);
    const [segments, setSegments] = useState<Segment[]>([]);
    const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [muted, setMuted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [segmenting, setSegmenting] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);

    const duration = video?.duration || 0;
    const selected = segments.find((s) => s.id === selectedSegment);

    // Fetch video + segments
    useEffect(() => {
        if (!videoId) return;

        Promise.all([
            fetch(`/api/videos/${videoId}/status`).then((r) => r.json()),
            fetch(`/api/videos/${videoId}/segment`).then((r) => r.json()),
        ]).then(([videoData, segmentData]) => {
            setVideo(videoData);
            if (Array.isArray(segmentData)) setSegments(segmentData);
            setLoading(false);
        });
    }, [videoId]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            switch (e.key) {
                case " ":
                    e.preventDefault();
                    togglePlay();
                    break;
                case "j":
                    seekBy(-10);
                    break;
                case "k":
                    togglePlay();
                    break;
                case "l":
                    seekBy(10);
                    break;
                case "ArrowLeft":
                    seekBy(e.shiftKey ? -5 : -1);
                    break;
                case "ArrowRight":
                    seekBy(e.shiftKey ? 5 : 1);
                    break;
                case "i":
                    if (selected) updateSegmentBound("start", currentTime);
                    break;
                case "o":
                    if (selected) updateSegmentBound("end", currentTime);
                    break;
                case "Escape":
                    setSelectedSegment(null);
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [currentTime, selected, isPlaying]);

    // Video time update
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onTimeUpdate = () => setCurrentTime(video.currentTime);
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);

        video.addEventListener("timeupdate", onTimeUpdate);
        video.addEventListener("play", onPlay);
        video.addEventListener("pause", onPause);

        return () => {
            video.removeEventListener("timeupdate", onTimeUpdate);
            video.removeEventListener("play", onPlay);
            video.removeEventListener("pause", onPause);
        };
    }, []);

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (videoRef.current.paused) videoRef.current.play();
        else videoRef.current.pause();
    };

    const seekBy = (seconds: number) => {
        if (!videoRef.current) return;
        videoRef.current.currentTime = Math.max(
            0,
            Math.min(duration, videoRef.current.currentTime + seconds)
        );
    };

    const seekTo = (time: number) => {
        if (!videoRef.current) return;
        videoRef.current.currentTime = time;
        setCurrentTime(time);
    };

    const updateSegmentBound = async (bound: "start" | "end", time: number) => {
        if (!selected) return;
        setSegments((prev) =>
            prev.map((s) =>
                s.id === selected.id ? { ...s, [bound]: Math.round(time * 100) / 100 } : s
            )
        );
    };

    const handleTimelineClick = (e: React.MouseEvent) => {
        if (!timelineRef.current || !duration) return;
        const rect = timelineRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = x / rect.width;
        seekTo(pct * duration);
    };

    const updateSegmentStatus = async (segmentId: string, status: string) => {
        setSegments((prev) =>
            prev.map((s) => (s.id === segmentId ? { ...s, status } : s))
        );
        try {
            await fetch(`/api/videos/${videoId}/segment/${segmentId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });
        } catch (err) {
            console.error("Failed to persist segment status:", err);
        }
    };

    const splitSegment = () => {
        if (!selected || currentTime <= selected.start || currentTime >= selected.end) return;
        const newSegment: Segment = {
            id: `temp-${Date.now()}`,
            start: currentTime,
            end: selected.end,
            title: `${selected.title} (Part 2)`,
            description: selected.description,
            aiScore: selected.aiScore,
            status: "SUGGESTED",
            voiceoverEnabled: false,
        };
        setSegments((prev) => [
            ...prev.map((s) =>
                s.id === selected.id ? { ...s, end: currentTime, title: `${s.title} (Part 1)` } : s
            ),
            newSegment,
        ].sort((a, b) => a.start - b.start));
    };

    const triggerSegmentation = async () => {
        if (!videoId) return;
        setSegmenting(true);
        try {
            const res = await fetch(`/api/videos/${videoId}/segment`, { method: "POST" });
            const data = await res.json();
            if (res.ok) {
                const segs = await fetch(`/api/videos/${videoId}/segment`).then((r) => r.json());
                if (Array.isArray(segs)) setSegments(segs);
            } else {
                alert(data.error || "Segmentation failed");
            }
        } catch (err: any) {
            alert("Segmentation request failed: " + err.message);
        } finally {
            setSegmenting(false);
        }
    };

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        const ms = Math.floor((secs % 1) * 10);
        return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
    };

    const scoreColor = (score: number | null) => {
        if (!score) return "text-gray-500";
        if (score >= 8) return "text-emerald-400";
        if (score >= 6) return "text-amber-400";
        return "text-red-400";
    };

    if (!videoId) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <Scissors className="w-16 h-16 text-violet-400/30 mb-4" />
                <h1 className="text-2xl font-bold text-white mb-2">Segment Editor</h1>
                <p className="text-gray-400 text-sm mb-6">
                    Select a video from your library to start editing
                </p>
                <a href="/dashboard/library" className="px-5 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors">
                    Open Library
                </a>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-4 -mx-6 lg:-mx-8 -mt-6 lg:-mt-8">
            {/* Header */}
            <div className="px-6 pt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <a href="/dashboard/library" className="p-2 text-gray-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </a>
                    <div>
                        <h1 className="text-lg font-semibold text-white truncate max-w-md">
                            {video?.title || "Untitled"}
                        </h1>
                        <p className="text-xs text-gray-500">
                            {segments.length} segments · {formatTime(duration)}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={triggerSegmentation}
                        disabled={segmenting}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
                    >
                        {segmenting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        AI Segment
                    </button>
                    <button
                        onClick={() => setShowShortcuts(!showShortcuts)}
                        className={cn(
                            "p-2 rounded-lg text-xs transition-colors",
                            showShortcuts
                                ? "bg-violet-500/15 text-violet-400"
                                : "text-gray-400 hover:text-white hover:bg-gray-800"
                        )}
                    >
                        <Keyboard className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Shortcuts Panel */}
            {showShortcuts && (
                <div className="mx-6 bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                    <div className="grid grid-cols-4 gap-3 text-xs">
                        <Shortcut keys="Space" label="Play/Pause" />
                        <Shortcut keys="J" label="⟵ 10s" />
                        <Shortcut keys="K" label="Play/Pause" />
                        <Shortcut keys="L" label="10s ⟶" />
                        <Shortcut keys="←" label="⟵ 1s" />
                        <Shortcut keys="→" label="1s ⟶" />
                        <Shortcut keys="Shift+←" label="⟵ 5s" />
                        <Shortcut keys="Shift+→" label="5s ⟶" />
                        <Shortcut keys="I" label="Set In Point" />
                        <Shortcut keys="O" label="Set Out Point" />
                        <Shortcut keys="Esc" label="Deselect" />
                    </div>
                </div>
            )}

            {/* Video Preview + Segment Panel */}
            <div className="flex gap-4 px-6">
                {/* Video */}
                <div className="flex-1">
                    <div className="aspect-video bg-black rounded-xl overflow-hidden relative">
                        <video
                            ref={videoRef}
                            className="w-full h-full object-contain"
                            muted={muted}
                            playsInline
                            src={videoId ? `/api/videos/${videoId}/stream` : undefined}
                        />

                        {/* Playback overlay */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 p-3">
                            <div className="flex items-center gap-3">
                                <button onClick={togglePlay} className="text-white hover:text-violet-400 transition-colors">
                                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                                </button>
                                <button onClick={() => seekBy(-10)} className="text-white/70 hover:text-white transition-colors">
                                    <SkipBack className="w-4 h-4" />
                                </button>
                                <button onClick={() => seekBy(10)} className="text-white/70 hover:text-white transition-colors">
                                    <SkipForward className="w-4 h-4" />
                                </button>
                                <span className="text-xs text-white/70 font-mono">
                                    {formatTime(currentTime)} / {formatTime(duration)}
                                </span>
                                <div className="flex-1" />
                                <button onClick={() => setMuted(!muted)} className="text-white/70 hover:text-white transition-colors">
                                    {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Segment Details Panel */}
                <div className="w-80 flex-shrink-0">
                    {selected ? (
                        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-white">Segment Details</h3>
                                <button onClick={() => setSelectedSegment(null)} className="text-gray-500 hover:text-white">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <input
                                type="text"
                                value={selected.title}
                                onChange={(e) =>
                                    setSegments((prev) =>
                                        prev.map((s) => (s.id === selected.id ? { ...s, title: e.target.value } : s))
                                    )
                                }
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                            />

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] text-gray-500 uppercase">In</label>
                                    <p className="text-sm text-white font-mono">{formatTime(selected.start)}</p>
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-500 uppercase">Out</label>
                                    <p className="text-sm text-white font-mono">{formatTime(selected.end)}</p>
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-500 uppercase">Duration</label>
                                    <p className="text-sm text-white font-mono">
                                        {formatTime(selected.end - selected.start)}
                                    </p>
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-500 uppercase">Score</label>
                                    <p className={cn("text-sm font-mono font-bold", scoreColor(selected.aiScore))}>
                                        {selected.aiScore || "—"}/10
                                    </p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        seekTo(selected.start);
                                        if (!isPlaying) togglePlay();
                                    }}
                                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 text-white transition-colors"
                                >
                                    <Play className="w-3 h-3" /> Preview
                                </button>
                                <button
                                    onClick={splitSegment}
                                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 text-white transition-colors"
                                >
                                    <Scissors className="w-3 h-3" /> Split
                                </button>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => updateSegmentStatus(selected.id, "APPROVED")}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors",
                                        selected.status === "APPROVED"
                                            ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                                            : "bg-gray-800 hover:bg-gray-700 text-white"
                                    )}
                                >
                                    <Check className="w-3 h-3" /> Approve
                                </button>
                                <button
                                    onClick={() => updateSegmentStatus(selected.id, "REJECTED")}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors",
                                        selected.status === "REJECTED"
                                            ? "bg-red-500/15 text-red-400 ring-1 ring-red-500/30"
                                            : "bg-gray-800 hover:bg-gray-700 text-white"
                                    )}
                                >
                                    <X className="w-3 h-3" /> Reject
                                </button>
                            </div>

                            {/* Voiceover Toggle */}
                            <div className="flex items-center justify-between py-2 border-t border-gray-800">
                                <span className="text-xs text-gray-400 flex items-center gap-1.5">
                                    <Mic className="w-3 h-3" /> Voiceover
                                </span>
                                <button
                                    onClick={() =>
                                        setSegments((prev) =>
                                            prev.map((s) =>
                                                s.id === selected.id
                                                    ? { ...s, voiceoverEnabled: !s.voiceoverEnabled }
                                                    : s
                                            )
                                        )
                                    }
                                    className={cn(
                                        "w-9 h-5 rounded-full transition-colors relative",
                                        selected.voiceoverEnabled ? "bg-violet-600" : "bg-gray-700"
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                                            selected.voiceoverEnabled ? "translate-x-4" : "translate-x-0.5"
                                        )}
                                    />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 text-center">
                            <Info className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                            <p className="text-sm text-gray-400">
                                Click a segment on the timeline to edit
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Timeline */}
            <div className="px-6 pb-6">
                <div
                    ref={timelineRef}
                    onClick={handleTimelineClick}
                    className="relative bg-gray-900 border border-gray-800 rounded-xl h-24 cursor-crosshair overflow-hidden"
                >
                    {/* Segment Regions */}
                    {segments.map((seg) => {
                        const left = duration ? (seg.start / duration) * 100 : 0;
                        const width = duration ? ((seg.end - seg.start) / duration) * 100 : 0;
                        const isSelected = seg.id === selectedSegment;

                        const statusColors: Record<string, string> = {
                            SUGGESTED: "bg-violet-500/20 border-violet-500/40 hover:bg-violet-500/30",
                            APPROVED: "bg-emerald-500/20 border-emerald-500/40 hover:bg-emerald-500/30",
                            REJECTED: "bg-red-500/20 border-red-500/20 hover:bg-red-500/30 opacity-40",
                            RENDERED: "bg-blue-500/20 border-blue-500/40 hover:bg-blue-500/30",
                        };

                        return (
                            <div
                                key={seg.id}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedSegment(seg.id);
                                }}
                                className={cn(
                                    "absolute top-2 bottom-2 rounded-lg border cursor-pointer transition-all group",
                                    statusColors[seg.status] || statusColors.SUGGESTED,
                                    isSelected && "ring-2 ring-white/40 z-10"
                                )}
                                style={{ left: `${left}%`, width: `${width}%` }}
                            >
                                {/* Label */}
                                {width > 3 && (
                                    <div className="absolute inset-0 flex flex-col justify-between p-1.5 overflow-hidden">
                                        <span className="text-[9px] text-white/80 font-medium truncate">
                                            {seg.title}
                                        </span>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[8px] text-white/50 font-mono">
                                                {formatTime(seg.end - seg.start)}
                                            </span>
                                            {seg.aiScore && (
                                                <span className={cn("text-[8px] font-bold", scoreColor(seg.aiScore))}>
                                                    {seg.aiScore}/10
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Drag handles (visual only for now) */}
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/0 group-hover:bg-white/30 cursor-ew-resize rounded-l" />
                                <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/0 group-hover:bg-white/30 cursor-ew-resize rounded-r" />
                            </div>
                        );
                    })}

                    {/* Playhead */}
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none"
                        style={{ left: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
                    >
                        <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-white rounded-full" />
                    </div>

                    {/* Time markers */}
                    <div className="absolute bottom-0 left-0 right-0 h-5 flex items-end px-2">
                        {Array.from({ length: Math.min(10, Math.ceil(duration / 60)) }, (_, i) => {
                            const time = (i / Math.min(10, Math.ceil(duration / 60))) * duration;
                            return (
                                <span
                                    key={i}
                                    className="text-[8px] text-gray-600 font-mono absolute"
                                    style={{ left: `${(time / duration) * 100}%` }}
                                >
                                    {formatTime(time)}
                                </span>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Segment List */}
            <div className="px-6 pb-6">
                <h3 className="text-sm font-semibold text-white mb-3">
                    All Segments ({segments.length})
                </h3>
                <div className="space-y-1.5">
                    {segments
                        .sort((a, b) => a.start - b.start)
                        .map((seg) => (
                            <div
                                key={seg.id}
                                onClick={() => {
                                    setSelectedSegment(seg.id);
                                    seekTo(seg.start);
                                }}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                                    seg.id === selectedSegment
                                        ? "bg-violet-500/10 border border-violet-500/20"
                                        : "bg-gray-900/30 hover:bg-gray-800/50 border border-transparent"
                                )}
                            >
                                <span className="text-xs text-gray-500 font-mono w-20 flex-shrink-0">
                                    {formatTime(seg.start)} → {formatTime(seg.end)}
                                </span>
                                <span className="text-sm text-white flex-1 truncate">{seg.title}</span>
                                <span
                                    className={cn(
                                        "text-[10px] font-medium px-2 py-0.5 rounded-full",
                                        seg.status === "APPROVED"
                                            ? "bg-emerald-500/15 text-emerald-400"
                                            : seg.status === "REJECTED"
                                                ? "bg-red-500/15 text-red-400"
                                                : "bg-gray-800 text-gray-400"
                                    )}
                                >
                                    {seg.status}
                                </span>
                                <span className={cn("text-xs font-bold", scoreColor(seg.aiScore))}>
                                    {seg.aiScore || "—"}
                                </span>
                                {seg.voiceoverEnabled && <Mic className="w-3 h-3 text-violet-400" />}
                            </div>
                        ))}
                    {segments.length === 0 && (
                        <div className="text-center py-8 text-gray-500 text-sm">
                            No segments yet. Click &quot;AI Segment&quot; to generate suggestions.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
    return (
        <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 text-[10px] font-mono border border-gray-700">
                {keys}
            </kbd>
            <span className="text-gray-500">{label}</span>
        </div>
    );
}
