"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    Plus,
    Search,
    Film,
    Loader2,
    Clock,
    Layers,
    Image,
    AlertCircle,
    Trash2,
    Play,
    CheckCircle2,
    XCircle,
    Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Documentary = {
    id: string;
    title: string | null;
    sourceUrls: string[];
    status: string;
    style: string;
    totalDuration: number | null;
    createdAt: string;
    updatedAt: string;
    _count: {
        scenes: number;
        assets: number;
        genJobs: number;
    };
};

const STATUS_CONFIG: Record<string, { label: string; class: string; icon: any }> = {
    DRAFT: { label: "Draft", class: "bg-gray-500/15 text-gray-400", icon: Film },
    SCENES_PLANNED: { label: "Scenes Planned", class: "bg-blue-500/15 text-blue-400", icon: Layers },
    ASSETS_READY: { label: "Assets Ready", class: "bg-cyan-500/15 text-cyan-400", icon: Image },
    GENERATING: { label: "Generating", class: "bg-violet-500/15 text-violet-400", icon: Sparkles },
    ASSEMBLING: { label: "Assembling", class: "bg-amber-500/15 text-amber-400", icon: Loader2 },
    REVIEW: { label: "Review", class: "bg-yellow-500/15 text-yellow-400", icon: Play },
    APPROVED: { label: "Approved", class: "bg-emerald-500/15 text-emerald-400", icon: CheckCircle2 },
    PUBLISHED: { label: "Published", class: "bg-green-500/15 text-green-400", icon: CheckCircle2 },
    FAILED: { label: "Failed", class: "bg-red-500/15 text-red-400", icon: XCircle },
};

export default function DocumentaryPage() {
    const router = useRouter();
    const [documentaries, setDocumentaries] = useState<Documentary[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState("");
    const [search, setSearch] = useState("");
    const [showCreateModal, setShowCreateModal] = useState(false);

    const fetchDocumentaries = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (statusFilter) params.set("status", statusFilter);
        const res = await fetch(`/api/documentary?${params}`);
        const data = await res.json();
        setDocumentaries(Array.isArray(data) ? data : []);
        setLoading(false);
    }, [statusFilter]);

    useEffect(() => {
        fetchDocumentaries();
    }, [fetchDocumentaries]);

    // Auto-refresh for in-progress items
    useEffect(() => {
        const hasProcessing = documentaries.some((d) =>
            ["GENERATING", "ASSEMBLING"].includes(d.status)
        );
        if (!hasProcessing) return;
        const interval = setInterval(fetchDocumentaries, 8000);
        return () => clearInterval(interval);
    }, [documentaries, fetchDocumentaries]);

    const deleteDocumentary = async (id: string) => {
        if (!confirm("Delete this documentary project and all its assets? This cannot be undone.")) return;
        await fetch(`/api/documentary/${id}`, { method: "DELETE" });
        setDocumentaries((prev) => prev.filter((d) => d.id !== id));
    };

    const filtered = documentaries.filter((d) => {
        if (!search) return true;
        return (d.title || "").toLowerCase().includes(search.toLowerCase()) ||
            d.sourceUrls.some((u) => u.toLowerCase().includes(search.toLowerCase()));
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Documentary Factory</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        {documentaries.length} project{documentaries.length !== 1 ? "s" : ""}
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white transition-all shadow-lg shadow-violet-500/20"
                >
                    <Plus className="w-4 h-4" />
                    New Documentary
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search documentaries..."
                        className="w-full bg-gray-900/50 border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-gray-900/50 border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
                >
                    <option value="">All Status</option>
                    {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                        <option key={key} value={key}>{val.label}</option>
                    ))}
                </select>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center">
                    <Film className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-2">No documentaries yet</h3>
                    <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
                        Create your first documentary project. Paste article URLs and let AI transform them into a narrated visual story.
                    </p>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Create First Documentary
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filtered.map((doc) => (
                        <DocumentaryCard
                            key={doc.id}
                            doc={doc}
                            onDelete={deleteDocumentary}
                            onClick={() => router.push(`/dashboard/documentary/${doc.id}`)}
                        />
                    ))}
                </div>
            )}

            {/* Create Modal */}
            {showCreateModal && (
                <CreateDocumentaryModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={(id) => {
                        setShowCreateModal(false);
                        router.push(`/dashboard/documentary/${id}`);
                    }}
                />
            )}
        </div>
    );
}

