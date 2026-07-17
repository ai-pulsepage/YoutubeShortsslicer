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
    Clock,
    Check,
    Users,
    Save,
    Sparkle,
    ArrowRight,
    ArrowLeft,
    Copy,
    Upload,
    Folder
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

type Shot = {
    id: string;
    primaryCharacter: string;
    visualPrompt: string;
    imagePrompt?: string;     // FLUX starting frame prompt
    motionPrompt?: string;    // Wan motion prompt
    startImagePath?: string;  // Generated starting webp frame path
    startImageJobId?: string; // FLUX generation jobId
    startImageJobStatus?: "IDLE" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
    visualPath?: string;      // R2 key of generated shot clip
    jobId?: string;           // RunPod Job ID
    jobStatus?: "IDLE" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "PENDING_AVATAR" | "PENDING_PREVIOUS" | "GENERATING_IMAGE";
    duration?: number;        // Optional custom duration in seconds
    chainFromPrevious?: boolean; // Optional flag to chain keyframe context
};

type Scene = {
    id: string;
    type: "dialogue" | "song";
    character: string;
    voice: string;
    text: string;
    visualPrompt: string;
    visualPath?: string;       // Fallback for single clip or compiled path
    jobId?: string;            // Fallback Job ID
    jobStatus?: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
    sunoAudioKey?: string;      // R2 key for uploaded Suno audio
    sunoStylePrompt?: string;   // Suggested style prompt for Suno AI
    sunoDuration?: number;      // Resolved MP3 duration in seconds
    narrationPath?: string;     // R2 key for pre-generated dialogue voice
    voiceStatus?: "IDLE" | "GENERATING" | "READY" | "FAILED";
    visualShots?: Shot[];       // Multi-shot sequence
    planningShots?: boolean;    // Loading state for AI planning
};

type Character = {
    id: string;
    name: string;
    prompt: string;
    imagePath?: string;         // R2 avatar path
    jobId?: string;            // Avatar generation job id
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
    sourceUrls?: string[];
};

type Video = {
    id: string;
    title: string;
    description?: string | null;
    thumbnail: string | null;
    duration: number | null;
    createdAt: string;
};

const EDGE_TTS_VOICES = [
    { id: "en-US-AnaNeural-Female", label: "Ana (US Child Female)" },
    { id: "en-US-ChristopherNeural-Male", label: "Christopher (US Child Male)" },
    { id: "en-GB-OliverNeural-Male", label: "Oliver (UK Child Male)" },
    { id: "zh-CN-XiaoyiNeural-Female", label: "Xiaoyi (CN Child Female)" },
    { id: "en-US-AriaNeural-Female", label: "Aria (US Female)" },
    { id: "en-US-GuyNeural-Male", label: "Guy (US Male)" },
    { id: "en-GB-SoniaNeural-Female", label: "Sonia (UK Female)" },
    { id: "en-GB-RyanNeural-Male", label: "Ryan (UK Male)" },
    { id: "zh-CN-XiaoxiaoNeural-Female", label: "Xiaoxiao (CN Female)" },
    { id: "zh-CN-YunxiNeural-Male", label: "Yunxi (CN Male)" },
];

const CHARACTER_PRESETS = [
    { name: "Leo", prompt: "A young 3D Pixar style cartoon boy with bright green eyes, a wide joyful smile, and messy red hair. He wears a yellow t-shirt and blue denim shorts. His features are soft, round, and friendly. Styled in Pixar 3D digital animation look, shown against a neutral studio backdrop." },
    { name: "Lily", prompt: "A cheerful 3D Pixar style cartoon princess girl with round brown eyes, black hair, and a sparkling gold crown. She wears a warm pink dress. Features are soft and rounded. Beautiful 3D cartoon style, shown on a plain studio backdrop." },
    { name: "Bingo", prompt: "A cute anthropomorphic 3D cartoon bunny with big, curious round eyes and fluffy white fur. He wears a tiny blue vest. Cute, child-friendly features in 3D Pixar style, shown on a neutral plain background." },
    { name: "Rex", prompt: "A friendly 3D cartoon baby green dinosaur with big round eyes, a happy smile, and a soft, smooth green skin texture. Cute anthropomorphic styling, Pixar look, shown on a plain studio backdrop." },
    { name: "Rusty", prompt: "A shiny 3D toy robot with smiling digital eyes, colorful control buttons, and rounded steel-blue joints. Friendly cartoon style, clean child-friendly Pixar look, shown on a neutral backdrop." },
    { name: "Buddy", prompt: "An adorable anthropomorphic 3D golden retriever puppy with floppy ears and a red collar. Kind expression, happy smile, soft plush fur texture, Pixar cartoon style, shown on a plain studio background." }
];

