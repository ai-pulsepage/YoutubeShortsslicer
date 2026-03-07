"use client";

import { useState, useEffect } from "react";
import { Film, Download, Play, Loader2, RefreshCw, Clock, CheckCircle, XCircle, Tag, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

type TagType = { id: string; name: string; color: string };

type ShortVideo = {
    id: string;
    segmentId: string;
    storagePath: string;
    duration: number;
    status: string;
    createdAt: string;
    segment: {
        id: string;
        title: string;
        startTime: number;
        endTime: number;
        aiScore: number | null;
        video: {
            id: string;
            title: string | null;
        };
    };
};

export default function RenderPage() {
    const [shorts, setShorts] = useState<ShortVideo[]>([]);
    const [loading, setLoading] = useState(true);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [tags, setTags] = useState<TagType[]>([]);
    const [selectedTag, setSelectedTag] = useState<string>("");

    const loadShorts = (tagId?: string) => {
        const url = tagId ? `/api/shorts?tag=${tagId}` : "/api/shorts";
        fetch(url)
            .then((r) => r.json())
            .then((data) => {
                if (Array.isArray(data)) setShorts(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        loadShorts();
        // Load tags for filter
        fetch("/api/tags")
            .then(r => r.ok ? r.json() : [])
            .then(data => setTags(Array.isArray(data) ? data : []))
            .catch(() => { });
        // Auto-refresh every 10 seconds
        const interval = setInterval(() => {
            const url = selectedTag ? `/api/shorts?tag=${selectedTag}` : "/api/shorts";
            fetch(url)
                .then((r) => r.json())
                .then((data) => {
                    if (Array.isArray(data)) setShorts(data);
                })
                .catch(() => { });
        }, 10000);
        return () => clearInterval(interval);
    }, []);

    const formatTime = (secs: number) => {
        if (!isFinite(secs) || isNaN(secs)) return "0:00";
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = Math.floor(secs % 60);
        if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    const statusIcon = (status: string) => {
        switch (status) {
            case "RENDERED": return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
            case "RENDERING": return <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />;
            case "FAILED": return <XCircle className="w-3.5 h-3.5 text-red-400" />;
            default: return <Clock className="w-3.5 h-3.5 text-gray-400" />;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Rendered Shorts</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        {shorts.length} short{shorts.length !== 1 ? "s" : ""} rendered and ready to publish
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Tag filter */}
                    <select
                        value={selectedTag}
                        onChange={(e) => {
                            setSelectedTag(e.target.value);
                            loadShorts(e.target.value || undefined);
                        }}
                        className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                    >
                        <option value="">All Batches</option>
                        {tags.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                    <button
                        onClick={() => {
                            setLoading(true);
                            loadShorts(selectedTag || undefined);
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gray-800 hover:bg-gray-700 text-white transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {shorts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
                        <Film className="w-8 h-8 text-blue-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-white mb-2">No rendered shorts yet</h2>
                    <p className="text-gray-400 text-sm max-w-md">
                        Approve segments in the editor and click &quot;Render Approved&quot; to generate short-form videos.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {shorts.map((short) => (
                        <div
                            key={short.id}
                            className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors group"
                        >
                            {/* Video preview */}
                            <div className="aspect-[9/16] bg-black relative">
                                {playingId === short.id ? (
                                    <video
                                        src={`/api/shorts/${short.id}/stream`}
                                        controls
                                        autoPlay
                                        className="w-full h-full object-contain"
                                        onEnded={() => setPlayingId(null)}
                                    />
                                ) : (
                                    <button
                                        onClick={() => setPlayingId(short.id)}
                                        className="absolute inset-0 flex items-center justify-center bg-gray-900/80 hover:bg-gray-900/60 transition-colors"
                                    >
                                        <div className="w-14 h-14 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                                            <Play className="w-6 h-6 text-violet-400 ml-0.5" />
                                        </div>
                                    </button>
                                )}

                                {/* Duration badge */}
                                <div className="absolute bottom-2 right-2 bg-black/70 rounded px-1.5 py-0.5 text-[10px] text-white font-medium">
                                    {formatTime(short.duration)}
                                </div>
                            </div>

                            {/* Info */}
                            <div className="p-3 space-y-2">
                                <p className="text-sm text-white font-medium truncate">
                                    {short.segment?.title || "Untitled"}
                                </p>
                                <p className="text-[10px] text-gray-500 truncate">
                                    from: {short.segment?.video?.title || "Unknown video"}
                                </p>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        {statusIcon(short.status)}
                                        <span className="text-[10px] text-gray-500 uppercase">{short.status}</span>
                                    </div>

                                    <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-gray-500">
                                            {formatTime(short.segment?.startTime || 0)} → {formatTime(short.segment?.endTime || 0)}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <a
                                        href={`/api/shorts/${short.id}/stream`}
                                        download={`${short.segment?.title || "short"}.mp4`}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                                    >
                                        <Download className="w-3 h-3" />
                                        Download
                                    </a>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
