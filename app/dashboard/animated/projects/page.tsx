"use client";

import { useState, useEffect } from "react";
import {
    Loader2, Trash2, FolderOpen, Play, Calendar, Film, Users, ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type SavedProject = {
    id: string;
    title: string;
    script: string;
    status: string;
    finalVideoPath?: string;
    characters: any[];
    scenes: any[];
};

export default function AnimatedProjectsManagerPage() {
    const router = useRouter();
    const [projects, setProjects] = useState<SavedProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [queuingId, setQueuingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    const loadProjects = async () => {
        try {
            const res = await fetch("/api/animated/projects");
            if (res.ok) {
                const data = await res.json();
                setProjects(data.projects || []);
            }
        } catch (err) {
            console.error("Failed to load projects:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProjects();
    }, []);

    const handleDeleteProject = async (id: string, title: string) => {
        if (!confirm(`Are you sure you want to delete "${title}"? This will permanently erase the project workspace.`)) return;
        setDeletingId(id);
        setError("");
        setSuccessMessage("");
        try {
            const res = await fetch("/api/animated/projects", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id })
            });
            if (!res.ok) throw new Error("Failed to delete project");
            setSuccessMessage(`"${title}" has been deleted.`);
            await loadProjects();
        } catch (err: any) {
            setError(err.message || "Failed to delete project.");
        } finally {
            setDeletingId(null);
        }
    };

    const handleBatchQueue = async (id: string, title: string) => {
        setQueuingId(id);
        setError("");
        setSuccessMessage("");
        try {
            const res = await fetch("/api/animated/projects/batch-queue", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId: id })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to queue batch");

            setSuccessMessage(
                `Successfully queued batch for "${title}"! Queued ${data.queuedAvatarsCount} avatars and ${data.queuedShotsCount} video scenes. You can now start your RunPod worker to process the queue.`
            );
        } catch (err: any) {
            setError(err.message || "Failed to start batch queue.");
        } finally {
            setQueuingId(null);
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
                        <span className="text-violet-400">Projects Manager</span>
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Saved Projects Manager</h1>
                    <p className="text-gray-400 mt-1 text-sm">Manage your saved short movie drafts, delete duplicates, or fire batch runs to the video generators.</p>
                </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-4 border-b border-gray-800 pb-2">
                <Link href="/dashboard/animated" className="text-sm font-semibold text-gray-500 hover:text-gray-300 pb-1.5 font-sans">
                    Story Timeline
                </Link>
                <Link href="/dashboard/animated/projects" className="text-sm font-bold text-violet-400 border-b-2 border-violet-500 pb-1.5 font-sans">
                    Projects Manager
                </Link>
                <Link href="/dashboard/animated/characters" className="text-sm font-semibold text-gray-500 hover:text-gray-300 pb-1.5 font-sans">
                    Cast Library
                </Link>
            </div>

            {/* Status Notifications */}
            {error && (
                <div className="bg-red-950/40 border border-red-900/50 p-4 rounded-xl text-xs text-red-300 leading-normal font-sans">
                    <p className="font-bold mb-1">Notice</p>
                    <p>{error}</p>
                </div>
            )}
            {successMessage && (
                <div className="bg-emerald-950/40 border border-emerald-900/50 p-4 rounded-xl text-xs text-emerald-300 leading-normal font-sans">
                    <p className="font-bold mb-1">Success</p>
                    <p>{successMessage}</p>
                </div>
            )}

            {/* Projects List Grid */}
            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>
            ) : projects.length === 0 ? (
                <div className="bg-gray-955/10 border border-gray-850 rounded-2xl p-16 text-center">
                    <FolderOpen className="w-12 h-12 text-gray-650 mx-auto mb-4" />
                    <h3 className="text-md font-bold text-white">No Saved Projects</h3>
                    <p className="text-gray-400 text-xs mt-2 max-w-sm mx-auto leading-relaxed font-sans">Create a story and click "Save Project" inside the Story Timeline builder to see it here.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {projects.map(proj => (
                        <div key={proj.id} className="bg-gray-955/20 border border-gray-850 p-5 rounded-2xl flex flex-col justify-between space-y-4 relative group">
                            
                            {/* Delete button */}
                            <button 
                                onClick={() => handleDeleteProject(proj.id, proj.title)}
                                disabled={deletingId === proj.id}
                                className="absolute top-3 right-3 p-1.5 bg-gray-850 hover:bg-red-955/20 border border-gray-800 hover:border-red-900/30 text-gray-500 hover:text-red-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50">
                                {deletingId === proj.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </button>

                            <div className="space-y-2">
                                <h3 className="text-md font-bold text-white pr-6">{proj.title}</h3>
                                {proj.script && (
                                    <p className="text-xs text-gray-450 line-clamp-2 leading-relaxed font-sans">
                                        {proj.script}
                                    </p>
                                )}

                                <div className="flex flex-wrap items-center gap-4 text-[10px] text-gray-500 pt-1">
                                    <span className="flex items-center gap-1 font-sans">
                                        <Users className="w-3.5 h-3.5 text-violet-400/80" /> {proj.characters?.length || 0} Cast
                                    </span>
                                    <span className="flex items-center gap-1 font-sans">
                                        <Film className="w-3.5 h-3.5 text-blue-400/80" /> {proj.scenes?.length || 0} Scenes
                                    </span>
                                    <span className="flex items-center gap-1 font-sans">
                                        <Calendar className="w-3.5 h-3.5 text-emerald-400/80" /> ID: {proj.id.substring(0, 8)}...
                                    </span>
                                </div>
                            </div>

                            <div className="flex gap-2 pt-3 border-t border-gray-850/60 justify-end">
                                <button 
                                    onClick={() => handleBatchQueue(proj.id, proj.title)}
                                    disabled={queuingId === proj.id}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-violet-600/10 border border-violet-500/20 hover:bg-violet-600/20 text-violet-400 text-xs font-bold rounded-xl transition-all disabled:opacity-55 font-sans">
                                    {queuingId === proj.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                    Queue All Visuals
                                </button>
                                <button 
                                    onClick={() => router.push(`/dashboard/animated?project=${proj.id}`)}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl transition-all shadow-md font-sans">
                                    <FolderOpen className="w-3.5 h-3.5" />
                                    Open Project
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