function DocumentaryCard({
    doc,
    onDelete,
    onClick,
}: {
    doc: Documentary;
    onDelete: (id: string) => void;
    onClick: () => void;
}) {
    const config = STATUS_CONFIG[doc.status] || STATUS_CONFIG.DRAFT;
    const StatusIcon = config.icon;
    const isProcessing = ["GENERATING", "ASSEMBLING"].includes(doc.status);

    return (
        <div
            onClick={onClick}
            className="group bg-gray-900/50 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 hover:shadow-lg hover:shadow-violet-500/5 transition-all duration-200 cursor-pointer relative"
        >
            {/* Status badge */}
            <div className="flex items-center justify-between mb-3">
                <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5", config.class)}>
                    <StatusIcon className={cn("w-3 h-3", isProcessing && "animate-spin")} />
                    {config.label}
                </span>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Title */}
            <h3 className="text-sm font-semibold text-white mb-1 truncate">
                {doc.title || "Untitled Documentary"}
            </h3>

            {/* Source URLs preview */}
            <p className="text-xs text-gray-500 truncate mb-3">
                {doc.sourceUrls.length} source{doc.sourceUrls.length !== 1 ? "s" : ""}: {doc.sourceUrls[0] || "No URLs"}
            </p>

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {doc._count.scenes} scenes
                </span>
                <span className="flex items-center gap-1">
                    <Image className="w-3 h-3" />
                    {doc._count.assets} assets
                </span>
                {doc.totalDuration && (
                    <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {Math.round(doc.totalDuration / 60)}m
                    </span>
                )}
            </div>

            {/* Style badge */}
            <div className="mt-3 flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 capitalize">
                    {doc.style}
                </span>
                <span className="text-[10px] text-gray-600">
                    {new Date(doc.updatedAt).toLocaleDateString()}
                </span>
            </div>

            {/* Processing indicator */}
            {isProcessing && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-800 rounded-b-2xl overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-blue-500 animate-pulse" style={{ width: "60%" }} />
                </div>
            )}
        </div>
    );
}

function CreateDocumentaryModal({
    onClose,
    onCreated,
}: {
    onClose: () => void;
    onCreated: (id: string) => void;
}) {
    const [mode, setMode] = useState<"topic" | "urls">("topic");
    const [title, setTitle] = useState("");
    const [urlsText, setUrlsText] = useState("");
    const [style, setStyle] = useState("cinematic");
    const [creating, setCreating] = useState(false);

    const handleCreate = async () => {
        if (mode === "urls") {
            const urls = urlsText.split("\n").map((u) => u.trim()).filter(Boolean);
            if (urls.length === 0) return;
            setCreating(true);
            const res = await fetch("/api/documentary", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title || undefined,
                    sourceUrls: urls,
                    style,
                }),
            });
            const data = await res.json();
            setCreating(false);
            if (data.id) onCreated(data.id);
        } else {
            // Topic mode: title is required, no URLs
            if (!title.trim()) return;
            setCreating(true);
            const res = await fetch("/api/documentary", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim(),
                    sourceUrls: [],
                    style,
                }),
            });
            const data = await res.json();
            setCreating(false);
            if (data.id) onCreated(data.id);
        }
    };

    const canCreate = mode === "topic" ? !!title.trim() : !!urlsText.trim();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg mx-4 shadow-2xl">
                <div className="px-6 py-4 border-b border-gray-800">
                    <h2 className="text-lg font-semibold text-white">New Documentary Project</h2>
                    <p className="text-sm text-gray-400 mt-0.5">
                        {mode === "topic" ? "Describe a topic and AI will research it" : "Paste article URLs to begin"}
                    </p>
                </div>

                <div className="p-6 space-y-4">
                    {/* Mode Toggle */}
                    <div className="flex items-center gap-1 bg-gray-800 rounded-xl p-1">
                        <button
                            onClick={() => setMode("topic")}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                mode === "topic" ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white"
                            )}
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            AI Research
                        </button>
                        <button
                            onClick={() => setMode("urls")}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                mode === "urls" ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white"
                            )}
                        >
                            <Search className="w-3.5 h-3.5" />
                            From URLs
                        </button>
                    </div>

                    {/* Title */}
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">
                            {mode === "topic" ? (
                                <>Documentary Topic <span className="text-red-400">*</span></>
                            ) : (
                                "Title (optional)"
                            )}
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder={mode === "topic"
                                ? "e.g. The newest frontiers on quantum physics and entanglement"
                                : "e.g. Dark Matter Mysteries"
                            }
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
                        />
                        {mode === "topic" && (
                            <p className="text-xs text-gray-600 mt-1">
                                AI will research the most popular and up-to-date publications on this topic.
                            </p>
                        )}
                    </div>

                    {/* Source URLs — only shown in URL mode */}
                    {mode === "urls" && (
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1.5">
                                Source Article URLs <span className="text-red-400">*</span>
                            </label>
                            <textarea
                                value={urlsText}
                                onChange={(e) => setUrlsText(e.target.value)}
                                rows={4}
                                placeholder={"https://example.com/article-1\nhttps://example.com/article-2\nhttps://example.com/article-3"}
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors resize-none font-mono"
                            />
                            <p className="text-xs text-gray-600 mt-1">One URL per line. AI will scrape and synthesize these into a narrated documentary.</p>
                        </div>
                    )}

                    {/* Style */}
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">Visual Style</label>
                        <select
                            value={style}
                            onChange={(e) => setStyle(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
                        >
                            <option value="cinematic">Cinematic</option>
                            <option value="documentary">Documentary</option>
                            <option value="sci-fi">Sci-Fi</option>
                            <option value="nature">Nature / Wildlife</option>
                            <option value="retro">Retro / Vintage</option>
                            <option value="anime">Anime</option>
                            <option value="watercolor">Watercolor</option>
                        </select>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={creating || !canCreate}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
                    >
                        {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                        {mode === "topic" ? "Create & Research" : "Create Project"}
                    </button>
                </div>
            </div>
        </div>
    );
}
