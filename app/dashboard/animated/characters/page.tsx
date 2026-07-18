"use client";

import { useState, useEffect } from "react";
import {
    ChevronLeft, Loader2, Plus, Trash2, Sparkles, Tv, Users, ArrowLeft, Folder, Copy, Upload, Download, Eye
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
    wizardMetadata?: {
        style: string;
        subjectClass: string;
        species: string;
        anthropomorphic: boolean;
        ageBracket: string;
        attire: string;
        customDetails: string;
    } | null;
};

export default function AnimatedCastLibraryPage() {
    const [characters, setCharacters] = useState<LibraryCharacter[]>([]);
    const [loading, setLoading] = useState(true);
    const [libraryDocId, setLibraryDocId] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [insufficientFunds, setInsufficientFunds] = useState(false);

    // R2 Pick Avatar states
    const [pickingAvatarCharName, setPickingAvatarCharName] = useState<string | null>(null);
    const [r2Avatars, setR2Avatars] = useState<{ key: string; size: number }[]>([]);
    const [loadingR2Avatars, setLoadingR2Avatars] = useState(false);

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [formName, setFormName] = useState("");
    const [formPrompt, setFormPrompt] = useState("");
    const [creating, setCreating] = useState(false);
    const [expandingId, setExpandingId] = useState<string | null>(null);

    // Wizard States
    const [wizardStyle, setWizardStyle] = useState("Pixar 3D");
    const [wizardSubjectClass, setWizardSubjectClass] = useState("Human");
    const [wizardSpecies, setWizardSpecies] = useState("Boy");
    const [wizardAnthro, setWizardAnthro] = useState(false);
    const [wizardAgeBracket, setWizardAgeBracket] = useState("Child");
    const [wizardAttire, setWizardAttire] = useState("");
    const [wizardCustomDetails, setWizardCustomDetails] = useState("");
    const [generatingBlueprint, setGeneratingBlueprint] = useState(false);

    // Filter States
    const [searchQuery, setSearchQuery] = useState("");
    const [classFilter, setClassFilter] = useState("All");
    const [styleFilter, setStyleFilter] = useState("All");

    const loadLibrary = async () => {
        try {
            const res = await fetch("/api/animated/characters/library");
            if (res.ok) {
                const data = await res.json();
                setCharacters(data.characters || []);
                setLibraryDocId(data.docId || null);
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
            const wizardMetadata = {
                style: wizardStyle,
                subjectClass: wizardSubjectClass,
                species: wizardSpecies,
                anthropomorphic: wizardAnthro,
                ageBracket: wizardAgeBracket,
                attire: wizardAttire,
                customDetails: wizardCustomDetails
            };

            const res = await fetch("/api/animated/characters/library", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formName,
                    prompt: formPrompt,
                    imagePath: "",
                    wizardMetadata
                })
            });
            if (!res.ok) throw new Error("Failed to create library character");
            setFormName("");
            setFormPrompt("");
            setWizardStyle("Pixar 3D");
            setWizardSubjectClass("Human");
            setWizardSpecies("Boy");
            setWizardAnthro(false);
            setWizardAgeBracket("Child");
            setWizardAttire("");
            setWizardCustomDetails("");
            setShowForm(false);
            await loadLibrary();
        } catch (err: any) {
            setError(err.message || "Failed to create character.");
        } finally {
            setCreating(false);
        }
    };

    const handleAiGeneratePrompt = async () => {
        setGeneratingBlueprint(true);
        setError("");
        setInsufficientFunds(false);
        try {
            const wizardMetadata = {
                style: wizardStyle,
                subjectClass: wizardSubjectClass,
                species: wizardSpecies,
                anthropomorphic: wizardAnthro,
                ageBracket: wizardAgeBracket,
                attire: wizardAttire,
                customDetails: wizardCustomDetails
            };

            const res = await fetch("/api/animated/characters/expand", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: wizardCustomDetails,
                    wizardMetadata
                })
            });
            const data = await res.json();
            if (res.status === 402 || data.error === "DEEPSEEK_OUT_OF_FUNDS") {
                setInsufficientFunds(true);
                throw new Error(data.details || "DeepSeek API: Insufficient Balance.");
            }

            if (!res.ok) throw new Error(data.error || "Failed to generate character prompt");
            setFormPrompt(data.expandedPrompt || "");
        } catch (err: any) {
            setError(err.message || "Failed to generate AI character prompt.");
        } finally {
            setGeneratingBlueprint(false);
        }
    };

    const handleCloneCharacter = async (char: LibraryCharacter) => {
        setError("");
        try {
            const res = await fetch("/api/animated/characters/library", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: `${char.name} (Copy)`,
                    prompt: char.prompt,
                    imagePath: char.imagePath
                })
            });
            if (!res.ok) throw new Error("Failed to clone character");
            await loadLibrary();
        } catch (err: any) {
            setError(err.message || "Failed to clone character.");
        }
    };

    const handleUploadAvatarImage = async (charName: string, file: File) => {
        setError("");
        const formData = new FormData();
        formData.append("file", file);
        formData.append("characterId", charName.replace(/\s+/g, "_"));

        try {
            const res = await fetch("/api/animated/characters/upload", {
                method: "POST",
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to upload custom avatar");

            const res2 = await fetch("/api/animated/characters/library", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: charName,
                    imagePath: data.imagePath
                })
            });
            if (!res2.ok) throw new Error("Failed to update character image path");
            await loadLibrary();
        } catch (err: any) {
            setError(err.message || "Error uploading avatar image.");
        }
    };

    const openR2Picker = async (charName: string) => {
        setPickingAvatarCharName(charName);
        setLoadingR2Avatars(true);
        try {
            const [resAvatars, resAssets, resDocs] = await Promise.all([
                fetch("/api/storage/list?prefix=avatars/"),
                fetch("/api/storage/list?prefix=animated/&recursive=true"),
                fetch("/api/storage/list?prefix=documentaries/&recursive=true")
            ]);
            
            const dataAvatars = await resAvatars.json();
            const dataAssets = await resAssets.json();
            const dataDocs = await resDocs.json();
            
            const mergedFiles = [
                ...(dataAvatars.files || []),
                ...(dataAssets.files || []),
                ...(dataDocs.files || [])
            ];
            
            setR2Avatars(mergedFiles);
        } catch (err) {
            console.error("Failed to load R2 avatars:", err);
        } finally {
            setLoadingR2Avatars(false);
        }
    };

    const handleSelectR2Avatar = async (key: string) => {
        if (!pickingAvatarCharName) return;
        const charName = pickingAvatarCharName;

        try {
            const res = await fetch("/api/animated/characters/library", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: charName,
                    imagePath: key
                })
            });
            if (!res.ok) throw new Error("Failed to link selected avatar image");
            await loadLibrary();
        } catch (err: any) {
            setError(err.message || "Error setting avatar.");
        } finally {
            setPickingAvatarCharName(null);
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

    const handleExpandPrompt = async (charId: string, currentPrompt: string, wizardMetadata?: any) => {
        setExpandingId(charId);
        setError("");
        setInsufficientFunds(false);

        try {
            const res = await fetch("/api/animated/characters/expand", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: currentPrompt, wizardMetadata })
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
                        imagePath: targetChar.imagePath,
                        wizardMetadata: wizardMetadata || targetChar.wizardMetadata
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
            if (!libraryDocId) {
                throw new Error("Library scope not initialized. Please save a character blueprint first.");
            }

            const res = await fetch("/api/animated/characters/avatar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    docId: libraryDocId,
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

    const filteredCharacters = characters.filter(char => {
        const matchesSearch = searchQuery.trim() === "" ||
            char.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            char.prompt.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesClass = classFilter === "All" ||
            (char.wizardMetadata && char.wizardMetadata.subjectClass === classFilter);

        const matchesStyle = styleFilter === "All" ||
            (char.wizardMetadata && char.wizardMetadata.style === styleFilter);

        return matchesSearch && matchesClass && matchesStyle;
    });

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
                <Link href="/dashboard/animated" className="text-sm font-semibold text-gray-500 hover:text-gray-300 pb-1.5 font-sans">
                    Story Timeline
                </Link>
                <Link href="/dashboard/animated/projects" className="text-sm font-semibold text-gray-500 hover:text-gray-300 pb-1.5 font-sans">
                    Projects Manager
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
            )}            {/* Create character form */}
            {showForm && (
                <div className="bg-gray-955/20 border border-gray-850 p-6 rounded-2xl space-y-4 max-w-2xl">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">New Cast Character Profile Wizard</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Character Name</label>
                            <input type="text" placeholder="e.g. Jimmy" value={formName} onChange={e => setFormName(e.target.value)}
                                className="w-full bg-gray-850 border border-gray-750 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 font-semibold" />
                        </div>
                        
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Visual Style</label>
                            <select value={wizardStyle} onChange={e => setWizardStyle(e.target.value)}
                                className="w-full bg-gray-850 border border-gray-750 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 font-semibold">
                                {["Pixar 3D", "Studio Ghibli", "Classic Anime", "Claymation", "Hand-Drawn / Watercolor", "Retro Cartoon (90s)", "Realistic CGI"].map(s => (
                                    <option key={s} value={s} className="bg-gray-900 text-white">{s}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Subject Class</label>
                            <select value={wizardSubjectClass} onChange={e => setWizardSubjectClass(e.target.value)}
                                className="w-full bg-gray-850 border border-gray-750 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 font-semibold">
                                {["Human", "Animal", "Robot", "Creature"].map(c => (
                                    <option key={c} value={c} className="bg-gray-900 text-white">{c}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Species / Sub-Type</label>
                            <input type="text" placeholder="e.g. Beaver, Boy, Android, Cat" value={wizardSpecies} onChange={e => setWizardSpecies(e.target.value)}
                                className="w-full bg-gray-850 border border-gray-750 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 font-semibold" />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Age Bracket</label>
                            <select value={wizardAgeBracket} onChange={e => setWizardAgeBracket(e.target.value)}
                                className="w-full bg-gray-850 border border-gray-750 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 font-semibold">
                                {["Toddler", "Child", "Teen", "Adult", "Elderly"].map(a => (
                                    <option key={a} value={a} className="bg-gray-900 text-white">{a}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center gap-2 pt-5">
                            <input type="checkbox" id="anthro" checked={wizardAnthro} onChange={e => setWizardAnthro(e.target.checked)}
                                className="w-4 h-4 rounded bg-gray-850 border-gray-750 text-violet-550 focus:ring-violet-550 cursor-pointer" />
                            <label htmlFor="anthro" className="text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer select-none">Anthropomorphic (Anthro)</label>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Key Attire / Accessory</label>
                            <input type="text" placeholder="e.g. Blue builder hat, red jacket" value={wizardAttire} onChange={e => setWizardAttire(e.target.value)}
                                className="w-full bg-gray-850 border border-gray-750 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 font-semibold" />
                        </div>

                        <div className="md:col-span-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Custom details (Optional description)</label>
                            <textarea placeholder="e.g. buck teeth, happy smile, wide brown eyes"
                                value={wizardCustomDetails} onChange={e => setWizardCustomDetails(e.target.value)} rows={2}
                                className="w-full bg-gray-850 border border-gray-750 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-violet-500 leading-relaxed font-sans" />
                        </div>

                        <div className="md:col-span-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Visual Prompt blueprint (Generated from wizard)</label>
                                <button type="button" onClick={handleAiGeneratePrompt} disabled={generatingBlueprint}
                                    className="flex items-center gap-1 text-[10px] text-violet-400 font-bold hover:text-violet-300 cursor-pointer disabled:opacity-50">
                                    {generatingBlueprint ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                    {generatingBlueprint ? "AI Generating..." : "AI Generate Blueprint Prompt"}
                                </button>
                            </div>
                            <textarea placeholder="Click 'AI Generate Blueprint Prompt' or type manually..."
                                value={formPrompt} onChange={e => setFormPrompt(e.target.value)} rows={2}
                                className="w-full bg-gray-850 border border-gray-750 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-violet-500 leading-relaxed font-sans" />
                        </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                        <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white cursor-pointer">Cancel</button>
                        <button onClick={handleCreateCharacter} disabled={creating || !formName.trim()}
                            className="flex items-center gap-1 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md font-sans cursor-pointer">
                            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            Create Profile
                        </button>
                    </div>
                </div>
            )}

            {/* Search/Filter Toolbar */}
            <div className="bg-gray-955/20 border border-gray-850 p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between font-sans">
                <div className="w-full md:w-80">
                    <input type="text" placeholder="Search cast by name or prompt details..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-gray-850 border border-gray-750 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 font-semibold" />
                </div>
                <div className="flex flex-wrap gap-4 w-full md:w-auto">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Class:</span>
                        <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
                            className="bg-gray-850 border border-gray-750 rounded-xl px-3 py-2 text-xs text-white font-semibold focus:outline-none cursor-pointer">
                            {["All", "Human", "Animal", "Robot", "Creature"].map(c => (
                                <option key={c} value={c} className="bg-gray-900 text-white">{c}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Style:</span>
                        <select value={styleFilter} onChange={e => setStyleFilter(e.target.value)}
                            className="bg-gray-850 border border-gray-750 rounded-xl px-3 py-2 text-xs text-white font-semibold focus:outline-none cursor-pointer">
                            {["All", "Pixar 3D", "Studio Ghibli", "Classic Anime", "Claymation", "Hand-Drawn / Watercolor", "Retro Cartoon (90s)", "Realistic CGI"].map(s => (
                                <option key={s} value={s} className="bg-gray-900 text-white">{s}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Character grid */}
            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>
            ) : characters.length === 0 ? (
                <div className="bg-gray-955/10 border border-gray-850 rounded-2xl p-16 text-center">
                    <Users className="w-12 h-12 text-gray-650 mx-auto mb-4" />
                    <h3 className="text-md font-bold text-white">Cast Library is Empty</h3>
                    <p className="text-gray-400 text-xs mt-2 max-w-sm mx-auto leading-relaxed font-sans">Create your first reusable Pixar 3D animated character using the creator form above.</p>
                </div>
            ) : filteredCharacters.length === 0 ? (
                <div className="bg-gray-955/10 border border-gray-850 rounded-2xl p-16 text-center">
                    <Users className="w-12 h-12 text-gray-650 mx-auto mb-4" />
                    <h3 className="text-md font-bold text-white">No Matching Characters</h3>
                    <p className="text-gray-400 text-xs mt-2 max-w-sm mx-auto leading-relaxed font-sans">No characters in the cast library match your search filters.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {filteredCharacters.map(char => (
                        <div key={char.id} className="bg-gray-955/20 border border-gray-850 p-5 rounded-2xl flex flex-col justify-between space-y-4 relative group">
                            <button onClick={() => handleDeleteCharacter(char.name)}
                                className="absolute top-3 right-3 p-1.5 bg-gray-850 hover:bg-red-950/20 border border-gray-800 hover:border-red-900/30 text-gray-500 hover:text-red-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                                <Trash2 className="w-4 h-4" />
                            </button>                            <div className="flex gap-4">
                                <div className="w-20 h-20 bg-black/40 border border-gray-850 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center relative group/avatar cursor-pointer">
                                    {char.imagePath ? (
                                        <img src={`/api/storage/signed?key=${char.imagePath}`} alt="" className="w-full h-full object-cover" />
                                    ) : char.jobStatus === "QUEUED" || char.jobStatus === "PROCESSING" ? (
                                        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                                    ) : (
                                        <Users className="w-8 h-8 text-gray-750" />
                                    )}
                                    <div className="absolute inset-0 bg-black/85 opacity-0 group-hover/avatar:opacity-100 flex flex-col items-center justify-center transition-all p-1.5 text-[9px] font-bold text-violet-400 gap-1.5">
                                        <label className="w-full flex items-center justify-center gap-0.5 py-1 px-1 bg-violet-600 hover:bg-violet-500 rounded text-white cursor-pointer transition-colors">
                                            <Upload className="w-3 h-3" />
                                            <span>Upload</span>
                                            <input type="file" accept="image/*" className="hidden"
                                                onChange={e => {
                                                    const file = e.target.files?.[0];
                                                    if (file) handleUploadAvatarImage(char.name, file);
                                                }} />
                                        </label>
                                        {char.imagePath && (
                                            <a href={`/api/storage/signed?key=${char.imagePath}`} download={`${char.name}_avatar.webp`} target="_blank" rel="noreferrer"
                                                className="w-full flex items-center justify-center gap-0.5 py-1 px-1 bg-gray-800 hover:bg-gray-700 border border-gray-700/60 rounded text-gray-300 hover:text-white cursor-pointer no-underline transition-colors">
                                                <Download className="w-3 h-3" />
                                                <span>Save</span>
                                            </a>
                                        )}
                                    </div>
                                </div>

                                <div className="flex-1 min-w-0 space-y-1">
                                    <h4 className="text-sm font-bold text-white">{char.name}</h4>
                                    <p className="text-[11px] text-gray-450 leading-relaxed font-sans">{char.prompt || "No appearance details described yet."}</p>
                                </div>
                            </div>

                            <div className="flex gap-2 pt-3 border-t border-gray-850/60 justify-end">
                                <button onClick={() => handleCloneCharacter(char)}
                                    className="flex items-center gap-0.5 px-3 py-1.5 bg-gray-850 hover:bg-gray-800 border border-gray-750 text-gray-300 text-[10px] font-bold rounded-lg transition-all font-sans cursor-pointer">
                                    <Copy className="w-3 h-3 text-gray-400" /> Clone
                                </button>
                                <button onClick={() => handleExpandPrompt(char.id, char.prompt, char.wizardMetadata)}
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
                                <button onClick={() => openR2Picker(char.name)}
                                    className="flex items-center gap-0.5 px-3 py-1.5 bg-violet-600/10 border border-violet-500/20 text-violet-400 text-[10px] font-bold rounded-lg hover:bg-violet-600/20 transition-all font-sans cursor-pointer">
                                    <Folder className="w-3 h-3 text-violet-400" /> Pick from R2
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* R2 Avatar Picker Modal */}
            {pickingAvatarCharName !== null && (
                <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-955 border border-gray-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh] animate-in fade-in-50 zoom-in-95 duration-150">
                        {/* Header */}
                        <div className="p-5 border-b border-gray-850 flex items-center justify-between bg-gray-900/40">
                            <div>
                                <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                                    <Folder className="w-4 h-4 text-violet-400" /> Select Avatar from R2
                                </h3>
                                <p className="text-[10px] text-gray-550 font-sans mt-0.5">Select a generated profile image already uploaded to your avatars/ folder.</p>
                            </div>
                            <button onClick={() => setPickingAvatarCharName(null)}
                                className="p-1.5 bg-gray-850 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg border border-gray-800 transition-all text-[10px] font-bold font-mono">
                                CANCEL
                            </button>
                        </div>

                        {/* Content */}
                        {loadingR2Avatars ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-3">
                                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                                <span className="text-xs text-gray-500 font-sans">Scanning avatars/ directory...</span>
                            </div>
                        ) : r2Avatars.length === 0 ? (
                            <div className="text-center py-20 space-y-2">
                                <Folder className="w-10 h-10 text-gray-700 mx-auto" />
                                <h4 className="text-xs font-bold text-gray-450">No R2 avatars found</h4>
                                <p className="text-[10px] text-gray-550 font-sans max-w-xs mx-auto">No generated files are present inside the avatars/ folder. Generate some avatars first or upload them manually.</p>
                            </div>
                        ) : (
                            <div className="p-5 overflow-y-auto flex-1 grid grid-cols-3 sm:grid-cols-4 gap-4 bg-gray-955/5">
                                {r2Avatars.map((avatar, idx) => (
                                    <button key={idx} onClick={() => handleSelectR2Avatar(avatar.key)}
                                        className="bg-gray-900/60 border border-gray-850 hover:border-violet-500 hover:bg-gray-900 p-2 rounded-2xl flex flex-col items-center gap-2 transition-all cursor-pointer group text-center">
                                        <div className="w-16 h-16 bg-black/40 border border-gray-800 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0">
                                            <img src={`/api/storage/signed?key=${avatar.key}`} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-all" />
                                        </div>
                                        <span className="text-[9px] font-mono text-gray-500 group-hover:text-white truncate w-full block">
                                            {avatar.key.split("/").pop()}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
