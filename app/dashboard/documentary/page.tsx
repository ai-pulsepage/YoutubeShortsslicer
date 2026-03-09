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

            {isProcessing && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-800 rounded-b-2xl overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-blue-500 animate-pulse" style={{ width: "60%" }} />
                </div>
            )}
        </div>
    );
}

/* ────── Genre Data (client-side subset) ────── */
const GENRES = [
    { id: "science", label: "Science & Education", icon: "🔬", subStyles: [
        { id: "bbc_earth", label: "BBC Earth" }, { id: "cosmos", label: "Cosmos (Sagan)" },
        { id: "kurzgesagt", label: "Kurzgesagt" }, { id: "ted_talk", label: "TED Talk" },
        { id: "bill_nye", label: "Bill Nye" }, { id: "academic", label: "Academic Lecture" },
    ]},
    { id: "true_crime", label: "True Crime / Mystery", icon: "🔍", subStyles: [
        { id: "serial", label: "Serial (Podcast)" }, { id: "forensic_files", label: "Forensic Files" },
        { id: "unsolved_mysteries", label: "Unsolved Mysteries" }, { id: "making_murderer", label: "Making a Murderer" },
        { id: "cold_case", label: "Cold Case Files" },
    ]},
    { id: "horror", label: "Horror / Creepy", icon: "👻", subStyles: [
        { id: "campfire", label: "Campfire Story" }, { id: "cryptids", label: "Cryptids & Paranormal" },
        { id: "urban_legend", label: "Urban Legends" }, { id: "psychological", label: "Psychological" },
        { id: "scp", label: "SCP Foundation" },
    ]},
    { id: "history", label: "History", icon: "📜", subStyles: [
        { id: "ken_burns", label: "Ken Burns" }, { id: "epic_cinematic", label: "Epic / Cinematic" },
        { id: "ancient_civ", label: "Ancient Civilizations" }, { id: "war_doc", label: "War Documentary" },
        { id: "biography", label: "Biography" },
    ]},
    { id: "children", label: "Children's", icon: "🧸", subStyles: [
        { id: "dr_seuss", label: "Dr. Seuss Style" }, { id: "fairy_tale", label: "Fairy Tale" },
        { id: "mr_rogers", label: "Mr. Rogers" }, { id: "aesop", label: "Aesop's Fables" },
        { id: "bedtime_lullaby", label: "Bedtime Lullaby" },
    ]},
    { id: "sleep", label: "Sleep / Relaxation", icon: "🌙", subStyles: [
        { id: "asmr_nature", label: "ASMR Nature" }, { id: "bedtime_science", label: "Bedtime Science" },
        { id: "rain_ocean", label: "Rain & Ocean" }, { id: "meditation", label: "Guided Meditation" },
        { id: "sleepy_history", label: "Sleepy History" },
    ]},
    { id: "comedy", label: "Comedy / Satire", icon: "😂", subStyles: [
        { id: "mock_doc", label: "Mock Documentary" }, { id: "drunk_history", label: "Drunk History" },
        { id: "absurdist", label: "Absurdist" }, { id: "deadpan_british", label: "Deadpan British" },
        { id: "standup", label: "Stand-up Narrator" },
    ]},
    { id: "nature", label: "Nature / Wildlife", icon: "🌿", subStyles: [
        { id: "planet_earth", label: "Planet Earth" }, { id: "ocean_deep", label: "Ocean Deep" },
        { id: "rainforest", label: "Rainforest" }, { id: "migration", label: "Migration" },
        { id: "micro_world", label: "Micro World" },
    ]},
];

