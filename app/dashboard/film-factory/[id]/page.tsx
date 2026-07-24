"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    ArrowLeft,
    Film,
    Tv,
    Users,
    Layers,
    Play,
    Loader2,
    RefreshCw,
    CheckCircle2,
    Clock,
    Sparkles,
    ChevronRight,
    Camera,
    Image as ImageIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function MasterShowHubPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [doc, setDoc] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [regeneratingAsset, setRegeneratingAsset] = useState<string | null>(null);

    const fetchDoc = useCallback(async () => {
        const res = await fetch(`/api/documentary/${id}`);
        if (!res.ok) { router.push("/dashboard/film-factory"); return; }
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

    const handleRegenerateAsset = async (assetId: string) => {
        setRegeneratingAsset(assetId);
        try {
            await fetch(`/api/documentary/assets/${assetId}/regenerate`, { method: "POST" });
            fetchDoc();
        } catch (err: any) {
            alert("Failed to regenerate asset");
        } finally {
            setRegeneratingAsset(null);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
                <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                <p className="text-xs text-gray-400 font-medium">Loading Show Hub...</p>
            </div>
        );
    }

    if (!doc) return null;

    const episodes = doc.scenes || [];
    const assets = doc.assets || [];

    return (
        <div className="space-y-6">
            {/* Top Navigation */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <Link
                    href="/dashboard/film-factory"
                    className="inline-flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to Film Factory
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

            {/* Show Master Header */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 relative overflow-hidden">
                <div className="flex items-start justify-between flex-wrap gap-4 relative z-10">
                    <div className="space-y-2 max-w-3xl">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 font-bold text-[10px] uppercase tracking-wider">
                                📺 TV Mini-Series
                            </span>
                            <span className="px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-300 font-bold text-[10px] uppercase tracking-wider">
                                {(doc.genre || "Drama").replace(/_/g, " ")}
                            </span>
                            <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider",
                                doc.status === "SCENES_PLANNED" ? "bg-emerald-500/15 text-emerald-400" :
                                    doc.status === "GENERATING" ? "bg-violet-500/15 text-violet-400 animate-pulse" : "bg-gray-800 text-gray-400"
                            )}>
                                {doc.status}
                            </span>
                        </div>

                        <h1 className="text-3xl font-black text-white tracking-tight">
                            {doc.title.replace(/\(Mini-Series\)/g, "").trim()}
                        </h1>

                        <p className="text-xs text-gray-400 leading-relaxed">
                            {doc.narrationText || doc.script || "Character-driven story series"}
                        </p>
                    </div>

                    <div className="flex items-center gap-3 bg-black/40 border border-gray-800 rounded-xl p-3 text-xs text-gray-400">
                        <div>
                            <span className="block text-[10px] text-gray-500 font-bold uppercase">Total Episodes</span>
                            <span className="text-base font-bold text-white">{episodes.length}</span>
                        </div>
                        <div className="w-px h-8 bg-gray-800" />
                        <div>
                            <span className="block text-[10px] text-gray-500 font-bold uppercase">Cast Members</span>
                            <span className="text-base font-bold text-white">{assets.length}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Section 1: Cast Asset Gallery (7 Master Face Reference Anchors) */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-amber-500" />
                        Cast Roster & Face References ({assets.length})
                    </h2>
                    <span className="text-xs text-gray-500">FLUX 1.1 Pro + PuLID Face Anchors</span>
                </div>

                {assets.length === 0 ? (
                    <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-6 text-center text-xs text-gray-500">
                        No cast assets created yet.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {assets.map((asset: any) => (
                            <div key={asset.id} className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 space-y-3">
                                <div className="aspect-square bg-gray-950 rounded-lg overflow-hidden relative border border-gray-800 flex items-center justify-center">
                                    {asset.imageUrl ? (
                                        <img src={asset.imageUrl} alt={asset.label} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="text-center p-3">
                                            <ImageIcon className="w-8 h-8 text-gray-600 mx-auto mb-1" />
                                            <span className="text-[10px] text-gray-500">Rendering Face Anchor...</span>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => handleRegenerateAsset(asset.id)}
                                        disabled={regeneratingAsset === asset.id}
                                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black text-white text-xs backdrop-blur cursor-pointer"
                                        title="Re-render character portrait"
                                    >
                                        <RefreshCw className={cn("w-3.5 h-3.5", regeneratingAsset === asset.id && "animate-spin")} />
                                    </button>
                                </div>

                                <div>
                                    <h4 className="text-xs font-bold text-white truncate">{asset.label}</h4>
                                    <p className="text-[10px] text-gray-400 line-clamp-2 mt-0.5">{asset.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Section 2: Dedicated Episode Directory */}
            <div className="space-y-3 pt-4 border-t border-gray-800">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Film className="w-5 h-5 text-violet-500" />
                    Episode Directory ({episodes.length})
                </h2>

                <div className="space-y-3">
                    {episodes.map((epScene: any, epIdx: number) => {
                        const epNum = epScene.sceneIndex || epIdx + 1;
                        const shotCount = epScene.shots?.length || 0;

                        return (
                            <div
                                key={epScene.id}
                                className="bg-gray-900/60 border border-gray-800 hover:border-violet-500/50 rounded-2xl p-5 transition-all flex items-center justify-between flex-wrap gap-4 group"
                            >
                                <div className="space-y-1 max-w-xl">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2.5 py-0.5 rounded-full bg-violet-600/20 text-violet-300 font-extrabold text-[10px] uppercase">
                                            Episode {epNum}
                                        </span>
                                        <span className="text-xs text-gray-500 font-mono">{shotCount} visual shots</span>
                                    </div>
                                    <h3 className="text-base font-bold text-white group-hover:text-violet-300 transition-colors">
                                        {epScene.title?.startsWith("Episode") ? epScene.title : `Episode ${epNum}: ${epScene.title}`}
                                    </h3>
                                    <p className="text-xs text-gray-400 line-clamp-2">{epScene.narrationText || "Episode screenplay beat"}</p>
                                </div>

                                <Link
                                    href={`/dashboard/film-factory/${doc.id}/episode/${epNum}`}
                                    className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-violet-600/20"
                                >
                                    🎬 Open Episode {epNum} Context
                                    <ChevronRight className="w-4 h-4" />
                                </Link>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
