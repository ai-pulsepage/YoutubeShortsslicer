"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
    Sparkles,
    Plus,
    Upload,
    Trash2,
    Loader2,
    CheckCircle2,
    XCircle,
    ExternalLink,
    Play,
    User,
    Package,
    Wand2,
    AlertCircle,
    Copy,
    Folder,
    ArrowLeft,
    RefreshCw,
    Search,
    Eye
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

type Avatar = {
    id: string;
    name: string;
    persona: string | null;
    referenceImageUrl: string | null;
    voiceEngine: string;
    voiceId: string | null;
    jobId?: string | null;
    jobStatus?: string | null;
};

type Product = {
    id: string;
    name: string;
    description: string | null;
    price: string | null;
    imageUrls: string[];
    sourceUrl: string;
    brand: string | null;
    _count?: {
        ugcJobs: number;
    };
};

type UGCJob = {
    id: string;
    status: string;
    script: string | null;
    outputUrl: string | null;
    hookStyle: string;
    avatarId: string;
    productId: string;
    avatar: { name: string };
    product: { name: string };
    createdAt: string;
};

const HOOK_STYLES = [
    { value: "TESTIMONIAL", label: "Testimonial", desc: '"I tried this and..."' },
    { value: "PROBLEM_SOLUTION", label: "Problem / Solution", desc: '"Struggling with X?"' },
    { value: "UNBOXING", label: "Unboxing", desc: "Reveal style" },
    { value: "COMPARISON", label: "Comparison", desc: '"Before vs after"' },
    { value: "TUTORIAL", label: "Tutorial", desc: "Step by step" },
];

const STATUS_COLORS: Record<string, string> = {
    PENDING: "text-gray-400 bg-gray-500/10 border-gray-500/20",
    GENERATING_SCRIPT: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    GENERATING_VIDEO: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    COMPOSITING: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    DONE: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    FAILED: "text-red-400 bg-red-500/10 border-red-500/20",
};

