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
    Tv,
    Plus,
    Trash,
    Volume2,
    Music,
    RefreshCw,
    Check,
    Users
} from "lucide-react";
import { cn } from "@/lib/utils";

type Scene = {
    id: string;
    type: "dialogue" | "song";
    character: string;
    voice: string;
    text: string;
    visualPrompt: string;
    visualPath?: string;      // R2 key for generated video clip
    jobId?: string;           // RunPod Job ID
    jobStatus?: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
    sunoAudioKey?: string;     // R2 key for uploaded Suno audio
};

type Character = {
    id: string;
    name: string;
    prompt: string;
};

type Video = {
    id: string;
    title: string;
    thumbnail: string | null;
    duration: number | null;
    createdAt: string;
};

const EDGE_TTS_VOICES = [
    { id: "en-US-AnaNeural-Female", label: "Ana (US Child Female)" },
    { id: "zh-CN-XiaoyiNeural-Female", label: "Xiaoyi (CN Child Female)" },
    { id: "en-US-AriaNeural-Female", label: "Aria (US Female)" },
    { id: "en-US-GuyNeural-Male", label: "Guy (US Male)" },
    { id: "en-GB-SoniaNeural-Female", label: "Sonia (UK Female)" },
    { id: "en-GB-RyanNeural-Male", label: "Ryan (UK Male)" },
    { id: "zh-CN-XiaoxiaoNeural-Female", label: "Xiaoxiao (CN Female)" },
    { id: "zh-CN-YunxiNeural-Male", label: "Yunxi (CN Male)" },
];

