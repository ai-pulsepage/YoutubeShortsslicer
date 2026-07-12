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
    Users,
    Save,
    Sparkle
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
    narrationPath?: string;    // R2 key for pre-generated dialogue voice
    voiceStatus?: "IDLE" | "GENERATING" | "READY" | "FAILED";
};

type Character = {
    id: string;
    name: string;
    prompt: string;
    imagePath?: string;        // R2 avatar path
    jobId?: string;           // Avatar generation job id
    jobStatus?: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
};

type Project = {
    id: string;
    title: string;
    script: string;
    status: string;
    characters: Character[];
    scenes: Scene[];
    finalVideoPath?: string;
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

const CHARACTER_PRESETS = [
    { name: "Leo", prompt: "cheerful 3D cartoon boy with red hair, green eyes, yellow shirt, Pixar 3d style" },
    { name: "Lily", prompt: "cheerful 3D cartoon girl with black hair, princess crown, pink dress, Pixar 3d style" },
    { name: "Bingo", prompt: "cute anthropomorphic talking bunny, fluffy white fur, wearing a tiny blue vest, 3d cartoon style, Pixar look" },
    { name: "Rex", prompt: "happy anthropomorphic baby green dinosaur, friendly expression, big round eyes, 3d cartoon style, Pixar look" },
    { name: "Rusty", prompt: "cute shiny toy robot, smiling digital eyes, colorful buttons, friendly cartoon style, 3d look" },
    { name: "Buddy", prompt: "adorable anthropomorphic golden retriever puppy, wearing a red collar, happy expression, 3d cartoon style, Pixar look" }
];

export default function KidsStoryBuilderPage() {
    const [sourceMode, setSourceMode] = useState<"text" | "video">("text");
    
    // Project Hub State
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>("");
    const [projectTitle, setProjectTitle] = useState("");
    const [projectScript, setProjectScript] = useState("");
    const [saving, setSaving] = useState(false);

    const [docId, setDocId] = useState<string | null>(null);
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [characters, setCharacters] = useState<Character[]>([]);

    // Voice preview audio state
    const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
    const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);

    // Compilation states
    const [compiling, setCompiling] = useState(false);
    const [compiledVideoUrl, setCompiledVideoUrl] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [insufficientFunds, setInsufficientFunds] = useState(false);

    // Ingested videos state
    const [videos, setVideos] = useState<Video[]>([]);
    const [selectedVideoId, setSelectedVideoId] = useState<string>("");
    const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
    const [transcriptText, setTranscriptText] = useState("");
    const [videosLoading, setVideosLoading] = useState(false);
    const [transcriptLoading, setTranscriptLoading] = useState(false);
    const [summarizing, setSummarizing] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Load projects and videos list
    useEffect(() => {
        loadProjects();
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

    // Load Projects List
    const loadProjects = async () => {
        try {
            const res = await fetch("/api/animated/projects");
            if (res.ok) {
                const data = await res.json();
                setProjects(data.projects || []);
            }
        } catch (err) {
            console.error("Failed to load projects:", err);
        }
    };

    // Handle Project Selection
    const handleSelectProject = (projectId: string) => {
        if (!projectId) {
            setSelectedProjectId("");
            setDocId(null);
            setProjectTitle("");
            setProjectScript("");
            setScenes([]);
            setCharacters([]);
            return;
        }
        const proj = projects.find(p => p.id === projectId);
        if (proj) {
            setSelectedProjectId(proj.id);
            setDocId(proj.id);
            setProjectTitle(proj.title);
            setProjectScript(proj.script);
            setCharacters(proj.characters);
            
            // Map saved DB scenes to client type structure
            setScenes(proj.scenes.map(s => ({
                ...s,
                type: s.type || "dialogue",
                character: s.character || "Leo",
                voice: s.voice || "en-US-AnaNeural-Female"
            })));
        }
    };

    // Poll RunPod Job Statuses
    useEffect(() => {
        const pendingJobs = scenes.filter(s => s.jobId && s.jobStatus !== "COMPLETED" && s.jobStatus !== "FAILED");
        const pendingAvatars = characters.filter(c => c.jobId && c.jobStatus !== "COMPLETED" && c.jobStatus !== "FAILED");
        
        if (pendingJobs.length === 0 && pendingAvatars.length === 0) return;

        const interval = setInterval(async () => {
            const jobIds = [
                ...pendingJobs.map(s => s.jobId),
                ...pendingAvatars.map(c => c.jobId)
            ].join(",");

            try {
                const res = await fetch(`/api/animated/scenes/video/status?jobIds=${jobIds}`);
                if (!res.ok) return;

                const data = await res.json();
                const updatedJobs = data.jobs || [];

                // Update scene clips statuses
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

                // Update character avatar images statuses
                setCharacters(prev =>
                    prev.map(char => {
                        const matchingJob = updatedJobs.find((j: any) => j.id === char.jobId);
                        if (!matchingJob) return char;

                        return {
                            ...char,
                            jobStatus: matchingJob.status === "QUEUED" ? "QUEUED" 
                                     : matchingJob.status === "PROCESSING" ? "PROCESSING"
                                     : matchingJob.status === "COMPLETED" ? "COMPLETED"
                                     : "FAILED",
                            imagePath: matchingJob.outputPath || char.imagePath
                        };
                    })
                );
            } catch (err) {
                console.error("Job status check failed:", err);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [scenes, characters]);

    // Save Project Draft to Postgres
    const handleSaveProject = async () => {
        setSaving(true);
        setError("");
        try {
            const res = await fetch("/api/animated/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: docId,
                    title: projectTitle || "New Story Project",
                    script: projectScript,
                    characters,
                    scenes
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save project");

            if (data.project) {
                setDocId(data.project.id);
                setSelectedProjectId(data.project.id);
                loadProjects(); // reload list
            }
        } catch (err: any) {
            setError(err.message || "Error saving project draft.");
        } finally {
            setSaving(false);
        }
    };

    // Ingest & draft new kids storyboard scenes (blueprint writer)
    const handleAnalyze = async () => {
        setSummarizing(true);
        setError("");
        setInsufficientFunds(false);
        try {
            const bodyPayload = sourceMode === "video" 
                ? { videoId: selectedVideoId } 
                : { premise: projectScript };

            const res = await fetch("/api/animated/summarize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyPayload)
            });

            const data = await res.json();
            
            if (res.status === 402 || data.error === "DEEPSEEK_OUT_OF_FUNDS") {
                setInsufficientFunds(true);
                throw new Error(data.details || "DeepSeek API: Insufficient Balance.");
            }

            if (!res.ok) throw new Error(data.error || "Failed to draft blueprint");

            if (data.scenes && Array.isArray(data.scenes)) {
                setScenes(data.scenes);
            }
        } catch (err: any) {
            setError(err.message || "Error generating storyboard.");
        } finally {
            setSummarizing(false);
        }
    };

    // AI Polish Script Line / Song Lyrics
    const handleImproveScript = async (sceneId: string, text: string, type: "dialogue" | "song") => {
        setError("");
        setInsufficientFunds(false);
        try {
            const res = await fetch("/api/animated/scenes/improve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, type })
            });
            const data = await res.json();

            if (res.status === 402 || data.error === "DEEPSEEK_OUT_OF_FUNDS") {
                setInsufficientFunds(true);
                throw new Error(data.details || "DeepSeek API: Insufficient Balance.");
            }

            if (!res.ok) throw new Error(data.error || "Polishing script failed");

            updateScene(sceneId, { text: data.improvedText || text });
        } catch (err: any) {
            setError(err.message || "Script Polish failed.");
        }
    };

    // AI Expand Character Appearance Prompt
    const handleExpandCharacterPrompt = async (charId: string, promptText: string) => {
        setError("");
        setInsufficientFunds(false);
        try {
            const res = await fetch("/api/animated/characters/expand", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: promptText })
            });
            const data = await res.json();

            if (res.status === 402 || data.error === "DEEPSEEK_OUT_OF_FUNDS") {
                setInsufficientFunds(true);
                throw new Error(data.details || "DeepSeek API: Insufficient Balance.");
            }

            if (!res.ok) throw new Error(data.error || "Expansion failed");

            updateCharacterProfile(charId, { prompt: data.expandedPrompt || promptText });
        } catch (err: any) {
            setError(err.message || "Expansion failed.");
        }
    };

    // Generate Character Avatar Face
    const handleGenerateAvatar = async (charId: string, promptText: string) => {
        if (!docId) {
            setError("Please click 'Save Project Draft' first before generating character avatars.");
            return;
        }

        setError("");
        try {
            const res = await fetch("/api/animated/characters/avatar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ docId, characterId: charId, prompt: promptText })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Avatar generation call failed");

            updateCharacterProfile(charId, {
                jobId: data.jobId,
                jobStatus: "QUEUED"
            });
        } catch (err: any) {
            setError(err.message || "Failed to queue avatar face generator.");
        }
    };

    // Card-Level EdgeTTS Voiceover Pre-Generator (Option B)
    const generateSceneVoiceover = async (sceneId: string, text: string, voice: string) => {
        setError("");
        updateScene(sceneId, { voiceStatus: "GENERATING" });

        try {
            const res = await fetch("/api/animated/voice/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ docId, sceneId, text, voice })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Voiceover synthesis failed");

            updateScene(sceneId, {
                narrationPath: data.narrationPath,
                voiceStatus: "READY"
            });
        } catch (err: any) {
            setError(err.message || "Failed to generate voiceover track.");
            updateScene(sceneId, { voiceStatus: "FAILED" });
        }
    };

    // Play Voice Preview from either Pre-generated R2 file or On-Demand blob preview
    const playVoicePreview = async (scene: Scene) => {
        if (playingAudioId === scene.id && previewAudio) {
            previewAudio.pause();
            setPlayingAudioId(null);
            return;
        }

        setError("");
        setPlayingAudioId(scene.id);

        try {
            let audioUrl = "";
            
            // If R2 path exists, download presigned URL
            if (scene.narrationPath) {
                const signedRes = await fetch(`/api/storage/signed?key=${scene.narrationPath}`);
                const signedData = await signedRes.json();
                audioUrl = signedData.url;
            } else {
                // Otherwise fall back to on-demand preview API
                const res = await fetch("/api/animated/voice/preview", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: scene.text, voice: scene.voice })
                });
                if (!res.ok) throw new Error();
                const blob = await res.blob();
                audioUrl = URL.createObjectURL(blob);
            }

            const audio = new Audio(audioUrl);
            setPreviewAudio(audio);
            audio.play();

            audio.onended = () => {
                setPlayingAudioId(null);
            };
        } catch (err) {
            setError("Failed to play scene voiceover audio.");
            setPlayingAudioId(null);
        }
    };

    // Dispatch Scene video generator request to RunPod
    const generateSceneVideo = async (sceneId: string, visualPrompt: string, characterName: string) => {
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

        // Find character avatar image path to pass as seed reference if available
        const characterObj = characters.find(c => c.name.toLowerCase() === characterName.toLowerCase());
        const hasRefImage = characterObj?.imagePath;

        try {
            const res = await fetch("/api/animated/scenes/video", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    sceneId, 
                    visualPrompt: finalPrompt, 
                    docId, 
                    refImage: hasRefImage || undefined 
                })
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

    // Queue All Visuals (Assembly Line Queueing)
    const handleQueueAllVisuals = async () => {
        setError("");
        const pendingScenes = scenes.filter(s => s.jobStatus !== "COMPLETED" && s.jobStatus !== "PROCESSING");
        if (pendingScenes.length === 0) return;

        console.log(`[Queue All] Queueing ${pendingScenes.length} visual scenes concurrent pipeline`);
        for (const s of pendingScenes) {
            await generateSceneVideo(s.id, s.visualPrompt, s.character);
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
    const addManualCharacter = () => {
        setCharacters(prev => [
            ...prev,
            { id: `char-${Date.now()}`, name: "CharacterName", prompt: "description details..." }
        ]);
    };

    const addPresetCharacter = (presetIndex: number) => {
        const preset = CHARACTER_PRESETS[presetIndex];
        setCharacters(prev => [
            ...prev,
            { id: `char-preset-${Date.now()}-${presetIndex}`, name: preset.name, prompt: preset.prompt }
        ]);
    };

    const resetToDefaultCharacters = () => {
        setCharacters([
            { id: "1", name: "Leo", prompt: CHARACTER_PRESETS[0].prompt },
            { id: "2", name: "Lily", prompt: CHARACTER_PRESETS[1].prompt }
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
        <div className="space-y-6 pb-12">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Kids AI Film Studio</h1>
                    <p className="text-gray-400 mt-1">Create persistent children's animation projects, generate consistent characters, plan storyboards, and compile videos.</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Project Selector Hub */}
                    <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-xl">
                        <span className="text-xs font-semibold text-gray-400">Project:</span>
                        <select value={selectedProjectId} onChange={e => handleSelectProject(e.target.value)}
                            className="bg-transparent text-xs text-white focus:outline-none cursor-pointer font-medium">
                            <option value="" className="bg-gray-900 text-gray-500">Create New Project...</option>
                            {projects.map(p => <option key={p.id} value={p.id} className="bg-gray-900 text-white">{p.title}</option>)}
                        </select>
                    </div>

                    <button onClick={handleSaveProject} disabled={saving}
                        className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-55 text-white text-xs font-bold rounded-xl transition-all shadow-md">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save Project Draft
                    </button>

                    <button onClick={() => setSourceMode(sourceMode === "video" ? "text" : "video")}
                        className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-xs font-semibold text-gray-300 hover:text-white transition-all">
                        {sourceMode === "video" ? "Write Original Story" : "Ingest Library Video"}
                    </button>
                </div>
            </div>

            {/* Error Panels */}
            {error && (
                <div className="flex items-start gap-3 text-red-400 text-xs bg-red-950/20 border border-red-900/30 p-4 rounded-xl">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <span className="font-semibold">{error}</span>
                        {insufficientFunds && (
                            <p className="text-red-300">
                                Please check your API billing settings and add balance to continue generating scripts.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Layout Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Left Side Panel - Video Ingest OR Original script creator */}
                <div className="lg:col-span-4 space-y-4">
                    {sourceMode === "video" ? (
                        <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-4 flex flex-col h-[560px]">
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
                    ) : (
                        // Custom Original Story writing box
                        <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-5 space-y-4 flex flex-col h-[560px]">
                            <div>
                                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Write Original Story</h3>
                                <p className="text-gray-400 text-[10px] mt-0.5">Type your story premise or custom script, and the AI will design the storyboard outline.</p>
                            </div>

                            <div className="space-y-3 flex-1 flex flex-col min-h-0">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Story Project Title</label>
                                    <input type="text" placeholder="Rusty the Robot's Swamp Rescue..." value={projectTitle} onChange={e => setProjectTitle(e.target.value)}
                                        className="w-full bg-gray-850 border border-gray-750 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500" />
                                </div>

                                <div className="flex-1 flex flex-col min-h-0">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Premise Concept or Complete Script</label>
                                    <textarea placeholder="Type your kid's story premise here. Even a rough/fragmented concept will be improved by the AI..."
                                        value={projectScript} onChange={e => setProjectScript(e.target.value)}
                                        className="w-full flex-1 bg-gray-850 border border-gray-750 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 resize-none font-sans leading-relaxed" />
                                </div>
                            </div>

                            <button onClick={handleAnalyze} disabled={summarizing || !projectScript}
                                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md mt-auto">
                                {summarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                Draft Story Blueprint
                            </button>
                        </div>
                    )}
                </div>

                {/* Right Side: Cast Profiles + Interactive Storyboard Timeline */}
                <div className="lg:col-span-8 space-y-6">
                    
                    {/* Character Consistency Profiles Box */}
                    <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                                <Users className="w-4 h-4 text-violet-400" /> Cast of Characters (Consistency Directory)
                            </h3>
                            <div className="flex items-center gap-2">
                                <button onClick={resetToDefaultCharacters} className="px-2 py-0.5 bg-gray-850 hover:bg-gray-800 border border-gray-750 text-gray-400 rounded text-[10px] font-bold transition-all">
                                    Reset Defaults
                                </button>
                                <select onChange={e => {
                                    if (e.target.value !== "") {
                                        addPresetCharacter(parseInt(e.target.value));
                                        e.target.value = "";
                                    }
                                }} className="bg-violet-600/10 border border-violet-500/20 text-violet-400 rounded text-[10px] font-bold px-2 py-0.5 focus:outline-none cursor-pointer">
                                    <option value="" className="bg-gray-900 text-gray-400">Add Preset Character...</option>
                                    {CHARACTER_PRESETS.map((preset, idx) => (
                                        <option key={idx} value={idx} className="bg-gray-900 text-white">{preset.name} (Template)</option>
                                    ))}
                                </select>
                                <button onClick={addManualCharacter} className="flex items-center gap-1 px-2 py-0.5 bg-violet-600/10 border border-violet-500/20 text-violet-400 rounded text-[10px] font-bold hover:bg-violet-600/20 transition-all">
                                    <Plus className="w-3 h-3" /> Manual
                                </button>
                            </div>
                        </div>
                        
                        <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                            {characters.map(char => (
                                <div key={char.id} className="flex gap-2 items-center bg-gray-950/20 border border-gray-850 p-2.5 rounded-xl">
                                    {/* Thumbnail Preview or Generator Loader */}
                                    <div className="w-12 h-12 bg-black/40 border border-gray-855 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center relative">
                                        {char.imagePath ? (
                                            <img src={`/api/storage/signed?key=${char.imagePath}`} alt="" className="w-full h-full object-cover" />
                                        ) : char.jobStatus === "QUEUED" || char.jobStatus === "PROCESSING" ? (
                                            <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                                        ) : (
                                            <Users className="w-5 h-5 text-gray-650" />
                                        )}
                                    </div>

                                    <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                                        <div className="flex gap-2">
                                            <input type="text" placeholder="Name" value={char.name} onChange={e => updateCharacterProfile(char.id, { name: e.target.value })}
                                                className="w-24 bg-gray-800 border border-gray-750 rounded-lg px-2 py-0.5 text-xs font-semibold text-white focus:outline-none focus:border-violet-500" />
                                            <button onClick={() => handleExpandCharacterPrompt(char.id, char.prompt)}
                                                className="flex items-center gap-0.5 px-2 py-0.5 bg-violet-600/15 border border-violet-500/25 text-violet-400 text-[9px] font-bold rounded hover:bg-violet-600/25 transition-all">
                                                <Sparkles className="w-2.5 h-2.5" /> AI Expand Prompt
                                            </button>
                                            <button onClick={() => handleGenerateAvatar(char.id, char.prompt)}
                                                disabled={char.jobStatus === "QUEUED" || char.jobStatus === "PROCESSING"}
                                                className="flex items-center gap-0.5 px-2 py-0.5 bg-emerald-600/15 border border-emerald-500/25 text-emerald-400 text-[9px] font-bold rounded hover:bg-emerald-600/25 transition-all disabled:opacity-50">
                                                <Tv className="w-2.5 h-2.5" /> Generate Avatar Face
                                            </button>
                                        </div>
                                        <input type="text" placeholder="Appearance description (Pixar style prompt)..." value={char.prompt} onChange={e => updateCharacterProfile(char.id, { prompt: e.target.value })}
                                            className="w-full bg-gray-800 border border-gray-750 rounded-lg px-2.5 py-1 text-[11px] text-gray-300 focus:outline-none focus:border-violet-500" />
                                    </div>
                                    <button onClick={() => deleteCharacterProfile(char.id)} className="p-1 bg-gray-800 border border-gray-750 hover:bg-red-950/25 hover:border-red-900/30 text-gray-500 hover:text-red-400 rounded-lg transition-colors flex-shrink-0">
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
                                <h3 className="text-lg font-semibold text-white">Storyboard Timeline is empty</h3>
                                <p className="text-gray-400 text-xs mt-1">
                                    Type your story premise in the left panel and click "Draft Story Blueprint" to generate kids show storyboard cards, or create manual cards.
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
                                    <div className="flex gap-2">
                                        <button onClick={handleQueueAllVisuals}
                                            className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg transition-all shadow">
                                            <Wand2 className="w-3.5 h-3.5" /> Queue All Visuals (Assembly Line)
                                        </button>
                                        <button onClick={addScene} className="flex items-center gap-1 px-2.5 py-1 bg-violet-600/15 hover:bg-violet-600/30 border border-violet-500/20 text-violet-400 text-[11px] font-semibold rounded-lg transition-all">
                                            <Plus className="w-3.5 h-3.5" /> Add Scene Card
                                        </button>
                                    </div>
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
                                                                <select value={scene.character} onChange={e => updateScene(scene.id, { character: e.target.value })}
                                                                    className="w-full bg-gray-850 border border-gray-750 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500">
                                                                    {characters.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-0.5">Voice Tone</label>
                                                                <div className="flex items-center gap-1">
                                                                    <select value={scene.voice} onChange={e => updateScene(scene.id, { voice: e.target.value })}
                                                                        className="flex-1 bg-gray-850 border border-gray-750 rounded-lg px-1.5 py-1 text-[10px] text-white focus:outline-none focus:border-violet-500">
                                                                        {EDGE_TTS_VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                                                                    </select>
                                                                    <button onClick={() => playVoicePreview(scene)}
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

                                                    {/* Textarea for Script/Lyrics with AI Improve Action */}
                                                    <div>
                                                        <div className="flex items-center justify-between mb-0.5">
                                                            <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block">
                                                                {scene.type === "song" ? "Song Lyrics" : "Dialogue Spoken Text"}
                                                            </label>
                                                            <button onClick={() => handleImproveScript(scene.id, scene.text, scene.type)}
                                                                className="flex items-center gap-0.5 text-violet-400 hover:text-violet-300 text-[9px] font-bold">
                                                                <Sparkle className="w-2.5 h-2.5" /> AI Improve Text
                                                            </button>
                                                        </div>
                                                        <textarea value={scene.text} onChange={e => updateScene(scene.id, { text: e.target.value })} rows={4}
                                                            className="w-full bg-gray-850 border border-gray-750 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500 font-mono leading-relaxed" />
                                                    </div>

                                                    {/* Visual prompt input */}
                                                    <div>
                                                        <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-0.5">RunPod Visual Prompt</label>
                                                        <textarea value={scene.visualPrompt} onChange={e => updateScene(scene.id, { visualPrompt: e.target.value })} rows={2}
                                                            className="w-full bg-gray-850 border border-gray-750 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500 leading-relaxed resize-none" />
                                                    </div>

                                                    {/* Generate triggers row */}
                                                    <div className="grid grid-cols-2 gap-2 pt-2">
                                                        {scene.type === "dialogue" ? (
                                                            <button onClick={() => generateSceneVoiceover(scene.id, scene.text, scene.voice)}
                                                                disabled={scene.voiceStatus === "GENERATING"}
                                                                className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all border border-gray-750 bg-gray-850 hover:bg-gray-800 text-gray-300 disabled:opacity-50">
                                                                {scene.voiceStatus === "GENERATING" ? (
                                                                    <>
                                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                        <span>Synthesizing...</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Volume2 className="w-3.5 h-3.5" />
                                                                        <span>{scene.narrationPath ? "Regenerate Voice" : "Synthesize Voice"}</span>
                                                                    </>
                                                                )}
                                                            </button>
                                                        ) : (
                                                            <button onClick={() => {
                                                                navigator.clipboard.writeText(scene.text);
                                                                alert("Song lyrics copied to clipboard! You can paste them into Suno.");
                                                            }} className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all border border-gray-750 bg-gray-850 hover:bg-gray-800 text-gray-300">
                                                                <FileText className="w-3.5 h-3.5" />
                                                                <span>Copy Lyrics for Suno</span>
                                                            </button>
                                                        )}

                                                        <button onClick={() => generateSceneVideo(scene.id, scene.visualPrompt, scene.character)}
                                                            disabled={scene.jobStatus === "QUEUED" || scene.jobStatus === "PROCESSING"}
                                                            className={cn("flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50",
                                                                scene.jobStatus === "COMPLETED" ? "bg-gray-850 hover:bg-gray-800 text-gray-300 border border-gray-750" : "bg-violet-600 hover:bg-violet-500 text-white")}>
                                                            {scene.jobStatus === "QUEUED" || scene.jobStatus === "PROCESSING" ? (
                                                                <>
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                    <span>Generating Clip...</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Wand2 className="w-3.5 h-3.5" />
                                                                    <span>{scene.jobStatus === "COMPLETED" ? "Regenerate Visual" : "Generate Visual"}</span>
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
