"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    Clapperboard,
    Plus,
    Search,
    Film,
    Sparkles,
    Loader2,
    CheckCircle2,
    XCircle,
    Clock,
    Trash2,
    Layers,
    Image as ImageIcon,
    Video,
    Tv
} from "lucide-react";
import { cn } from "@/lib/utils";

type ShowProject = {
    id: string;
    title: string;
    genre: string;
    subStyle: string;
    visualMode: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    _count: {
        scenes: number;
        assets: number;
        genJobs: number;
    };
};

const GENRES = [
    { id: "romance_telenovela", label: "Telenovela & Romance", icon: "🌹" },
    { id: "anthropomorphic_animal", label: "Anthropomorphic & Fantasy", icon: "🦊" },
    { id: "kung_fu_classics", label: "Kung Fu & Martial Arts", icon: "🥋" },
    { id: "dystopian_scifi", label: "Dystopian Sci-Fi", icon: "🌌" },
    { id: "horror", label: "Cinematic Horror", icon: "🕯️" },
    { id: "true_crime", label: "Crime & Noir Thriller", icon: "🔍" },
];

export default function FilmFactoryPage() {
    const router = useRouter();
    const [shows, setShows] = useState<ShowProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [showCreateModal, setShowCreateModal] = useState(false);

    const fetchShows = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/documentary");
            const data = await res.json().catch(() => []);
            // Filter to show projects created in Film Factory
            const filmShows = (Array.isArray(data) ? data : []).filter((d: any) =>
                d.title?.includes("(Mini-Series)") || d.visualMode === "full_ai_video"
            );
            setShows(filmShows);
        } catch (err) {
            console.error("Fetch shows error:", err);
            setShows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchShows();
    }, [fetchShows]);

    // Auto-refresh while processing
    useEffect(() => {
        const hasProcessing = shows.some((s) => ["GENERATING", "ASSEMBLING"].includes(s.status));
        if (!hasProcessing) return;
        const interval = setInterval(fetchShows, 6000);
        return () => clearInterval(interval);
    }, [shows, fetchShows]);

    const deleteShow = async (id: string) => {
        if (!confirm("Delete this Film Factory project and all its episode assets?")) return;
        await fetch(`/api/documentary/${id}`, { method: "DELETE" });
        setShows((prev) => prev.filter((s) => s.id !== id));
    };

    const filtered = shows.filter((s) => {
        if (!search) return true;
        return (s.title || "").toLowerCase().includes(search.toLowerCase());
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Clapperboard className="w-7 h-7 text-amber-500" />
                        Film Factory Studio
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Character-driven Feature Films & Multi-Episode TV Mini-Series
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <a
                        href="/api/admin/logs/ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
                        title="Download AI Generation Log File"
                    >
                        📄 Download AI Log
                    </a>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-amber-500 to-violet-600 hover:from-amber-400 hover:to-violet-500 text-white transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
                    >
                        <Plus className="w-4 h-4" />
                        New Film / TV Series
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search shows & films..."
                    className="w-full bg-gray-900/50 border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 transition-colors"
                />
            </div>

            {/* Projects Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center max-w-md mx-auto">
                    <Clapperboard className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                    <h3 className="text-base font-semibold text-white mb-2">No Film Factory Projects</h3>
                    <p className="text-xs text-gray-500 mb-6">
                        Create your first character-driven TV mini-series or feature film.
                    </p>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-white transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        New Film / TV Series
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map((s) => (
                        <ShowCard key={s.id} show={s} onDelete={() => deleteShow(s.id)} />
                    ))}
                </div>
            )}

            {/* Creation Modal */}
            {showCreateModal && (
                <CreateFilmModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={(id) => {
                        setShowCreateModal(false);
                        router.push(`/dashboard/film-factory/${id}`);
                    }}
                />
            )}
        </div>
    );
}