export default function KidsStoryBuilderPage() {
    const [sourceMode, setSourceMode] = useState<"text" | "video">("video");
    const [docId, setDocId] = useState<string | null>(null);
    const [scenes, setScenes] = useState<Scene[]>([]);
    
    // Character Consistency Profiles
    const [characters, setCharacters] = useState<Character[]>([
        { id: "1", name: "Leo", prompt: "cheerful 3D cartoon boy with red hair, green eyes, yellow shirt, Pixar 3d style" },
        { id: "2", name: "Lily", prompt: "cheerful 3D cartoon girl with black hair, princess crown, pink dress, Pixar 3d style" }
    ]);

    // Voice preview audio state
    const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
    const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);

    // Compilation states
    const [compiling, setCompiling] = useState(false);
    const [compiledVideoUrl, setCompiledVideoUrl] = useState<string | null>(null);
    const [error, setError] = useState("");

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

    // Poll RunPod Job Statuses
    useEffect(() => {
        const pendingJobs = scenes.filter(s => s.jobId && s.jobStatus !== "COMPLETED" && s.jobStatus !== "FAILED");
        if (pendingJobs.length === 0) return;

        const interval = setInterval(async () => {
            const jobIds = pendingJobs.map(s => s.jobId).join(",");
            try {
                const res = await fetch(`/api/animated/scenes/video/status?jobIds=${jobIds}`);
                if (!res.ok) return;

                const data = await res.json();
                const updatedJobs = data.jobs || [];

                setScenes(prev =>
                    prev.map(scene => {
                        const matchingJob = updatedJobs.find((j: any) => j.id === scene.jobId);
                        if (!matchingJob) return scene;

                        return {
                            ...scene,
                            jobStatus: matchingJob.status === "QUEUED" ? "QUEUED" 
                                     : matchingJob.status === "PROCESSING" ? "PROCESSING"
                                     : matchingJob.status === "COMPLETED" ? "COMPLETED"
                                     : "FAILED",
                            visualPath: matchingJob.outputPath || scene.visualPath
                        };
                    })
                );
            } catch (err) {
                console.error("Job poller error:", err);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [scenes]);

    // Ingest & draft new kids storyboard scenes
    const handleAnalyze = async () => {
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

            if (data.scenes && Array.isArray(data.scenes)) {
                setScenes(data.scenes);
                setDocId(null); // Reset parent reference for new compilation
            }
        } catch (err: any) {
            setError(err.message || "Error generating storyboard.");
        } finally {
            setSummarizing(false);
        }
    };

    // Voice Preview Synthesizer
    const playVoicePreview = async (sceneId: string, text: string, voice: string) => {
        if (!text || !voice) return;

        if (playingAudioId === sceneId && previewAudio) {
            previewAudio.pause();
            setPlayingAudioId(null);
            return;
        }

        setError("");
        setPlayingAudioId(sceneId);

        try {
            const res = await fetch("/api/animated/voice/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, voice })
            });

            if (!res.ok) throw new Error("Voice synthesis preview failed");

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);

            const audio = new Audio(url);
            setPreviewAudio(audio);
            audio.play();

            audio.onended = () => {
                setPlayingAudioId(null);
            };
        } catch (err: any) {
            setError(err.message || "Failed to preview voice.");
            setPlayingAudioId(null);
        }
    };

    // Dispatch Scene video generator request to RunPod (Injecting Character Consistency Profiles)
    const generateSceneVideo = async (sceneId: string, visualPrompt: string) => {
        setError("");
        
        // Inject character consistency descriptions into prompt
        let finalPrompt = visualPrompt;
        characters.forEach(char => {
            if (!char.name.trim()) return;
            const regex = new RegExp(`\\b${char.name}\\b`, 'gi');
            if (regex.test(finalPrompt)) {
                finalPrompt = finalPrompt.replace(regex, `${char.name} (${char.prompt})`);
            }
        });

        try {
            const res = await fetch("/api/animated/scenes/video", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sceneId, visualPrompt: finalPrompt, docId })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to start video generation");

            if (data.docId) setDocId(data.docId);

            setScenes(prev =>
                prev.map(s => {
                    if (s.id !== sceneId) return s;
                    return {
                        ...s,
                        jobId: data.jobId,
                        jobStatus: "QUEUED"
                    };
                })
            );
        } catch (err: any) {
            setError(err.message || "Failed to dispatch video task.");
        }
    };

    // Handle Custom Suno MP3 Upload for song scenes
    const handleSunoUpload = async (sceneId: string, file: File) => {
        setError("");
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("type", "voice");

            const res = await fetch("/api/cam-overlay/upload", {
                method: "POST",
                body: formData
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Upload failed");

            setScenes(prev =>
                prev.map(s => {
                    if (s.id !== sceneId) return s;
                    return {
                        ...s,
                        sunoAudioKey: data.path || data.key
                    };
                })
            );
        } catch (err: any) {
            setError(`Audio upload failed: ${err.message}`);
        }
    };

    // Edit scene values dynamically
    const updateScene = (id: string, updates: Partial<Scene>) => {
        setScenes(prev =>
            prev.map(s => (s.id === id ? { ...s, ...updates } : s))
        );
    };

    // Add empty scene
    const addScene = () => {
        const newScene: Scene = {
            id: `scene-manual-${Date.now()}`,
            type: "dialogue",
            character: "Leo",
            voice: "en-US-AnaNeural-Female",
            text: "New dialogue script...",
            visualPrompt: "Leo standing in a happy kids bedroom"
        };
        setScenes(prev => [...prev, newScene]);
    };

    // Delete scene
    const deleteScene = (id: string) => {
        setScenes(prev => prev.filter(s => s.id !== id));
    };

    // Character Profiles Actions
    const addCharacterProfile = () => {
        setCharacters(prev => [
            ...prev,
            { id: `char-${Date.now()}`, name: "CharacterName", prompt: "description details..." }
        ]);
    };

    const updateCharacterProfile = (id: string, updates: Partial<Character>) => {
        setCharacters(prev =>
            prev.map(c => (c.id === id ? { ...c, ...updates } : c))
        );
    };

    const deleteCharacterProfile = (id: string) => {
        setCharacters(prev => prev.filter(c => c.id !== id));
    };

    // Final Stitch & Compile Video
    const handleCompile = async () => {
        if (scenes.some(s => !s.visualPath)) {
            setError("Cannot compile. Make sure all scenes have finished video clips generated.");
            return;
        }

        setCompiling(true);
        setError("");
        setCompiledVideoUrl(null);

        try {
            const res = await fetch("/api/animated/scenes/compile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ scenes, docId })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Compilation failed");

            if (data.videoUrl) {
                const signedRes = await fetch(`/api/storage/signed?key=${data.videoUrl}`);
                const signedData = await signedRes.json();
                setCompiledVideoUrl(signedData.url || data.videoUrl);
            }
        } catch (err: any) {
            setError(err.message || "Failed to compile merged video.");
        } finally {
            setCompiling(false);
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
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Kids Story Storyboard Builder</h1>
                    <p className="text-gray-400 mt-1">Ingest transcripts, create multi-character dialogs, upload Suno music, and generate scenes with RunPod.</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setSourceMode(sourceMode === "video" ? "text" : "video")}
                        className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-xs font-semibold text-gray-300 hover:text-white transition-all">
                        {sourceMode === "video" ? "Hide Video Ingest Panel" : "Show Video Ingest Panel"}
                    </button>
                </div>
            </div>

            {/* Layout Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Left Side: Video Ingester */}
                {sourceMode === "video" && (
                    <div className="lg:col-span-4 space-y-4">
                        <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-4 flex flex-col h-[520px]">
                            <div className="border-b border-gray-800 pb-3 space-y-2">
                                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Ingested Library Videos</h3>
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-500" />
                                    <input type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1 text-xs text-white focus:outline-none focus:border-violet-500" />
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto py-2 space-y-1">
                                {videosLoading ? (
                                    <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-violet-400" /></div>
                                ) : filteredVideos.length === 0 ? (
                                    <div className="text-center py-8 text-xs text-gray-500">No ready videos.</div>
                                ) : (
                                    filteredVideos.map(v => (
                                        <button key={v.id} onClick={() => setSelectedVideoId(v.id)}
                                            className={cn("w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-all border text-xs",
                                                selectedVideoId === v.id ? "bg-violet-500/10 border-violet-500/30" : "border-transparent hover:bg-gray-850/40")}>
                                            <div className="w-12 aspect-video bg-gray-800 rounded overflow-hidden flex-shrink-0 relative">
                                                {v.thumbnail ? <img src={v.thumbnail} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-gray-850"><Film className="w-3.5 h-3.5 text-gray-600" /></div>}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium text-white truncate text-[11px]">{v.title}</p>
                                                <p className="text-[9px] text-gray-500 mt-0.5">{v.duration ? formatTime(v.duration) : "--:--"}</p>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>

                            {selectedVideo && (
                                <div className="border-t border-gray-800 pt-3 space-y-2 mt-auto">
                                    <video src={`/api/videos/${selectedVideoId}/stream`} controls className="w-full aspect-video rounded-xl bg-black/40 border border-gray-850" />
                                    <button onClick={handleAnalyze} disabled={summarizing || transcriptLoading || !transcriptText}
                                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold disabled:opacity-50 transition-all">
                                        {summarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                        Analyze & Draft Script
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Right Side: Cast Profiles + Interactive Storyboard Timeline */}
                <div className={cn("space-y-6", sourceMode === "video" ? "lg:col-span-8" : "lg:col-span-12")}>
                    
                    {/* Character Consistency Profiles Box */}
                    <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                                <Users className="w-4 h-4 text-violet-400" /> Cast of Characters (Consistency Directory)
                            </h3>
                            <button onClick={addCharacterProfile} className="flex items-center gap-1 px-2 py-0.5 bg-violet-600/10 border border-violet-500/20 text-violet-400 rounded text-[10px] font-bold hover:bg-violet-600/20 transition-all">
                                <Plus className="w-3 h-3" /> Add Character
                            </button>
                        </div>
                        
                        <div className="space-y-2.5 max-h-[160px] overflow-y-auto pr-1">
                            {characters.map(char => (
                                <div key={char.id} className="flex gap-2 items-center bg-gray-950/20 border border-gray-850 p-2 rounded-xl">
                                    <input type="text" placeholder="Name" value={char.name} onChange={e => updateCharacterProfile(char.id, { name: e.target.value })}
                                        className="w-24 bg-gray-800 border border-gray-750 rounded-lg px-2.5 py-1 text-xs font-semibold text-white focus:outline-none focus:border-violet-500" />
                                    <input type="text" placeholder="Appearance description (injected into visual prompts)..." value={char.prompt} onChange={e => updateCharacterProfile(char.id, { prompt: e.target.value })}
                                        className="flex-1 bg-gray-800 border border-gray-750 rounded-lg px-2.5 py-1 text-xs text-gray-300 focus:outline-none focus:border-violet-500" />
                                    <button onClick={() => deleteCharacterProfile(char.id)} className="p-1 bg-gray-800 border border-gray-750 hover:bg-red-950/25 hover:border-red-900/30 text-gray-500 hover:text-red-400 rounded-lg transition-colors">
                                        <Trash className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {scenes.length === 0 ? (
                        <div className="bg-gray-900/10 border border-dashed border-gray-800 rounded-3xl p-12 text-center max-w-xl mx-auto flex flex-col items-center justify-center space-y-4">
                            <Tv className="w-12 h-12 text-gray-700" />
                            <div>
                                <h3 className="text-lg font-semibold text-white">Storyboard is empty</h3>
                                <p className="text-gray-400 text-xs mt-1">
                                    Select an ingested kids video on the left list and click "Analyze & Draft Script" to automatically plan storyboard scenes, or add manual cards below.
                                </p>
                            </div>
                            <button onClick={addScene} className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-xl transition-all">
                                <Plus className="w-4 h-4" /> Create Manual Scene
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            
                            {/* Scenes Timeline */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Storyboard Timeline</h3>
                                    <button onClick={addScene} className="flex items-center gap-1 px-2.5 py-1 bg-violet-600/15 hover:bg-violet-600/30 border border-violet-500/20 text-violet-400 text-[11px] font-semibold rounded-lg transition-all">
                                        <Plus className="w-3.5 h-3.5" /> Add Scene Card
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {scenes.map((scene, idx) => (
                                        <div key={scene.id} className="bg-gray-900/40 border border-gray-800 rounded-2xl p-5 relative group">
                                            {/* Delete Button */}
                                            <button onClick={() => deleteScene(scene.id)}
                                                className="absolute top-3 right-3 p-1.5 bg-gray-850 hover:bg-red-950/20 border border-gray-800 hover:border-red-900/30 text-gray-500 hover:text-red-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all z-10">
                                                <Trash className="w-3.5 h-3.5" />
                                            </button>

                                            {/* Grid layout inside card - Left (Inputs) and Right (Video clip display) */}
                                            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                                                
                                                {/* Left Column - Inputs */}
                                                <div className="md:col-span-7 space-y-3">
                                                    
                                                    {/* Row Header */}
                                                    <div className="flex items-center gap-2 pb-1 border-b border-gray-800/50">
                                                        <span className="w-6 h-6 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-white">{idx + 1}</span>
                                                        <select value={scene.type} onChange={e => updateScene(scene.id, { type: e.target.value as "dialogue" | "song" })}
                                                            className="bg-gray-850 border border-gray-750 text-[10px] font-bold text-white px-2 py-0.5 rounded uppercase focus:outline-none">
                                                            <option value="dialogue">Dialogue</option>
                                                            <option value="song">Song / Lyric</option>
                                                        </select>
                                                    </div>

                                                    {/* Dialogue type controls */}
                                                    {scene.type === "dialogue" ? (
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div>
                                                                <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-0.5">Speaker Actor</label>
                                                                <input type="text" value={scene.character} onChange={e => updateScene(scene.id, { character: e.target.value })}
                                                                    className="w-full bg-gray-850 border border-gray-750 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-violet-500" />
                                                            </div>
                                                            <div>
                                                                <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-0.5">Voice Tone</label>
                                                                <div className="flex items-center gap-1">
                                                                    <select value={scene.voice} onChange={e => updateScene(scene.id, { voice: e.target.value })}
                                                                        className="flex-1 bg-gray-850 border border-gray-750 rounded-lg px-1.5 py-1.5 text-[10px] text-white focus:outline-none focus:border-violet-500">
                                                                        {EDGE_TTS_VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                                                                    </select>
                                                                    <button onClick={() => playVoicePreview(scene.id, scene.text, scene.voice)}
                                                                        className={cn("p-1.5 rounded-lg border transition-all",
                                                                            playingAudioId === scene.id ? "bg-violet-500/10 border-violet-500/30 text-violet-400" : "bg-gray-800 border-gray-750 text-gray-400 hover:text-white")}>
                                                                        {playingAudioId === scene.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        // Song type Suno Audio controls
                                                        <div className="space-y-1.5">
                                                            <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block">Suno Song Audio track (.mp3)</label>
                                                            <div className="flex items-center gap-2">
                                                                <label className="flex-1 flex items-center justify-between bg-gray-850 border border-dashed border-gray-750 hover:bg-gray-800/80 px-3 py-1.5 rounded-xl cursor-pointer transition-colors text-xs text-gray-400">
                                                                    <span className="truncate">{scene.sunoAudioKey ? "✓ Audio uploaded" : "Upload Suno MP3"}</span>
                                                                    <Music className="w-3.5 h-3.5 text-gray-500" />
                                                                    <input type="file" accept="audio/mpeg" onChange={e => e.target.files?.[0] && handleSunoUpload(scene.id, e.target.files[0])} className="hidden" />
                                                                </label>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Textarea for Script/Lyrics */}
                                                    <div>
                                                        <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-0.5">
                                                            {scene.type === "song" ? "Song Lyrics" : "Dialogue Spoken Text"}
                                                        </label>
                                                        <textarea value={scene.text} onChange={e => updateScene(scene.id, { text: e.target.value })} rows={4}
                                                            className="w-full bg-gray-850 border border-gray-750 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500 font-sans leading-relaxed" />
                                                    </div>

                                                    {/* Visual prompt input */}
                                                    <div>
                                                        <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-0.5">RunPod Visual Prompt</label>
                                                        <textarea value={scene.visualPrompt} onChange={e => updateScene(scene.id, { visualPrompt: e.target.value })} rows={2}
                                                            className="w-full bg-gray-850 border border-gray-750 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500 leading-relaxed resize-none" />
                                                    </div>

                                                    {/* Generate Trigger */}
                                                    <div className="pt-2">
                                                        <button onClick={() => generateSceneVideo(scene.id, scene.visualPrompt)}
                                                            disabled={scene.jobStatus === "QUEUED" || scene.jobStatus === "PROCESSING"}
                                                            className={cn("w-full flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50",
                                                                scene.jobStatus === "COMPLETED" ? "bg-gray-850 hover:bg-gray-800 text-gray-300 border border-gray-750" : "bg-violet-600 hover:bg-violet-500 text-white")}>
                                                            {scene.jobStatus === "QUEUED" || scene.jobStatus === "PROCESSING" ? (
                                                                <>
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                    <span>Generating Clip...</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Wand2 className="w-3.5 h-3.5" />
                                                                    <span>{scene.jobStatus === "COMPLETED" ? "Regenerate Visual Clip" : "Generate Visual Clip"}</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>

                                                </div>

                                                {/* Right Column - Video Preview Window */}
                                                <div className="md:col-span-5 flex flex-col h-full min-h-[220px] bg-black/30 border border-gray-850 rounded-2xl overflow-hidden p-4 justify-between">
                                                    <div className="flex-1 flex flex-col items-center justify-center">
                                                        {scene.visualPath ? (
                                                            <div className="w-full aspect-video flex items-center justify-center relative bg-black/40 rounded-xl overflow-hidden border border-gray-800">
                                                                {/* Map output key to a temporary public url */}
                                                                <video src={`/api/storage/signed?key=${scene.visualPath}`} controls className="max-h-full max-w-full" />
                                                            </div>
                                                        ) : (
                                                            <div className="text-center space-y-2">
                                                                {scene.jobStatus === "QUEUED" ? (
                                                                    <div className="flex flex-col items-center gap-2 text-gray-400">
                                                                        <RefreshCw className="w-8 h-8 animate-spin text-gray-500" />
                                                                        <span className="text-xs font-semibold">Queued in RunPod channel...</span>
                                                                    </div>
                                                                ) : scene.jobStatus === "PROCESSING" ? (
                                                                    <div className="flex flex-col items-center gap-2 text-violet-400">
                                                                        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                                                                        <span className="text-xs font-semibold">Generating scene GPU frames...</span>
                                                                    </div>
                                                                ) : scene.jobStatus === "FAILED" ? (
                                                                    <div className="flex flex-col items-center gap-2 text-red-400">
                                                                        <XCircle className="w-8 h-8 text-red-500" />
                                                                        <span className="text-xs font-semibold">Generation failed</span>
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-gray-600 flex flex-col items-center gap-1.5">
                                                                        <Film className="w-8 h-8 text-gray-800" />
                                                                        <span className="text-[11px]">Video clip not generated</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="pt-3 border-t border-gray-850 flex items-center justify-between">
                                                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Preview Display</span>
                                                        <span className="text-[10px] text-gray-400 font-mono">
                                                            {scene.jobId ? `Job: ${scene.jobId.substring(0, 8)}` : "No job associated"}
                                                        </span>
                                                    </div>
                                                </div>

                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Compilation panel */}
                            <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-sm font-semibold text-white">Assemble Final Story</h3>
                                        <p className="text-gray-400 text-xs mt-0.5">This will loop scene visual clips, synthesize voice dialogue overlays, and stitch the timeline.</p>
                                    </div>
                                    <button onClick={handleCompile} disabled={compiling || scenes.some(s => !s.visualPath)}
                                        className="flex items-center gap-1.5 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition-all shadow-md">
                                        {compiling ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                        Compile & Stitch Kids Video
                                    </button>
                                </div>

                                {error && (
                                    <div className="flex items-center gap-1.5 text-red-400 text-xs bg-red-950/20 border border-red-900/30 p-3 rounded-xl">
                                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                        <span>{error}</span>
                                    </div>
                                )}

                                {compiledVideoUrl && (
                                    <div className="pt-4 border-t border-gray-800 flex flex-col items-center gap-3">
                                        <video src={compiledVideoUrl} controls className="max-h-[360px] rounded-xl border border-gray-800 bg-black" />
                                        <a href={compiledVideoUrl} download className="flex items-center justify-center gap-1.5 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all">
                                            <Play className="w-3.5 h-3.5" /> Download Stitched Kids Movie
                                        </a>
                                    </div>
                                )}
                            </div>

                        </div>
                    )}

                </div>

            </div>
        </div>
    );
}
