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
    FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSmartDefaults, GENRES } from "@/lib/documentary/genre-presets";

type Documentary = {
    id: string;
    title: string | null;
    sourceUrls: string[];
    status: string;
    genre: string;
    subStyle: string;
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
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.set("status", statusFilter);
            const res = await fetch(`/api/documentary?${params}`);
            const data = await res.json().catch(() => []);
            setDocumentaries(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Fetch documentaries error:", err);
            setDocumentaries([]);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        fetchDocumentaries();
    }, [fetchDocumentaries]);

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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Movie Factory</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        {documentaries.length} project{documentaries.length !== 1 ? "s" : ""}
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white transition-all shadow-lg shadow-violet-500/20"
                >
                    <Plus className="w-4 h-4" />
                    New Movie Project
                </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search movies..."
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

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center">
                    <Film className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-2">No movies yet</h3>
                    <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
                        Create your first movie project. Paste article URLs and let AI transform them into a narrated visual story.
                    </p>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Create First Movie
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

            <h3 className="text-sm font-semibold text-white mb-1 truncate">
                {doc.title || "Untitled Documentary"}
            </h3>
            <p className="text-xs text-gray-500 truncate mb-3">
                {doc.sourceUrls.length} source{doc.sourceUrls.length !== 1 ? "s" : ""}: {doc.sourceUrls[0] || "Topic mode"}
            </p>

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

            <div className="mt-3 flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 capitalize">
                    {(doc.genre || "science").replace(/_/g, " ")}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 capitalize">
                    {(doc.subStyle || "").replace(/_/g, " ")}
                </span>
                <span className="text-[10px] text-gray-600 ml-auto">
                    {new Date(doc.updatedAt).toLocaleDateString()}
                </span>
            </div>

            <div className="mt-2.5 px-3 py-1.5 bg-gray-950/45 border border-gray-855 rounded-xl flex items-center justify-between text-xs text-gray-300 font-mono font-bold select-all">
                <span className="flex items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap">
                    <span className="text-[9px] uppercase text-emerald-400 tracking-wider font-sans font-extrabold flex-shrink-0">ID:</span>
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap">{doc.id}</span>
                </span>
            </div>

            {isProcessing && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-800 rounded-b-2xl overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-blue-500 animate-pulse" style={{ width: "60%" }} />
                </div>
            )}
        </div>
    );
}



// Smart defaults are now sourced directly from genre-presets.ts via the GENRES array.
// The creation modal imports getSmartDefaults() to apply them dynamically.

