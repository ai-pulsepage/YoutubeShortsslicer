"use client";

import { useState, useEffect } from "react";
import {
    ChevronLeft, Loader2, Plus, Trash2, Sparkles, Tv, Users, ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

type LibraryCharacter = {
    id: string;
    name: string;
    prompt: string;
    imagePath: string;
    jobId?: string;
    jobStatus?: "IDLE" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
};

export default function AnimatedCastLibraryPage() {
    const [characters, setCharacters] = useState<LibraryCharacter[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [insufficientFunds, setInsufficientFunds] = useState(false);

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [formName, setFormName] = useState("");
    const [formPrompt, setFormPrompt] = useState("");
    const [creating, setCreating] = useState(false);
    const [expandingId, setExpandingId] = useState<string | null>(null);

    const loadLibrary = async () => {
        try {
            const res = await fetch("/api/animated/characters/library");
            if (res.ok) {
                const data = await res.json();
                setCharacters(data.characters || []);
            }
        } catch (err) {
            console.error("Failed to load library characters:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadLibrary();
    }, []);

    // Poll for avatar image generation status
    useEffect(() => {
        const pendingJobs = characters.filter(
            c => c.jobStatus === "QUEUED" || c.jobStatus === "PROCESSING"
        );
        if (pendingJobs.length === 0) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch("/api/animated/scenes/video/poll", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jobIds: pendingJobs.map(c => c.jobId).filter(Boolean)
                    })
                });

                if (!res.ok) return;
                const { jobs } = await res.json();

                setCharacters(prev =>
                    prev.map(char => {
                        const matchingJob = jobs.find((j: any) => j.id === char.jobId);
                        if (!matchingJob) return char;

                        const nextStatus =
                            matchingJob.status === "QUEUED" ? "QUEUED"
                            : matchingJob.status === "PROCESSING" ? "PROCESSING"
                            : matchingJob.status === "COMPLETED" ? "COMPLETED"
                            : "FAILED";

                        return {
                            ...char,
                            jobStatus: nextStatus,
                            imagePath: matchingJob.outputPath || char.imagePath
                        };
                    })
                );
            } catch (err) {
                console.error("Failed to poll library avatars:", err);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [characters]);

    const handleCreateCharacter = async () => {
        if (!formName.trim()) return;
        setCreating(true);
        setError("");
        try {
            const res = await fetch("/api/animated/characters/library", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formName,
                    prompt: formPrompt,
                    imagePath: ""
                })
            });
            if (!res.ok) throw new Error("Failed to create library character");
            setFormName("");
            setFormPrompt("");
            setShowForm(false);
            await loadLibrary();
        } catch (err: any) {
            setError(err.message || "Failed to create character.");
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteCharacter = async (charName: string) => {
        if (!confirm(`Are you sure you want to delete "${charName}" from your cast library?`)) return;
        // In our API, we reuse POST with empty strings or delete by setting a custom endpoint.
        // Let's call /api/animated/characters/library/delete or handle locally in route.ts!
        // To be safe, we will implement the delete handler in library route.ts in the next step.
        try {
            const res = await fetch("/api/animated/characters/library/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: charName })
            });
            if (!res.ok) throw new Error("Failed to delete character");
            await loadLibrary();
        } catch (err: any) {
            setError(err.message || "Failed to delete character.");
        }
    };

    const handleExpandPrompt = async (charId: string, currentPrompt: string) => {
        setExpandingId(charId);
        setError("");
        setInsufficientFunds(false);

        try {
            const res = await fetch("/api/animated/characters/expand", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: currentPrompt })
            });
            const data = await res.json();
            if (res.status === 402 || data.error === "DEEPSEEK_OUT_OF_FUNDS") {
                setInsufficientFunds(true);
                throw new Error(data.details || "DeepSeek API: Insufficient Balance.");
            }

            if (!res.ok) throw new Error(data.error || "Expansion failed");

            // Update in library DB
            const targetChar = characters.find(c => c.id === charId);
            if (targetChar) {
                await fetch("/api/animated/characters/library", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: targetChar.name,
                        prompt: data.expandedPrompt,
                        imagePath: targetChar.imagePath
                    })
                });
                await loadLibrary();
            }
        } catch (err: any) {
            setError(err.message || "Failed to expand prompt.");
        } finally {
            setExpandingId(null);
        }
    };

    const handleGenerateAvatar = async (charId: string, promptText: string) => {
        setError("");
        try {
            // Find library docId
            const docRes = await fetch("/api/animated/projects");
            if (!docRes.ok) throw new Error("Failed to identify library scope");
            const docData = await docRes.json();
            
            const libraryProject = docData.projects?.find((p: any) => p.genre === "children_library");
            if (!libraryProject) throw new Error("Please save a character blueprint first to initialize library scope");

            const res = await fetch("/api/animated/characters/avatar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    docId: libraryProject.id,
                    characterId: charId,
                    prompt: promptText
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to generate avatar");

            setCharacters(prev =>
                prev.map(c =>
                    c.id === charId
                        ? { ...c, jobId: data.jobId, jobStatus: "QUEUED" }
                        : c
                )
            );
        } catch (err: any) {
            setError(err.message || "Failed to dispatch avatar face generation.");
        }
    };

    return (
        <div className="space-y-6 pb-12">
            {/* Header / Sub-navigation links */}
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 pb-4 gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1.5 text-xs text-gray-400 font-bold uppercase tracking-wider font-sans">
                        <Link href="/dashboard/animated" className="flex items-center gap-1 hover:text-white">
                            <ArrowLeft className="w-3.5 h-3.5" /> Animated Shorts
                        </Link>
                        <span>/</span>
                        <span className="text-violet-400">Cast Library</span>
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Animated Shorts Cast Library</h1>
                    <p className="text-gray-400 mt-1 text-sm">Create, manage, and render reusable 3D Pixar character profiles for your Animated Shorts.</p>
                </div>

                <button onClick={() => setShowForm(!showForm)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all shadow-md font-sans">
                    <Plus className="w-4 h-4" /> Create Character
                </button>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-4 border-b border-gray-800 pb-2">
                <Link href="/dashboard/animated" className="text-sm font-semibold text-gray-500 hover:text-gray-300 pb-1.5">
                    Story Timeline
                </Link>
                <Link href="/dashboard/animated/characters" className="text-sm font-bold text-violet-400 border-b-2 border-violet-500 pb-1.5 font-sans">
                    Cast Library
                </Link>
            </div>

            {/* Error notifications */}
            {error && (
                <div className="bg-red-950/40 border border-red-900/50 p-4 rounded-xl text-xs text-red-300 leading-normal font-sans">
                    <p className="font-bold mb-1">Notice</p>
                    <p>{error}</p>
                    {insufficientFunds && (
                        <a href="https://console.deepseek.com" target="_blank" rel="noreferrer" className="underline mt-1 block font-bold text-red-400 hover:text-red-300">
                            Add DeepSeek Balance at console.deepseek.com →
                        </a>
                    )}
                </div>
            )}

            {/* Create character form */}
            {showForm && (
                <div className="bg-gray-955/20 border border-gray-850 p-6 rounded-2xl space-y-4 max-w-2xl">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">New Cast Character Profile</h3>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Character Name</label>
                            <input type="text" placeholder="e.g. Jimmy" value={formName} onChange={e => setFormName(e.target.value)}
                                className="w-full bg-gray-850 border border-gray-750 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 font-semibold" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Appearance Prompt blueprint</label>
                            <textarea placeholder="Describe hair color, clothing style, Pixar 3D face details (on a plain neutral backdrop)..."
                                value={formPrompt} onChange={e => setFormPrompt(e.target.value)} rows={3}
                                className="w-full bg-gray-850 border border-gray-750 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-violet-500 leading-relaxed font-sans" />
                        </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                        <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white">Cancel</button>
                        <button onClick={handleCreateCharacter} disabled={creating || !formName.trim()}
                            className="flex items-center gap-1 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md font-sans">
                            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            Create Profile
                        </button>
                    </div>
                </div>
            )}

            {/* Character grid */}
            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>
            ) : characters.length === 0 ? (
                <div className="bg-gray-955/10 border border-gray-850 rounded-2xl p-16 text-center">
                    <Users className="w-12 h-12 text-gray-650 mx-auto mb-4" />
                    <h3 className="text-md font-bold text-white">Cast Library is Empty</h3>
                    <p className="text-gray-400 text-xs mt-2 max-w-sm mx-auto leading-relaxed font-sans">Create your first reusable Pixar 3D animated character using the creator form above.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {characters.map(char => (
                        <div key={char.id} className="bg-gray-955/20 border border-gray-850 p-5 rounded-2xl flex flex-col justify-between space-y-4 relative group">
                            <button onClick={() => handleDeleteCharacter(char.name)}
                                className="absolute top-3 right-3 p-1.5 bg-gray-850 hover:bg-red-950/20 border border-gray-800 hover:border-red-900/30 text-gray-500 hover:text-red-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                                <Trash2 className="w-4 h-4" />
                            </button>

                            <div className="flex gap-4">
                                <div className="w-20 h-20 bg-black/40 border border-gray-800 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center relative">
                                    {char.imagePath ? (
                                        <img src={`/api/storage/signed?key=${char.imagePath}`} alt="" className="w-full h-full object-cover" />
                                    ) : char.jobStatus === "QUEUED" || char.jobStatus === "PROCESSING" ? (
                                        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                                    ) : (
                                        <Users className="w-8 h-8 text-gray-750" />
                                    )}
                                </div>

                                <div className="flex-1 min-w-0 space-y-1">
                                    <h4 className="text-sm font-bold text-white">{char.name}</h4>
                                    <p className="text-[11px] text-gray-400 leading-relaxed font-sans">{char.prompt || "No appearance details described yet."}</p>
                                </div>
                            </div>

                            <div className="flex gap-2 pt-3 border-t border-gray-850/60 justify-end">
                                <button onClick={() => handleExpandPrompt(char.id, char.prompt)}
                                    disabled={expandingId === char.id}
                                    className="flex items-center gap-0.5 px-3 py-1.5 bg-violet-600/10 border border-violet-500/20 text-violet-400 text-[10px] font-bold rounded-lg hover:bg-violet-600/20 transition-all font-sans">
                                    {expandingId === char.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                    AI Expand Prompt
                                </button>
                                <button onClick={() => handleGenerateAvatar(char.id, char.prompt)}
                                    disabled={char.jobStatus === "QUEUED" || char.jobStatus === "PROCESSING"}
                                    className="flex items-center gap-0.5 px-3 py-1.5 bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-lg hover:bg-emerald-600/20 transition-all disabled:opacity-50 font-sans">
                                    <Tv className="w-3 h-3" /> Generate Avatar Face
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