function ShowCard({ show, onDelete }: { show: ShowProject; onDelete: () => void }) {
    const isProcessing = ["GENERATING", "ASSEMBLING"].includes(show.status);

    return (
        <div className="group relative bg-gray-900/50 border border-gray-800 hover:border-amber-500/40 rounded-2xl p-5 transition-all hover:shadow-xl hover:shadow-amber-500/5">
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Tv className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">TV Series</span>
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-1 rounded hover:bg-red-500/20 text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete show"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            <Link href={`/dashboard/film-factory/${show.id}`} className="block space-y-2">
                <h3 className="text-base font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                    {show.title.replace(/\(Mini-Series\)/g, "").trim()}
                </h3>

                <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5" />
                        {show._count.scenes || 0} episodes
                    </span>
                    <span className="flex items-center gap-1">
                        <ImageIcon className="w-3.5 h-3.5" />
                        {show._count.assets || 0} cast assets
                    </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-800/60 text-xs">
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-semibold text-[10px] capitalize">
                        {(show.genre || "drama").replace(/_/g, " ")}
                    </span>
                    <span className="text-gray-500 text-[10px]">
                        {new Date(show.updatedAt).toLocaleDateString()}
                    </span>
                </div>
            </Link>

            {isProcessing && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-800 rounded-b-2xl overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-500 to-violet-500 animate-pulse" style={{ width: "70%" }} />
                </div>
            )}
        </div>
    );
}