function CreateDocumentaryModal({
    onClose,
    onCreated,
}: {
    onClose: () => void;
    onCreated: (id: string) => void;
}) {
    const [mode, setMode] = useState<"topic" | "urls" | "text" | "shows">("topic");
    const [title, setTitle] = useState("");
    const [urlsText, setUrlsText] = useState("");
    const [textStory, setTextStory] = useState("");
    const [creating, setCreating] = useState(false);

    // Length controls
    const [targetDurationMinutes, setTargetDurationMinutes] = useState(15);
    const [numEpisodes, setNumEpisodes] = useState(3);
    const [shotsPerEpisode, setShotsPerEpisode] = useState(5);

    // Genre settings
    const [genre, setGenre] = useState("science");
    const [subStyle, setSubStyle] = useState("bbc_earth");
    const [audience, setAudience] = useState("adults");
    const [perspective, setPerspective] = useState("omniscient");
    const [pacing, setPacing] = useState("standard");
    const [ending, setEnding] = useState("ai_decide");
    const [endingNote, setEndingNote] = useState("");
    const [contentMode, setContentMode] = useState("creative");
    const [musicMood, setMusicMood] = useState("ambient");
    const [useBRoll, setUseBRoll] = useState(true);
    const [useKenBurns, setUseKenBurns] = useState(true);
    const [visualMode, setVisualMode] = useState("full_ai_video");
    const [imageModel, setImageModel] = useState("chroma");
    const [narratorStyle, setNarratorStyle] = useState("sleep");

    const selectedGenre = GENRES.find((g) => g.id === genre);

    const applyDefaults = (g: string, s: string) => {
        const defaults = getSmartDefaults(g, s);
        if (defaults) {
            setNarratorStyle(defaults.narratorStyle);
            setMusicMood(defaults.musicMood);
            setPacing(defaults.pacing);
            setAudience(defaults.audience);
            setPerspective(defaults.perspective);
            setEnding(defaults.ending);
            setContentMode(defaults.contentMode);
            setUseBRoll(defaults.useBRoll);
            setUseKenBurns(defaults.useKenBurns);
            setVisualMode(defaults.visualMode);
            setImageModel(defaults.imageModel);
        }
    };

    const handleCreate = async () => {
        setCreating(true);

        if (mode === "shows") {
            try {
                const res = await fetch("/api/shows/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: title.trim() || "Untitled TV Mini-Series",
                        concept: textStory.trim() || title.trim() || "Dramatic multi-episode story arc",
                        genre,
                        subStyle,
                        numEpisodes,
                        shotsPerEpisode,
                    })
                });
                const data = await res.json();
                setCreating(false);
                if (data.showId) onCreated(data.showId);
            } catch (err) {
                setCreating(false);
                alert("Failed to generate TV Mini-Series.");
            }
            return;
        }

        const sourceUrls = mode === "urls"
            ? urlsText.split("\n").map((u) => u.trim()).filter(Boolean)
            : [];

        const res = await fetch("/api/documentary", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: title.trim() || undefined,
                sourceUrls,
                textStory: (mode === "text" || mode === "topic") ? textStory.trim() : undefined,
                targetDurationMinutes,
                genre, subStyle, audience, perspective, pacing,
                ending, endingNote: endingNote || undefined,
                contentMode, musicMood,
                useBRoll, useKenBurns, visualMode, imageModel, narratorStyle,
            }),
        });
        const data = await res.json();
        if (data.id) {
            // Auto-trigger story generation & scene planning pipeline
            fetch(`/api/documentary/${data.id}/generate-story`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetDurationMinutes })
            }).catch((err) => console.error("Auto generate-story error:", err));

            setCreating(false);
            onCreated(data.id);
        } else {
            setCreating(false);
            alert(`Error: ${data.error || "Failed to create project"}`);
        }
    };

    const canProceedStep1 =
        mode === "topic" ? !!title.trim() :
        mode === "shows" ? !!title.trim() :
        mode === "text" ? !!textStory.trim() :
        !!urlsText.trim();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-gray-800 sticky top-0 bg-gray-900 z-10">
                    <h2 className="text-lg font-semibold text-white">New Movie Project</h2>
                    <p className="text-sm text-gray-400 mt-0.5">
                        Configure production style and source material
                    </p>
                </div>

                <div className="p-6 space-y-5">
                    {/* Mode Toggle */}
                    <div className="flex items-center gap-1 bg-gray-800 rounded-xl p-1">
                        <button onClick={() => setMode("topic")}
                            className={cn("flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                mode === "topic" ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white")}>
                            <Sparkles className="w-3.5 h-3.5" /> AI Movie
                        </button>
                        <button onClick={() => setMode("shows")}
                            className={cn("flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                mode === "shows" ? "bg-gradient-to-r from-amber-500 to-violet-600 text-white font-bold" : "text-gray-400 hover:text-white")}>
                            <Film className="w-3.5 h-3.5" /> 📺 TV Mini-Series
                        </button>
                        <button onClick={() => setMode("text")}
                            className={cn("flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                mode === "text" ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white")}>
                            <FileText className="w-3.5 h-3.5" /> From Text
                        </button>
                        <button onClick={() => setMode("urls")}
                            className={cn("flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                mode === "urls" ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white")}>
                            <Search className="w-3.5 h-3.5" /> From URLs
                        </button>
                    </div>

                    {/* Title */}
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">
                            {mode === "topic" ? (<>Movie Topic <span className="text-red-400">*</span></>) : "Title (optional)"}
                        </label>
                        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                            placeholder={mode === "topic" ? "e.g. The newest frontiers on quantum physics" : mode === "text" ? "e.g. The Lost Expedition" : "e.g. Dark Matter Mysteries"}
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors" />
                    </div>

                    {/* URLs */}
                    {mode === "urls" && (
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1.5">
                                Source URLs <span className="text-red-400">*</span>
                            </label>
                            <textarea value={urlsText} onChange={(e) => setUrlsText(e.target.value)} rows={3}
                                placeholder={"https://example.com/article-1\nhttps://example.com/article-2"}
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors resize-none font-mono" />
                        </div>
                    )}

                    {/* Plain Text Story */}
                    {mode === "text" && (
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1.5">
                                Story Text / Script <span className="text-red-400">*</span>
                            </label>
                            <textarea value={textStory} onChange={(e) => setTextStory(e.target.value)} rows={4}
                                placeholder="Paste your story text, documentary research, or custom script here..."
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors resize-none font-mono" />
                        </div>
                    )}

                    {/* AI Movie Concept */}
                    {mode === "topic" && (
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1.5">
                                Movie Premise / Detailed Concept
                            </label>
                            <textarea value={textStory} onChange={(e) => setTextStory(e.target.value)} rows={4}
                                placeholder="Describe the documentary topic, research findings, specific events, or structural instructions for the AI scriptwriter..."
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors resize-none font-sans" />
                        </div>
                    )}

                    {/* TV Mini-Series Concept */}
                    {mode === "shows" && (
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1.5">
                                Series Plot Concept / Character Conflict Details
                            </label>
                            <textarea value={textStory} onChange={(e) => setTextStory(e.target.value)} rows={4}
                                placeholder="Describe the story, conflict, protagonist vs antagonist, setting, tone, and multi-episode story beats..."
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors resize-none font-sans" />
                        </div>
                    )}

                    {/* ── AI Movie: Duration picker ── */}
                    {(mode === "topic" || mode === "text" || mode === "urls") && (
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1.5">
                                🎬 Target Movie Length
                            </label>
                            <div className="grid grid-cols-5 gap-1.5">
                                {[5, 10, 15, 20, 30, 45, 60].map((mins) => (
                                    <button key={mins}
                                        onClick={() => setTargetDurationMinutes(mins)}
                                        className={cn("py-1.5 rounded-lg text-xs font-medium transition-colors",
                                            targetDurationMinutes === mins
                                                ? "bg-violet-600 text-white"
                                                : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700")}>
                                        {mins}m
                                    </button>
                                ))}
                            </div>
                            <p className="text-[9px] text-gray-600 mt-1">Approximate narrated runtime. Longer = more scenes + rendering time.</p>
                        </div>
                    )}

                    {/* ── TV Mini-Series: Episode + shot count ── */}
                    {mode === "shows" && (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                                    📺 Number of Episodes
                                </label>
                                <div className="flex gap-1.5">
                                    {[1, 2, 3, 4, 5, 6].map((n) => (
                                        <button key={n}
                                            onClick={() => setNumEpisodes(n)}
                                            className={cn("flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                                numEpisodes === n
                                                    ? "bg-amber-500 text-white"
                                                    : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700")}>
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                                    🎬 Shots per Episode
                                </label>
                                <div className="flex gap-1.5">
                                    {[4, 5, 6, 7, 8].map((n) => (
                                        <button key={n}
                                            onClick={() => setShotsPerEpisode(n)}
                                            className={cn("flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                                shotsPerEpisode === n
                                                    ? "bg-amber-500 text-white"
                                                    : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700")}>
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <p className="col-span-2 text-[9px] text-gray-600">
                                {numEpisodes} episode{numEpisodes !== 1 ? "s" : ""} × {shotsPerEpisode} shots = {numEpisodes * shotsPerEpisode} total scenes to render.
                            </p>
                        </div>
                    )}

                    <div className="border-t border-gray-800 my-4 pt-4" />


                    {/* Genre Selection */}
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-2">Genre</label>
                        <div className="grid grid-cols-4 gap-2">
                            {GENRES.map((g) => (
                                <button key={g.id}
                                    onClick={() => { setGenre(g.id); setSubStyle(g.subStyles[0].id); applyDefaults(g.id, g.subStyles[0].id); }}
                                    className={cn("flex flex-col items-center gap-1 p-3 rounded-xl border text-center transition-all",
                                        genre === g.id
                                            ? "border-violet-500 bg-violet-500/10 text-white"
                                            : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-white")}>
                                    <span className="text-xl">{g.icon}</span>
                                    <span className="text-[10px] font-medium leading-tight">{g.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Sub-Style */}
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">Style</label>
                        <div className="flex flex-wrap gap-1.5">
                            {selectedGenre?.subStyles.map((s) => (
                                <button key={s.id}
                                    onClick={() => { setSubStyle(s.id); applyDefaults(genre, s.id); }}
                                    className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                        subStyle === s.id
                                            ? "bg-violet-600 text-white"
                                            : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700")}>
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Row: Audience + Perspective + Pacing */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1">Audience</label>
                            <select value={audience} onChange={(e) => setAudience(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500">
                                <option value="adults">Adults</option>
                                <option value="young_adults">Young Adults</option>
                                <option value="kids">Kids (8-12)</option>
                                <option value="toddlers">Toddlers (3-6)</option>
                                <option value="expert">Expert</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1">Perspective</label>
                            <select value={perspective} onChange={(e) => setPerspective(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500">
                                <option value="omniscient">Omniscient</option>
                                <option value="first_person">First Person</option>
                                <option value="second_person">Second Person</option>
                                <option value="investigator">Investigator</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1">Pacing</label>
                            <select value={pacing} onChange={(e) => setPacing(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500">
                                <option value="slow">Slow (~100 wpm)</option>
                                <option value="standard">Standard (~150 wpm)</option>
                                <option value="fast">Fast (~180 wpm)</option>
                            </select>
                        </div>
                    </div>

                    {/* Row: Ending + Content Mode + Music */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1">Ending</label>
                            <select value={ending} onChange={(e) => setEnding(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500">
                                <option value="ai_decide">Let AI Decide</option>
                                <option value="hopeful">Hopeful</option>
                                <option value="tragic">Tragic</option>
                                <option value="cliffhanger">Cliffhanger</option>
                                <option value="reflective">Reflective</option>
                                <option value="circular">Circular</option>
                                <option value="call_to_action">Call to Action</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1">Content</label>
                            <select value={contentMode} onChange={(e) => setContentMode(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500">
                                <option value="factual">Factual Only</option>
                                <option value="creative">Creative Liberty</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1">Music</label>
                            <select value={musicMood} onChange={(e) => setMusicMood(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500">
                                <option value="classical">Classical</option>
                                <option value="ambient">Ambient</option>
                                <option value="dark_ambient">Dark Ambient</option>
                                <option value="whimsical">Whimsical</option>
                                <option value="epic">Epic / Cinematic</option>
                                <option value="piano">Gentle Piano</option>
                                <option value="electronic">Electronic</option>
                                <option value="none">No Music</option>
                            </select>
                        </div>
                    </div>

                    {/* Ending Note */}
                    {ending !== "ai_decide" && (
                        <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1">Ending Note (optional)</label>
                            <input type="text" value={endingNote} onChange={(e) => setEndingNote(e.target.value)}
                                placeholder="e.g. The protagonist realizes they caused their own downfall"
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-violet-500" />
                        </div>
                    )}

                    {/* Visual Mode Cards */}
                    <div className="pt-2 border-t border-gray-800">
                        <label className="block text-[10px] font-medium text-gray-500 mb-2">Visual Mode</label>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { id: "full_ai_video", label: "Full AI Video", icon: "🎬", desc: "AI images + AI video clips" },
                                { id: "chapter_illustrations", label: "Chapter Illustrations", icon: "🖼️", desc: "AI images (Ken Burns) + Pexels B-Roll" },
                                { id: "broll_only", label: "B-Roll Only", icon: "📹", desc: "Pexels stock footage only" },
                                { id: "narration_only", label: "Narration Only", icon: "🎙️", desc: "Audio narration, no video" },
                            ].map((vm) => (
                                <button key={vm.id} onClick={() => setVisualMode(vm.id)}
                                    className={cn("text-left px-3 py-2 rounded-lg border transition-all",
                                        visualMode === vm.id
                                            ? "border-violet-500/50 bg-violet-500/10"
                                            : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
                                    )}>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm">{vm.icon}</span>
                                        <span className={cn("text-[11px] font-medium", visualMode === vm.id ? "text-violet-300" : "text-gray-300")}>{vm.label}</span>
                                    </div>
                                    <p className="text-[9px] text-gray-500 mt-0.5 leading-tight">{vm.desc}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Image Model + Narrator + Toggles */}
                    <div className="flex items-end gap-3">
                        {(visualMode === "full_ai_video" || visualMode === "chapter_illustrations") && (
                            <div className="flex-1">
                                <label className="block text-[10px] font-medium text-gray-500 mb-1">Image Model</label>
                                <select value={imageModel} onChange={(e) => setImageModel(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500">
                                    <option value="chroma">Chroma FP16 (Uncensored)</option>
                                    <option value="flux">Flux (Standard)</option>
                                    <option value="juggernaut">Juggernaut XL (Photorealistic)</option>
                                </select>
                            </div>
                        )}
                        <div className="flex-1">
                            <label className="block text-[10px] font-medium text-gray-500 mb-1">Narrator</label>
                            <select value={narratorStyle} onChange={(e) => setNarratorStyle(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500">
                                <option value="sleep">Sleep (slow pauses)</option>
                                <option value="documentary">Documentary</option>
                                <option value="dramatic">Dramatic</option>
                                <option value="energetic">Energetic</option>
                                <option value="conversational">Conversational</option>
                            </select>
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer pb-1">
                            <input type="checkbox" checked={useBRoll} onChange={(e) => setUseBRoll(e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-violet-500 focus:ring-violet-500" />
                            <span className="text-[10px] text-gray-400">B-Roll</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer pb-1">
                            <input type="checkbox" checked={useKenBurns} onChange={(e) => setUseKenBurns(e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-violet-500 focus:ring-violet-500" />
                            <span className="text-[10px] text-gray-400">Ken Burns</span>
                        </label>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between sticky bottom-0 bg-gray-900">
                    <button onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleCreate} disabled={!canProceedStep1 || creating}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white disabled:opacity-50 transition-colors">
                        {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                        {mode === "topic" ? "Create & Research" : "Create Movie"}
                    </button>
                </div>
            </div>
        </div>
    );
}
