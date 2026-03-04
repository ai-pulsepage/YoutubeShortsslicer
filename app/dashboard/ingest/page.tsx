"use client";

import { useState, useEffect } from "react";
import {
    Download,
    Link2,
    Youtube,
    AlertCircle,
    Loader2,
    CheckCircle2,
    Clock,
    User,
    Eye,
    Tag,
    X,
    Image,
    FileText,
    Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Metadata = {
    title: string;
    thumbnail: string | null;
    duration: number | null;
    uploader: string | null;
    viewCount: number | null;
    description: string | null;
    platform: string;
};

type TagType = {
    id: string;
    name: string;
    color: string;
};

type IngestedVideo = {
    id: string;
    status: string;
    platform: string;
    title?: string;
};

export default function IngestPage() {
    const [url, setUrl] = useState("");
    const [metadata, setMetadata] = useState<Metadata | null>(null);
    const [fetchingMeta, setFetchingMeta] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState<IngestedVideo | null>(null);
    const [tags, setTags] = useState<TagType[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [recentIngests, setRecentIngests] = useState<IngestedVideo[]>([]);
    const [autoTranscribe, setAutoTranscribe] = useState(true);
    const [autoSegment, setAutoSegment] = useState(true);

    // Fetch tags on load
    useEffect(() => {
        fetch("/api/tags")
            .then((r) => r.json())
            .then((data) => setTags(data || []))
            .catch(() => { });
    }, []);

    const platform = url ? detectPlatform(url) : null;

    const fetchMetadata = async () => {
        if (!url.trim()) return;
        setFetchingMeta(true);
        setError("");
        setMetadata(null);

        try {
            const res = await fetch("/api/videos/metadata", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.message || data.error || "Failed to fetch metadata");
                return;
            }
            setMetadata(data);
        } catch (err: any) {
            setError(err.message || "Failed to fetch metadata");
        } finally {
            setFetchingMeta(false);
        }
    };

    const handleSubmit = async () => {
        if (!url.trim()) return;
        setSubmitting(true);
        setError("");
        setSuccess(null);

        try {
            const res = await fetch("/api/videos/ingest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url,
                    tags: selectedTags,
                    autoTranscribe,
                    autoSegment,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Failed to start ingestion");
                return;
            }
            setSuccess(data);
            setRecentIngests((prev) => [data, ...prev]);
            setUrl("");
            setMetadata(null);
            setSelectedTags([]);
        } catch (err: any) {
            setError(err.message || "Ingestion failed");
        } finally {
            setSubmitting(false);
        }
    };

    const toggleTag = (tagId: string) => {
        setSelectedTags((prev) =>
            prev.includes(tagId)
                ? prev.filter((t) => t !== tagId)
                : [...prev, tagId]
        );
    };

    const formatDuration = (seconds: number | null) => {
        if (!seconds) return "--:--";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    const formatViews = (count: number | null) => {
        if (!count) return null;
        if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M views`;
        if (count >= 1000) return `${(count / 1000).toFixed(1)}K views`;
        return `${count} views`;
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Ingest Video</h1>
                <p className="text-gray-400 text-sm mt-1">
                    Paste a video URL to preview metadata and start downloading
                </p>
            </div>

            {/* URL Input */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-4">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input
                            type="url"
                            value={url}
                            onChange={(e) => {
                                setUrl(e.target.value);
                                setError("");
                                setMetadata(null);
                                setSuccess(null);
                            }}
                            onKeyDown={(e) => e.key === "Enter" && fetchMetadata()}
                            placeholder="https://youtube.com/watch?v=..."
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-12 pr-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors text-sm"
                        />
                    </div>
                    <button
                        onClick={fetchMetadata}
                        disabled={!url.trim() || fetchingMeta}
                        className="px-4 py-3 rounded-xl text-sm font-medium bg-gray-800 hover:bg-gray-700 text-white disabled:opacity-50 transition-colors border border-gray-700"
                    >
                        {fetchingMeta ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Eye className="w-5 h-5" />
                        )}
                    </button>
                </div>

                {platform && !metadata && (
                    <div className="flex items-center gap-2 text-sm">
                        <Youtube className="w-4 h-4 text-violet-400" />
                        <span className="text-gray-400">
                            Detected: <span className="text-white font-medium capitalize">{platform}</span>
                        </span>
                    </div>
                )}
            </div>

            {/* Metadata Preview */}
            {metadata && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="flex">
                        {/* Thumbnail */}
                        <div className="w-64 flex-shrink-0">
                            {metadata.thumbnail ? (
                                <img
                                    src={metadata.thumbnail}
                                    alt={metadata.title}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full bg-gray-800 flex items-center justify-center min-h-[144px]">
                                    <Image className="w-10 h-10 text-gray-600" />
                                </div>
                            )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 p-5 space-y-3">
                            <h3 className="text-white font-semibold">{metadata.title}</h3>
                            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                                {metadata.uploader && (
                                    <span className="flex items-center gap-1.5">
                                        <User className="w-3.5 h-3.5" />
                                        {metadata.uploader}
                                    </span>
                                )}
                                {metadata.duration && (
                                    <span className="flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5" />
                                        {formatDuration(metadata.duration)}
                                    </span>
                                )}
                                {metadata.viewCount && (
                                    <span className="flex items-center gap-1.5">
                                        <Eye className="w-3.5 h-3.5" />
                                        {formatViews(metadata.viewCount)}
                                    </span>
                                )}
                                <span className="capitalize text-violet-400">{metadata.platform}</span>
                            </div>
                            {metadata.description && (
                                <p className="text-xs text-gray-500 line-clamp-2">
                                    {metadata.description}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Tag Selection */}
            {(metadata || url) && tags.length > 0 && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                        <Tag className="w-4 h-4 text-gray-400" />
                        Assign Tags (optional)
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {tags.map((tag) => (
                            <button
                                key={tag.id}
                                onClick={() => toggleTag(tag.id)}
                                className={cn(
                                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                                    selectedTags.includes(tag.id)
                                        ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30"
                                        : "bg-gray-800 text-gray-400 hover:text-white"
                                )}
                            >
                                <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: tag.color }}
                                />
                                {tag.name}
                                {selectedTags.includes(tag.id) && <X className="w-3 h-3" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* Success */}
            {success && (
                <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    Video queued for download! Check the library for progress.
                </div>
            )}

            {/* Submit Button */}

            {/* Pipeline Options */}
            {(metadata || url) && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                        <Brain className="w-4 h-4 text-violet-400" />
                        Pipeline Options
                    </h3>
                    <div className="space-y-3">
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    checked={autoTranscribe}
                                    onChange={(e) => {
                                        setAutoTranscribe(e.target.checked);
                                        if (!e.target.checked) setAutoSegment(false);
                                    }}
                                    className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-gray-700 rounded-full peer-checked:bg-violet-600 transition-colors" />
                                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                            </div>
                            <div>
                                <span className="text-sm text-white font-medium flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                                    Auto-Transcribe
                                </span>
                                <p className="text-[10px] text-gray-500">
                                    Extract audio and transcribe to text with word-level timestamps
                                </p>
                            </div>
                        </label>

                        <label className={cn("flex items-center gap-3 cursor-pointer group", !autoTranscribe && "opacity-40 pointer-events-none")}>
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    checked={autoSegment}
                                    onChange={(e) => setAutoSegment(e.target.checked)}
                                    disabled={!autoTranscribe}
                                    className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-gray-700 rounded-full peer-checked:bg-violet-600 transition-colors" />
                                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                            </div>
                            <div>
                                <span className="text-sm text-white font-medium flex items-center gap-1.5">
                                    <Brain className="w-3.5 h-3.5 text-cyan-400" />
                                    Auto-Segment (AI)
                                </span>
                                <p className="text-[10px] text-gray-500">
                                    AI analyzes transcript and suggests best 30–60s clips with scores
                                </p>
                            </div>
                        </label>
                    </div>
                </div>
            )}

            {/* Submit */}
            <button
                onClick={handleSubmit}
                disabled={!url.trim() || submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors text-sm"
            >
                {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                    <Download className="w-5 h-5" />
                )}
                {submitting ? "Queueing..." : metadata ? `Ingest "${metadata.title}"` : "Start Ingestion"}
            </button>

            {/* Supported Platforms */}
            <div className="bg-gray-900/30 border border-gray-800/50 rounded-2xl p-5">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Supported Platforms
                </h3>
                <div className="grid grid-cols-3 gap-2">
                    {[
                        "YouTube",
                        "Vimeo",
                        "TikTok",
                        "Instagram",
                        "Twitch",
                        "Twitter/X",
                        "Facebook",
                        "Reddit",
                        "1000+ more via yt-dlp",
                    ].map((p) => (
                        <div key={p} className="flex items-center gap-2 text-xs text-gray-500">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
                            {p}
                        </div>
                    ))}
                </div>
            </div>

            {/* Recent Ingests */}
            {recentIngests.length > 0 && (
                <div>
                    <h3 className="text-sm font-semibold text-white mb-3">Just Ingested</h3>
                    <div className="space-y-2">
                        {recentIngests.map((v) => (
                            <div
                                key={v.id}
                                className="flex items-center justify-between bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-3"
                            >
                                <div className="flex items-center gap-3">
                                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                                    <span className="text-sm text-white">
                                        {v.title || v.platform} — downloading...
                                    </span>
                                </div>
                                <a
                                    href="/dashboard/library"
                                    className="text-xs text-violet-400 hover:text-violet-300"
                                >
                                    View in Library →
                                </a>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function detectPlatform(url: string): string {
    const u = url.toLowerCase();
    if (u.includes("youtube.com") || u.includes("youtu.be")) return "YouTube";
    if (u.includes("vimeo.com")) return "Vimeo";
    if (u.includes("tiktok.com")) return "TikTok";
    if (u.includes("instagram.com")) return "Instagram";
    if (u.includes("twitch.tv")) return "Twitch";
    if (u.includes("twitter.com") || u.includes("x.com")) return "Twitter/X";
    return "Unknown";
}