const SMART_DEFAULTS: Record<string, Record<string, any>> = {
    "science.bbc_earth": { narratorStyle: "documentary", musicMood: "classical", pacing: "slow", audience: "adults", perspective: "omniscient", ending: "reflective", contentMode: "factual", useBRoll: true, useKenBurns: true, useAIVideo: false },
    "science.cosmos": { narratorStyle: "sleep", musicMood: "ambient", pacing: "slow", audience: "adults", perspective: "omniscient", ending: "reflective", contentMode: "factual", useBRoll: true, useKenBurns: true, useAIVideo: false },
    "science.kurzgesagt": { narratorStyle: "conversational", musicMood: "electronic", pacing: "fast", audience: "young_adults", perspective: "omniscient", ending: "ai_decide", contentMode: "factual", useBRoll: true, useKenBurns: false, useAIVideo: false },
    "science.ted_talk": { narratorStyle: "conversational", musicMood: "none", pacing: "standard", audience: "adults", perspective: "first_person", ending: "call_to_action", contentMode: "factual", useBRoll: true, useKenBurns: true, useAIVideo: false },
    "science.bill_nye": { narratorStyle: "energetic", musicMood: "whimsical", pacing: "fast", audience: "kids", perspective: "omniscient", ending: "hopeful", contentMode: "factual", useBRoll: true, useKenBurns: true, useAIVideo: false },
    "science.academic": { narratorStyle: "documentary", musicMood: "none", pacing: "standard", audience: "expert", perspective: "omniscient", ending: "ai_decide", contentMode: "factual", useBRoll: false, useKenBurns: true, useAIVideo: false },
    "true_crime.serial": { narratorStyle: "conversational", musicMood: "dark_ambient", pacing: "standard", audience: "adults", perspective: "investigator", ending: "cliffhanger", contentMode: "factual", useBRoll: true, useKenBurns: true, useAIVideo: false },
    "true_crime.forensic_files": { narratorStyle: "documentary", musicMood: "dark_ambient", pacing: "standard", audience: "adults", perspective: "omniscient", ending: "ai_decide", contentMode: "factual", useBRoll: true, useKenBurns: true, useAIVideo: false },
    "true_crime.unsolved_mysteries": { narratorStyle: "dramatic", musicMood: "dark_ambient", pacing: "slow", audience: "adults", perspective: "omniscient", ending: "cliffhanger", contentMode: "factual", useBRoll: true, useKenBurns: true, useAIVideo: false },
    "horror.campfire": { narratorStyle: "dramatic", musicMood: "dark_ambient", pacing: "slow", audience: "adults", perspective: "first_person", ending: "cliffhanger", contentMode: "creative", useBRoll: true, useKenBurns: true, useAIVideo: false },
    "horror.cryptids": { narratorStyle: "dramatic", musicMood: "dark_ambient", pacing: "slow", audience: "adults", perspective: "investigator", ending: "cliffhanger", contentMode: "creative", useBRoll: true, useKenBurns: true, useAIVideo: false },
    "horror.psychological": { narratorStyle: "sleep", musicMood: "dark_ambient", pacing: "slow", audience: "adults", perspective: "second_person", ending: "cliffhanger", contentMode: "creative", useBRoll: true, useKenBurns: true, useAIVideo: false },
    "history.ken_burns": { narratorStyle: "sleep", musicMood: "classical", pacing: "slow", audience: "adults", perspective: "omniscient", ending: "reflective", contentMode: "factual", useBRoll: false, useKenBurns: true, useAIVideo: false },
    "history.epic_cinematic": { narratorStyle: "dramatic", musicMood: "epic", pacing: "standard", audience: "adults", perspective: "omniscient", ending: "ai_decide", contentMode: "creative", useBRoll: true, useKenBurns: true, useAIVideo: false },
    "children.dr_seuss": { narratorStyle: "conversational", musicMood: "whimsical", pacing: "standard", audience: "toddlers", perspective: "omniscient", ending: "hopeful", contentMode: "creative", useBRoll: false, useKenBurns: true, useAIVideo: false },
    "children.fairy_tale": { narratorStyle: "sleep", musicMood: "whimsical", pacing: "slow", audience: "kids", perspective: "omniscient", ending: "hopeful", contentMode: "creative", useBRoll: false, useKenBurns: true, useAIVideo: false },
    "children.bedtime_lullaby": { narratorStyle: "sleep", musicMood: "piano", pacing: "slow", audience: "toddlers", perspective: "second_person", ending: "hopeful", contentMode: "creative", useBRoll: false, useKenBurns: true, useAIVideo: false },
    "sleep.asmr_nature": { narratorStyle: "sleep", musicMood: "ambient", pacing: "slow", audience: "adults", perspective: "second_person", ending: "hopeful", contentMode: "creative", useBRoll: true, useKenBurns: true, useAIVideo: false },
    "sleep.bedtime_science": { narratorStyle: "sleep", musicMood: "ambient", pacing: "slow", audience: "adults", perspective: "omniscient", ending: "reflective", contentMode: "factual", useBRoll: true, useKenBurns: true, useAIVideo: false },
    "comedy.mock_doc": { narratorStyle: "documentary", musicMood: "ambient", pacing: "standard", audience: "adults", perspective: "omniscient", ending: "ai_decide", contentMode: "creative", useBRoll: true, useKenBurns: true, useAIVideo: false },
    "comedy.drunk_history": { narratorStyle: "energetic", musicMood: "whimsical", pacing: "fast", audience: "young_adults", perspective: "first_person", ending: "ai_decide", contentMode: "creative", useBRoll: true, useKenBurns: true, useAIVideo: false },
    "nature.planet_earth": { narratorStyle: "sleep", musicMood: "classical", pacing: "slow", audience: "adults", perspective: "omniscient", ending: "reflective", contentMode: "factual", useBRoll: true, useKenBurns: true, useAIVideo: false },
};

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
    const [creating, setCreating] = useState(false);
    const [step, setStep] = useState<1 | 2>(1);

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
    const [useAIVideo, setUseAIVideo] = useState(false);
    const [narratorStyle, setNarratorStyle] = useState("sleep");

    const selectedGenre = GENRES.find((g) => g.id === genre);

    const applyDefaults = (g: string, s: string) => {
        const key = `${g}.${s}`;
        const defaults = SMART_DEFAULTS[key];
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
            setUseAIVideo(defaults.useAIVideo);
        }
    };

    const handleCreate = async () => {
        setCreating(true);
        const sourceUrls = mode === "urls"
            ? urlsText.split("\n").map((u) => u.trim()).filter(Boolean)
            : [];

        const res = await fetch("/api/documentary", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: title.trim() || undefined,
                sourceUrls,
                genre, subStyle, audience, perspective, pacing,
                ending, endingNote: endingNote || undefined,
                contentMode, musicMood,
                useBRoll, useKenBurns, useAIVideo, narratorStyle,
            }),
        });
        const data = await res.json();
        setCreating(false);
        if (data.id) onCreated(data.id);
    };

    const canProceedStep1 = mode === "topic" ? !!title.trim() : !!urlsText.trim();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-gray-800 sticky top-0 bg-gray-900 z-10">
                    <h2 className="text-lg font-semibold text-white">New Documentary Project</h2>
                    <p className="text-sm text-gray-400 mt-0.5">
                        {step === 1 ? "Choose your source material" : "Configure production style"}
                    </p>
                </div>

                <div className="p-6 space-y-5">
                    {step === 1 ? (
                        <>
                            {/* Mode Toggle */}
                            <div className="flex items-center gap-1 bg-gray-800 rounded-xl p-1">
                                <button onClick={() => setMode("topic")}
                                    className={cn("flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                        mode === "topic" ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white")}>
                                    <Sparkles className="w-3.5 h-3.5" /> AI Research
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
                                    {mode === "topic" ? (<>Documentary Topic <span className="text-red-400">*</span></>) : "Title (optional)"}
                                </label>
                                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                                    placeholder={mode === "topic" ? "e.g. The newest frontiers on quantum physics" : "e.g. Dark Matter Mysteries"}
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
                        </>
                    ) : (
                        <>
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

                            {/* Narrator Style + Production Toggles */}
                            <div className="flex items-center gap-3 pt-2 border-t border-gray-800">
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
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" checked={useBRoll} onChange={(e) => setUseBRoll(e.target.checked)}
                                        className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-violet-500 focus:ring-violet-500" />
                                    <span className="text-[10px] text-gray-400">B-Roll</span>
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" checked={useKenBurns} onChange={(e) => setUseKenBurns(e.target.checked)}
                                        className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-violet-500 focus:ring-violet-500" />
                                    <span className="text-[10px] text-gray-400">Ken Burns</span>
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" checked={useAIVideo} onChange={(e) => setUseAIVideo(e.target.checked)}
                                        className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-violet-500 focus:ring-violet-500" />
                                    <span className="text-[10px] text-gray-400">AI Video</span>
                                </label>
                            </div>
                        </>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between sticky bottom-0 bg-gray-900">
                    <button onClick={step === 2 ? () => setStep(1) : onClose}
                        className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                        {step === 2 ? "← Back" : "Cancel"}
                    </button>
                    {step === 1 ? (
                        <button onClick={() => setStep(2)} disabled={!canProceedStep1}
                            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors">
                            Next: Style →
                        </button>
                    ) : (
                        <button onClick={handleCreate} disabled={creating}
                            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white disabled:opacity-50 transition-colors">
                            {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                            {mode === "topic" ? "Create & Research" : "Create Project"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
