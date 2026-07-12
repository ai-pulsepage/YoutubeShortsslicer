"use client";

import { useState, useEffect } from "react";
import {
    Folder,
    File,
    Film,
    Music,
    Image as ImageIcon,
    FileText,
    Trash2,
    Copy,
    ChevronRight,
    ArrowLeft,
    ExternalLink,
    Loader2,
    RefreshCw,
    Download,
    Eye
} from "lucide-react";
import { cn } from "@/lib/utils";

type R2File = {
    key: string;
    size: number;
    lastModified: string;
};

export default function StorageExplorerPage() {
    const [currentPrefix, setCurrentPrefix] = useState<string>("");
    const [folders, setFolders] = useState<string[]>([]);
    const [files, setFiles] = useState<R2File[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>("");
    
    // Preview overlay state
    const [previewKey, setPreviewKey] = useState<string | null>(null);
    const [previewType, setPreviewType] = useState<"video" | "image" | "audio" | "other" | null>(null);

    const fetchObjects = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/storage/list?prefix=${encodeURIComponent(currentPrefix)}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to fetch storage items");
            
            setFolders(data.folders || []);
            setFiles(data.files || []);
        } catch (err: any) {
            setError(err.message || "Failed to load objects from R2 storage.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchObjects();
    }, [currentPrefix]);

    const handleDelete = async (key: string) => {
        if (!confirm(`Are you sure you want to permanently delete "${key}"?`)) return;
        
        try {
            const res = await fetch("/api/storage/list", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to delete file");
            
            // Refresh list
            fetchObjects();
        } catch (err: any) {
            alert(err.message || "Error deleting file.");
        }
    };

    const handleCopyKey = (key: string) => {
        navigator.clipboard.writeText(key);
        alert(`Copied key: "${key}" to clipboard!`);
    };

    // Format file sizes
    const formatBytes = (bytes: number) => {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    // Resolve extension-based icon
    const getFileIcon = (key: string) => {
        const ext = key.split(".").pop()?.toLowerCase();
        if (["mp4", "webm", "mkv", "avi"].includes(ext || "")) return <Film className="w-5 h-5 text-violet-400" />;
        if (["mp3", "wav", "m4a", "ogg"].includes(ext || "")) return <Music className="w-5 h-5 text-emerald-400" />;
        if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext || "")) return <ImageIcon className="w-5 h-5 text-amber-400" />;
        return <FileText className="w-5 h-5 text-gray-400" />;
    };

    const handlePreview = (key: string) => {
        const ext = key.split(".").pop()?.toLowerCase();
        let type: "video" | "image" | "audio" | "other" = "other";
        
        if (["mp4", "webm", "mkv", "avi"].includes(ext || "")) type = "video";
        else if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext || "")) type = "image";
        else if (["mp3", "wav", "m4a", "ogg"].includes(ext || "")) type = "audio";
        
        setPreviewType(type);
        setPreviewKey(key);
    };

    // Parse folder name for display
    const getFolderDisplayName = (prefix: string) => {
        const parts = prefix.split("/").filter(Boolean);
        return parts[parts.length - 1] + "/";
    };

    // Navigate to parent folder
    const handleNavigateUp = () => {
        const parts = currentPrefix.split("/").filter(Boolean);
        parts.pop();
        setCurrentPrefix(parts.length > 0 ? parts.join("/") + "/" : "");
    };

    // Breadcrumb list builder
    const getBreadcrumbs = () => {
        const parts = currentPrefix.split("/").filter(Boolean);
        const list: { name: string; prefix: string }[] = [{ name: "Root", prefix: "" }];
        
        let path = "";
        parts.forEach(p => {
            path += p + "/";
            list.push({ name: p, prefix: path });
        });
        
        return list;
    };

    return (
        <div className="space-y-6 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 pb-4 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2">
                        Cloud Storage Explorer
                    </h1>
                    <p className="text-gray-400 mt-1 text-sm font-sans">
                        Browse, inspect, and manage raw video clips, avatars, and audio tracks stored in Cloudflare R2.
                    </p>
                </div>
                <button onClick={fetchObjects} disabled={loading}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gray-850 hover:bg-gray-800 text-gray-300 text-xs font-bold rounded-xl border border-gray-750 transition-all cursor-pointer">
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Refresh Bucket
                </button>
            </div>

            {/* Navigation & Breadcrumbs */}
            <div className="bg-gray-950 border border-gray-850 p-4 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
                    {getBreadcrumbs().map((b, idx) => (
                        <div key={idx} className="flex items-center">
                            {idx > 0 && <ChevronRight className="w-3 h-3 text-gray-650 mx-1" />}
                            <button onClick={() => setCurrentPrefix(b.prefix)}
                                className={cn("hover:text-violet-400 transition-all font-mono font-bold",
                                    idx === getBreadcrumbs().length - 1 ? "text-violet-400 font-extrabold" : "text-gray-500"
                                )}>
                                {b.name}
                            </button>
                        </div>
                    ))}
                </div>

                {currentPrefix && (
                    <button onClick={handleNavigateUp}
                        className="flex items-center gap-1 text-[10px] bg-gray-900 border border-gray-800 hover:bg-gray-850 px-2 py-1 rounded-lg text-gray-450 hover:text-white transition-all font-sans cursor-pointer">
                        <ArrowLeft className="w-3 h-3" /> Back
                    </button>
                )}
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-400 text-xs leading-relaxed font-sans">
                    {error}
                </div>
            )}

            {/* Browser Content */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3 bg-black/10 border border-gray-850 rounded-3xl">
                    <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                    <span className="text-xs text-gray-500 font-sans">Querying Cloudflare R2 bucket...</span>
                </div>
            ) : folders.length === 0 && files.length === 0 ? (
                <div className="text-center py-24 bg-black/10 border border-dashed border-gray-850 rounded-3xl space-y-2">
                    <Folder className="w-10 h-10 text-gray-700 mx-auto" />
                    <h3 className="text-sm font-bold text-gray-400">Folder is empty</h3>
                    <p className="text-[11px] text-gray-550 font-sans max-w-xs mx-auto">No directories or files match this prefix prefix query in the R2 bucket.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6">
                    {/* Folders Section */}
                    {folders.length > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Directories</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                {folders.map((f, idx) => (
                                    <button key={idx} onClick={() => setCurrentPrefix(f)}
                                        className="flex items-center gap-3 p-4 bg-gray-950 hover:bg-gray-900/60 border border-gray-850 hover:border-violet-500/25 rounded-2xl text-left transition-all group cursor-pointer">
                                        <Folder className="w-7 h-7 text-violet-500 group-hover:scale-105 transition-all" />
                                        <div className="min-w-0">
                                            <div className="text-xs font-bold text-white truncate">{getFolderDisplayName(f)}</div>
                                            <div className="text-[9px] text-gray-550 font-sans mt-0.5">Virtual Folder</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Files Section */}
                    {files.length > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Files</h3>
                            <div className="bg-gray-950 border border-gray-850 rounded-3xl overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                            <tr className="border-b border-gray-850 bg-gray-900/40 text-gray-400 font-bold font-sans">
                                                <th className="p-4">Name / Key</th>
                                                <th className="p-4">Size</th>
                                                <th className="p-4">Last Modified</th>
                                                <th className="p-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-850 bg-gray-955/5">
                                            {files.map((file, idx) => (
                                                <tr key={idx} className="hover:bg-gray-900/25 transition-all">
                                                    <td className="p-4 font-mono font-medium text-white max-w-xs md:max-w-md">
                                                        <div className="flex items-center gap-3">
                                                            {getFileIcon(file.key)}
                                                            <span className="truncate block" title={file.key}>{file.key.split("/").pop()}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-gray-450 font-sans">{formatBytes(file.size)}</td>
                                                    <td className="p-4 text-gray-450 font-sans">{new Date(file.lastModified).toLocaleString()}</td>
                                                    <td className="p-4 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <button onClick={() => handlePreview(file.key)} title="Preview File"
                                                                className="p-1.5 bg-gray-900 hover:bg-gray-850 border border-gray-800 text-gray-400 hover:text-white rounded-lg transition-all cursor-pointer">
                                                                <Eye className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button onClick={() => handleCopyKey(file.key)} title="Copy Object Key"
                                                                className="p-1.5 bg-gray-900 hover:bg-gray-850 border border-gray-800 text-gray-400 hover:text-white rounded-lg transition-all cursor-pointer">
                                                                <Copy className="w-3.5 h-3.5" />
                                                            </button>
                                                            <a href={`/api/storage/signed?key=${file.key}`} target="_blank" rel="noreferrer" title="Download File"
                                                                className="p-1.5 bg-gray-900 hover:bg-gray-850 border border-gray-800 text-gray-400 hover:text-white rounded-lg transition-all cursor-pointer">
                                                                <Download className="w-3.5 h-3.5" />
                                                            </a>
                                                            <button onClick={() => handleDelete(file.key)} title="Delete Object"
                                                                className="p-1.5 bg-red-955/15 hover:bg-red-955/35 border border-red-900/30 hover:border-red-900/50 text-red-400 rounded-lg transition-all cursor-pointer">
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Media Preview Drawer Modal */}
            {previewKey && previewType && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-950 border border-gray-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in fade-in-50 zoom-in-95 duration-150">
                        {/* Header */}
                        <div className="p-4 border-b border-gray-850 flex items-center justify-between bg-gray-900/30">
                            <div className="min-w-0">
                                <h3 className="text-xs font-bold text-white uppercase tracking-wider">File Preview</h3>
                                <p className="text-[10px] text-gray-450 font-mono truncate mt-0.5">{previewKey.split("/").pop()}</p>
                            </div>
                            <button onClick={() => { setPreviewKey(null); setPreviewType(null); }}
                                className="p-1.5 bg-gray-850 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg border border-gray-800 transition-all text-[10px] font-bold font-mono">
                                CLOSE
                             </button>
                        </div>

                        {/* Preview Player Container */}
                        <div className="p-8 flex items-center justify-center bg-black/30 flex-1 min-h-[300px]">
                            {previewType === "video" && (
                                <video src={`/api/storage/signed?key=${previewKey}`} controls autoPlay className="max-w-full max-h-[45vh] rounded-2xl border border-gray-850 shadow-lg" />
                            )}
                            {previewType === "audio" && (
                                <div className="text-center space-y-4 w-full max-w-sm">
                                    <Music className="w-16 h-16 text-emerald-500 mx-auto animate-pulse" />
                                    <audio src={`/api/storage/signed?key=${previewKey}`} controls autoPlay className="w-full" />
                                </div>
                            )}
                            {previewType === "image" && (
                                <img src={`/api/storage/signed?key=${previewKey}`} alt="" className="max-w-full max-h-[45vh] rounded-2xl object-contain border border-gray-850 shadow-lg" />
                            )}
                            {previewType === "other" && (
                                <div className="text-center space-y-3">
                                    <FileText className="w-16 h-16 text-gray-600 mx-auto" />
                                    <p className="text-xs text-gray-400 font-sans">No inline preview available for this file type.</p>
                                    <a href={`/api/storage/signed?key=${previewKey}`} target="_blank" rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl transition-all font-sans">
                                        <ExternalLink className="w-3.5 h-3.5" /> Download / Open in Browser
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