/* ────── Film Factory Creation Modal ────── */
function CreateFilmModal({
    onClose,
    onCreated,
}: {
    onClose: () => void;
    onCreated: (id: string) => void;
}) {
    const [projectType, setProjectType] = useState<"series" | "feature">("series");
    const [title, setTitle] = useState("");
    const [premise, setPremise] = useState("");
    const [genre, setGenre] = useState("romance_telenovela");
    const [numEpisodes, setNumEpisodes] = useState(3);
    const [targetEpisodeMinutes, setTargetEpisodeMinutes] = useState(3);
    const [videoModel, setVideoModel] = useState<"wan2.3" | "ltx2.3">("wan2.3");
    const [voiceEngine, setVoiceEngine] = useState<"cosyvoice2" | "elevenlabs">("cosyvoice2");
    const [creating, setCreating] = useState(false);

    const handleCreate = async () => {
        if (!title.trim() || !premise.trim()) return;
        setCreating(true);

        try {
            const res = await fetch("/api/shows/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim(),
                    concept: premise.trim(),
                    genre,
                    numEpisodes: projectType === "feature" ? 1 : numEpisodes,
                    targetEpisodeMinutes,
                    videoModel,
                    voiceEngine,
                }),
            });
            const data = await res.json();
            setCreating(false);
            if (data.showId) {
                onCreated(data.showId);
            } else {
                alert(`Creation failed: ${data.error || "Unknown error"}`);
            }
        } catch (err: any) {
            setCreating(false);
            alert(`Error: ${err.message || "Failed to create project"}`);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-gray-800 sticky top-0 bg-gray-900 z-10 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Clapperboard className="w-5 h-5 text-amber-500" />
                            New Film / TV Series Project
                        </h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                            Character Dialogue Driven • 100% Actor Acted • Zero Narrator
                        </p>
                    </div>
                </div>

                <div className="p-6 space-y-5">
                    {/* Project Type Toggle */}
                    <div className="grid grid-cols-2 gap-2 bg-gray-800/60 p-1.5 rounded-xl border border-gray-750">
                        <button
                            onClick={() => setProjectType("series")}
                            className={cn(
                                "py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
                                projectType === "series" ? "bg-amber-500 text-white shadow-md" : "text-gray-400 hover:text-white"
                            )}
                        >
                            <Tv className="w-4 h-4" />
                            Multi-Episode TV Series
                        </button>
                        <button
                            onClick={() => setProjectType("feature")}
                            className={cn(
                                "py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
                                projectType === "feature" ? "bg-amber-500 text-white shadow-md" : "text-gray-400 hover:text-white"
                            )}
                        >
                            <Film className="w-4 h-4" />
                            Feature Film (Single Story)
                        </button>
                    </div>

                    {/* Show Title */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-300 mb-1">
                            Title of Show / Film *
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Blood Inheritance, Neon Horizon 2099..."
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                        />
                    </div>

                    {/* Story Premise */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-300 mb-1">
                            Story Premise & Cast Description *
                        </label>
                        <textarea
                            value={premise}
                            onChange={(e) => setPremise(e.target.value)}
                            rows={4}
                            placeholder="Describe the central storyline, main characters (Protagonist, Antagonist, Family members), and inciting conflict..."
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 resize-y"
                        />
                    </div>

                    {/* Genre Selection */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-300 mb-2">Cinematic Genre</label>
                        <div className="grid grid-cols-3 gap-2">
                            {GENRES.map((g) => (
                                <button
                                    key={g.id}
                                    onClick={() => setGenre(g.id)}
                                    className={cn(
                                        "p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2",
                                        genre === g.id
                                            ? "border-amber-500 bg-amber-500/10 text-white font-bold"
                                            : "border-gray-800 bg-gray-800/40 text-gray-400 hover:border-gray-700 hover:text-white"
                                    )}
                                >
                                    <span className="text-lg">{g.icon}</span>
                                    <span className="text-[11px] font-medium leading-tight">{g.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Episodes & Duration Controls */}
                    {projectType === "series" && (
                        <div className="grid grid-cols-2 gap-3 bg-black/40 border border-gray-800 rounded-xl p-3">
                            <div>
                                <label className="block text-[11px] font-bold text-gray-400 mb-1.5">
                                    📺 Number of Episodes
                                </label>
                                <div className="flex gap-1 overflow-x-auto pb-1">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 10].map((n) => (
                                        <button
                                            key={n}
                                            onClick={() => setNumEpisodes(n)}
                                            className={cn(
                                                "px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 cursor-pointer",
                                                numEpisodes === n ? "bg-amber-500 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                                            )}
                                        >
                                            {n} {n === 1 ? "Ep" : "Eps"}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-gray-400 mb-1.5">
                                    ⏱️ Length per Episode
                                </label>
                                <div className="flex gap-1.5">
                                    {[1, 2, 3, 5, 10].map((mins) => (
                                        <button
                                            key={mins}
                                            onClick={() => setTargetEpisodeMinutes(mins)}
                                            className={cn(
                                                "flex-1 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer",
                                                targetEpisodeMinutes === mins ? "bg-amber-500 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                                            )}
                                        >
                                            {mins}m
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Decoupled Video & Voice Engine Selection */}
                    <div className="grid grid-cols-2 gap-3 bg-black/40 border border-gray-800 rounded-xl p-3">
                        <div>
                            <label className="block text-[11px] font-bold text-gray-400 mb-1">
                                🎥 Video Generator Pipeline
                            </label>
                            <div className="flex gap-1.5">
                                <button
                                    onClick={() => setVideoModel("wan2.3")}
                                    className={cn(
                                        "flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border transition cursor-pointer text-center",
                                        videoModel === "wan2.3" ? "bg-violet-600 border-violet-500 text-white" : "bg-gray-900 border-gray-800 text-gray-400 hover:text-white"
                                    )}
                                >
                                    Wan 2.3 (5s Video)
                                </button>
                                <button
                                    onClick={() => setVideoModel("ltx2.3")}
                                    className={cn(
                                        "flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border transition cursor-pointer text-center",
                                        videoModel === "ltx2.3" ? "bg-amber-600 border-amber-500 text-white" : "bg-gray-900 border-gray-800 text-gray-400 hover:text-white"
                                    )}
                                >
                                    LTX 2.3 (Native SFX)
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-gray-400 mb-1">
                                🎙️ Character Voice Engine
                            </label>
                            {videoModel === "ltx2.3" ? (
                                <div className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-amber-955/40 border border-amber-700/40 text-amber-300 text-center">
                                    🔊 Native LTX Sound Effects (Bypassed)
                                </div>
                            ) : (
                                <div className="flex gap-1.5">
                                    <button
                                        onClick={() => setVoiceEngine("cosyvoice2")}
                                        className={cn(
                                            "flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border transition cursor-pointer text-center",
                                            voiceEngine === "cosyvoice2" ? "bg-violet-600 border-violet-500 text-white" : "bg-gray-900 border-gray-800 text-gray-400 hover:text-white"
                                        )}
                                    >
                                        CosyVoice 2
                                    </button>
                                    <button
                                        onClick={() => setVoiceEngine("elevenlabs")}
                                        className={cn(
                                            "flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border transition cursor-pointer text-center",
                                            voiceEngine === "elevenlabs" ? "bg-emerald-600 border-emerald-500 text-white" : "bg-gray-900 border-gray-800 text-gray-400 hover:text-white"
                                        )}
                                    >
                                        ElevenLabs
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between sticky bottom-0 bg-gray-900">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={!title.trim() || !premise.trim() || creating}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-amber-500 to-violet-600 hover:from-amber-400 hover:to-violet-500 text-white disabled:opacity-50 transition-colors cursor-pointer"
                    >
                        {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                        Create Film Project
                    </button>
                </div>
            </div>
        </div>
    );
}
