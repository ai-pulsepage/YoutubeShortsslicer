"use client";

import { useState } from "react";
import { Wand2, Loader2, Play, AlertCircle } from "lucide-react";

export default function AnimatedShortsPage() {
    const [topic, setTopic] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState("");

    const generate = async () => {
        if (!topic.trim()) return;
        setLoading(true);
        setError("");
        setResult(null);
        try {
            const res = await fetch("/api/animated/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic, aspectRatio: "9:16" }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Generation failed");
            setResult(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-2xl">
            <div>
                <h1 className="text-3xl font-bold text-white">Animated Shorts</h1>
                <p className="text-gray-400 mt-1">Generate fully animated YouTube Shorts — script, voiceover, visuals, all from a topic</p>
            </div>
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-4">
                <label className="block text-sm font-medium text-gray-300">Topic or title</label>
                <textarea placeholder="e.g. '5 things you didn't know about the Roman Empire'" value={topic}
                    onChange={e => setTopic(e.target.value)} rows={3}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500 resize-none" />
                {error && <div className="flex items-center gap-2 text-red-400 text-sm"><AlertCircle className="w-4 h-4" /> {error}</div>}
                <button onClick={generate} disabled={loading || !topic.trim()}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-violet-500 text-white font-medium hover:bg-violet-600 disabled:opacity-50 transition-colors">
                    {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Generating (takes a few minutes)...</> : <><Wand2 className="w-5 h-5" /> Generate animated short</>}
                </button>
            </div>
            {result && (
                <div className="bg-gray-900/50 border border-emerald-500/30 rounded-2xl p-6">
                    <p className="text-emerald-400 font-medium mb-3">Video ready</p>
                    {result.video_url && (
                        <a href={result.video_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300">
                            <Play className="w-4 h-4" /> Watch video
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}
