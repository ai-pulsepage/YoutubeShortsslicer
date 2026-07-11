"use client";

import { useState, useEffect } from "react";
import {
    Wand2,
    Loader2,
    Play,
    AlertCircle,
    Film,
    FileText,
    Sparkles,
    CheckCircle2,
    XCircle,
    Search,
    Tv
} from "lucide-react";
import { cn } from "@/lib/utils";

type Video = {
    id: string;
    title: string;
    thumbnail: string | null;
    duration: number | null;
    createdAt: string;
};

const EDGE_TTS_VOICES = [
    { id: "", label: "Auto-detect (Recommended)" },
    { id: "en-US-AriaNeural-Female", label: "Aria (US Female)" },
    { id: "en-US-GuyNeural-Male", label: "Guy (US Male)" },
    { id: "en-GB-SoniaNeural-Female", label: "Sonia (UK Female)" },
    { id: "en-GB-RyanNeural-Male", label: "Ryan (UK Male)" },
    { id: "zh-CN-XiaoxiaoNeural-Female", label: "Xiaoxiao (CN Female)" },
    { id: "zh-CN-YunxiNeural-Male", label: "Yunxi (CN Male)" },
];

export default function AnimatedShortsPage() {
    const [sourceMode, setSourceMode] = useState<"text" | "video">("text");
    const [topic, setTopic] = useState("");
    const [aspectRatio, setAspectRatio] = useState("9:16");
    const [voiceName, setVoiceName] = useState("");
    const [bgmType, setBgmType] = useState("random");
    const [subtitleEnabled, setSubtitleEnabled] = useState(true);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [taskId, setTaskId] = useState<string | null>(null);
    const [taskStatus, setTaskStatus] = useState<any>(null);

    // Ingested videos state
    const [videos, setVideos] = useState<Video[]>([]);
    const [selectedVideoId, setSelectedVideoId] = useState<string>("");
    const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
    const [transcriptText, setTranscriptText] = useState("");
    const [videosLoading, setVideosLoading] = useState(false);
    const [transcriptLoading, setTranscriptLoading] = useState(false);
    const [summarizing, setSummarizing] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Load ingested videos list
    useEffect(() => {
        setVideosLoading(true);
        fetch("/api/videos?status=READY&limit=50")
            .then(r => r.json())
            .then(data => {
                setVideos(data.videos || []);
            })
            .catch(err => console.error("Failed to load videos:", err))
            .finally(() => setVideosLoading(false));
    }, []);

    // Load specific video transcript
    useEffect(() => {
        if (!selectedVideoId) {
            setSelectedVideo(null);
            setTranscriptText("");
            return;
        }

        const videoObj = videos.find(v => v.id === selectedVideoId);
        setSelectedVideo(videoObj || null);

        setTranscriptLoading(true);
        setTranscriptText("");
        fetch(`/api/videos/${selectedVideoId}/transcript`)
            .then(r => {
                if (!r.ok) throw new Error();
                return r.json();
            })
            .then(data => {
                setTranscriptText(data.content || "No transcript text available.");
            })
            .catch(() => {
                setTranscriptText("Failed to retrieve transcription.");
            })
            .finally(() => setTranscriptLoading(false));
    }, [selectedVideoId, videos]);

    // Poll MoneyPrinterTask status
    useEffect(() => {
        if (!taskId) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/animated/tasks/${taskId}`);
                if (!res.ok) return;
                const data = await res.json();
                
                const task = data.data || data;
                setTaskStatus(task);

                if (task.state === 1 || task.state === -1) {
                    setTaskId(null);
                    setLoading(false);
                    if (task.state === -1) {
                        setError(task.message || "Video generation failed.");
                    }
                }
            } catch (err) {
                console.error("Poller error:", err);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [taskId]);

    const handleSummarize = async () => {
        if (!selectedVideoId) return;
        setSummarizing(true);
        setError("");
        try {
            const res = await fetch("/api/animated/summarize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videoId: selectedVideoId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to summarize transcript");

            if (data.summary) {
                setTopic(data.summary);
                setSourceMode("text");
            }
        } catch (err: any) {
            setError(err.message || "Error generating summary.");
        } finally {
            setSummarizing(false);
        }
    };

    const handleUseRawTranscript = () => {
        if (!transcriptText) return;
        setTopic(transcriptText.substring(0, 1800)); // safety characters clamp
        setSourceMode("text");
    };

    const generate = async () => {
        if (!topic.trim()) return;
        setLoading(true);
        setError("");
        setTaskId(null);
        setTaskStatus(null);

        try {
            const res = await fetch("/api/animated/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    topic,
                    aspectRatio,
                    voiceName,
                    bgmType,
                    subtitleEnabled
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Generation request failed");

            const task = data.data || data;
            if (task && task.task_id) {
                setTaskId(task.task_id);
                setTaskStatus(task);
            } else {
                throw new Error("Invalid task response from MoneyPrinterTurbo");
            }
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    const formatTime = (secs: number | null) => {
        if (!secs) return "--:--";
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    const filteredVideos = videos.filter(v =>
        v.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white">Animated Shorts</h1>
                <p className="text-gray-400 mt-1">Generate fully animated YouTube Shorts — script, voiceover, visuals, all from a topic or video source</p>
            </div>

            {/* Source Mode Selector */}
            <div className="flex gap-1 bg-gray-900/50 border border-gray-800 rounded-2xl p-1 w-fit">
                <button onClick={() => setSourceMode("text")}
                    className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                        sourceMode === "text" ? "bg-violet-500/15 text-violet-400" : "text-gray-400 hover:text-white")}>
                    <Wand2 className="w-4 h-4" /> Text / Topic Prompt
                </button>
                <button onClick={() => setSourceMode("video")}
                    className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                        sourceMode === "video" ? "bg-violet-500/15 text-violet-400" : "text-gray-400 hover:text-white")}>
                    <Film className="w-4 h-4" /> Ingested Video Source
                </button>
            </div>

            {/* Main Area */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Mode B: Video Source Selection */}
                {sourceMode === "video" && (
                    <>
                        {/* Video List Column */}
                        <div className="lg:col-span-4 flex flex-col bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden h-[540px]">
                            <div className="p-4 border-b border-gray-800 space-y-3">
                                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Ready Videos</h3>
                                <div className="relative">
                                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                                    <input type="text" placeholder="Search videos..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full bg-gray-800/60 border border-gray-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-violet-500" />
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                {videosLoading ? (
                                    <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-violet-400" /></div>
                                ) : filteredVideos.length === 0 ? (
                                    <div className="text-center py-12 text-xs text-gray-500">No ready videos found.</div>
                                ) : (
                                    filteredVideos.map(v => (
                                        <button key={v.id} onClick={() => setSelectedVideoId(v.id)}
                                            className={cn("w-full flex items-center gap-3 p-2 rounded-xl text-left transition-all border text-xs",
                                                selectedVideoId === v.id ? "bg-violet-500/10 border-violet-500/30" : "border-transparent hover:bg-gray-800/40")}>
                                            <div className="w-16 aspect-video bg-gray-800 rounded overflow-hidden flex-shrink-0 relative">
                                                {v.thumbnail ? <img src={v.thumbnail} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-gray-800"><Film className="w-4 h-4 text-gray-600" /></div>}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium text-white truncate">{v.title}</p>
                                                <p className="text-[10px] text-gray-500 mt-0.5">{v.duration ? formatTime(v.duration) : "--:--"}</p>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Video Review Column */}
                        <div className="lg:col-span-8 flex flex-col bg-gray-900/50 border border-gray-800 rounded-2xl p-5 h-[540px]">
                            {selectedVideo ? (
                                <div className="flex flex-col h-full space-y-4">
                                    <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                                        <h3 className="text-sm font-semibold text-white truncate max-w-[420px]">{selectedVideo.title}</h3>
                                        <div className="flex gap-2">
                                            <button onClick={handleSummarize} disabled={summarizing || transcriptLoading || !transcriptText}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50">
                                                {summarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                                Summarize Video
                                            </button>
                                            <button onClick={handleUseRawTranscript} disabled={transcriptLoading || !transcriptText}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors disabled:opacity-50">
                                                <FileText className="w-3.5 h-3.5" />
                                                Use Raw Script
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
                                        {/* Player */}
                                        <div className="flex flex-col justify-center bg-black/40 rounded-xl overflow-hidden border border-gray-800/80 aspect-video">
                                            <video src={`/api/videos/${selectedVideoId}/stream`} controls className="w-full h-full" />
                                        </div>

                                        {/* Transcript */}
                                        <div className="flex flex-col min-h-0 bg-gray-950/40 border border-gray-800/80 rounded-xl p-3">
                                            <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <FileText className="w-3 h-3 text-violet-400" />
                                                Transcription
                                            </span>
                                            <div className="flex-1 overflow-y-auto text-xs text-gray-300 leading-relaxed font-mono pr-2">
                                                {transcriptLoading ? (
                                                    <div className="flex items-center justify-center h-full"><Loader2 className="w-4 h-4 animate-spin text-violet-400" /></div>
                                                ) : transcriptText}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500">
                                    <Tv className="w-12 h-12 text-gray-700 mb-3" />
                                    <p className="text-sm">Select an ingested video from the left to play it and review its transcription.</p>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Generator Form Section */}
                <div className={cn("space-y-6", sourceMode === "video" ? "lg:col-span-12" : "lg:col-span-8")}>
                    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-5">
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Video Subject / Script Source</label>
                            <textarea placeholder="e.g. '5 things you didn't know about the Roman Empire' or paste a custom voiceover script..." value={topic}
                                onChange={e => setTopic(e.target.value)} rows={4}
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500 resize-none font-sans" />
                            <p className="text-[10px] text-gray-500">You can type a general topic or title, or paste a complete script text directly.</p>
                        </div>

                        {/* Customization Details Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-gray-800/60 pt-4">
                            <div>
                                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">Aspect Ratio</label>
                                <div className="flex gap-2">
                                    {[
                                        { id: "9:16", label: "Portrait" },
                                        { id: "16:9", label: "Landscape" },
                                        { id: "1:1", label: "Square" },
                                    ].map(ar => (
                                        <button key={ar.id} onClick={() => setAspectRatio(ar.id)}
                                            className={cn("flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                                                aspectRatio === ar.id ? "border-violet-500 bg-violet-500/10 text-violet-400" : "border-gray-850 bg-gray-800/40 text-gray-400 hover:border-gray-700")}>
                                            {ar.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">EdgeTTS Voice</label>
                                <select value={voiceName} onChange={e => setVoiceName(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-750 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500">
                                    {EDGE_TTS_VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">Background Music</label>
                                <select value={bgmType} onChange={e => setBgmType(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-750 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500">
                                    <option value="random">Random BGM Track</option>
                                    <option value="none">No Background Music</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-gray-850 pt-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={subtitleEnabled} onChange={e => setSubtitleEnabled(e.target.checked)} className="rounded accent-violet-500" />
                                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Burn-in Subtitles</span>
                            </label>

                            {error && (
                                <div className="flex items-center gap-1.5 text-red-400 text-xs">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    <span>{error}</span>
                                </div>
                            )}
                        </div>

                        <button onClick={generate} disabled={loading || !topic.trim()}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-medium hover:scale-[1.01] active:scale-100 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/10">
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span>
                                        {taskStatus?.progress !== undefined 
                                            ? `Generating Video (${taskStatus.progress}%)` 
                                            : "Contacting MoneyPrinterTurbo..."}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <Wand2 className="w-5 h-5" />
                                    <span>Generate Animated Short</span>
                                </>
                            )}
                        </button>
                    </div>

                    {/* Progress tracking block */}
                    {taskStatus && (
                        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                    {taskStatus.state === 1 ? (
                                        <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="w-4 h-4" /> Finished</span>
                                    ) : taskStatus.state === -1 ? (
                                        <span className="flex items-center gap-1 text-red-400"><XCircle className="w-4 h-4" /> Failed</span>
                                    ) : (
                                        <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-violet-400" /> Synthesizing...</span>
                                    )}
                                </h3>
                                <span className="text-xs text-gray-500 font-mono">Task ID: {taskStatus.task_id?.substring(0, 8)}</span>
                            </div>

                            {/* Progress bar */}
                            <div className="w-full bg-gray-850 h-2.5 rounded-full overflow-hidden">
                                <div className="bg-violet-500 h-full transition-all duration-500" style={{ width: `${taskStatus.progress || 0}%` }} />
                            </div>

                            {taskStatus.state === 1 && taskStatus.videos && taskStatus.videos[0] && (
                                <div className="pt-2 flex flex-col items-center gap-4">
                                    <video src={taskStatus.videos[0]} controls className="max-h-[380px] rounded-xl border border-gray-800" style={{ aspectRatio: aspectRatio === "16:9" ? "16/9" : aspectRatio === "1:1" ? "1/1" : "9/16" }} />
                                    <a href={taskStatus.videos[0]} download className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all">
                                        <Play className="w-3.5 h-3.5" /> Download Generated Short
                                    </a>
                                </div>
                            )}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
