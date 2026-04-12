"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Search,
    Grid3X3,
    List,
    Filter,
    Plus,
    Tag,
    X,
    Film,
    Clock,
    Scissors,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    MoreVertical,
    Trash2,
    Loader2,
    AlertCircle,
    RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Video = {
    id: string;
    title: string | null;
    sourceUrl: string;
    platform: string;
    thumbnail: string | null;
    duration: number | null;
    status: string;
    createdAt: string;
    videoTags: { tag: { id: string; name: string; color: string } }[];
    _count: { segments: number };
};

type TagType = {
    id: string;
    name: string;
    color: string;
    _count: { videoTags: number };
};

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
    PENDING: { label: "Pending", class: "bg-gray-500/15 text-gray-400" },
    DOWNLOADING: { label: "Downloading", class: "bg-blue-500/15 text-blue-400" },
    TRANSCRIBING: { label: "Transcribing", class: "bg-cyan-500/15 text-cyan-400" },
    SEGMENTING: { label: "Segmenting", class: "bg-violet-500/15 text-violet-400" },
    READY: { label: "Ready", class: "bg-emerald-500/15 text-emerald-400" },
    FAILED: { label: "Failed", class: "bg-red-500/15 text-red-400" },
};

const TAG_COLORS = [
    "#3B82F6", "#8B5CF6", "#EC4899", "#EF4444", "#F97316",
    "#EAB308", "#22C55E", "#06B6D4", "#6366F1", "#A855F7",
];