export default function UGCStudioPage() {
    // Left Cast Panel States
    const [avatars, setAvatars] = useState<Avatar[]>([]);
    const [loadingAvatars, setLoadingAvatars] = useState(true);
    const [spawnerSuggestion, setSpawnerSuggestion] = useState("");
    const [spawnerVoiceEngine, setSpawnerVoiceEngine] = useState("elevenlabs");
    const [spawnerLoading, setSpawnerLoading] = useState(false);
    
    // Manual character form
    const [showManualForm, setShowManualForm] = useState(false);
    const [manualForm, setManualForm] = useState({ name: "", persona: "", voiceEngine: "elevenlabs", voiceId: "" });
    const [manualCreating, setManualCreating] = useState(false);

    // Right Campaign Panel States
    const [products, setProducts] = useState<Product[]>([]);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
    const [scrapingUrl, setScrapingUrl] = useState("");
    const [scrapingLoading, setScrapingLoading] = useState(false);
    
    // UGC Job Generation States
    const [jobs, setJobs] = useState<UGCJob[]>([]);
    const [loadingJobs, setLoadingJobs] = useState(true);
    const [selectedAvatarId, setSelectedAvatarId] = useState("");
    const [selectedHookStyle, setSelectedHookStyle] = useState("TESTIMONIAL");
    const [selectedLayoutType, setSelectedLayoutType] = useState("SPLIT");
    const [selectedPresetPack, setSelectedPresetPack] = useState<'SINGLE' | 'TIKTOK_3X' | 'OMNICHANNEL_5X'>('SINGLE');
    const [useCustomScript, setUseCustomScript] = useState(false);
    const [customScript, setCustomScript] = useState("");
    const [generatingVideo, setGeneratingVideo] = useState(false);
    const [activeJobId, setActiveJobId] = useState<string | null>(null);

    const handleDeleteCampaign = async (id: string, name: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!confirm(`Are you sure you want to delete campaign "${name}"?`)) return;
        try {
            const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete campaign");
            if (selectedCampaignId === id) setSelectedCampaignId(null);
            fetchProducts();
        } catch (err: any) {
            alert(err.message || "Error deleting campaign.");
        }
    };
    
    // Upload references
    const [uploadingAvatarId, setUploadingAvatarId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const activeUploadAvatarId = useRef<string | null>(null);

    // R2 Picker modal states
    const [pickingAvatarId, setPickingAvatarId] = useState<string | null>(null);
    const [r2Avatars, setR2Avatars] = useState<{ key: string; size: number }[]>([]);
    const [loadingR2Avatars, setLoadingR2Avatars] = useState(false);

    const [error, setError] = useState("");

    // ─── Data Loaders ──────────────────────────────────────────
    const fetchAvatars = async () => {
        setLoadingAvatars(true);
        try {
            const res = await fetch("/api/avatars");
            if (res.ok) setAvatars(await res.json());
        } catch (err) {
            console.error("Failed to load avatars:", err);
        } finally {
            setLoadingAvatars(false);
        }
    };

    const fetchProducts = async () => {
        setLoadingProducts(true);
        try {
            const res = await fetch("/api/products");
            if (res.ok) setProducts(await res.json());
        } catch (err) {
            console.error("Failed to load campaigns:", err);
        } finally {
            setLoadingProducts(false);
        }
    };

    const fetchJobs = async () => {
        setLoadingJobs(true);
        try {
            const res = await fetch("/api/ugc");
            if (res.ok) setJobs(await res.json());
        } catch (err) {
            console.error("Failed to load jobs:", err);
        } finally {
            setLoadingJobs(false);
        }
    };

    useEffect(() => {
        fetchAvatars();
        fetchProducts();
        fetchJobs();
    }, []);

    // ─── Reactive Polling loops ─────────────────────────────────
    // 1. Poll active video jobs
    useEffect(() => {
        const activeJobs = jobs.filter(j => !["DONE", "FAILED"].includes(j.status));
        if (activeJobs.length === 0 && !activeJobId) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch("/api/ugc");
                if (res.ok) {
                    const latestJobs = await res.json();
                    setJobs(latestJobs);

                    // Check if active triggered job is done
                    if (activeJobId) {
                        const activeJob = latestJobs.find((j: any) => j.id === activeJobId);
                        if (activeJob && ["DONE", "FAILED"].includes(activeJob.status)) {
                            setActiveJobId(null);
                            fetchProducts(); // Refresh job count badges
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to poll jobs:", err);
            }
        }, 4000);

        return () => clearInterval(interval);
    }, [jobs, activeJobId]);

    // 2. Poll rendering avatar faces
    useEffect(() => {
        const pendingAvatars = avatars.filter(a => a.jobStatus === "QUEUED" || a.jobStatus === "PROCESSING");
        if (pendingAvatars.length === 0) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch("/api/avatars");
                if (res.ok) {
                    setAvatars(await res.json());
                }
            } catch (err) {
                console.error("Failed to poll avatars:", err);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [avatars]);

    // ─── Avatar Handlers ────────────────────────────────────────
    const handleSpawnAvatar = async () => {
        if (!spawnerSuggestion.trim()) return;
        setSpawnerLoading(true);
        setError("");
        try {
            const res = await fetch("/api/avatars/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ suggestion: spawnerSuggestion, voiceEngine: spawnerVoiceEngine })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to spawn character");
            
            setSpawnerSuggestion("");
            fetchAvatars();
        } catch (err: any) {
            setError(err.message || "Failed to spawn avatar.");
        } finally {
            setSpawnerLoading(false);
        }
    };

    const handleCreateManualAvatar = async () => {
        if (!manualForm.name.trim()) return;
        setManualCreating(true);
        try {
            const res = await fetch("/api/avatars", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(manualForm)
            });
            if (res.ok) {
                setManualForm({ name: "", persona: "", voiceEngine: "elevenlabs", voiceId: "" });
                setShowManualForm(false);
                fetchAvatars();
            }
        } catch (err) {
            console.error("Manual avatar creation failed:", err);
        } finally {
            setManualCreating(false);
        }
    };

    const handleCloneAvatar = async (avatar: Avatar) => {
        try {
            const res = await fetch("/api/avatars", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: `${avatar.name} (Copy)`,
                    persona: avatar.persona,
                    voiceEngine: avatar.voiceEngine,
                })
            });
            if (res.ok) {
                const data = await res.json();
                
                // If it had a face image, patch the copy with the same face key
                if (avatar.referenceImageUrl) {
                    await fetch(`/api/avatars/${data.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ referenceImageUrl: avatar.referenceImageUrl })
                    });
                }
                fetchAvatars();
            }
        } catch (err) {
            console.error("Failed to clone avatar:", err);
        }
    };

    const handleDeleteJob = async (jobId: string) => {
        try {
            const res = await fetch(`/api/ugc/${jobId}`, { method: "DELETE" });
            if (res.ok) {
                setJobs(prev => prev.filter(j => j.id !== jobId));
                fetchJobs();
            }
        } catch (err) {
            console.error("Failed to delete ad job:", err);
        }
    };

    const handleUploadAvatarImage = async (avatarId: string, file: File) => {
        setUploadingAvatarId(avatarId);
        const fd = new FormData();
        fd.append("file", file);
        fd.append("type", "image");
        try {
            const res = await fetch(`/api/avatars/${avatarId}/upload`, {
                method: "POST",
                body: fd
            });
            if (res.ok) {
                fetchAvatars();
            }
        } catch (err) {
            console.error("Upload failed:", err);
        } finally {
            setUploadingAvatarId(null);
        }
    };

    const handleDeleteAvatar = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete AI Cast member "${name}"?`)) return;
        try {
            const res = await fetch(`/api/avatars/${id}`, {
                method: "DELETE"
            });
            if (res.ok) fetchAvatars();
        } catch (err) {
            console.error("Failed to delete avatar:", err);
        }
    };

    // Update avatar voice engine and voice ID dynamically from card
    const handleUpdateAvatarVoice = async (avatarId: string, engine: string, voiceId: string) => {
        setAvatars(prev => prev.map(a => (a.id === avatarId ? { ...a, voiceEngine: engine, voiceId } : a)));
        try {
            const res = await fetch(`/api/avatars/${avatarId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ voiceEngine: engine, voiceId })
            });
            if (!res.ok) throw new Error("Failed to update voice settings");
        } catch (err) {
            console.error("Failed to update voice settings:", err);
            fetchAvatars();
        }
    };

    // R2 Picker Handlers
    const openR2Picker = async (id: string) => {
        setPickingAvatarId(id);
        setLoadingR2Avatars(true);
        try {
            const [resAvatars, resAssets] = await Promise.all([
                fetch("/api/storage/list?prefix=avatars/"),
                fetch("/api/storage/list?prefix=ugc/avatars/&recursive=true")
            ]);
            
            const dataAvatars = await resAvatars.json();
            const dataAssets = await resAssets.json();
            
            const mergedFiles = [
                ...(dataAvatars.files || []),
                ...(dataAssets.files || [])
            ];
            
            setR2Avatars(mergedFiles);
        } catch (err) {
            console.error("Failed to load R2 avatars:", err);
        } finally {
            setLoadingR2Avatars(false);
        }
    };

    const handleSelectR2Avatar = async (key: string) => {
        if (!pickingAvatarId) return;
        const id = pickingAvatarId;
        try {
            const res = await fetch(`/api/avatars/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ referenceImageUrl: key })
            });
            if (res.ok) fetchAvatars();
        } catch (err) {
            console.error("Failed to link R2 image:", err);
        } finally {
            setPickingAvatarId(null);
        }
    };

    // ─── Campaign Handlers ─────────────────────────────────────
    const handleCreateCampaign = async () => {
        if (!scrapingUrl.trim()) return;
        setScrapingLoading(true);
        setError("");
        try {
            const res = await fetch("/api/products/ingest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: scrapingUrl })
            });
            if (!res.ok) throw new Error("Failed to ingest product details");
            setScrapingUrl("");
            fetchProducts();
        } catch (err: any) {
            setError(err.message || "Failed to create product campaign.");
        } finally {
            setScrapingLoading(false);
        }
    };

    const handleGenerateUGCVideo = async () => {
        if (!selectedAvatarId || !selectedCampaignId) return;

        if (selectedPresetPack === 'TIKTOK_3X') {
            return handleGenerateUGCBatch(['TESTIMONIAL', 'PROBLEM_SOLUTION', 'COMPARISON']);
        }
        if (selectedPresetPack === 'OMNICHANNEL_5X') {
            return handleGenerateUGCBatch(['TESTIMONIAL', 'PROBLEM_SOLUTION', 'UNBOXING', 'COMPARISON', 'TUTORIAL']);
        }

        setGeneratingVideo(true);
        setError("");
        try {
            const res = await fetch("/api/ugc/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    avatarId: selectedAvatarId,
                    productId: selectedCampaignId,
                    hookStyle: selectedHookStyle,
                    layoutType: selectedLayoutType,
                    customScript: useCustomScript ? customScript : undefined
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "UGC Generation failed");
            
            setActiveJobId(data.jobId);
            setCustomScript("");
            setUseCustomScript(false);
            fetchJobs();
        } catch (err: any) {
            setError(err.message || "UGC Generation failed.");
        } finally {
            setGeneratingVideo(false);
        }
    };

    const handleGenerateUGCBatch = async (hookStyles: string[]) => {
        if (!selectedAvatarId || !selectedCampaignId) return;
        setGeneratingVideo(true);
        setError("");
        
        try {
            const results = await Promise.all(
                hookStyles.map(async (style) => {
                    const res = await fetch("/api/ugc/generate", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            avatarId: selectedAvatarId,
                            productId: selectedCampaignId,
                            hookStyle: style,
                            layoutType: selectedLayoutType,
                        })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || `Failed to queue ${style}`);
                    return data;
                })
            );
            
            if (results.length > 0) {
                setActiveJobId(results[0].jobId);
            }
            fetchJobs();
            alert(`Successfully queued batch of ${results.length} UGC videos for this week's ads!`);
        } catch (err: any) {
            setError(err.message || "Failed to generate batch of videos.");
        } finally {
            setGeneratingVideo(false);
        }
    };

    // Find active product campaign details
    const activeCampaign = products.find(p => p.id === selectedCampaignId);
    // Find jobs nested in this campaign
    const campaignJobs = jobs.filter(j => j.productId === selectedCampaignId);

    return (
        <div className="space-y-6 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 pb-4 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2">
                        AI UGC Studio
                    </h1>
                    <p className="text-gray-400 mt-1 text-sm font-sans">
                        Design consistent AI UGC characters, scrape product detail campaigns, and batch generate high-converting promotional videos.
                    </p>
                </div>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-400 text-xs leading-relaxed font-sans flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Split Page Workspace Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* ─── LEFT COLUMN: AI CAST DIRECTORY (30% width) ─── */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-gray-950 border border-gray-850 p-5 rounded-3xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                                <User className="w-4 h-4 text-violet-400" /> AI UGC Cast
                            </h2>
                            <span className="text-[10px] text-gray-500 font-mono">{avatars.length} Active</span>
                        </div>

                        {/* AI Character Spawner Box */}
                        <div className="bg-gray-900/60 border border-gray-850 p-3.5 rounded-2xl space-y-2">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">AI Character Spawner</label>
                            <div className="flex gap-2">
                                <input type="text" placeholder="e.g. skincare aesthetician Sarah..." value={spawnerSuggestion} onChange={e => setSpawnerSuggestion(e.target.value)}
                                    className="flex-1 bg-gray-950 border border-gray-800 focus:border-violet-500 rounded-xl px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none transition-all font-sans" />
                                <button onClick={handleSpawnAvatar} disabled={spawnerLoading || !spawnerSuggestion.trim()}
                                    className="px-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-[10px] font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center whitespace-nowrap">
                                    {spawnerLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                            
                            <div className="flex items-center justify-between text-[9px] pt-1">
                                <span className="text-gray-550 font-sans">Default Voice Engine:</span>
                                <select value={spawnerVoiceEngine} onChange={e => setSpawnerVoiceEngine(e.target.value)}
                                    className="bg-gray-950 border border-gray-800 rounded-lg px-2 py-0.5 text-violet-400 font-bold focus:outline-none focus:border-violet-500">
                                    <option value="xtts">XTTS (Free)</option>
                                    <option value="dia">Dia (Free)</option>
                                    <option value="elevenlabs">ElevenLabs</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                            <button onClick={() => setShowManualForm(!showManualForm)}
                                className="w-full text-center py-1.5 bg-gray-900 hover:bg-gray-850 text-gray-400 hover:text-white rounded-lg border border-gray-800 text-[10px] font-bold transition-all cursor-pointer uppercase tracking-wider">
                                {showManualForm ? "Hide Advanced Form" : "+ Create Custom Avatar"}
                            </button>
                        </div>

                        {/* Manual Form Toggle */}
                        {showManualForm && (
                            <div className="bg-gray-900/40 border border-gray-850 p-4 rounded-2xl space-y-3">
                                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Custom Profile Details</h3>
                                <input type="text" placeholder="Character Name" value={manualForm.name} onChange={e => setManualForm(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 font-sans" />
                                <textarea placeholder="Describe Persona, tone of voice, style..." value={manualForm.persona} onChange={e => setManualForm(prev => ({ ...prev, persona: e.target.value }))} rows={2}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-violet-500 font-sans resize-none" />
                                <div className="grid grid-cols-2 gap-2">
                                    <select value={manualForm.voiceEngine} onChange={e => setManualForm(prev => ({ ...prev, voiceEngine: e.target.value }))}
                                        className="bg-gray-955 border border-gray-800 rounded-xl px-2 py-2 text-[10px] text-white focus:outline-none focus:border-violet-500 font-sans">
                                        <option value="elevenlabs">ElevenLabs</option>
                                        <option value="xtts">XTTS (local)</option>
                                    </select>
                                    <input type="text" placeholder="Voice ID" value={manualForm.voiceId} onChange={e => setManualForm(prev => ({ ...prev, voiceId: e.target.value }))}
                                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-[10px] text-white focus:outline-none focus:border-violet-500 font-sans" />
                                </div>
                                <button onClick={handleCreateManualAvatar} disabled={manualCreating || !manualForm.name.trim()}
                                    className="w-full py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-[10px] font-bold rounded-xl transition-all cursor-pointer">
                                    {manualCreating ? "Saving..." : "Save Character"}
                                </button>
                            </div>
                        )}

                        {/* Cast Directory Scroll Loop */}
                        {loadingAvatars ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-violet-400" /></div>
                        ) : avatars.length === 0 ? (
                            <div className="text-center py-10 bg-black/10 border border-dashed border-gray-850 rounded-2xl">
                                <User className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                                <p className="text-[11px] text-gray-500 font-sans">Spawner is empty. generate some characters above!</p>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                                {avatars.map(avatar => (
                                    <div key={avatar.id}
                                        className={cn("bg-gray-900/60 border p-3 rounded-2xl flex gap-3 transition-all relative group/card",
                                            selectedAvatarId === avatar.id ? "border-violet-500 bg-violet-500/[0.02]" : "border-gray-850 hover:border-gray-800"
                                        )}>
                                        
                                        {/* Action buttons overlay visible on card hover */}
                                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/card:opacity-100 transition-all z-10">
                                            <button onClick={() => handleCloneAvatar(avatar)} title="Clone Character"
                                                className="p-1 bg-gray-850 hover:bg-gray-800 text-gray-400 hover:text-white rounded border border-gray-800 transition-all cursor-pointer">
                                                <Copy className="w-3 h-3" />
                                            </button>
                                            <button onClick={() => handleDeleteAvatar(avatar.id, avatar.name)} title="Delete Character"
                                                className="p-1 bg-red-955/20 hover:bg-red-955/40 text-red-400 rounded border border-red-900/20 transition-all cursor-pointer">
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>

                                        {/* Avatar Face Box */}
                                        <div className="w-14 h-14 bg-black/40 border border-gray-850 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center relative group/avatar cursor-pointer">
                                            {avatar.referenceImageUrl ? (
                                                <img src={`/api/storage/signed?key=${avatar.referenceImageUrl}`} alt="" className="w-full h-full object-cover" />
                                            ) : avatar.jobStatus === "QUEUED" || avatar.jobStatus === "PROCESSING" ? (
                                                <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                                            ) : (
                                                <User className="w-5 h-5 text-gray-750" />
                                            )}
                                            
                                            {/* Hover file upload overlay */}
                                            {(!avatar.jobStatus || avatar.jobStatus === "FAILED" || avatar.referenceImageUrl) && (
                                                <label className="absolute inset-0 bg-black/75 opacity-0 group-hover/avatar:opacity-100 flex flex-col items-center justify-center transition-all cursor-pointer text-center p-1 text-[7px] font-bold text-violet-400">
                                                    <Upload className="w-3 h-3 mb-0.5 text-violet-450" />
                                                    Upload
                                                    <input type="file" accept="image/*" className="hidden"
                                                        onChange={e => {
                                                            const file = e.target.files?.[0];
                                                            if (file) handleUploadAvatarImage(avatar.id, file);
                                                        }} />
                                                </label>
                                            )}
                                        </div>

                                        {/* Character Profile Info */}
                                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                                            <div className="min-w-0">
                                                <h4 className="text-xs font-bold text-white truncate">{avatar.name}</h4>
                                                <p className="text-[10px] text-gray-550 line-clamp-2 mt-0.5 leading-snug font-sans">{avatar.persona || "No persona details defined yet."}</p>
                                            </div>
                                            <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-gray-850/40">
                                                
                                                {/* Voice engine and voice ID editor */}
                                                <div className="flex items-center gap-1.5">
                                                    <select value={avatar.voiceEngine}
                                                        onChange={e => handleUpdateAvatarVoice(avatar.id, e.target.value, avatar.voiceId || "")}
                                                        className="bg-gray-950 border border-gray-800 rounded-lg px-1.5 py-0.5 text-[9px] font-bold text-violet-400 focus:outline-none focus:border-violet-500 cursor-pointer">
                                                        <option value="xtts">XTTS (Free)</option>
                                                        <option value="dia">Dia (Free)</option>
                                                        <option value="elevenlabs">ElevenLabs</option>
                                                    </select>
                                                    <input type="text" placeholder="Voice ID" value={avatar.voiceId || ""}
                                                        onChange={e => handleUpdateAvatarVoice(avatar.id, avatar.voiceEngine, e.target.value)}
                                                        className="w-16 bg-gray-950 border border-gray-800 rounded-lg px-1.5 py-0.5 text-[9px] font-mono text-gray-300 placeholder-gray-700 focus:outline-none focus:border-violet-500" />
                                                </div>

                                                <div className="flex items-center justify-between gap-1">
                                                    <button onClick={() => openR2Picker(avatar.id)}
                                                        className="px-1.5 py-0.5 bg-gray-850 hover:bg-gray-800 text-gray-400 hover:text-white rounded border border-gray-800 text-[8px] font-bold font-sans cursor-pointer transition-all">
                                                        R2
                                                    </button>
                                                    <button onClick={async () => {
                                                        const userPrompt = window.prompt("Enter detailed design prompt to generate an AI face for this character spokesperson:", `Highly realistic headshot of a professional presenter named ${avatar.name}, friendly expression, natural human skin texture, studio background, photorealistic, 8k`);
                                                        if (!userPrompt || !userPrompt.trim()) return;
                                                        try {
                                                            const genRes = await fetch(`/api/avatars/${avatar.id}/generate`, {
                                                                method: "POST",
                                                                headers: { "Content-Type": "application/json" },
                                                                body: JSON.stringify({ prompt: userPrompt })
                                                            });
                                                            const genData = await genRes.json();
                                                            if (!genRes.ok) throw new Error(genData.error || "Failed to start generation");
                                                            fetchAvatars();
                                                        } catch (err: any) {
                                                            alert(err.message || "Failed to queue image generation.");
                                                        }
                                                    }}
                                                        className="px-1.5 py-0.5 bg-violet-650 hover:bg-violet-600 text-white rounded border border-violet-500/30 text-[8px] font-bold font-sans cursor-pointer transition-all flex items-center gap-0.5">
                                                        <Sparkles className="w-2 h-2" /> AI Face
                                                    </button>
                                                    <button onClick={() => setSelectedAvatarId(avatar.id)}
                                                        className={cn("px-2 py-0.5 rounded text-[8px] font-bold font-sans transition-all cursor-pointer",
                                                            selectedAvatarId === avatar.id 
                                                                ? "bg-violet-600 text-white" 
                                                                : "bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:bg-gray-850"
                                                        )}>
                                                        {selectedAvatarId === avatar.id ? "Selected" : "Select"}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ─── RIGHT COLUMN: UGC CAMPAIGNS WORKSPACE (70% width) ─── */}
                <div className="lg:col-span-8 space-y-6">

                    {/* CAMPAIGN MODE 1: Directory List (Scraping URL and listing Campaigns) */}
                    {selectedCampaignId === null ? (
                        <div className="space-y-6">
                            
                            {/* Product URL Scraper Bar */}
                            <div className="bg-gray-955 border border-gray-850 p-5 rounded-3xl space-y-4">
                                <div>
                                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Start Product Campaign</h2>
                                    <p className="text-xs text-gray-500 font-sans mt-0.5">Scrape details from Amazon or any other ecommerce store page to auto-configure scripts.</p>
                                </div>
                                <div className="flex gap-3">
                                    <input type="url" placeholder="https://amazon.com/... or any product link" value={scrapingUrl} onChange={e => setScrapingUrl(e.target.value)}
                                        className="flex-1 bg-gray-900 border border-gray-800 focus:border-violet-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none transition-all font-sans" />
                                    <button onClick={handleCreateCampaign} disabled={scrapingLoading || !scrapingUrl.trim()}
                                        className="flex items-center gap-1.5 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-all shadow font-sans cursor-pointer">
                                        {scrapingLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Package className="w-3.5 h-3.5" />}
                                        Create Campaign
                                    </button>
                                </div>
                            </div>

                            {/* Ad Templates & Presets Gallery */}
                            <div className="bg-gray-950 border border-gray-850 p-6 rounded-3xl space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                            <Sparkles className="w-4 h-4 text-violet-400" /> Ad Templates & Weekly Preset Packs
                                        </h3>
                                        <p className="text-xs text-gray-500 font-sans mt-0.5">Select a pre-built video template formula to batch generate ads for your avatars.</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="bg-gray-900/60 border border-gray-850 p-4 rounded-2xl space-y-2 font-sans">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[9px] font-bold px-2 py-0.5 bg-violet-600/10 border border-violet-500/20 text-violet-400 rounded">3x Video Batch</span>
                                            <span className="text-[9px] text-gray-500 font-mono">Split Stacked</span>
                                        </div>
                                        <h4 className="text-xs font-bold text-white">TikTok Ads Pack</h4>
                                        <p className="text-[10px] text-gray-500 leading-normal">Generates Testimonial, Problem/Solution, and Comparison hooks for split-testing vertical ads.</p>
                                        <button onClick={() => {
                                            if (products.length === 0) {
                                                alert("Please paste a product URL above to create your first campaign!");
                                                return;
                                            }
                                            setSelectedCampaignId(products[0].id);
                                        }} className="w-full py-1.5 bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 font-bold text-[10px] rounded-xl border border-violet-500/20 transition-all cursor-pointer">
                                            Use Template
                                        </button>
                                    </div>

                                    <div className="bg-gray-900/60 border border-gray-850 p-4 rounded-2xl space-y-2 font-sans">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[9px] font-bold px-2 py-0.5 bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 rounded">5x Video Batch</span>
                                            <span className="text-[9px] text-gray-500 font-mono">Multi-Layout</span>
                                        </div>
                                        <h4 className="text-xs font-bold text-white">Omnichannel Launch Pack</h4>
                                        <p className="text-[10px] text-gray-500 leading-normal">Generates a whole week of unique hooks (Unboxing, Testimonial, Tutorial, Comparison, Problem/Solution).</p>
                                        <button onClick={() => {
                                            if (products.length === 0) {
                                                alert("Please paste a product URL above to create your first campaign!");
                                                return;
                                            }
                                            setSelectedCampaignId(products[0].id);
                                        }} className="w-full py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 font-bold text-[10px] rounded-xl border border-emerald-500/20 transition-all cursor-pointer">
                                            Use Template
                                        </button>
                                    </div>

                                    <div className="bg-gray-900/60 border border-gray-850 p-4 rounded-2xl space-y-2 font-sans">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[9px] font-bold px-2 py-0.5 bg-cyan-600/10 border border-cyan-500/20 text-cyan-400 rounded">Single Video</span>
                                            <span className="text-[9px] text-gray-500 font-mono">Green Screen</span>
                                        </div>
                                        <h4 className="text-xs font-bold text-white">Chroma Key Review</h4>
                                        <p className="text-[10px] text-gray-500 leading-normal">Removes the avatar's background and overlays them over live product photos or videos.</p>
                                        <button onClick={() => {
                                            if (products.length === 0) {
                                                alert("Please paste a product URL above to create your first campaign!");
                                                return;
                                            }
                                            setSelectedLayoutType("GREEN_SCREEN");
                                            setSelectedCampaignId(products[0].id);
                                        }} className="w-full py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 font-bold text-[10px] rounded-xl border border-cyan-500/20 transition-all cursor-pointer">
                                            Use Template
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Campaigns Directory Grid */}
                            <div className="bg-gray-950 border border-gray-850 p-6 rounded-3xl space-y-4">
                                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Active Campaigns</h3>
                                
                                {loadingProducts ? (
                                    <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>
                                ) : products.length === 0 ? (
                                    <div className="text-center py-20 bg-black/10 border border-dashed border-gray-850 rounded-2xl space-y-2">
                                        <Package className="w-10 h-10 text-gray-700 mx-auto" />
                                        <h4 className="text-xs font-bold text-gray-400">No campaigns active</h4>
                                        <p className="text-[11px] text-gray-550 font-sans max-w-xs mx-auto">Paste a product page URL in the creator bar above to initialize a campaign.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {products.map(product => (
                                            <div key={product.id} onClick={() => setSelectedCampaignId(product.id)}
                                                className="bg-gray-900/60 border border-gray-850 hover:border-violet-500/25 p-4 rounded-2xl flex gap-4 text-left transition-all group cursor-pointer">
                                                
                                                {/* Product Image */}
                                                <div className="w-16 h-16 bg-black/40 border border-gray-850 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center">
                                                    {product.imageUrls[0] ? (
                                                        <img src={product.imageUrls[0]} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Package className="w-6 h-6 text-gray-750" />
                                                    )}
                                                </div>

                                                {/* Details */}
                                                <div className="flex-1 min-w-0 flex flex-col justify-between">
                                                    <div>
                                                        <div className="flex items-start justify-between gap-2">
                                                            <h4 className="text-xs font-bold text-white group-hover:text-violet-400 transition-all truncate">{product.name}</h4>
                                                            <button onClick={(e) => handleDeleteCampaign(product.id, product.name, e)}
                                                                title="Delete Campaign"
                                                                className="p-1 hover:bg-red-500/20 text-gray-500 hover:text-red-400 rounded transition-all">
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            {product.brand && <span className="text-[9px] text-gray-500 truncate font-sans">{product.brand}</span>}
                                                            {product.price && <span className="text-[9px] text-emerald-400 font-mono font-bold">{product.price}</span>}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between border-t border-gray-850/40 pt-2 mt-2">
                                                        <span className="text-[9px] text-gray-500 font-mono">Campaign ID: #{product.id.slice(-6)}</span>
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 bg-violet-600/10 border border-violet-500/15 rounded text-violet-400">
                                                            {product._count?.ugcJobs || 0} Shorts
                                                        </span>
                                                    </div>
                                                </div>

                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        
                        /* CAMPAIGN MODE 2: Campaign Detail Workspace (When campaign active) */
                        <div className="space-y-6">
                            
                            {/* Campaign Context Navigation */}
                            <div className="bg-gray-950 border border-gray-850 p-4 rounded-2xl flex items-center justify-between">
                                <button onClick={() => setSelectedCampaignId(null)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 border border-gray-800 hover:bg-gray-850 text-gray-300 text-xs font-bold rounded-xl transition-all cursor-pointer">
                                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Directory
                                </button>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-gray-500 font-mono font-bold">Active Workspace: {activeCampaign?.name.slice(0, 30)}...</span>
                                    {activeCampaign && (
                                        <button onClick={(e) => handleDeleteCampaign(activeCampaign.id, activeCampaign.name, e)}
                                            className="flex items-center gap-1 px-2.5 py-1 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-xs font-bold rounded-xl transition-all cursor-pointer">
                                            <Trash2 className="w-3 h-3" /> Delete Campaign
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Active Selected Avatar Badge */}
                            <div className="bg-gray-950 border border-violet-500/20 p-4 rounded-2xl flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-full bg-violet-600/20 border border-violet-500/40 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                        {avatars.find(a => a.id === selectedAvatarId)?.referenceImageUrl ? (
                                            <img src={avatars.find(a => a.id === selectedAvatarId)!.referenceImageUrl!} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <User className="w-5 h-5 text-violet-400" />
                                        )}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] uppercase tracking-wider font-bold text-violet-400 bg-violet-600/10 px-2 py-0.5 rounded border border-violet-500/20">Selected Cast Avatar</span>
                                            <span className="text-[10px] text-gray-500">Engine: {avatars.find(a => a.id === selectedAvatarId)?.voiceEngine || "elevenlabs"}</span>
                                        </div>
                                        <h4 className="text-xs font-bold text-white mt-0.5">{avatars.find(a => a.id === selectedAvatarId)?.name || "Select an Avatar from Left Panel"}</h4>
                                    </div>
                                </div>
                                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg">Active for Campaign</span>
                            </div>

                            {/* Product details Banner */}
                            {activeCampaign && (
                                <div className="bg-gray-950 border border-gray-850 p-5 rounded-3xl flex flex-col md:flex-row gap-5">
                                    <div className="w-24 h-24 bg-black/40 border border-gray-850 rounded-2xl overflow-hidden flex-shrink-0 flex items-center justify-center">
                                        {activeCampaign.imageUrls[0] ? (
                                            <img src={activeCampaign.imageUrls[0]} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <Package className="w-8 h-8 text-gray-700" />
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <h3 className="text-sm font-bold text-white">{activeCampaign.name}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    {activeCampaign.brand && <span className="text-[10px] bg-gray-900 border border-gray-850 px-2 py-0.5 rounded text-gray-400 font-sans">{activeCampaign.brand}</span>}
                                                    {activeCampaign.price && <span className="text-[10px] text-emerald-400 font-mono font-bold">{activeCampaign.price}</span>}
                                                </div>
                                            </div>
                                            <a href={activeCampaign.sourceUrl} target="_blank" rel="noreferrer"
                                                className="p-1.5 bg-gray-900 border border-gray-800 hover:bg-gray-850 text-gray-400 hover:text-white rounded-lg transition-all cursor-pointer">
                                                <ExternalLink className="w-4 h-4" />
                                            </a>
                                        </div>
                                        {activeCampaign.description && (
                                            <p className="text-[10px] text-gray-500 leading-relaxed font-sans line-clamp-3">
                                                {activeCampaign.description}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Campaign Video Generator Form */}
                            <div className="bg-gray-950 border border-gray-850 p-6 rounded-3xl space-y-6">
                                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Configure UGC Video Batch</h3>

                                <div className="space-y-5">
                                    
                                    {/* Hook selectors */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Hook Style Formula</label>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {HOOK_STYLES.map(h => (
                                                <button key={h.value} onClick={() => { setSelectedHookStyle(h.value); setSelectedPresetPack('SINGLE'); }}
                                                    className={cn("p-2.5 rounded-xl border text-left transition-all cursor-pointer font-sans",
                                                        selectedHookStyle === h.value && selectedPresetPack === 'SINGLE'
                                                            ? "border-violet-500 bg-violet-500/[0.04]" 
                                                            : "border-gray-850 hover:border-gray-800 bg-gray-900/20"
                                                    )}>
                                                    <div className="text-xs font-bold text-white">{h.label}</div>
                                                    <div className="text-[9px] text-gray-550 font-mono mt-0.5">{h.desc}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Visual Template Layout */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Visual Template Layout</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { value: "SPLIT", label: "Split Stacked", desc: "Top/Bottom Stack" },
                                                { value: "GREEN_SCREEN", label: "Green Screen", desc: "Chroma Key Background" },
                                                { value: "PIP", label: "PiP Bubble", desc: "Circular Video Bubble" },
                                            ].map(l => (
                                                <button key={l.value} onClick={() => setSelectedLayoutType(l.value)}
                                                    className={cn("p-2.5 rounded-xl border text-left transition-all cursor-pointer font-sans",
                                                        selectedLayoutType === l.value 
                                                            ? "border-violet-500 bg-violet-500/[0.04] ring-1 ring-violet-500/35" 
                                                            : "border-gray-850 hover:border-gray-800 bg-gray-900/20"
                                                    )}>
                                                    <div className="text-xs font-bold text-white">{l.label}</div>
                                                    <div className="text-[9px] text-gray-550 font-mono mt-0.5">{l.desc}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Batch Ad Pack Templates */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Batch Ads Presets (Week of Ads)</label>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <button onClick={() => setSelectedPresetPack(selectedPresetPack === 'TIKTOK_3X' ? 'SINGLE' : 'TIKTOK_3X')}
                                                className={cn("p-3 border rounded-2xl text-left transition-all cursor-pointer font-sans",
                                                    selectedPresetPack === 'TIKTOK_3X'
                                                        ? "bg-violet-500/10 border-violet-500 ring-1 ring-violet-500/40"
                                                        : "bg-gray-900 border-gray-850 hover:border-gray-700"
                                                )}>
                                                <div className="text-xs font-bold text-violet-400 flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-violet-400" /> TikTok Ads Pack (3x)</div>
                                                <div className="text-[9px] text-gray-500 mt-1 leading-normal">Selects Testimonial, Problem/Solution, and Comparison hooks for split-test ads.</div>
                                            </button>
                                            <button onClick={() => setSelectedPresetPack(selectedPresetPack === 'OMNICHANNEL_5X' ? 'SINGLE' : 'OMNICHANNEL_5X')}
                                                className={cn("p-3 border rounded-2xl text-left transition-all cursor-pointer font-sans",
                                                    selectedPresetPack === 'OMNICHANNEL_5X'
                                                        ? "bg-emerald-500/10 border-emerald-500 ring-1 ring-emerald-500/40"
                                                        : "bg-gray-900 border-gray-850 hover:border-gray-700"
                                                )}>
                                                <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-emerald-400" /> Omnichannel Campaign (5x)</div>
                                                <div className="text-[9px] text-gray-500 mt-1 leading-normal">Selects a whole week of unique hooks (Unboxing, Testimonial, Tutorial, Comparison, Problem/Solution).</div>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Custom Script text drawer */}
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 cursor-pointer font-sans">
                                            <input type="checkbox" checked={useCustomScript} onChange={e => setUseCustomScript(e.target.checked)}
                                                className="rounded bg-gray-900 border-gray-800 text-violet-600 focus:ring-0 focus:ring-offset-0" />
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider select-none">Write custom UGC script (Optional)</span>
                                        </label>
                                        
                                        {useCustomScript ? (
                                            <textarea placeholder="Write the exact script dialog (e.g. Hey guys, Sarah here...)" value={customScript} onChange={e => setCustomScript(e.target.value)} rows={4}
                                                className="w-full bg-gray-900 border border-gray-800 focus:border-violet-500 rounded-2xl p-3.5 text-xs text-white focus:outline-none leading-relaxed font-sans resize-none" />
                                        ) : (
                                            <p className="text-[10px] text-gray-550 leading-relaxed font-sans italic bg-gray-900/30 border border-gray-850/50 p-3 rounded-xl">
                                                If custom script is unchecked, the AI assistance drafts a viral script dynamically matching the product scraped details and selected avatar persona.
                                            </p>
                                        )}
                                    </div>

                                    {/* Dispatch batch button */}
                                    <button onClick={handleGenerateUGCVideo} disabled={!selectedAvatarId || generatingVideo}
                                        className="w-full flex items-center justify-center gap-1.5 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold text-xs rounded-2xl transition-all shadow-md font-sans cursor-pointer uppercase tracking-wider">
                                        {generatingVideo ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" /> Queuing Generation...
                                            </>
                                        ) : (
                                            <>
                                                <Wand2 className="w-4 h-4" /> Queue UGC Generation
                                            </>
                                        )}
                                    </button>

                                </div>
                            </div>

                            {/* Campaign Nested Video Explorer */}
                            <div className="bg-gray-950 border border-gray-850 p-6 rounded-3xl space-y-4">
                                <h3 className="text-xs font-bold text-white uppercase tracking-wider border-b border-gray-850 pb-2">Campaign Video Hierarchy</h3>
                                
                                {campaignJobs.length === 0 ? (
                                    <div className="text-center py-12 bg-black/10 border border-dashed border-gray-850 rounded-2xl">
                                        <Play className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                                        <p className="text-[11px] text-gray-500 font-sans">No videos queued for this campaign yet.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {campaignJobs.map(job => (
                                            <div key={job.id} className="bg-gray-900/60 border border-gray-850 p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-start md:items-center">
                                                
                                                {/* Left Details */}
                                                <div className="flex-1 min-w-0 space-y-1">
                                                    <div className="flex items-center gap-3">
                                                        <h4 className="text-xs font-bold text-white">{job.avatar.name}</h4>
                                                        <span className="text-[8px] font-mono text-gray-500">#{job.id.slice(-6)}</span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2 items-center">
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-950 border border-gray-800 text-gray-400 font-bold">
                                                            {job.hookStyle}
                                                        </span>
                                                        <span className={cn("text-[9px] font-bold px-1.5 py-0.5 border rounded uppercase font-mono", STATUS_COLORS[job.status] || "text-gray-400")}>
                                                            {["GENERATING_VIDEO", "COMPOSITING", "GENERATING_SCRIPT"].includes(job.status) && (
                                                                <Loader2 className="w-2.5 h-2.5 animate-spin inline mr-1" />
                                                            )}
                                                            {job.status}
                                                        </span>
                                                    </div>
                                                    {job.script && (
                                                        <p className="text-[10px] text-gray-450 leading-relaxed font-sans line-clamp-2 bg-black/25 border border-gray-950 p-2 rounded-lg mt-2">
                                                            "{job.script}"
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Right Video Preview Player & Actions */}
                                                <div className="flex items-center gap-3 w-full md:w-auto">
                                                    <div className="w-full md:w-36 aspect-video bg-black/40 border border-gray-850 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center">
                                                        {job.status === "DONE" && job.outputUrl ? (
                                                            <video src={`/api/storage/signed?key=${job.outputUrl}`} controls className="w-full h-full object-cover" />
                                                        ) : job.status === "FAILED" ? (
                                                            <div className="text-center p-2"><XCircle className="w-5 h-5 text-red-500 mx-auto" /><span className="text-[8px] text-red-400 mt-1 block font-sans">Failed</span></div>
                                                        ) : (
                                                            <div className="text-center p-2 text-gray-600"><Loader2 className="w-5 h-5 animate-spin mx-auto text-violet-500" /><span className="text-[8px] mt-1 block font-sans">Generating...</span></div>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteJob(job.id)}
                                                        title="Delete Ad Video"
                                                        className="p-2 bg-gray-900 border border-gray-800 hover:border-red-500/50 hover:bg-red-500/10 text-gray-500 hover:text-red-400 rounded-xl transition-all cursor-pointer flex-shrink-0"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>

                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                        </div>
                    )}
                </div>

            </div>

            {/* R2 Avatar Picker Modal */}
            {pickingAvatarId !== null && (
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
                            <button onClick={() => setPickingAvatarId(null)}
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
