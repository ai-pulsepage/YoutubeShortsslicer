"use client";

import { useState, useEffect } from "react";
import {
    Loader2, Trash2, RefreshCw, Layers, Film, Sparkles, Download, Play, AlertTriangle
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type QueuedJob = {
    id: string;
    documentaryId?: string;
    type: string;
    prompt: string;
    queueName: string;
    sourceApp: string;
    projectTitle: string;
    status: string;
};

export default function CentralQueueMonitorPage() {
    const [jobs, setJobs] = useState<QueuedJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [cancelingId, setCancelingId] = useState<string | null>(null);
    const [filterApp, setFilterApp] = useState<string>("all");
    const [error, setError] = useState("");

    const loadJobs = async (silent = false) => {
        if (!silent) setRefreshing(true);
        try {
            const res = await fetch("/api/queue/jobs");
            if (!res.ok) throw new Error("Failed to load queue statistics");
            const data = await res.json();
            setJobs(data.jobs || []);
            setError("");
        } catch (err: any) {
            setError(err.message || "Could not reach queue monitor API.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Auto poll queue state every 5 seconds
    useEffect(() => {
        loadJobs();
        const interval = setInterval(() => {
            loadJobs(true);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleCancelJob = async (jobId: string, queueName: string) => {
        if (!confirm("Are you sure you want to stop and delete this job from the queue?")) return;
        setCancelingId(jobId);
        setError("");
        try {
            const res = await fetch("/api/queue/jobs", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jobId, queueName })
            });
            if (!res.ok) throw new Error("Failed to remove job from queue");
            
            // Instantly update local list state
            setJobs(prev => prev.filter(j => j.id !== jobId));
        } catch (err: any) {
            setError(err.message || "Failed to cancel job.");
        } finally {
            setCancelingId(null);
        }
    };

    const handleClearAll = async () => {
        if (!confirm("WARNING: This will cancel ALL queued jobs in the current filtered list. Proceed?")) return;
        setError("");
        setRefreshing(true);
        try {
            const activeFiltered = filteredJobs;
            for (const j of activeFiltered) {
                await fetch("/api/queue/jobs", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jobId: j.id, queueName: j.queueName })
                });
            }
            await loadJobs();
        } catch (err: any) {
            setError("Failed to clear some jobs.");
        } finally {
            setRefreshing(false);
        }
    };

    const filteredJobs = jobs.filter(j => {
        if (filterApp === "all") return true;
        return j.sourceApp.toLowerCase().includes(filterApp.toLowerCase());
    });

    const getAppIcon = (app: string) => {
        if (app.includes("Shorts")) return <Film className="w-3.5 h-3.5 text-violet-400" />;
        if (app.includes("UGC")) return <Sparkles className="w-3.5 h-3.5 text-amber-400" />;
        return <Download className="w-3.5 h-3.5 text-blue-400" />;
    };

    const getAppBadgeStyles = (app: string) => {
        if (app.includes("Shorts")) return "bg-violet-950/40 text-violet-300 border-violet-800/40";
        if (app.includes("UGC")) return "bg-amber-950/40 text-amber-300 border-amber-800/40";
        return "bg-blue-950/40 text-blue-300 border-blue-800/40";
    };

    return (
        <div className="space-y-6 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 pb-4 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2">
                        <Layers className="w-8 h-8 text-violet-500" /> Server Queue Monitor
                    </h1>
                    <p className="text-gray-400 mt-1 text-sm">
                        Universal control panel to track, filter, and cancel background synthesis jobs across all factory pipelines.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => loadJobs()} disabled={refreshing}
                        className="p-2 bg-gray-900 border border-gray-800 rounded-xl hover:bg-gray-800 transition text-gray-400 hover:text-white disabled:opacity-50">
                        <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
                    </button>
                    {filteredJobs.length > 0 && (
                        <button onClick={handleClearAll}
                            className="flex items-center gap-1.5 px-4 py-2 bg-red-950/30 hover:bg-red-950/60 border border-red-900/35 hover:border-red-900/60 text-red-400 text-xs font-bold rounded-xl transition shadow">
                            <Trash2 className="w-3.5 h-3.5" /> Clear Filtered Queue
                        </button>
                    )}
                </div>
            </div>

            {/* Error banner */}
            {error && (
                <div className="flex items-center gap-2 bg-red-950/20 border border-red-900/30 text-red-400 text-xs p-3.5 rounded-xl">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Filter buttons */}
            <div className="flex gap-2 overflow-x-auto pb-1">
                {[
                    { id: "all", label: "All Pipelines", count: jobs.length },
                    { id: "shorts", label: "Animated Shorts", count: jobs.filter(j => j.sourceApp.includes("Shorts")).length },
                    { id: "ugc", label: "UGC / Render", count: jobs.filter(j => j.sourceApp.includes("UGC")).length },
                    { id: "slicer", label: "Video Ingestion Slicer", count: jobs.filter(j => j.sourceApp.includes("Slicer")).length }
                ].map(tab => (
                    <button key={tab.id} onClick={() => setFilterApp(tab.id)}
                        className={cn("px-4 py-1.5 rounded-xl border text-xs font-semibold transition flex items-center gap-2",
                            filterApp === tab.id
                                ? "bg-violet-600 border-violet-500 text-white"
                                : "bg-gray-900 border-gray-800 text-gray-400 hover:text-white hover:bg-gray-850"
                        )}>
                        <span>{tab.label}</span>
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px]", 
                            filterApp === tab.id ? "bg-violet-700 text-white" : "bg-gray-800 text-gray-500")}>
                            {tab.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* Jobs Content List */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3 bg-gray-900/20 border border-gray-850 rounded-3xl">
                    <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                    <span className="text-xs text-gray-500">Retrieving server queue lists...</span>
                </div>
            ) : filteredJobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 bg-gray-900/20 border border-gray-850 rounded-3xl text-center">
                    <div className="w-12 h-12 bg-gray-850 border border-gray-800 rounded-2xl flex items-center justify-center text-gray-500">
                        <Layers className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-sm font-bold text-white">Queue is Empty</h3>
                        <p className="text-xs text-gray-500 max-w-xs px-4">
                            There are currently no active or waiting generation jobs lined up for workers.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="bg-gray-900/20 border border-gray-850 rounded-3xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-gray-850 bg-black/15 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                    <th className="py-4.5 px-6">Pipeline / App</th>
                                    <th className="py-4.5 px-6">Project Context</th>
                                    <th className="py-4.5 px-6">Job Type</th>
                                    <th className="py-4.5 px-6">Prompt / Payload</th>
                                    <th className="py-4.5 px-6">Queue Status</th>
                                    <th className="py-4.5 px-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-850/65">
                                {filteredJobs.map(job => (
                                    <tr key={job.id} className="hover:bg-gray-855/20 text-xs text-gray-300 transition-colors">
                                        <td className="py-4 px-6">
                                            <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold", getAppBadgeStyles(job.sourceApp))}>
                                                {getAppIcon(job.sourceApp)}
                                                {job.sourceApp}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6 font-semibold text-white max-w-[150px] truncate">
                                            {job.projectTitle}
                                        </td>
                                        <td className="py-4 px-6 font-mono text-[10px] text-gray-450 uppercase tracking-wide">
                                            {job.type}
                                        </td>
                                        <td className="py-4 px-6 max-w-[280px]">
                                            <p className="truncate text-gray-400" title={job.prompt}>
                                                {job.prompt}
                                            </p>
                                        </td>
                                        <td className="py-4 px-6">
                                            <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider",
                                                job.status === "active" ? "text-amber-400" : "text-violet-400"
                                            )}>
                                                <span className={cn("w-1.5 h-1.5 rounded-full",
                                                    job.status === "active" ? "bg-amber-400 animate-ping" : "bg-violet-500"
                                                )} />
                                                {job.status}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6 text-right">
                                            <button onClick={() => handleCancelJob(job.id, job.queueName)}
                                                disabled={cancelingId === job.id}
                                                className="p-2 bg-gray-850/50 hover:bg-red-955/20 border border-gray-800 hover:border-red-900/35 text-gray-500 hover:text-red-400 rounded-xl transition disabled:opacity-50 inline-flex items-center justify-center">
                                                {cancelingId === job.id ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