export default function LibraryPage() {
    const [videos, setVideos] = useState<Video[]>([]);
    const [tags, setTags] = useState<TagType[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [tagFilter, setTagFilter] = useState("");
    const [sort, setSort] = useState("newest");
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [loading, setLoading] = useState(true);
    const [showTagManager, setShowTagManager] = useState(false);
    const [newTagName, setNewTagName] = useState("");
    const [newTagColor, setNewTagColor] = useState("#3B82F6");

    const fetchVideos = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams({
            page: page.toString(),
            search,
            status: statusFilter,
            tag: tagFilter,
            sort,
        });
        const res = await fetch(`/api/videos?${params}`);
        const data = await res.json();
        setVideos(data.videos || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        setLoading(false);
    }, [page, search, statusFilter, tagFilter, sort]);

    const fetchTags = useCallback(async () => {
        const res = await fetch("/api/tags");
        const data = await res.json();
        setTags(data || []);
    }, []);

    useEffect(() => {
        fetchVideos();
    }, [fetchVideos]);

    useEffect(() => {
        fetchTags();
    }, [fetchTags]);

    // Auto-refresh every 5s when there are in-progress videos
    useEffect(() => {
        const hasProcessing = videos.some((v) =>
            ["PENDING", "DOWNLOADING", "TRANSCRIBING", "SEGMENTING"].includes(v.status)
        );
        if (!hasProcessing) return;
        const interval = setInterval(fetchVideos, 5000);
        return () => clearInterval(interval);
    }, [videos, fetchVideos]);

    const deleteVideo = async (videoId: string) => {
        if (!confirm("Delete this video and all its segments? This cannot be undone.")) return;
        try {
            const res = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(`Delete failed: ${err.error || res.statusText}`);
                return;
            }
            setVideos((prev) => prev.filter((v) => v.id !== videoId));
            setTotal((prev) => prev - 1);
        } catch (err: any) {
            alert(`Delete failed: ${err.message || "Network error"}`);
        }
    };

    const createTag = async () => {
        if (!newTagName.trim()) return;
        await fetch("/api/tags", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newTagName, color: newTagColor }),
        });
        setNewTagName("");
        fetchTags();
    };

    const deleteTag = async (id: string) => {
        await fetch(`/api/tags?id=${id}`, { method: "DELETE" });
        fetchTags();
        if (tagFilter === id) setTagFilter("");
    };

    const formatDuration = (seconds: number | null) => {
        if (!seconds) return "--:--";
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Library</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        {total} video{total !== 1 ? "s" : ""} in your library
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowTagManager(!showTagManager)}
                        className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors",
                            showTagManager
                                ? "bg-violet-500/15 text-violet-400"
                                : "text-gray-400 hover:text-white hover:bg-gray-800"
                        )}
                    >
                        <Tag className="w-4 h-4" />
                        Tags
                    </button>
                    <a
                        href="/dashboard/ingest"
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add Video
                    </a>
                </div>
            </div>

            {/* Tag Manager Panel */}
            {showTagManager && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-3">Manage Tags</h3>
                    <div className="flex flex-wrap gap-2 mb-4">
                        {tags.map((tag) => (
                            <span
                                key={tag.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-800 text-gray-200"
                            >
                                <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: tag.color }}
                                />
                                {tag.name}
                                <span className="text-gray-500">({tag._count.videoTags})</span>
                                <button
                                    onClick={() => deleteTag(tag.id)}
                                    className="ml-1 text-gray-500 hover:text-red-400 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}
                        {tags.length === 0 && (
                            <p className="text-sm text-gray-500">No tags yet. Create one below.</p>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <div className="flex gap-1">
                            {TAG_COLORS.map((c) => (
                                <button
                                    key={c}
                                    onClick={() => setNewTagColor(c)}
                                    className={cn(
                                        "w-6 h-6 rounded-full transition-transform",
                                        newTagColor === c && "scale-125 ring-2 ring-white/30"
                                    )}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                        <input
                            type="text"
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && createTag()}
                            placeholder="Tag name..."
                            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500"
                        />
                        <button
                            onClick={createTag}
                            disabled={!newTagName.trim()}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
                        >
                            Add
                        </button>
                    </div>
                </div>
            )}

            {/* Filters Bar */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        placeholder="Search videos..."
                        className="w-full bg-gray-900/50 border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                </div>

                {/* Status Filter */}
                <select
                    value={statusFilter}
                    onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setPage(1);
                    }}
                    className="bg-gray-900/50 border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
                >
                    <option value="all">All Status</option>
                    <option value="PENDING">Pending</option>
                    <option value="DOWNLOADING">Downloading</option>
                    <option value="TRANSCRIBING">Transcribing</option>
                    <option value="SEGMENTING">Segmenting</option>
                    <option value="READY">Ready</option>
                    <option value="FAILED">Failed</option>
                </select>

                {/* Tag Filter */}
                <select
                    value={tagFilter}
                    onChange={(e) => {
                        setTagFilter(e.target.value);
                        setPage(1);
                    }}
                    className="bg-gray-900/50 border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
                >
                    <option value="">All Tags</option>
                    {tags.map((tag) => (
                        <option key={tag.id} value={tag.id}>
                            {tag.name}
                        </option>
                    ))}
                </select>

                {/* Sort */}
                <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    className="bg-gray-900/50 border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
                >
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="title">Title A-Z</option>
                    <option value="duration">Longest</option>
                </select>

                {/* View Toggle */}
                <div className="flex items-center bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
                    <button
                        onClick={() => setViewMode("grid")}
                        className={cn(
                            "p-2.5 transition-colors",
                            viewMode === "grid"
                                ? "bg-violet-500/15 text-violet-400"
                                : "text-gray-500 hover:text-white"
                        )}
                    >
                        <Grid3X3 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setViewMode("list")}
                        className={cn(
                            "p-2.5 transition-colors",
                            viewMode === "list"
                                ? "bg-violet-500/15 text-violet-400"
                                : "text-gray-500 hover:text-white"
                        )}
                    >
                        <List className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                </div>
            ) : videos.length === 0 ? (
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center">
                    <Film className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-2">No videos yet</h3>
                    <p className="text-gray-400 text-sm mb-6">
                        Start by ingesting your first video from YouTube, Vimeo, or any other platform.
                    </p>
                    <a
                        href="/dashboard/ingest"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Ingest First Video
                    </a>
                </div>
            ) : viewMode === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {videos.map((video) => (
                        <VideoCard key={video.id} video={video} onDelete={deleteVideo} />
                    ))}
                </div>
            ) : (
                <div className="space-y-2">
                    {videos.map((video) => (
                        <VideoRow key={video.id} video={video} onDelete={deleteVideo} />
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                    <button
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page === 1}
                        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm text-gray-400 px-3">
                        Page {page} of {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(Math.min(totalPages, page + 1))}
                        disabled={page === totalPages}
                        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 transition-colors"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            )}
        </div>
    );
}

function VideoCard({ video, onDelete }: { video: Video; onDelete: (id: string) => void }) {
    const status = STATUS_LABELS[video.status] || STATUS_LABELS.PENDING;
    const isProcessing = ["PENDING", "DOWNLOADING", "TRANSCRIBING", "SEGMENTING"].includes(video.status);
    const isFailed = video.status === "FAILED";

    return (
        <div className="group bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden hover:border-gray-700 transition-all duration-200 hover:shadow-lg">
            {/* Thumbnail */}
            <div className="aspect-video bg-gray-800 relative">
                {video.thumbnail ? (
                    <img
                        src={video.thumbnail}
                        alt={video.title || "Video"}
                        className={cn("w-full h-full object-cover", isProcessing && "opacity-60")}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-10 h-10 text-gray-600" />
                    </div>
                )}
                {video.duration && (
                    <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                        {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, "0")}
                    </span>
                )}
                <span className={cn(
                    "absolute top-2 left-2 text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1",
                    status.class
                )}>
                    {isProcessing && <Loader2 className="w-3 h-3 animate-spin" />}
                    {isFailed && <AlertCircle className="w-3 h-3" />}
                    {status.label}
                </span>

                {/* Delete button */}
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(video.id); }}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-gray-400 hover:text-red-400 hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete video"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>

                {/* Processing animation bar */}
                {isProcessing && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700 overflow-hidden">
                        <div className="h-full bg-violet-500 animate-pulse" style={{ width: "60%" }} />
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="p-4">
                <h3 className="text-sm font-medium text-white truncate mb-1">
                    {video.title || "Untitled Video"}
                </h3>
                <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
                    <span className="capitalize">{video.platform}</span>
                    <span className="flex items-center gap-1">
                        <Scissors className="w-3 h-3" />
                        {video._count.segments} segments
                    </span>
                </div>
                {video.videoTags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {video.videoTags.map(({ tag }) => (
                            <span
                                key={tag.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-gray-800 text-gray-300"
                            >
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                                {tag.name}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function VideoRow({ video, onDelete }: { video: Video; onDelete: (id: string) => void }) {
    const status = STATUS_LABELS[video.status] || STATUS_LABELS.PENDING;
    const isProcessing = ["PENDING", "DOWNLOADING", "TRANSCRIBING", "SEGMENTING"].includes(video.status);
    const isFailed = video.status === "FAILED";

    return (
        <div className="flex items-center gap-4 bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-3 hover:border-gray-700 transition-colors group">
            {/* Thumbnail */}
            <div className="w-24 h-14 bg-gray-800 rounded-lg flex-shrink-0 overflow-hidden relative">
                {video.thumbnail ? (
                    <img src={video.thumbnail} alt="" className={cn("w-full h-full object-cover", isProcessing && "opacity-60")} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-5 h-5 text-gray-600" />
                    </div>
                )}
                {isProcessing && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-white truncate">
                    {video.title || "Untitled Video"}
                </h3>
                <p className="text-xs text-gray-500 truncate">{video.sourceUrl}</p>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-1 max-w-[200px]">
                {video.videoTags.map(({ tag }) => (
                    <span
                        key={tag.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-gray-800 text-gray-300"
                    >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                        {tag.name}
                    </span>
                ))}
            </div>

            {/* Status */}
            <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 flex items-center gap-1", status.class)}>
                {isProcessing && <Loader2 className="w-3 h-3 animate-spin" />}
                {isFailed && <AlertCircle className="w-3 h-3" />}
                {status.label}
            </span>

            {/* Segments count */}
            <span className="text-xs text-gray-500 flex items-center gap-1 flex-shrink-0">
                <Scissors className="w-3 h-3" />
                {video._count.segments}
            </span>

            {/* Duration */}
            <span className="text-xs text-gray-500 flex items-center gap-1 flex-shrink-0">
                <Clock className="w-3 h-3" />
                {video.duration ? `${Math.floor(video.duration / 60)}:${(video.duration % 60).toString().padStart(2, "0")}` : "--:--"}
            </span>

            {/* Actions */}
            <a
                href={`/dashboard/studio?video=${video.id}`}
                className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
            >
                <ExternalLink className="w-4 h-4" />
            </a>
            <button
                onClick={() => onDelete(video.id)}
                className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                title="Delete video"
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    );
}
