"use client";

import { useState } from "react";
import { Download, Link2, Youtube, AlertCircle, Loader2 } from "lucide-react";

export default function IngestPage() {
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const detectPlatform = (u: string) => {
        if (u.includes("youtube.com") || u.includes("youtu.be")) return "YouTube";
        if (u.includes("vimeo.com")) return "Vimeo";
        if (u.includes("tiktok.com")) return "TikTok";
        if (u.includes("instagram.com")) return "Instagram";
        if (u.includes("twitch.tv")) return "Twitch";
        return "Unknown";
    };

    const platform = url ? detectPlatform(url) : null;

    const handleSubmit = async () => {
        if (!url.trim()) return;
        setLoading(true);
        setError("");
        // Phase 3 will implement the actual download
        setTimeout(() => {
            setError("Ingestion pipeline not yet implemented (Phase 3)");
            setLoading(false);
        }, 1500);
    };

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-white">Ingest Video</h1>
                <p className="text-gray-400 text-sm mt-1">
                    Paste a video URL to download and process it
                </p>
            </div>

            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-4">
                <div className="relative">
                    <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                        type="url"
                        value={url}
                        onChange={(e) => {
                            setUrl(e.target.value);
                            setError("");
                        }}
                        placeholder="https://youtube.com/watch?v=..."
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-12 pr-4 py-4 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors text-sm"
                    />
                </div>

                {platform && (
                    <div className="flex items-center gap-2 text-sm">
                        <Youtube className="w-4 h-4 text-violet-400" />
                        <span className="text-gray-400">
                            Detected: <span className="text-white font-medium">{platform}</span>
                        </span>
                    </div>
                )}

                {error && (
                    <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </div>
                )}

                <button
                    onClick={handleSubmit}
                    disabled={!url.trim() || loading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
                >
                    {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <Download className="w-5 h-5" />
                    )}
                    {loading ? "Processing..." : "Start Ingestion"}
                </button>
            </div>

            <div className="bg-gray-900/30 border border-gray-800/50 rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-gray-400 mb-3">Supported Platforms</h3>
                <div className="grid grid-cols-2 gap-3">
                    {["YouTube", "Vimeo", "TikTok", "Instagram", "Twitch", "Twitter/X"].map((p) => (
                        <div key={p} className="flex items-center gap-2 text-sm text-gray-500">
                            <div className="w-2 h-2 rounded-full bg-emerald-500/50" />
                            {p}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