export default function KidsStoryBuilderPage() {
    const [currentStep, setCurrentStep] = useState<number>(1);
    const [sourceMode, setSourceMode] = useState<"text" | "video">("text");
    
    // Project Hub State
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>("");
    const [projectTitle, setProjectTitle] = useState("");
    const [projectScript, setProjectScript] = useState("");
    const [targetDuration, setTargetDuration] = useState<number>(2); // Default to 2 minutes
    const [defaultShotDuration, setDefaultShotDuration] = useState<number>(5); // Default scene clip duration
    const [compositionMode, setCompositionMode] = useState<"spin_off" | "paraphrase">("spin_off");
    const [includeMusicals, setIncludeMusicals] = useState<boolean>(true);
    const [visualStyle, setVisualStyle] = useState<string>("Pixar 3D");
    const [targetAge, setTargetAge] = useState<string>("Kids");
    const [genre, setGenre] = useState<string>("Adventure");
    const [rewritingShotId, setRewritingShotId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [generatingAllVoices, setGeneratingAllVoices] = useState(false);
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);
    const [librarySearchQuery, setLibrarySearchQuery] = useState("");

    const [docId, setDocId] = useState<string | null>(null);
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [characters, setCharacters] = useState<Character[]>([]);
    const [libraryCharacters, setLibraryCharacters] = useState<Character[]>([]);
    const [pickingAvatarCharId, setPickingAvatarCharId] = useState<string | null>(null);
    const [r2Avatars, setR2Avatars] = useState<{ key: string; size: number }[]>([]);
    const [loadingR2Avatars, setLoadingR2Avatars] = useState(false);

    // Voice preview audio state
    const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
    const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);

    // Compilation states
    const [compiling, setCompiling] = useState(false);
    const [compiledVideoUrl, setCompiledVideoUrl] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [insufficientFunds, setInsufficientFunds] = useState(false);
    const [translating, setTranslating] = useState(false);

    // Ingested videos state
    const [videos, setVideos] = useState<Video[]>([]);
    const [selectedVideoId, setSelectedVideoId] = useState<string>("");
    const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
    const [visualAnalysis, setVisualAnalysis] = useState<any>(null);
    const [runningVisualAnalysis, setRunningVisualAnalysis] = useState(false);
    const [transcriptText, setTranscriptText] = useState("");
    const [videosLoading, setVideosLoading] = useState(false);
    const [transcriptLoading, setTranscriptLoading] = useState(false);
    const [summarizing, setSummarizing] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Load projects and videos list
    useEffect(() => {
        loadProjects();
        loadLibraryCharacters();
        setVideosLoading(true);
        fetch("/api/videos?status=READY&limit=50")
            .then(r => r.json())
            .then(data => {
                setVideos(data.videos || []);
            })
            .catch(err => console.error("Failed to load videos:", err))
            .finally(() => setVideosLoading(false));
    }, []);

    // Auto-load project from URL query parameter
    useEffect(() => {
        if (projects.length > 0) {
            const params = new URLSearchParams(window.location.search);
            const queryProjId = params.get("project");
            const queryStep = params.get("step");
            if (queryProjId && queryProjId !== selectedProjectId) {
                const parsedStep = queryStep ? parseInt(queryStep, 10) : 1;
                const targetStep = (parsedStep >= 1 && parsedStep <= 5) ? parsedStep : 1;
                handleSelectProject(queryProjId, targetStep);
            }
        }
    }, [projects]);

    // Sync project and step index to the URL parameters
    useEffect(() => {
        if (projects.length === 0) return; // Wait until projects have loaded from the database

        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            if (selectedProjectId) {
                params.set("project", selectedProjectId);
                params.set("step", String(currentStep));
            } else {
                params.delete("project");
                params.delete("step");
            }
            const newUrl = params.toString() ? `/dashboard/animated?${params.toString()}` : "/dashboard/animated";
            window.history.replaceState({}, "", newUrl);
        }
    }, [selectedProjectId, currentStep, projects]);

    // Load specific video transcript
    useEffect(() => {
        if (!selectedVideoId) {
            setSelectedVideo(null);
            setTranscriptText("");
            return;
        }

        const videoObj = videos.find(v => v.id === selectedVideoId);
        setSelectedVideo(videoObj || null);

        if (videoObj && videoObj.description) {
            try {
                const parsed = JSON.parse(videoObj.description);
                if (parsed.headcount !== undefined) {
                    setVisualAnalysis(parsed);
                } else {
                    setVisualAnalysis(null);
                }
            } catch (e) {
                setVisualAnalysis(null);
            }
        } else {
            setVisualAnalysis(null);
        }

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
        // Collect all pending job ids from nested shots
        const pendingJobs: { sceneId: string; shotId: string; jobId: string }[] = [];
        scenes.forEach(s => {
            if (s.visualShots) {
                s.visualShots.forEach(shot => {
                    if (shot.jobId && shot.jobStatus !== "COMPLETED" && shot.jobStatus !== "FAILED") {
                        pendingJobs.push({ sceneId: s.id, shotId: shot.id, jobId: shot.jobId });
                    }
                    if (shot.startImageJobId && shot.startImageJobStatus !== "COMPLETED" && shot.startImageJobStatus !== "FAILED") {
                        pendingJobs.push({ sceneId: s.id, shotId: shot.id, jobId: shot.startImageJobId });
                    }
                });
            }
        });

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
                        if (!scene.visualShots) return scene;
                        const updatedShots = scene.visualShots.map(shot => {
                            let updatedShot = { ...shot };

                            // Update start image job state if matching
                            if (shot.startImageJobId) {
                                const matchingStartJob = updatedJobs.find((j: any) => j.id === shot.startImageJobId);
                                if (matchingStartJob) {
                                    updatedShot.startImageJobStatus = (matchingStartJob.status === "QUEUED" ? "QUEUED"
                                                                     : matchingStartJob.status === "PROCESSING" ? "PROCESSING"
                                                                     : matchingStartJob.status === "COMPLETED" ? "COMPLETED"
                                                                     : "FAILED") as any;
                                    if (matchingStartJob.status === "COMPLETED" && matchingStartJob.outputPath) {
                                        updatedShot.startImagePath = matchingStartJob.outputPath;
                                        // Auto-migrate if it was saved to visualPath by old bugs
                                        if (updatedShot.visualPath === matchingStartJob.outputPath) {
                                            updatedShot.visualPath = undefined;
                                            updatedShot.jobStatus = "IDLE";
                                        }
                                    }
                                }
                            }

                            // Update final video job state if matching
                            if (shot.jobId) {
                                const matchingVideoJob = updatedJobs.find((j: any) => j.id === shot.jobId);
                                if (matchingVideoJob) {
                                    updatedShot.jobStatus = (matchingVideoJob.status === "QUEUED" ? "QUEUED"
                                                           : matchingVideoJob.status === "PROCESSING" ? "PROCESSING"
                                                           : matchingVideoJob.status === "COMPLETED" ? "COMPLETED"
                                                           : "FAILED") as Shot["jobStatus"];
                                    updatedShot.visualPath = matchingVideoJob.outputPath || shot.visualPath;
                                }
                            }

                            return updatedShot;
                        });

                        const allDone = updatedShots.every(s => s.jobStatus === "COMPLETED");
                        return {
                            ...scene,
                            visualShots: updatedShots,
                            // Map the final compiled visual path or last clip path if done
                            visualPath: allDone ? updatedShots[updatedShots.length - 1].visualPath : scene.visualPath
                        };
                    })
                );

                // Update characters
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

    // Load global character library assets
    const loadLibraryCharacters = async () => {
        try {
            const res = await fetch("/api/animated/characters/library");
            if (res.ok) {
                const data = await res.json();
                setLibraryCharacters(data.characters || []);
            }
        } catch (err) {
            console.error("Failed to load library characters:", err);
        }
    };

    const handleSaveToLibrary = async (char: Character) => {
        setError("");
        try {
            const res = await fetch("/api/animated/characters/library", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: char.name,
                    prompt: char.prompt,
                    imagePath: char.imagePath
                })
            });
            if (!res.ok) throw new Error("Failed to save to library");
            alert(`"${char.name}" has been saved to your global character library!`);
            loadLibraryCharacters();
        } catch (err: any) {
            setError(err.message || "Error saving to library.");
        }
    };

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
    const handleSelectProject = (projectId: string, defaultStep: number = 1) => {
        if (!projectId) {
            setSelectedProjectId("");
            setDocId(null);
            setProjectTitle("");
            setProjectScript("");
            setScenes([]);
            setCharacters([]);
            setCurrentStep(1);
            return;
        }
        const proj = projects.find(p => p.id === projectId);
        if (proj) {
            setSelectedProjectId(proj.id);
            setDocId(proj.id);
            setProjectTitle(proj.title);
            setProjectScript(proj.script);
            // Match characters with library characters by name to auto-populate images if missing
            const mappedCharacters = proj.characters.map(c => {
                if (!c.imagePath) {
                    const match = libraryCharacters.find(lc => lc.name.toLowerCase() === c.name.toLowerCase());
                    if (match && match.imagePath) {
                        return { ...c, imagePath: match.imagePath };
                    }
                }
                return c;
            });
            setCharacters(mappedCharacters);
            const cleanedScenes = proj.scenes.map(s => {
                let visualShots = s.visualShots || [];
                if (Array.isArray(visualShots)) {
                    visualShots = visualShots.map((shot: any) => {
                        if (shot.visualPath && shot.visualPath.endsWith(".webp")) {
                            return {
                                ...shot,
                                startImagePath: shot.startImagePath || shot.visualPath,
                                startImageJobStatus: "COMPLETED",
                                startImageJobId: shot.startImageJobId || shot.jobId,
                                visualPath: undefined,
                                jobStatus: shot.jobStatus === "COMPLETED" ? "IDLE" : shot.jobStatus,
                                jobId: undefined
                            };
                        }
                        return shot;
                    });
                }
                return {
                    ...s,
                    type: s.type || "dialogue",
                    character: s.character || "Leo",
                    voice: s.voice || "en-US-AnaNeural-Female",
                    visualShots
                };
            });
            setScenes(cleanedScenes);
            
            // Restore video ingestion source mode and ID
            if (proj.sourceUrls && proj.sourceUrls.length > 0) {
                setSourceMode("video");
                setSelectedVideoId(proj.sourceUrls[0]);
            } else {
                setSourceMode("text");
                setSelectedVideoId("");
            }
            setTargetDuration((proj as any).targetDuration || 2);
            setDefaultShotDuration((proj as any).defaultShotDuration || 5);
            setCompositionMode((proj as any).compositionMode || "spin_off");
            setIncludeMusicals((proj as any).includeMusicals !== false);
            setVisualStyle((proj as any).visualStyle || "Pixar 3D");
            setTargetAge((proj as any).targetAge || "Kids");
            setGenre((proj as any).genre || "Adventure");
            setVisualAnalysis((proj as any).visualAnalysis || null);
            setCurrentStep(defaultStep);
        }
    };

    // Run Visual Analysis
    const handleRunVisualAnalysis = async () => {
        if (!selectedVideoId) return;
        setError("");
        setRunningVisualAnalysis(true);
        try {
            const res = await fetch("/api/animated/projects/analyze-video", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videoId: selectedVideoId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to analyze video");
            
            if (data.visualAnalysis) {
                setVisualAnalysis(data.visualAnalysis);
                // Update the videos array so it is updated in-place without page reloading
                setVideos(prev => prev.map(v => {
                    if (v.id === selectedVideoId) {
                        return { ...v, description: JSON.stringify(data.visualAnalysis) };
                    }
                    return v;
                }));
                loadProjects();
            }
        } catch (err: any) {
            setError(err.message || "Failed to analyze video.");
        } finally {
            setRunningVisualAnalysis(false);
        }
    };

    // Save Project Draft
    const handleSaveProject = async (overrideScenes?: typeof scenes, overrideCharacters?: typeof characters) => {
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
                    characters: overrideCharacters !== undefined ? overrideCharacters : characters,
                    scenes: overrideScenes !== undefined ? overrideScenes : scenes,
                    sourceUrls: selectedVideoId ? [selectedVideoId] : [],
                    targetDuration,
                    defaultShotDuration,
                    compositionMode,
                    includeMusicals,
                    visualStyle,
                    targetAge,
                    genre
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save project");

            if (data.project) {
                setDocId(data.project.id);
                setSelectedProjectId(data.project.id);
                if (data.project.characters) {
                    setCharacters(data.project.characters);
                }
                if (data.project.scenes) {
                    setScenes(data.project.scenes);
                }
                loadProjects();
                return {
                    id: data.project.id,
                    characters: data.project.characters
                };
            }
        } catch (err: any) {
            setError(err.message || "Error saving project.");
        } finally {
            setSaving(false);
        }
    };

    // Blueprint Generator
    const handleAnalyze = async () => {
        setSummarizing(true);
        setError("");
        setInsufficientFunds(false);
        try {
            const bodyPayload = sourceMode === "video" 
                ? { videoId: selectedVideoId, characters, targetDuration, defaultShotDuration, compositionMode, includeMusicals, visualStyle, targetAge, genre } 
                : { premise: projectScript, characters, targetDuration, defaultShotDuration, compositionMode, includeMusicals, visualStyle, targetAge, genre };

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
                const mappedScenes = data.scenes.map((s: any, idx: number) => ({
                    ...s,
                    visualShots: s.visualShots ? s.visualShots.map((shot: any) => ({
                        ...shot,
                        duration: shot.duration || defaultShotDuration
                    })) : [
                        {
                            id: `shot-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}-default`,
                            primaryCharacter: s.character || "Leo",
                            visualPrompt: s.visualPrompt || "Cartoon style scenery background",
                            duration: defaultShotDuration,
                            jobStatus: "IDLE"
                        }
                    ]
                }));
                setScenes(mappedScenes);
                setTimeout(() => handleSaveProject(mappedScenes), 100);
                setCurrentStep(4);
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

    // AI Rewrite Shot Visual Prompt to match Character
    const handleRewriteShotPrompt = async (sceneId: string, shotId: string, visualPrompt: string, motionPrompt: string | undefined, primaryCharacter: string, sceneText: string) => {
        setError("");
        setInsufficientFunds(false);
        setRewritingShotId(shotId);
        try {
            const charObj = characters.find(c => c.name.toLowerCase() === primaryCharacter.toLowerCase());
            const characterPrompt = charObj ? charObj.prompt : "";

            const res = await fetch("/api/animated/scenes/improve-shot-prompt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    visualPrompt, 
                    motionPrompt, 
                    primaryCharacter, 
                    characterPrompt, 
                    sceneText, 
                    visualStyle 
                })
            });
            const data = await res.json();

            if (res.status === 402 || data.error === "DEEPSEEK_OUT_OF_FUNDS") {
                setInsufficientFunds(true);
                throw new Error("DeepSeek API: Insufficient Balance. Please check your console.deepseek.com funds.");
            }

            if (!res.ok) throw new Error(data.error || "Failed to rewrite visual prompt");

            if (data.rewrittenPrompt) {
                updateShot(sceneId, shotId, { 
                    visualPrompt: data.rewrittenPrompt,
                    imagePrompt: data.rewrittenImagePrompt || data.rewrittenPrompt,
                    motionPrompt: data.rewrittenMotionPrompt || motionPrompt
                });
            }
        } catch (err: any) {
            setError(err.message || "Failed to rewrite prompt.");
        } finally {
            setRewritingShotId(null);
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
        let activeCharId = charId;
        let activeDocId = docId;

        setError("");
        try {
            // Auto-save project if character has a temp ID or project is unsaved
            if (charId.startsWith("temp-") || !docId) {
                const localChar = characters.find(c => c.id === charId);
                if (!localChar) throw new Error("Character profile not found in local blueprint");

                console.log("[Auto-Save] Saving project before avatar generation to sync database IDs...");
                const saveResult = await handleSaveProject();
                if (!saveResult) throw new Error("Failed to save project draft. Please save draft manually first.");

                activeDocId = saveResult.id;
                
                // Find matching character's newly generated database CUID
                const updatedChar = saveResult.characters?.find((c: any) => c.name === localChar.name);
                if (!updatedChar) {
                    throw new Error(`Failed to save character profile for ${localChar.name}. Please try saving draft manually first.`);
                }
                activeCharId = updatedChar.id;
            }

            if (!activeDocId) {
                throw new Error("Please click 'Save Project Draft' first before generating character avatars.");
            }

            const res = await fetch("/api/animated/characters/avatar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ docId: activeDocId, characterId: activeCharId, prompt: promptText })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Avatar generation call failed");

            updateCharacterProfile(activeCharId, {
                jobId: data.jobId,
                jobStatus: "QUEUED"
            });
        } catch (err: any) {
            setError(err.message || "Failed to queue avatar face generator.");
        }
    };

    // Card-Level EdgeTTS Voiceover Pre-Generator
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
            // Auto plan shots based on EdgeTTS narration duration
            setTimeout(() => probeAndPlanShots(sceneId, data.narrationPath, text), 100);
        } catch (err: any) {
            setError(err.message || "Failed to generate voiceover track.");
            updateScene(sceneId, { voiceStatus: "FAILED" });
        }
    };

    // Batch Generate Dialogue Voiceovers
    const handleGenerateAllVoices = async () => {
        const dialogueScenes = scenes.filter(s => s.type === "dialogue" && s.voiceStatus !== "READY");
        if (dialogueScenes.length === 0) {
            alert("All dialogue voiceovers are already generated!");
            return;
        }

        setGeneratingAllVoices(true);
        setError("");

        try {
            // First, trigger a save to ensure latest timeline matches database
            await handleSaveProject();

            for (let i = 0; i < dialogueScenes.length; i++) {
                const s = dialogueScenes[i];
                console.log(`[Batch Audio] Generating voiceover for scene ${s.id} (${i + 1}/${dialogueScenes.length})`);
                
                updateScene(s.id, { voiceStatus: "GENERATING" });

                const res = await fetch("/api/animated/voice/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ docId, sceneId: s.id, text: s.text, voice: s.voice })
                });
                const data = await res.json();
                if (!res.ok) {
                    updateScene(s.id, { voiceStatus: "FAILED" });
                    throw new Error(data.error || `Voiceover synthesis failed for scene ${i + 1}`);
                }

                updateScene(s.id, {
                    narrationPath: data.narrationPath,
                    voiceStatus: "READY"
                });
                
                // Auto plan shots based on EdgeTTS narration duration
                await probeAndPlanShots(s.id, data.narrationPath, s.text);
            }
            alert(`Successfully generated narration audio for all ${dialogueScenes.length} dialogue scenes!`);
        } catch (err: any) {
            setError(err.message || "Failed during batch voiceover generation.");
        } finally {
            setGeneratingAllVoices(false);
            // Refresh project state
            const freshRes = await fetch("/api/animated/projects");
            if (freshRes.ok) {
                const freshData = await freshRes.json();
                setProjects(freshData.projects || []);
            }
        }
    };

    // Probe Suno Duration and Plan Shots
    const probeAndPlanShots = async (sceneId: string, audioKey: string, lyrics: string) => {
        setError("");
        updateScene(sceneId, { planningShots: true });
        
        try {
            // 1. Probe duration using ffprobe
            const durRes = await fetch("/api/animated/scenes/video/duration", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ audioKey })
            });
            const durData = await durRes.json();
            if (!durRes.ok) throw new Error(durData.error || "Failed to resolve audio duration");

            const duration = durData.duration || 5.0;
            const numShots = Math.max(1, Math.ceil(duration / (defaultShotDuration || 5)));

            // 2. Plan visual prompts using DeepSeek
            const shotDur = duration / numShots;
            const planRes = await fetch("/api/animated/scenes/video/plan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lyrics, numShots, characters, shotDuration: Math.max(3, Math.round(shotDur)), visualStyle })
            });
            const planData = await planRes.json();
            if (!planRes.ok) throw new Error(planData.error || "Failed to plan visual shots");

            const plannedShots = planData.shots.map((s: any, idx: number) => ({
                id: `shot-${idx}-${Date.now()}`,
                primaryCharacter: s.primaryCharacter || "Narrator",
                visualPrompt: s.visualPrompt || "Cartoon scene background",
                duration: Math.max(3, Math.round(shotDur)),
                chainFromPrevious: idx === 0 ? false : (s.chainFromPrevious ?? false),
                jobStatus: "IDLE"
            }));

            updateScene(sceneId, {
                sunoDuration: duration,
                visualShots: plannedShots
            });

        } catch (err: any) {
            setError(err.message || "Failed to plan visual shots sequence.");
        } finally {
            updateScene(sceneId, { planningShots: false });
        }
    };

    // Play Voice Preview
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
            if (scene.narrationPath) {
                const signedRes = await fetch(`/api/storage/signed?key=${scene.narrationPath}`);
                const signedData = await signedRes.json();
                audioUrl = signedData.url;
            } else {
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

    // Dispatch Scene video generator (shot-level)
    const generateShotVideo = async (sceneId: string, shotObj: Shot) => {
        setError("");
        const shotId = shotObj.id;
        const visualPrompt = shotObj.visualPrompt;
        const characterName = shotObj.primaryCharacter;
        
        let finalPrompt = visualPrompt;
        characters.forEach(char => {
            if (!char.name.trim()) return;
            const regex = new RegExp(`\\b${char.name}\\b`, 'gi');
            if (regex.test(finalPrompt)) {
                finalPrompt = finalPrompt.replace(regex, `${char.name} (${char.prompt})`);
            }
        });

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
                    refImage: hasRefImage || undefined,
                    shotId: shotObj.id,
                    duration: shotObj.duration || 5,
                    chainFromPrevious: shotObj.chainFromPrevious || false
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to start video generation");

            if (data.docId) setDocId(data.docId);

            setScenes(prev =>
                prev.map(s => {
                    if (s.id !== sceneId || !s.visualShots) return s;
                    return {
                        ...s,
                        visualShots: s.visualShots.map(shot => {
                            if (shot.id !== shotId) return shot;
                            return {
                                ...shot,
                                jobId: data.jobId,
                                jobStatus: data.pendingAvatar ? "PENDING_AVATAR" : (data.generatingImage ? "GENERATING_IMAGE" : "QUEUED")
                            };
                        })
                    };
                })
            );
        } catch (err: any) {
            setError(err.message || "Failed to dispatch video task.");
        }
    };

    // Assembly Line concurrent visual queuing (shot-level)
    const handleQueueAllVisuals = async () => {
        if (!docId) {
            setError("Please save the project first before batch queuing visuals.");
            return;
        }
        setError("");
        
        try {
            // First, trigger a save to ensure latest timeline matches database
            await handleSaveProject();

            // Run batch queue call
            const res = await fetch("/api/animated/projects/batch-queue", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId: docId })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Batch queuing failed");

            // Reload projects, select the updated project to refresh scenes list statuses
            await loadProjects();
            const freshRes = await fetch("/api/animated/projects");
            if (freshRes.ok) {
                const freshData = await freshRes.json();
                const updatedProj = (freshData.projects || []).find((p: any) => p.id === docId);
                if (updatedProj) {
                    setCharacters(updatedProj.characters);
                    setScenes(updatedProj.scenes);
                }
            }
            alert(`Queued ${data.queuedAvatarsCount} character avatars and ${data.queuedShotsCount} video scenes to Redis. Start your RunPod worker now to generate them!`);
        } catch (err: any) {
            setError(err.message || "Failed to batch queue visuals.");
        }
    };

    // Handle Custom Suno MP3 Upload
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

            const sunoKey = data.path || data.key;
            updateScene(sceneId, {
                sunoAudioKey: sunoKey
            });

            // Automatically trigger ffprobe and AI shot planning based on lyrics
            const sceneObj = scenes.find(s => s.id === sceneId);
            if (sceneObj) {
                probeAndPlanShots(sceneId, sunoKey, sceneObj.text);
            }
        } catch (err: any) {
            setError(`Audio upload failed: ${err.message}`);
        }
    };

    // Handle Custom Suno MP3 Deletion/Clear
    const handleClearSunoSong = async (sceneId: string) => {
        if (!confirm("Are you sure you want to delete the song from this scene? This will reset all generated visual shots for this scene.")) return;
        
        setError("");
        try {
            const defaultPrompt = scenes.find(s => s.id === sceneId)?.text || "";
            
            // Rebuild default visual shots list
            const defaultVisualShots = [
                {
                    id: `shot-0-${Date.now()}`,
                    visualPrompt: `${visualStyle} style animation of ${defaultPrompt.slice(0, 80)}, close-up portrait, plain neutral studio background`,
                    duration: defaultShotDuration || 5,
                    primaryCharacter: "None",
                    jobId: "",
                    jobStatus: "IDLE" as const
                }
            ];

            const updatedScenes = scenes.map(s => {
                if (s.id === sceneId) {
                    return {
                        ...s,
                        sunoAudioKey: "",
                        sunoDuration: undefined,
                        visualShots: defaultVisualShots,
                        visualPath: undefined
                    };
                }
                return s;
            });

            setScenes(updatedScenes);
            await handleSaveProject(updatedScenes);

        } catch (err: any) {
            setError(err.message || "Failed to clear song.");
        }
    };

    // Edit scene values
    const updateScene = (id: string, updates: Partial<Scene>) => {
        setScenes(prev =>
            prev.map(s => (s.id === id ? { ...s, ...updates } : s))
        );
    };

    const addScene = () => {
        const newScene: Scene = {
            id: `scene-manual-${Date.now()}`,
            type: "dialogue",
            character: characters?.[0]?.name || "Narrator",
            voice: "en-US-AnaNeural-Female",
            text: "New dialogue script lines...",
            visualPrompt: "Pixar style cartoon scene background",
            visualShots: [
                {
                    id: `shot-${Date.now()}-default`,
                    primaryCharacter: characters?.[0]?.name || "Narrator",
                    visualPrompt: "Pixar style cartoon scene background",
                    jobStatus: "IDLE"
                }
            ]
        };
        setScenes(prev => [...prev, newScene]);
    };

    const deleteScene = (id: string) => {
        if (typeof window !== "undefined" && !window.confirm("Are you sure you want to delete this entire scene? This will remove all associated dialogue and visual shots.")) {
            return;
        }
        setScenes(prev => prev.filter(s => s.id !== id));
    };

    // Characters directory setup
    const addManualCharacter = () => {
        setCharacters(prev => [
            ...prev,
            { id: `char-${Date.now()}`, name: "", prompt: "" }
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

    // Duplicate an existing character profile including their prompt and generated face R2 path
    const cloneCharacter = (char: Character) => {
        let updatedCharacters: typeof characters = [];
        setCharacters(prev => {
            const next = [
                ...prev,
                {
                    id: `char-clone-${Date.now()}`,
                    name: char.name ? `${char.name} (Copy)` : "Copy",
                    prompt: char.prompt,
                    imagePath: char.imagePath,
                    jobStatus: char.imagePath ? "COMPLETED" as const : undefined
                }
            ];
            updatedCharacters = next;
            return next;
        });
        setTimeout(() => {
            handleSaveProject(undefined, updatedCharacters);
        }, 50);
    };

    // Client-side file uploader: Upload a custom character profile image directly to R2 and auto-save the draft
    const handleUploadAvatarImage = async (charId: string, file: File) => {
        setError("");
        const formData = new FormData();
        formData.append("file", file);
        formData.append("characterId", charId);

        try {
            const res = await fetch("/api/animated/characters/upload", {
                method: "POST",
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to upload custom avatar");

            let updatedCharacters: typeof characters = [];
            setCharacters(prev => {
                const next = prev.map(c => (c.id === charId ? { ...c, imagePath: data.imagePath, jobStatus: "COMPLETED" as const } : c));
                updatedCharacters = next;
                return next;
            });
            setTimeout(() => {
                handleSaveProject(undefined, updatedCharacters);
            }, 50);
        } catch (err: any) {
            setError(err.message || "Error uploading avatar image.");
        }
    };

    // Scan avatars/ and animated/ prefixes in R2 and display file chooser popup
    const openR2Picker = async (charId: string) => {
        setPickingAvatarCharId(charId);
        setLoadingR2Avatars(true);
        try {
            const [resAvatars, resAssets, resDocs] = await Promise.all([
                fetch("/api/storage/list?prefix=avatars/"),
                fetch("/api/storage/list?prefix=animated/&recursive=true"),
                fetch("/api/storage/list?prefix=documentaries/&recursive=true")
            ]);
            
            const dataAvatars = await resAvatars.json();
            const dataAssets = await resAssets.json();
            const dataDocs = await resDocs.json();
            
            const mergedFiles = [
                ...(dataAvatars.files || []),
                ...(dataAssets.files || []),
                ...(dataDocs.files || [])
            ];
            
            setR2Avatars(mergedFiles);
        } catch (err) {
            console.error("Failed to load R2 avatars:", err);
        } finally {
            setLoadingR2Avatars(false);
        }
    };

    // Link a chosen R2 image key to character card imagePath
    const handleSelectR2Avatar = (key: string) => {
        if (!pickingAvatarCharId) return;
        const charId = pickingAvatarCharId;

        let updatedCharacters: typeof characters = [];
        setCharacters(prev => {
            const next = prev.map(c => (c.id === charId ? { ...c, imagePath: key, jobStatus: "COMPLETED" as const } : c));
            updatedCharacters = next;
            return next;
        });

        setPickingAvatarCharId(null);
        setTimeout(() => {
            handleSaveProject(undefined, updatedCharacters);
        }, 50);
    };

    // Edit shot values
    const updateShot = (sceneId: string, shotId: string, updates: Partial<Shot>) => {
        setScenes(prev =>
            prev.map(s => {
                if (s.id !== sceneId || !s.visualShots) return s;
                return {
                    ...s,
                    visualShots: s.visualShots.map(shot => (shot.id === shotId ? { ...shot, ...updates } : shot))
                };
            })
        );
    };

    // Manual recovery: reset a single visual shot to IDLE and trigger a direct project save to clear DB locks
    const resetShotStatus = async (sceneId: string, shotId: string) => {
        let updatedScenes: typeof scenes = [];
        setScenes(prev => {
            const next = prev.map(s => {
                if (s.id !== sceneId || !s.visualShots) return s;
                return {
                    ...s,
                    visualShots: s.visualShots.map(shot => (shot.id === shotId ? { ...shot, jobStatus: "IDLE" as const, jobId: undefined } : shot))
                };
            });
            updatedScenes = next;
            return next;
        });
        setTimeout(() => {
            handleSaveProject(updatedScenes);
        }, 50);
    };

    // Manual recovery: reset a single character profile avatar to IDLE and trigger save
    const resetCharacterStatus = async (charId: string) => {
        let updatedCharacters: typeof characters = [];
        setCharacters(prev => {
            const next = prev.map(c => (c.id === charId ? { ...c, jobStatus: undefined, jobId: undefined } : c));
            updatedCharacters = next;
            return next;
        });
        setTimeout(() => {
            handleSaveProject(undefined, updatedCharacters);
        }, 50);
    };

    // Manual recovery: reset all visual shots that are currently queued, generating, or failed to IDLE at once
    const resetAllVisualShotsStatus = async () => {
        let updatedScenes: typeof scenes = [];
        setScenes(prev => {
            const next = prev.map(s => {
                if (!s.visualShots) return s;
                return {
                    ...s,
                    visualShots: s.visualShots.map(shot => {
                        if (shot.jobStatus === "QUEUED" || shot.jobStatus === "PROCESSING" || shot.jobStatus === "FAILED") {
                            return { ...shot, jobStatus: "IDLE" as const, jobId: undefined };
                        }
                        return shot;
                    })
                };
            });
            updatedScenes = next;
            return next;
        });
        setTimeout(() => {
            handleSaveProject(updatedScenes);
        }, 50);
    };

    // Add empty shot to scene
    const addShotToScene = (sceneId: string) => {
        const sceneObj = scenes.find(s => s.id === sceneId);
        const nextIdx = (sceneObj?.visualShots?.length || 0) + 1;
        const newShot: Shot = {
            id: `shot-manual-${Date.now()}-${nextIdx}`,
            primaryCharacter: characters?.[0]?.name || "Narrator",
            visualPrompt: "3D animation Pixar style background",
            jobStatus: "IDLE"
        };

        setScenes(prev =>
            prev.map(s => {
                if (s.id !== sceneId) return s;
                return {
                    ...s,
                    visualShots: [...(s.visualShots || []), newShot]
                };
            })
        );
    };

    // Delete shot from scene
    const deleteShotFromScene = (sceneId: string, shotId: string) => {
        if (typeof window !== "undefined" && !window.confirm("Are you sure you want to delete this visual shot from the scene?")) {
            return;
        }
        setScenes(prev =>
            prev.map(s => {
                if (s.id !== sceneId || !s.visualShots) return s;
                return {
                    ...s,
                    visualShots: s.visualShots.filter(shot => shot.id !== shotId)
                };
            })
        );
    };

    // DeepSeek Storyboard Translation & Clone handler
    const handleTranslateProject = async (lang: string) => {
        if (!docId) return;
        setTranslating(true);
        setError("");
        setInsufficientFunds(false);

        try {
            const res = await fetch("/api/animated/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId: docId, targetLanguage: lang })
            });

            const data = await res.json();
            if (res.status === 402 || data.error === "DEEPSEEK_OUT_OF_FUNDS") {
                setInsufficientFunds(true);
                throw new Error(data.details || "DeepSeek API: Insufficient Balance.");
            }

            if (!res.ok) throw new Error(data.error || "Translation failed");

            // Reload projects, select the new translated copy
            await loadProjects();
            if (data.projectId) {
                const freshRes = await fetch("/api/animated/projects");
                if (freshRes.ok) {
                    const freshData = await freshRes.json();
                    setProjects(freshData.projects || []);
                    
                    const proj = (freshData.projects || []).find((p: any) => p.id === data.projectId);
                    if (proj) {
                        setSelectedProjectId(proj.id);
                        setDocId(proj.id);
                        setProjectTitle(proj.title);
                        setProjectScript(proj.script);
                        setCharacters(proj.characters);
                        setScenes(proj.scenes);
                        setCurrentStep(4); // Load directly at Step 4 editor
                    }
                }
            }
        } catch (err: any) {
            setError(err.message || "Failed to translate project.");
        } finally {
            setTranslating(false);
        }
    };

    // Compile timeline output
    const handleCompile = async () => {
        // Enforce all scenes have finished R2 clips
        const missingClips = scenes.some(s => {
            if (s.visualShots && s.visualShots.length > 0) {
                return s.visualShots.some(shot => !shot.visualPath);
            }
            return !s.visualPath;
        });

        if (missingClips) {
            setError("Cannot compile. Make sure all shots in the storyboard have generated visual clips.");
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
            if (!res.ok) throw new Error(data.details || data.error || "Compilation failed");

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
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 pb-4 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Kids AI Film Studio</h1>
                    <p className="text-gray-400 mt-1 text-sm">Design consistent characters, rewrite stories to bypass copyright, pre-generate EdgeTTS dialogue, and assemble videos.</p>
                </div>
                
                {/* Save and Selector Actions */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-xl">
                        <span className="text-xs font-semibold text-gray-500">Project Workspace:</span>
                        <select value={selectedProjectId} onChange={e => handleSelectProject(e.target.value)}
                            className="bg-transparent text-xs text-white focus:outline-none cursor-pointer font-medium">
                            <option value="" className="bg-gray-900 text-gray-500">New Kids Project...</option>
                            {projects.map(p => <option key={p.id} value={p.id} className="bg-gray-900 text-white">{p.title}</option>)}
                        </select>
                    </div>

                    <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 px-2 py-1.5 rounded-xl">
                        <span className="text-[10px] font-bold text-gray-500 uppercase font-sans">Translate:</span>
                        <select disabled={translating || !docId} onChange={e => {
                            if (e.target.value) {
                                handleTranslateProject(e.target.value);
                                e.target.value = "";
                            }
                        }} className="bg-transparent text-[10px] text-violet-400 focus:outline-none font-bold cursor-pointer disabled:opacity-50">
                            <option value="" className="bg-gray-900 text-gray-500">
                                {!docId ? "Save draft first..." : "Language..."}
                            </option>
                            <option value="Spanish" className="bg-gray-900 text-white">Spanish (Español)</option>
                            <option value="French" className="bg-gray-900 text-white">French (Français)</option>
                            <option value="German" className="bg-gray-900 text-white">German (Deutsch)</option>
                            <option value="Italian" className="bg-gray-900 text-white">Italian (Italiano)</option>
                            <option value="Korean" className="bg-gray-900 text-white">Korean (한국어)</option>
                            <option value="Chinese" className="bg-gray-900 text-white">Chinese (中文)</option>
                        </select>
                        {translating && <Loader2 className="w-3 h-3 animate-spin text-violet-400 ml-1" />}
                    </div>

                    <button onClick={() => handleSaveProject()} disabled={saving}
                        className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-55 text-white text-xs font-bold rounded-xl transition-all shadow-md font-sans">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save Project
                    </button>
                </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-4 border-b border-gray-800 pb-2">
                <Link href="/dashboard/animated" className="text-sm font-bold text-violet-400 border-b-2 border-violet-500 pb-1.5 font-sans">
                    Story Timeline
                </Link>
                <Link href="/dashboard/animated/projects" className="text-sm font-semibold text-gray-500 hover:text-gray-300 pb-1.5 font-sans">
                    Projects Manager
                </Link>
                <Link href="/dashboard/animated/characters" className="text-sm font-semibold text-gray-500 hover:text-gray-300 pb-1.5 font-sans">
                    Cast Library
                </Link>
            </div>

            {/* Error Indicators */}
            {error && (
                <div className="flex items-start gap-3 text-red-400 text-xs bg-red-950/20 border border-red-900/30 p-4 rounded-xl">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <span className="font-semibold">{error}</span>
                        {insufficientFunds && (
                            <p className="text-red-300">
                                Check credit cards or billing balance at deepseek console.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* 5-Step Guided Wizard Nav bar */}
            <div className="bg-gray-955/20 border border-gray-850 p-1.5 rounded-2xl flex items-center justify-between gap-1 overflow-x-auto">
                {[
                    { nr: 1, label: "Setup Premise" },
                    { nr: 2, label: "Cast Directory" },
                    { nr: 3, label: "Draft Blueprint" },
                    { nr: 4, label: "Storyboard Editor" },
                    { nr: 5, label: "Stitch & Export" }
                ].map(step => (
                    <button key={step.nr} onClick={() => setCurrentStep(step.nr)}
                        className={cn("flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all border",
                            currentStep === step.nr 
                                ? "bg-violet-600 border-violet-500 text-white shadow-md font-sans" 
                                : "bg-transparent border-transparent text-gray-500 hover:text-gray-300 font-sans")}>
                        <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px]", 
                            currentStep === step.nr ? "bg-white text-violet-600" : "bg-gray-800 text-gray-400")}>{step.nr}</span>
                        <span>{step.label}</span>
                    </button>
                ))}
            </div>

            {/* Step Content Blocks */}
            <div className="bg-gray-900/20 border border-gray-850 rounded-3xl p-6 min-h-[460px] flex flex-col justify-between">
                
                <div>
                    {/* STEP 1: Story Premise Setup */}
                    {currentStep === 1 && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            <div className="lg:col-span-8 space-y-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-1.5"><FileText className="w-5 h-5 text-violet-400" /> Story Premise Details</h3>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
                                        <div className="md:col-span-8">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Story Project Title</label>
                                            <input type="text" placeholder="Busby Beaver's Big Dam Adventure..." value={projectTitle} onChange={e => setProjectTitle(e.target.value)}
                                                className="w-full bg-gray-850 border border-gray-750 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 font-semibold" />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Video Length</label>
                                            <select value={targetDuration} onChange={e => setTargetDuration(parseInt(e.target.value))}
                                                className="w-full bg-gray-850 border border-gray-750 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 font-semibold">
                                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(m => (
                                                    <option key={m} value={m} className="bg-gray-900 text-white">
                                                        {m} Min (~{m * 3} scenes)
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Scene Duration</label>
                                            <select value={defaultShotDuration} onChange={e => setDefaultShotDuration(parseInt(e.target.value))}
                                                className="w-full bg-gray-850 border border-gray-750 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 font-semibold">
                                                {[5, 8, 10].map(s => (
                                                    <option key={s} value={s} className="bg-gray-900 text-white">
                                                        {s}s (~{Math.round(s * 2.5)} words)
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Premise Idea or Source Lyrics Concept</label>
                                        <textarea placeholder="Type a concept here (e.g. Busby the beaver has an oversized tail, but uses it to float his family safely during a sudden river flood)..." 
                                            value={projectScript} onChange={e => setProjectScript(e.target.value)} rows={8}
                                            className="w-full bg-gray-850 border border-gray-750 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-violet-500 leading-relaxed font-sans" />
                                    </div>
                                </div>
                            </div>
                            
                            <div className="lg:col-span-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Ingest Library Video Option</h4>
                                    <button onClick={() => setSourceMode(sourceMode === "video" ? "text" : "video")}
                                        className="text-[10px] text-violet-400 hover:text-violet-300 font-bold">
                                        {sourceMode === "video" ? "Cancel Ingest" : "Use Video File"}
                                    </button>
                                </div>

                                {sourceMode === "video" ? (
                                    <div className="bg-black/20 border border-gray-800 rounded-2xl p-4 space-y-3">
                                        <div className="relative">
                                            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-500" />
                                            <input type="text" placeholder="Search videos..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                                className="w-full bg-gray-850 border border-gray-750 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500" />
                                        </div>

                                        <div className="max-h-[180px] overflow-y-auto space-y-1">
                                            {filteredVideos.map(v => (
                                                <button key={v.id} onClick={() => setSelectedVideoId(v.id)}
                                                    className={cn("w-full flex items-center gap-2 p-1.5 rounded-lg text-left transition-all text-[11px]",
                                                        selectedVideoId === v.id ? "bg-violet-600/25 text-white" : "text-gray-400 hover:bg-gray-855/40")}>
                                                    <span className="truncate">{v.title}</span>
                                                </button>
                                            ))}
                                        </div>
                                        {selectedVideo && <p className="text-[10px] text-emerald-400 font-semibold">✓ Selected: {selectedVideo.title}</p>}
                                    </div>
                                ) : (
                                    <div className="bg-gray-955/20 border border-gray-850 p-4 rounded-2xl text-center text-xs text-gray-500 leading-relaxed font-sans">
                                        Using custom text premise. Type your story idea in the box to the left.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* STEP 2: Cast Directory Setup */}
                    {currentStep === 2 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                                <h3 className="text-lg font-bold text-white flex items-center gap-1.5"><Users className="w-5 h-5 text-violet-400" /> Cast Consistency Directory</h3>
                                <div className="flex items-center gap-2">
                                    <button onClick={resetToDefaultCharacters} className="px-3 py-1 bg-gray-850 border border-gray-750 hover:bg-gray-800 text-gray-400 rounded-lg text-xs font-bold transition-all">
                                        Reset Defaults
                                    </button>
                                    <select onChange={e => {
                                        if (e.target.value !== "") {
                                            addPresetCharacter(parseInt(e.target.value));
                                            e.target.value = "";
                                        }
                                    }} className="bg-violet-600/10 border border-violet-500/25 text-violet-400 rounded-lg text-xs font-bold px-3 py-1.5 focus:outline-none cursor-pointer">
                                        <option value="" className="bg-gray-900 text-gray-450">Add Preset character...</option>
                                        {CHARACTER_PRESETS.map((preset, idx) => (
                                            <option key={idx} value={idx} className="bg-gray-900 text-white">{preset.name} (Preset)</option>
                                        ))}
                                    </select>

                                    <button onClick={() => setIsLibraryOpen(true)} className="flex items-center gap-1 px-3 py-1.5 bg-violet-600/10 border border-violet-500/25 text-violet-400 rounded-lg text-xs font-bold hover:bg-violet-600/20 transition-all font-sans cursor-pointer">
                                        <Search className="w-4 h-4" /> Browse Library
                                    </button>

                                    <button onClick={addManualCharacter} className="flex items-center gap-1 px-3 py-1.5 bg-violet-600/10 border border-violet-500/25 text-violet-400 rounded-lg text-xs font-bold hover:bg-violet-600/20 transition-all font-sans">
                                        <Plus className="w-4 h-4" /> Add Character
                                    </button>
                                </div>
                            </div>

                            {sourceMode === "video" && (
                                <div className="bg-gray-950 border border-gray-850 rounded-2xl p-4 space-y-3.5">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div>
                                            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                                                <Sparkles className="w-4 h-4 text-violet-400" /> AI Video Cast Observation (Gemini 2.5 Flash)
                                            </h4>
                                            <p className="text-[10px] text-gray-400 mt-0.5 font-sans">
                                                We seek and inspect the video frame screenshots visually to identify recurring actors and visual layouts.
                                            </p>
                                        </div>
                                        {!visualAnalysis && (
                                            <button 
                                                onClick={handleRunVisualAnalysis}
                                                disabled={runningVisualAnalysis}
                                                className="px-3 py-1.5 bg-violet-650 hover:bg-violet-700 disabled:bg-violet-900/40 disabled:text-gray-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-center"
                                            >
                                                {runningVisualAnalysis ? (
                                                    <>
                                                        <Loader2 className="w-3 h-3 animate-spin" /> Analyzing Video...
                                                    </>
                                                ) : (
                                                    "Analyze Video Roster"
                                                )}
                                            </button>
                                        )}
                                    </div>

                                    {visualAnalysis ? (
                                        <div className="space-y-3.5 pt-1.5 border-t border-gray-850/60">
                                            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                                                Detected Headcount: <span className="text-violet-400 font-bold">{visualAnalysis.headcount}</span> characters
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                                {visualAnalysis.detectedCharacters?.map((c: any, cIdx: number) => {
                                                    const alreadyAdded = characters.some(rosterChar => rosterChar.name.toLowerCase() === c.name.toLowerCase());
                                                    return (
                                                        <div key={cIdx} className="bg-black/30 border border-gray-850/60 p-3.5 rounded-xl flex items-start justify-between gap-3">
                                                            <div className="space-y-1">
                                                                <span className="text-xs font-bold text-gray-250 block">{c.name}</span>
                                                                <p className="text-[10px] text-gray-400 leading-normal line-clamp-2" title={c.prompt}>
                                                                    {c.prompt}
                                                                </p>
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    if (alreadyAdded) return;
                                                                    setCharacters(prev => [
                                                                        ...prev,
                                                                        { id: `char-${Date.now()}-${cIdx}`, name: c.name, prompt: c.prompt }
                                                                    ]);
                                                                }}
                                                                disabled={alreadyAdded}
                                                                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all flex-shrink-0 border ${
                                                                    alreadyAdded 
                                                                        ? "bg-emerald-950/20 text-emerald-400 border-emerald-900/35" 
                                                                        : "bg-violet-600/10 hover:bg-violet-600/25 text-violet-400 border-violet-500/20 cursor-pointer"
                                                                }`}
                                                            >
                                                                {alreadyAdded ? "In Cast" : "Add to Cast"}
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : runningVisualAnalysis ? (
                                        <div className="h-16 flex items-center justify-center gap-2 text-[10px] text-gray-400 border border-dashed border-gray-850/60 rounded-xl bg-black/10 font-sans">
                                            <Loader2 className="w-4 h-4 animate-spin text-violet-500" /> Seek-extracting frames & running visual AI analysis. Please wait...
                                        </div>
                                    ) : (
                                        <div className="h-14 flex items-center justify-center text-[10px] text-gray-500 border border-dashed border-gray-850/60 rounded-xl bg-black/10 font-sans">
                                            No visual analysis available yet. Click "Analyze Video Roster" above to detect characters.
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {characters.map(char => (
                                    <div key={char.id} className="bg-gray-955/20 border border-gray-850 p-4 rounded-2xl flex flex-col justify-between space-y-3 relative group">
                                        <button onClick={() => deleteCharacterProfile(char.id)}
                                            className="absolute top-2 right-2 p-1.5 bg-gray-850 hover:bg-red-955/20 border border-gray-800 hover:border-red-900/30 text-gray-500 hover:text-red-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                                            <Trash className="w-3.5 h-3.5" />
                                        </button>

                                        <div className="flex gap-3">
                                            <div className="w-16 h-16 bg-black/40 border border-gray-850 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center relative group/avatar cursor-pointer">
                                                {char.imagePath ? (
                                                    <img src={`/api/storage/signed?key=${char.imagePath}`} alt="" className="w-full h-full object-cover" />
                                                ) : char.jobStatus === "QUEUED" || char.jobStatus === "PROCESSING" ? (
                                                    <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
                                                ) : (
                                                    <Users className="w-6 h-6 text-gray-750" />
                                                )}
                                                <label className="absolute inset-0 bg-black/75 opacity-0 group-hover/avatar:opacity-100 flex flex-col items-center justify-center transition-all cursor-pointer text-center p-1 text-[8px] font-bold text-violet-400">
                                                    <Upload className="w-3.5 h-3.5 mb-0.5 text-violet-450" />
                                                    Upload
                                                    <input type="file" accept="image/*" className="hidden"
                                                        onChange={e => {
                                                            const file = e.target.files?.[0];
                                                            if (file) handleUploadAvatarImage(char.id, file);
                                                        }} />
                                                </label>
                                            </div>

                                            <div className="flex-1 space-y-2 min-w-0">
                                                <input type="text" placeholder="Character Name" value={char.name} onChange={e => updateCharacterProfile(char.id, { name: e.target.value })}
                                                    className="bg-gray-800 border border-gray-750 rounded-lg px-2 py-0.5 text-xs font-bold text-white focus:outline-none focus:border-violet-500" />
                                                <textarea placeholder="Appearance prompt details..." value={char.prompt} onChange={e => updateCharacterProfile(char.id, { prompt: e.target.value })} rows={2}
                                                    className="w-full bg-gray-800 border border-gray-750 rounded-lg p-1.5 text-[10px] text-gray-350 focus:outline-none focus:border-violet-500 leading-normal font-sans" />
                                            </div>
                                        </div>

                                        <div className="flex gap-2 pt-2 border-t border-gray-850/60 justify-end">
                                            <button onClick={() => handleExpandCharacterPrompt(char.id, char.prompt)}
                                                className="flex items-center gap-0.5 px-2.5 py-1 bg-violet-600/10 border border-violet-500/20 text-violet-400 text-[10px] font-bold rounded-lg hover:bg-violet-600/20 transition-all font-sans">
                                                <Sparkles className="w-3 h-3" /> AI Expand Prompt
                                            </button>
                                            <button onClick={() => handleGenerateAvatar(char.id, char.prompt)}
                                                disabled={char.jobStatus === "QUEUED" || char.jobStatus === "PROCESSING"}
                                                className="flex items-center gap-0.5 px-2.5 py-1 bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-lg hover:bg-emerald-600/20 transition-all disabled:opacity-50 font-sans">
                                                <Tv className="w-3 h-3" /> Generate Avatar Face
                                            </button>
                                            <button onClick={() => openR2Picker(char.id)}
                                                className="flex items-center gap-0.5 px-2.5 py-1 bg-violet-600/10 border border-violet-500/20 text-violet-400 text-[10px] font-bold rounded-lg hover:bg-violet-600/20 transition-all font-sans cursor-pointer">
                                                <Folder className="w-3 h-3 text-violet-400" /> Pick from R2
                                            </button>
                                            {(char.jobStatus === "QUEUED" || char.jobStatus === "PROCESSING") && (
                                                <button onClick={() => resetCharacterStatus(char.id)}
                                                    className="px-2.5 py-1 bg-gray-850 hover:bg-gray-800 border border-gray-750 text-gray-400 hover:text-white text-[10px] font-bold rounded-lg transition-all font-sans cursor-pointer">
                                                    Reset
                                                </button>
                                            )}
                                            <button onClick={() => handleSaveToLibrary(char)}
                                                disabled={!char.name || !char.prompt}
                                                className="flex items-center gap-0.5 px-2.5 py-1 bg-violet-600/10 border border-violet-500/20 text-violet-400 text-[10px] font-bold rounded-lg hover:bg-violet-600/20 transition-all font-sans disabled:opacity-40">
                                                <Save className="w-3 h-3" /> Save to Library
                                            </button>
                                            <button onClick={() => cloneCharacter(char)}
                                                className="flex items-center gap-0.5 px-2.5 py-1 bg-violet-600/10 border border-violet-500/20 text-violet-400 text-[10px] font-bold rounded-lg hover:bg-violet-600/20 transition-all font-sans cursor-pointer">
                                                <Copy className="w-3.5 h-3.5" /> Clone
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* STEP 3: Draft Script Blueprint */}
                    {currentStep === 3 && (
                        <div className="max-w-xl mx-auto text-center space-y-6 py-8">
                            <Sparkles className="w-12 h-12 text-violet-400 mx-auto" />
                            <div>
                                <h3 className="text-xl font-bold text-white">Draft Script Blueprint</h3>
                                <p className="text-gray-400 text-xs mt-2 leading-relaxed font-sans">
                                    Ready to write the script? The AI will use your defined Cast list ({characters.map(c => c.name).join(", ") || "No characters added yet"})
                                    and premise to write completely original, legally distinct script dialogue lines, suggested song lyrics, and Suno AI prompts.
                                </p>
                            </div>

                            {/* Options panel in Step 3 */}
                            <div className="bg-black/20 border border-gray-850 p-5 rounded-2xl text-left space-y-4 max-w-lg mx-auto animate-none">
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-850 pb-2">AI Blueprint Composition Settings</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans">
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Story Composition Mode</label>
                                        <select value={compositionMode} onChange={e => setCompositionMode(e.target.value as any)}
                                            className="w-full bg-gray-850 border border-gray-750 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 font-semibold cursor-pointer">
                                            <option value="spin_off" className="bg-gray-900 text-white">Concept Spin-off (Original Story from Outline)</option>
                                            <option value="paraphrase" className="bg-gray-900 text-white">Direct Paraphrase (Similar Pacing & Sequence)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Visual Style Preset</label>
                                        <select value={visualStyle} onChange={e => setVisualStyle(e.target.value)}
                                            className="w-full bg-gray-850 border border-gray-750 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 font-semibold cursor-pointer">
                                            <option value="Pixar 3D" className="bg-gray-900 text-white">Pixar 3D</option>
                                            <option value="Studio Ghibli" className="bg-gray-900 text-white">Studio Ghibli</option>
                                            <option value="Classic Anime" className="bg-gray-900 text-white">Classic Anime</option>
                                            <option value="Claymation" className="bg-gray-900 text-white">Claymation</option>
                                            <option value="Hand-Drawn / Watercolor" className="bg-gray-900 text-white">Hand-Drawn / Watercolor</option>
                                            <option value="Retro Cartoon (90s)" className="bg-gray-900 text-white">Retro Cartoon (90s)</option>
                                            <option value="Realistic CGI" className="bg-gray-900 text-white">Realistic CGI</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Target Audience Age</label>
                                        <select value={targetAge} onChange={e => setTargetAge(e.target.value)}
                                            className="w-full bg-gray-850 border border-gray-750 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 font-semibold cursor-pointer font-sans">
                                            <option value="Toddlers" className="bg-gray-900 text-white">Toddlers (2-4)</option>
                                            <option value="Kids" className="bg-gray-900 text-white">Kids (5-11)</option>
                                            <option value="Teens (13+)" className="bg-gray-900 text-white">Teens (13+)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Story Genre</label>
                                        <select value={genre} onChange={e => setGenre(e.target.value)}
                                            className="w-full bg-gray-850 border border-gray-750 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 font-semibold cursor-pointer">
                                            <option value="Adventure" className="bg-gray-900 text-white">Adventure</option>
                                            <option value="Comedy" className="bg-gray-900 text-white">Comedy</option>
                                            <option value="Fantasy" className="bg-gray-900 text-white">Fantasy</option>
                                            <option value="Teen Romance" className="bg-gray-900 text-white">Teen Romance</option>
                                            <option value="Bedtime Story" className="bg-gray-900 text-white">Bedtime Story</option>
                                            <option value="Sci-Fi" className="bg-gray-900 text-white">Sci-Fi</option>
                                        </select>
                                    </div>

                                    <div className="flex items-center gap-2.5 mt-4 md:mt-0 md:justify-start md:col-span-2">
                                        <input type="checkbox" id="includeMusicalsCheckbox3" checked={includeMusicals} onChange={e => setIncludeMusicals(e.target.checked)}
                                            className="w-4 h-4 text-violet-600 border-gray-700 bg-gray-800 rounded focus:ring-violet-500 cursor-pointer animate-none" />
                                        <label htmlFor="includeMusicalsCheckbox3" className="text-xs text-gray-300 font-semibold cursor-pointer select-none">
                                            Include Sing-Along Songs (adds Suno prompt lyrics)
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <button onClick={handleAnalyze} disabled={summarizing || (sourceMode === "video" ? !selectedVideoId : !projectScript)}
                                className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-55 text-white font-bold text-sm rounded-xl transition-all shadow-lg font-sans">
                                {summarizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                Draft Story Blueprint
                            </button>
                        </div>
                    )}

                    {/* STEP 4: Storyboard Timeline & Editor */}
                    {currentStep === 4 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Timeline Scenes List</h3>
                                <div className="flex items-center gap-2">
                                    <button onClick={handleGenerateAllVoices} disabled={generatingAllVoices}
                                        className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[11px] font-bold rounded-lg transition-all shadow font-sans cursor-pointer">
                                        {generatingAllVoices ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />} 
                                        {generatingAllVoices ? "Generating Audio..." : "Queue All Dialogue Audio"}
                                    </button>
                                    <button onClick={handleQueueAllVisuals}
                                        className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg transition-all shadow font-sans cursor-pointer">
                                        <Wand2 className="w-3.5 h-3.5" /> Queue All Visuals (Assembly Line)
                                    </button>
                                    <button onClick={resetAllVisualShotsStatus}
                                        className="flex items-center gap-1 px-3 py-1 bg-gray-850 hover:bg-gray-800 border border-gray-750 text-gray-400 hover:text-white text-[11px] font-bold rounded-lg transition-all font-sans cursor-pointer">
                                        Reset All Stuck Queue
                                    </button>
                                    <button onClick={addScene} className="flex items-center gap-1 px-2.5 py-1 bg-violet-600/15 hover:bg-violet-600/30 border border-violet-500/20 text-violet-400 text-[11px] font-semibold rounded-lg transition-all font-sans cursor-pointer">
                                        <Plus className="w-3.5 h-3.5" /> Add Scene
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-6">
                                {scenes.map((scene, idx) => (
                                    <div key={scene.id} className="bg-gray-955/20 border border-gray-850 p-6 rounded-2xl relative group">
                                        
                                        {/* Delete Card trigger */}
                                        <button onClick={() => deleteScene(scene.id)}
                                            className="absolute top-2 right-2 p-1.5 bg-gray-850 hover:bg-red-950/30 border border-gray-800 text-gray-500 hover:text-red-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all z-10">
                                            <Trash className="w-3.5 h-3.5" />
                                        </button>

                                        {/* Two-Column Row layout */}
                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                                            
                                            {/* Left Inputs */}
                                            <div className="lg:col-span-6 space-y-3">
                                                
                                                <div className="flex items-center gap-2 border-b border-gray-850/60 pb-1.5">
                                                    <span className="w-5 h-5 rounded bg-gray-800 border border-gray-700 flex items-center justify-center text-[10px] font-bold text-white">{idx + 1}</span>
                                                    <select value={scene.type} onChange={e => updateScene(scene.id, { type: e.target.value as "dialogue" | "song" })}
                                                        className="bg-gray-850 border border-gray-750 text-[10px] font-bold text-white px-2 py-0.5 rounded uppercase focus:outline-none cursor-pointer">
                                                        <option value="dialogue">Dialogue</option>
                                                        <option value="song">Song / Lyric</option>
                                                    </select>
                                                </div>

                                                {/* dialogue character mapping */}
                                                {scene.type === "dialogue" ? (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-0.5">Speaker Actor</label>
                                                            <select value={scene.character} onChange={e => updateScene(scene.id, { character: e.target.value })}
                                                                className="w-full bg-gray-850 border border-gray-750 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500">
                                                                <option value="Narrator" className="bg-gray-900 text-white">Narrator</option>
                                                                {characters.map(c => <option key={c.id} value={c.name} className="bg-gray-900 text-white">{c.name}</option>)}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-0.5">Voice Tone</label>
                                                            <div className="flex items-center gap-1">
                                                                <select value={scene.voice} onChange={e => updateScene(scene.id, { voice: e.target.value })}
                                                                    className="flex-1 bg-gray-850 border border-gray-750 rounded-lg px-1.5 py-1 text-[10px] text-white focus:outline-none focus:border-violet-500">
                                                                    {EDGE_TTS_VOICES.map(v => <option key={v.id} value={v.id} className="bg-gray-900 text-white">{v.label}</option>)}
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
                                                    // Suno tracks upload row
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-0.5">Suno Prompt Suggestion</label>
                                                            <input type="text" readOnly value={scene.sunoStylePrompt || "upbeat kids singalong, bells, 120bpm"} 
                                                                className="w-full bg-gray-850 border border-gray-750 rounded-lg px-2.5 py-1.5 text-[10px] text-gray-450 focus:outline-none font-sans" />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-0.5">Suno MP3 Audio Upload</label>
                                                            <div className="flex gap-1.5">
                                                                <label className="flex-1 flex items-center justify-between bg-gray-850 border border-dashed border-gray-750 hover:bg-gray-800/80 px-3 py-1.5 rounded-xl cursor-pointer transition-colors text-[10px] text-gray-400 min-w-0">
                                                                    <span className="truncate">{scene.sunoAudioKey ? "✓ Track uploaded" : "Upload Suno MP3"}</span>
                                                                    <Music className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                                                                    <input type="file" accept="audio/mpeg" onChange={e => e.target.files?.[0] && handleSunoUpload(scene.id, e.target.files[0])} className="hidden" />
                                                                </label>
                                                                {scene.sunoAudioKey && (
                                                                    <button onClick={() => handleClearSunoSong(scene.id)} title="Delete Song"
                                                                        className="p-1.5 bg-red-950/20 border border-red-900/30 text-red-400 hover:bg-red-900/30 hover:border-red-800 rounded-xl transition-all cursor-pointer">
                                                                        <Trash className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Audio settings details */}
                                                {(scene.sunoDuration || scene.narrationPath) && (
                                                    <div className="bg-violet-955/20 border border-violet-900/30 p-2 rounded-xl flex items-center justify-between">
                                                        <span className="text-[10px] text-violet-300 font-semibold">
                                                            Duration resolved: {scene.sunoDuration ? `${scene.sunoDuration.toFixed(1)}s` : "Dialogue voice track ready"}
                                                            {scene.sunoDuration && ` (requires ${Math.max(1, Math.ceil(scene.sunoDuration / 5))} visual shots)`}
                                                        </span>
                                                        <button onClick={() => probeAndPlanShots(scene.id, scene.sunoAudioKey || scene.narrationPath || "", scene.text)}
                                                            disabled={scene.planningShots}
                                                            className="flex items-center gap-0.5 px-2 py-0.5 bg-violet-600 hover:bg-violet-500 text-white rounded text-[9px] font-bold transition-all disabled:opacity-50">
                                                            {scene.planningShots ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5" />}
                                                            AI Plan Shots
                                                        </button>
                                                    </div>
                                                )}

                                                {/* Spoken script text areas with AI improve */}
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
                                                        className="w-full bg-gray-855 border border-gray-750 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 font-mono leading-relaxed" />
                                                </div>

                                                {/* Action controls */}
                                                <div className="grid grid-cols-2 gap-2 pt-1.5">
                                                    {scene.type === "dialogue" ? (
                                                        <button onClick={() => generateSceneVoiceover(scene.id, scene.text, scene.voice)}
                                                            disabled={scene.voiceStatus === "GENERATING"}
                                                            className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all border border-gray-750 bg-gray-850 hover:bg-gray-800 text-gray-300 disabled:opacity-50">
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
                                                            alert("Lyrics copied! Paste directly into Suno.");
                                                        }} className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all border border-gray-750 bg-gray-850 hover:bg-gray-800 text-gray-300">
                                                            <FileText className="w-3.5 h-3.5" />
                                                            <span>Copy Lyrics</span>
                                                        </button>
                                                    )}

                                                    <button onClick={() => addShotToScene(scene.id)}
                                                        className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all border border-violet-550/20 bg-violet-600/10 hover:bg-violet-600/20 text-violet-400">
                                                        <Plus className="w-3.5 h-3.5" />
                                                        <span>Add Visual Shot</span>
                                                    </button>
                                                </div>

                                            </div>

                                            {/* Right Column: Visual Shots Sequence timeline list */}
                                            <div className="lg:col-span-6 space-y-3.5">
                                                <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block border-b border-gray-800/60 pb-1">Visual Progression Shots Sequence</label>
                                                
                                                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                                                    {scene.visualShots?.map((shot, sIdx) => (
                                                        <div key={shot.id} className="bg-black/30 border border-gray-850/80 rounded-xl p-3 flex flex-col md:flex-row gap-3 relative group/shot">
                                                            
                                                            {/* Remove shot */}
                                                            <button onClick={() => deleteShotFromScene(scene.id, shot.id)}
                                                                className="absolute top-1 right-1 p-1 bg-gray-850 hover:bg-red-955/20 border border-gray-800 hover:border-red-900/30 text-gray-500 hover:text-red-400 rounded-lg opacity-0 group-hover/shot:opacity-100 transition-all">
                                                                <Trash className="w-3 h-3" />
                                                            </button>

                                                            {/* left side prompt inputs */}
                                                            <div className="flex-1 space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <span className="text-[10px] font-bold text-gray-400">Shot {sIdx + 1}</span>
                                                                        
                                                                        <select value={shot.primaryCharacter} onChange={e => updateShot(scene.id, shot.id, { primaryCharacter: e.target.value })}
                                                                            className="bg-gray-850 border border-gray-750 text-[10px] text-white px-2 py-0.5 rounded focus:outline-none cursor-pointer">
                                                                            <option value="None" className="bg-gray-900 text-white">None (Landscape)</option>
                                                                            {characters.map(c => <option key={c.id} value={c.name} className="bg-gray-900 text-white">{c.name}</option>)}
                                                                        </select>

                                                                        <div className="flex items-center gap-1">
                                                                            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Dur:</span>
                                                                            <select value={shot.duration || 5} onChange={e => updateShot(scene.id, shot.id, { duration: parseInt(e.target.value) })}
                                                                                className="bg-gray-850 border border-gray-750 text-[10px] text-white px-1 py-0.5 rounded focus:outline-none cursor-pointer">
                                                                                {[3, 4, 5, 6, 7, 8, 9, 10].map(v => (
                                                                                    <option key={v} value={v} className="bg-gray-900 text-white">{v}s</option>
                                                                                ))}
                                                                            </select>
                                                                        </div>

                                                                        {(sIdx > 0 || idx > 0) && (
                                                                            <label className="flex items-center gap-1 cursor-pointer select-none">
                                                                                <input type="checkbox" checked={!!shot.chainFromPrevious} onChange={e => updateShot(scene.id, shot.id, { chainFromPrevious: e.target.checked })}
                                                                                    className="w-3 h-3 rounded border-gray-700 bg-gray-850 text-violet-500 focus:ring-0 focus:ring-offset-0 cursor-pointer" />
                                                                                <span className="text-[9px] text-gray-400 font-bold">Chain</span>
                                                                            </label>
                                                                        )}
                                                                    </div>
                                                                    {shot.visualPrompt && (
                                                                        <button onClick={() => handleRewriteShotPrompt(scene.id, shot.id, shot.visualPrompt, shot.motionPrompt, shot.primaryCharacter, scene.text)}
                                                                            disabled={rewritingShotId === shot.id}
                                                                            className="flex items-center gap-0.5 text-violet-400 hover:text-violet-300 text-[9px] font-bold disabled:opacity-50 transition-all">
                                                                            {rewritingShotId === shot.id ? (
                                                                                <>
                                                                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                                                                    <span>Rewriting...</span>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <Sparkles className="w-2.5 h-2.5" />
                                                                                    <span>AI Rewrite Prompt</span>
                                                                                </>
                                                                            )}
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                <div className="text-[10px] text-gray-500 mb-0.5 font-bold uppercase tracking-wider">Scene Setup / Canvas Prompt</div>
                                                                <textarea value={shot.visualPrompt} onChange={e => updateShot(scene.id, shot.id, { visualPrompt: e.target.value, imagePrompt: e.target.value })} rows={2}
                                                                    className="w-full bg-gray-800 border border-gray-750 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-violet-500 font-sans leading-normal resize-none mb-1.5" />
                                                                
                                                                <div className="text-[10px] text-gray-500 mb-0.5 font-bold uppercase tracking-wider flex items-center justify-between">
                                                                    <span>Motion / Animation Prompt</span>
                                                                    {shot.chainFromPrevious && <span className="text-[9px] text-violet-400 capitalize">Chained from previous shot</span>}
                                                                </div>
                                                                <textarea value={shot.motionPrompt || ""} onChange={e => updateShot(scene.id, shot.id, { motionPrompt: e.target.value })} rows={2} placeholder="Describe the character motion, gestures, and camera movements for this shot..."
                                                                    className="w-full bg-gray-800 border border-gray-750 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-violet-500 font-sans leading-normal resize-none mb-1.5" />

                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-[10px] font-mono text-gray-500">
                                                                        {shot.jobStatus === "QUEUED" ? (
                                                                            <span className="flex items-center gap-1 text-gray-450"><RefreshCw className="w-3 h-3 animate-spin" /> Queued</span>
                                                                        ) : shot.jobStatus === "PROCESSING" ? (
                                                                            <span className="flex items-center gap-1 text-violet-400"><Loader2 className="w-3 h-3 animate-spin" /> Animating Video...</span>
                                                                        ) : shot.jobStatus === "PENDING_AVATAR" ? (
                                                                            <span className="flex items-center gap-1 text-amber-400 font-medium"><Users className="w-3 h-3 animate-pulse" /> Pending Avatar</span>
                                                                        ) : shot.jobStatus === "PENDING_PREVIOUS" ? (
                                                                            <span className="flex items-center gap-1 text-purple-400 font-medium animate-pulse"><Clock className="w-3 h-3" /> Waiting for chain...</span>
                                                                        ) : shot.jobStatus === "GENERATING_IMAGE" ? (
                                                                            <span className="flex items-center gap-1 text-teal-400 font-medium animate-pulse"><Loader2 className="w-3 h-3 animate-spin" /> Generating canvas...</span>
                                                                        ) : shot.jobStatus === "COMPLETED" ? (
                                                                            <span className="flex items-center gap-1 text-emerald-400"><Check className="w-3 h-3" /> Ready</span>
                                                                        ) : shot.jobStatus === "FAILED" ? (
                                                                            <span className="flex items-center gap-1 text-red-400"><XCircle className="w-3 h-3" /> Failed</span>
                                                                        ) : (
                                                                            "Idle"
                                                                        )}
                                                                    </span>

                                                                    <div className="flex items-center gap-1.5">
                                                                        <button onClick={() => generateShotVideo(scene.id, shot)}
                                                                            disabled={shot.jobStatus === "QUEUED" || shot.jobStatus === "PROCESSING" || shot.jobStatus === "PENDING_AVATAR"}
                                                                            className="px-2 py-0.5 bg-violet-600 hover:bg-violet-550 disabled:opacity-50 text-[10px] text-white font-bold rounded transition-all font-sans">
                                                                            {shot.jobStatus === "COMPLETED" ? "Regenerate" : "Generate"}
                                                                        </button>
                                                                        {(shot.jobStatus === "QUEUED" || shot.jobStatus === "PROCESSING" || shot.jobStatus === "PENDING_AVATAR") && (
                                                                            <button onClick={() => resetShotStatus(scene.id, shot.id)}
                                                                                className="px-1.5 py-0.5 bg-gray-850 hover:bg-gray-800 border border-gray-750 text-gray-400 hover:text-white text-[9px] font-bold rounded transition-all font-sans cursor-pointer">
                                                                                Reset
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                             {/* right side visual preview */}
                                                             <div className="w-28 aspect-video bg-black/40 border border-gray-850 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                                                                 {shot.visualPath ? (
                                                                     <video src={`/api/storage/signed?key=${shot.visualPath}`} controls className="w-full h-full object-cover" />
                                                                 ) : (
                                                                     <Film className="w-5 h-5 text-gray-800" />
                                                                 )}
                                                             </div>

                                                        </div>
                                                    ))}
                                                    
                                                    {(!scene.visualShots || scene.visualShots.length === 0) && (
                                                        <div className="text-center py-6 text-xs text-gray-650 font-sans bg-black/10 border border-dashed border-gray-850 rounded-xl">
                                                            No visual shots configured yet. Click "Add Visual Shot" or "AI Plan Shots" to start planning visuals.
                                                        </div>
                                                    )}
                                                </div>

                                            </div>

                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* STEP 5: Stitch & Export compile */}
                    {currentStep === 5 && (
                        <div className="max-w-xl mx-auto space-y-6 py-6">
                            <div className="text-center space-y-2">
                                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                                <h3 className="text-lg font-bold text-white tracking-tight">Stitch & Export Timeline</h3>
                                <p className="text-gray-400 text-xs font-sans">Stitches pre-generated dialogue voice tracks, loops visual shots, overlays custom Suno music, and compiles your final kids movie.</p>
                            </div>

                            <button onClick={handleCompile} disabled={compiling || scenes.some(s => !s.visualPath)}
                                className="w-full flex items-center justify-center gap-1.5 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-sm rounded-xl transition-all shadow-md font-sans">
                                {compiling ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                Compile & Stitch Kids Video
                            </button>

                            {compiledVideoUrl && (
                                <div className="pt-4 border-t border-gray-800 flex flex-col items-center gap-3">
                                    <video src={compiledVideoUrl} controls className="max-h-[360px] rounded-xl border border-gray-800 bg-black w-full" />
                                    <a href={compiledVideoUrl} download className="w-full flex items-center justify-center gap-1.5 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all font-sans">
                                        <Play className="w-3.5 h-3.5" /> Download Stitched Kids Movie
                                    </a>
                                </div>
                            )}
                        </div>
                    )}

            {/* R2 Avatar Picker Modal */}
            {pickingAvatarCharId !== null && (
                <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-950 border border-gray-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh] animate-in fade-in-50 zoom-in-95 duration-150">
                        {/* Header */}
                        <div className="p-5 border-b border-gray-850 flex items-center justify-between bg-gray-900/40">
                            <div>
                                <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                                    <Folder className="w-4 h-4 text-violet-400" /> Select Avatar from R2
                                </h3>
                                <p className="text-[10px] text-gray-550 font-sans mt-0.5">Select a generated profile image already uploaded to your avatars/ folder.</p>
                            </div>
                            <button onClick={() => setPickingAvatarCharId(null)}
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

                {/* Footer Navigation Buttons */}
                <div className="mt-8 pt-4 border-t border-gray-850 flex items-center justify-between">
                    <button onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
                        disabled={currentStep === 1}
                        className="flex items-center gap-1 px-4 py-2 bg-gray-850 hover:bg-gray-800 disabled:opacity-40 text-gray-300 font-bold text-xs rounded-xl transition-all border border-gray-750 font-sans">
                        <ArrowLeft className="w-3.5 h-3.5" /> Previous Step
                    </button>

                    <span className="text-[10px] text-gray-500 font-mono">Step {currentStep} of 5</span>

                    <button onClick={() => setCurrentStep(prev => Math.min(5, prev + 1))}
                        disabled={currentStep === 5}
                        className="flex items-center gap-1 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition-all shadow font-sans">
                        Next Step <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                </div>
 
             </div>
 
             {/* Global Character Library Browser Modal */}
             {isLibraryOpen && (
                 <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
                     <div className="bg-gray-950 border border-gray-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in fade-in-50 zoom-in-95 duration-150">
                         {/* Modal Header */}
                         <div className="p-5 border-b border-gray-850 flex items-center justify-between bg-gray-900/40">
                             <div>
                                 <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                                     <Users className="w-4 h-4 text-violet-400" /> Global Character Library
                                 </h3>
                                 <p className="text-[10px] text-gray-500 font-sans mt-0.5">Select a character to inject them directly into your project cast.</p>
                             </div>
                             <button onClick={() => { setIsLibraryOpen(false); setLibrarySearchQuery(""); }}
                                 className="p-1.5 bg-gray-850 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg border border-gray-800 transition-all text-[10px] font-bold font-mono">
                                 ESC
                             </button>
                         </div>
 
                         {/* Search Bar */}
                         <div className="p-4 border-b border-gray-850 bg-gray-955/10 flex items-center gap-3">
                             <div className="flex-1 relative">
                                 <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                 <input type="text" placeholder="Search saved characters by name..." value={librarySearchQuery} onChange={e => setLibrarySearchQuery(e.target.value)}
                                     className="w-full bg-gray-900 border border-gray-800 focus:border-violet-500 rounded-xl pl-10 pr-4 py-2 text-xs text-white focus:outline-none placeholder-gray-600 transition-all font-sans" />
                             </div>
                         </div>
 
                         {/* Grid / List */}
                         <div className="p-5 overflow-y-auto flex-1 bg-gray-955/5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                             {libraryCharacters.filter(c => c.name.toLowerCase().includes(librarySearchQuery.toLowerCase())).length === 0 ? (
                                 <div className="col-span-full text-center py-12 text-xs text-gray-500 font-sans">
                                     No characters found matching "{librarySearchQuery}". Generate and save characters first!
                                 </div>
                             ) : (
                                 libraryCharacters.filter(c => c.name.toLowerCase().includes(librarySearchQuery.toLowerCase())).map(c => (
                                     <div key={c.id} className="bg-gray-900/60 border border-gray-850 hover:border-violet-500/30 p-3 rounded-2xl flex gap-3 transition-all group">
                                         {/* Avatar Image */}
                                         <div className="w-14 h-14 bg-black/40 border border-gray-850 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center">
                                             {c.imagePath ? (
                                                 <img src={`/api/storage/signed?key=${c.imagePath}`} alt="" className="w-full h-full object-cover" />
                                             ) : (
                                                 <Users className="w-5 h-5 text-gray-750" />
                                             )}
                                         </div>
 
                                         {/* Details & Select button */}
                                         <div className="flex-1 min-w-0 flex flex-col justify-between">
                                             <div>
                                                 <h4 className="text-xs font-bold text-white truncate">{c.name}</h4>
                                                 <p className="text-[10px] text-gray-450 line-clamp-2 mt-0.5 leading-snug font-sans">{c.prompt}</p>
                                             </div>
                                             <button onClick={() => {
                                                 let updatedCharacters: typeof characters = [];
                                                 setCharacters(prev => {
                                                     const next = [
                                                         ...prev,
                                                         {
                                                             id: `char-lib-${Date.now()}`,
                                                             name: c.name,
                                                             prompt: c.prompt,
                                                             imagePath: c.imagePath,
                                                             jobStatus: c.imagePath ? "COMPLETED" as const : undefined
                                                         }
                                                     ];
                                                     updatedCharacters = next;
                                                     return next;
                                                 });
                                                 setIsLibraryOpen(false);
                                                 setLibrarySearchQuery("");
                                                 setTimeout(() => {
                                                     handleSaveProject(undefined, updatedCharacters);
                                                 }, 50);
                                             }} className="mt-2 w-full py-1 bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-bold rounded-lg transition-all font-sans cursor-pointer text-center">
                                                 Add to Cast
                                             </button>
                                         </div>
                                     </div>
                                 ))
                             )}
                         </div>
                     </div>
                 </div>
             )}

            </div>
    );
}
