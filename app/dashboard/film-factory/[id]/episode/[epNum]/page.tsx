"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    ArrowLeft,
    Film,
    FileText,
    Grid3X3,
    Play,
    Loader2,
    CheckCircle2,
    Clock,
    Trash2,
    Camera,
    Save,
    ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";

type TabId = "script" | "shots" | "preview" | "assembly";

export default function EpisodeWorkspacePage({ params }: { params: Promise<{ id: string; epNum: string }> }) {
    const { id, epNum } = use(params);
    const episodeIndex = parseInt(epNum) || 1;
    const router = useRouter();

    const [doc, setDoc] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabId>("shots");
    const [editingShot, setEditingShot] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<any>({});
    const [savingShot, setSavingShot] = useState(false);

    const fetchDoc = useCallback(async () => {
        const res = await fetch(`/api/documentary/${id}`);
        if (!res.ok) { router.push(`/dashboard/film-factory`); return; }
        const data = await res.json();
        setDoc(data);
        setLoading(false);
    }, [id, router]);

    useEffect(() => { fetchDoc(); }, [fetchDoc]);

    // Auto-refresh during active states
    useEffect(() => {
        if (!doc || !["GENERATING", "ASSEMBLING"].includes(doc.status)) return;
        const interval = setInterval(fetchDoc, 5000);
        return () => clearInterval(interval);
    }, [doc, fetchDoc]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
                <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                <p className="text-xs text-gray-400 font-medium">Loading Episode Workspace...</p>
            </div>
        );
    }

    if (!doc) return null;

    const episodes = doc.scenes || [];
    const currentEpisode = episodes.find((s: any) => s.sceneIndex === episodeIndex || s.sceneIndex === (episodeIndex - 1)) || episodes[0];
    const shots = currentEpisode?.shots || [];

    const handleShotEditSave = async () => {
        if (!editingShot) return;
        setSavingShot(true);
        try {
            await fetch(`/api/shows/shot/update`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ shotId: editingShot, ...editForm }),
            });
            fetchDoc();
        } catch (err: any) {
            alert("Failed to save shot edits");
        } finally {
            setSavingShot(false);
            setEditingShot(null);
        }
    };

    const handleEpisodeAction = async (action: "launch" | "relaunch" | "reset") => {
        const confirmMsg = action === "launch"
            ? `Launch video generation for Episode ${episodeIndex}? All ${shots.length} shots will be queued into Redis.`
            : action === "relaunch"
                ? `Relaunch Episode ${episodeIndex}? Existing renders will be reset and re-queued using your updated screenplay.`
                : `Clear video renders for Episode ${episodeIndex}? Text & script will NOT be deleted.`;

        if (!confirm(confirmMsg)) return;

        try {
            const res = await fetch(`/api/shows/episode/launch`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ docId: doc.id, episodeNumber: episodeIndex, action })
            });
            if (res.ok) {
                alert(`Action "${action.toUpperCase()}" completed for Episode ${episodeIndex}.`);
                fetchDoc();
            }
        } catch (err: any) {
            alert(err.message);
        }
    };

    return (
        <div className="space-y-5">
            {/* Top Navigation & Breadcrumbs */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <Link
                    href={`/dashboard/film-factory/${doc.id}`}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to Master Show Hub
                </Link>

                <div className="flex items-center gap-2">
                    <a
                        href="/api/admin/logs/ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
                    >
                        📄 View AI Logs
                    </a>
                </div>
            </div>

            {/* Episode Context Header */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between flex-wrap gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="px-2.5 py-0.5 rounded-full bg-violet-600/20 text-violet-300 font-extrabold text-[10px] uppercase">
                                Episode {episodeIndex} Context
                            </span>
                            <span className="text-xs text-gray-500 font-bold">{doc.title.replace(/\(Mini-Series\)/g, "").trim()}</span>
                        </div>
                        <h1 className="text-2xl font-black text-white">
                            {currentEpisode?.title?.startsWith("Episode") ? currentEpisode.title : `Episode ${episodeIndex}: ${currentEpisode?.title || "Untitled"}`}
                        </h1>
                        <p className="text-xs text-gray-400 mt-1 max-w-2xl">{currentEpisode?.narrationText || "Episode screenplay beat"}</p>
                    </div>

                    {/* Episode Action Toolbar */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => handleEpisodeAction("launch")}
                            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-lg shadow-emerald-600/20"
                        >
                            🚀 Launch Episode
                        </button>
                        <button
                            onClick={() => handleEpisodeAction("relaunch")}
                            className="px-3.5 py-2 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-lg shadow-violet-600/20"
                        >
                            🔄 Relaunch Episode
                        </button>
                        <button
                            onClick={() => handleEpisodeAction("reset")}
                            className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
                        >
                            🗑️ Reset Renders
                        </button>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 bg-gray-900/60 border border-gray-800 rounded-xl p-1">
                <button
                    onClick={() => setActiveTab("shots")}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer",
                        activeTab === "shots" ? "bg-violet-600 text-white shadow" : "text-gray-400 hover:text-white"
                    )}
                >
                    <Grid3X3 className="w-4 h-4" />
                    30+ Shot Matrix ({shots.length})
                </button>
                <button
                    onClick={() => setActiveTab("script")}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer",
                        activeTab === "script" ? "bg-violet-600 text-white shadow" : "text-gray-400 hover:text-white"
                    )}
                >
                    <FileText className="w-4 h-4" />
                    Screenplay Dialogue
                </button>
                <button
                    onClick={() => setActiveTab("preview")}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer",
                        activeTab === "preview" ? "bg-violet-600 text-white shadow" : "text-gray-400 hover:text-white"
                    )}
                >
                    <Play className="w-4 h-4" />
                    Episode Preview
                </button>
            </div>

            {/* Tab 1: Shot Matrix Tab */}
            {activeTab === "shots" && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                            <thead>
                                <tr className="border-b border-gray-800 bg-gray-950/60 text-gray-400">
                                    <th className="px-4 py-3 font-bold">#</th>
                                    <th className="px-4 py-3 font-bold">Shot Type</th>
                                    <th className="px-4 py-3 font-bold">Spoken Dialogue</th>
                                    <th className="px-4 py-3 font-bold">Action Beat & Prompt</th>
                                    <th className="px-4 py-3 font-bold">Duration</th>
                                    <th className="px-4 py-3 font-bold">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shots.map((shot: any) => (
                                    editingShot === shot.id ? (
                                        <tr key={shot.id} className="border-b border-gray-800 bg-violet-500/10">
                                            <td className="px-4 py-3 font-mono font-bold text-violet-400">{shot.shotIndex}</td>
                                            <td className="px-2 py-2">
                                                <input
                                                    value={editForm.shotType}
                                                    onChange={(e) => setEditForm({ ...editForm, shotType: e.target.value })}
                                                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                                                />
                                            </td>
                                            <td className="px-2 py-2">
                                                <textarea
                                                    value={editForm.dialogue}
                                                    onChange={(e) => setEditForm({ ...editForm, dialogue: e.target.value })}
                                                    rows={2}
                                                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                                                />
                                            </td>
                                            <td className="px-2 py-2 space-y-1">
                                                <textarea
                                                    value={editForm.action}
                                                    onChange={(e) => setEditForm({ ...editForm, action: e.target.value })}
                                                    rows={2}
                                                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                                                />
                                                <input
                                                    value={editForm.compositePrompt}
                                                    onChange={(e) => setEditForm({ ...editForm, compositePrompt: e.target.value })}
                                                    className="w-full bg-gray-900 border border-gray-750 rounded px-2 py-1 text-[10px] text-violet-300 font-mono"
                                                />
                                            </td>
                                            <td className="px-4 py-3 font-mono text-gray-400">{shot.duration || 5}s</td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={handleShotEditSave}
                                                    disabled={savingShot}
                                                    className="px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded transition-all cursor-pointer"
                                                >
                                                    {savingShot ? "..." : "Save"}
                                                </button>
                                            </td>
                                        </tr>
                                    ) : (
                                        <tr
                                            key={shot.id}
                                            onClick={() => {
                                                setEditingShot(shot.id);
                                                setEditForm({
                                                    shotType: shot.shotType || "",
                                                    action: shot.action || "",
                                                    dialogue: shot.dialogue || "",
                                                    compositePrompt: shot.compositePrompt || ""
                                                });
                                            }}
                                            className="border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors cursor-pointer"
                                        >
                                            <td className="px-4 py-3 font-mono font-bold text-gray-400">{shot.shotIndex}</td>
                                            <td className="px-4 py-3 font-semibold text-white capitalize">{shot.shotType}</td>
                                            <td className="px-4 py-3 max-w-xs">
                                                {shot.dialogue ? (
                                                    <span className="text-violet-300 font-medium italic bg-violet-955/30 border border-violet-800/30 px-2 py-1 rounded-lg block">
                                                        &ldquo;{shot.dialogue}&rdquo;
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-600 italic">Non-dialogue beat</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 max-w-md space-y-1">
                                                <p className="text-gray-300">{shot.action}</p>
                                                {shot.compositePrompt && (
                                                    <p className="text-[10px] text-gray-500 font-mono truncate">🎬 {shot.compositePrompt}</p>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    {shot.clipPath ? (
                                                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                                    ) : (
                                                        <Clock className="w-4 h-4 text-gray-600" />
                                                    )}
                                                    <button
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            try {
                                                                await fetch(`/api/documentary/shots/${shot.id}/regenerate`, { method: "POST" });
                                                                alert(`⚡ Shot #${shot.shotIndex} dispatched to GPU Worker!`);
                                                                fetchDoc();
                                                            } catch (err: any) {
                                                                alert(`Dispatch error: ${err.message}`);
                                                            }
                                                        }}
                                                        className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 text-[10px] font-bold rounded transition-colors"
                                                        title="Dispatch single shot to GPU Worker"
                                                    >
                                                        ⚡ GPU
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Tab 2: Screenplay Tab */}
            {activeTab === "script" && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-6">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider border-b border-gray-800 pb-3">
                        Episode {episodeIndex} Screenplay
                    </h3>
                    <div className="space-y-4 font-mono text-xs max-w-3xl mx-auto">
                        {shots.map((shot: any) => (
                            <div key={shot.id} className="p-4 bg-black/40 border border-gray-800 rounded-xl space-y-2">
                                <div className="flex items-center justify-between text-gray-500 text-[10px]">
                                    <span>SHOT {shot.shotIndex} — {shot.shotType?.toUpperCase()}</span>
                                    <span>5 SECONDS</span>
                                </div>
                                <p className="text-gray-300 font-sans italic">{shot.action}</p>
                                {shot.dialogue && (
                                    <div className="pt-2 border-t border-gray-800/60">
                                        <p className="text-violet-300 font-bold text-sm font-sans">&ldquo;{shot.dialogue}&rdquo;</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tab 3: Episode Preview */}
            {activeTab === "preview" && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center space-y-4">
                    <Play className="w-12 h-12 text-violet-500 mx-auto" />
                    <h3 className="text-base font-bold text-white">Episode {episodeIndex} Preview</h3>
                    <p className="text-xs text-gray-400 max-w-md mx-auto">
                        Rendered video clips will play back in sequence here once jobs finish processing in the Queue Monitor.
                    </p>
                </div>
            )}
        </div>
    );
}
