"use client";

import { useState, useRef, useEffect } from "react";
import {
    Mic,
    Play,
    Pause,
    Volume2,
    Loader2,
    Sparkles,
    Upload,
    ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────

type TtsEngine = "elevenlabs" | "xtts";
type NarratorStyle = "sleep" | "documentary" | "dramatic" | "energetic" | "conversational";

type Voice = {
    id: string;
    name: string;
    description: string;
    category?: string;
    previewUrl?: string;
    engine: TtsEngine;
};

const ENGINES: { id: TtsEngine; name: string; desc: string; icon: string }[] = [
    { id: "elevenlabs", name: "ElevenLabs", desc: "Premium cloud voices, rich & natural", icon: "✨" },
    { id: "xtts", name: "XTTS v2", desc: "Self-hosted, voice cloning from samples", icon: "🎙️" },
];

const NARRATOR_STYLES: { id: NarratorStyle; name: string; desc: string; speed: string }[] = [
    { id: "sleep", name: "Sleep / Calm", desc: "Long pauses, very slow, contemplative", speed: "0.85×" },
    { id: "documentary", name: "Documentary", desc: "Natural pauses, measured pace", speed: "0.92×" },
    { id: "dramatic", name: "Dramatic", desc: "Shorter pauses, vocal intensity", speed: "0.95×" },
    { id: "energetic", name: "Energetic", desc: "Fast pace, YouTube-style", speed: "1.1×" },
    { id: "conversational", name: "Conversational", desc: "Natural speech rhythm", speed: "1.0×" },
];

const MIX_MODES = [
    { value: "replace", label: "Replace Original", desc: "Only voiceover audio" },
    { value: "mix", label: "Mix with Original", desc: "Both tracks blended" },
    { value: "original", label: "Original Only", desc: "No voiceover" },
];

export default function VoiceoverPage() {
    const [engine, setEngine] = useState<TtsEngine>("elevenlabs");
    const [narratorStyle, setNarratorStyle] = useState<NarratorStyle>("sleep");
    const [selectedVoice, setSelectedVoice] = useState<string>("");
    const [voices, setVoices] = useState<Voice[]>([]);
    const [loadingVoices, setLoadingVoices] = useState(false);
    const [mixMode, setMixMode] = useState("mix");
    const [balance, setBalance] = useState(70);
    const [generating, setGenerating] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewText, setPreviewText] = useState(
        "In the heart of the Amazon, a remarkable creature emerges from the shadows. Its eyes gleam in the filtered sunlight.\n\nThis is the golden poison frog. Small enough to sit on a fingertip, yet deadly enough to kill ten grown men."
    );
    const audioRef = useRef<HTMLAudioElement>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    // Load saved settings on mount
    useEffect(() => {
        const e = localStorage.getItem("vo_engine") as TtsEngine;
        const s = localStorage.getItem("vo_style") as NarratorStyle;
        const v = localStorage.getItem("vo_voice");
        const m = localStorage.getItem("vo_mixMode");
        const b = localStorage.getItem("vo_balance");
        if (e && ["elevenlabs", "xtts"].includes(e)) setEngine(e);
        if (s) setNarratorStyle(s);
        if (v) setSelectedVoice(v);
        if (m) setMixMode(m);
        if (b) setBalance(parseInt(b));
    }, []);

    // Load voices when engine changes
    useEffect(() => {
        loadVoices(engine);
    }, [engine]);

    const loadVoices = async (eng: TtsEngine) => {
        setLoadingVoices(true);
        setVoices([]);
        setError(null);
        try {
            const res = await fetch(`/api/voiceover/voices?engine=${eng}`);
            if (!res.ok) throw new Error("Failed to load voices");
            const data = await res.json();
            setVoices(data.voices || []);
            // Auto-select first voice if none selected
            if (data.voices?.length > 0 && (!selectedVoice || !data.voices.find((v: Voice) => v.id === selectedVoice))) {
                setSelectedVoice(data.voices[0].id);
                localStorage.setItem("vo_voice", data.voices[0].id);
            }
        } catch (err: any) {
            setError(`Failed to load ${eng} voices: ${err.message}`);
        } finally {
            setLoadingVoices(false);
        }
    };

    const updateEngine = (e: TtsEngine) => {
        setEngine(e);
        localStorage.setItem("vo_engine", e);
    };

    const updateStyle = (s: NarratorStyle) => {
        setNarratorStyle(s);
        localStorage.setItem("vo_style", s);
    };

    const updateVoice = (v: string) => {
        setSelectedVoice(v);
        localStorage.setItem("vo_voice", v);
    };

    const updateMix = (m: string) => {
        setMixMode(m);
        localStorage.setItem("vo_mixMode", m);
    };

    const updateBalance = (b: number) => {
        setBalance(b);
        localStorage.setItem("vo_balance", String(b));
    };

    const generatePreview = async () => {
        setGenerating(true);
        setError(null);
        setAudioUrl(null);

        try {
            const res = await fetch("/api/voiceover/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: previewText,
                    voiceId: selectedVoice,
                    engine,
                    narratorStyle,
                    speed: undefined,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.details || err.error || "Preview failed");
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            setAudioUrl(url);

            if (audioRef.current) {
                audioRef.current.src = url;
                audioRef.current.play();
                setPlaying(true);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setGenerating(false);
        }
    };

    const togglePlayback = () => {
        if (!audioRef.current || !audioUrl) return;
        if (playing) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setPlaying(!playing);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Voiceover Studio</h1>
                <p className="text-gray-400 text-sm mt-1">
                    Professional AI narration with ElevenLabs & XTTS v2
                </p>
            </div>

            <audio ref={audioRef} onEnded={() => setPlaying(false)} className="hidden" />

            {/* Engine Selector */}
            <div className="space-y-2">
                <h2 className="text-sm font-semibold text-white">TTS Engine</h2>
                <div className="grid grid-cols-2 gap-3">
                    {ENGINES.map((eng) => (
                        <button
                            key={eng.id}
                            onClick={() => updateEngine(eng.id)}
                            className={cn(
                                "p-4 rounded-xl border text-left transition-all",
                                engine === eng.id
                                    ? "bg-violet-500/10 border-violet-500/30 ring-1 ring-violet-500/20"
                                    : "bg-gray-900/50 border-gray-800 hover:border-gray-700"
                            )}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-lg">{eng.icon}</span>
                                <span className="text-sm font-medium text-white">{eng.name}</span>
                            </div>
                            <p className="text-xs text-gray-400">{eng.desc}</p>
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-4">
                    {/* Voice Selection */}
                    <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                        Choose Voice
                        {loadingVoices && <Loader2 className="w-3 h-3 animate-spin text-violet-400" />}
                    </h2>

                    {voices.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2 max-h-[280px] overflow-y-auto pr-1">
                            {voices.map((voice) => (
                                <button
                                    key={voice.id}
                                    onClick={() => updateVoice(voice.id)}
                                    className={cn(
                                        "p-3 rounded-xl border text-left transition-all relative group",
                                        selectedVoice === voice.id
                                            ? "bg-violet-500/10 border-violet-500/30"
                                            : "bg-gray-900/50 border-gray-800 hover:border-gray-700"
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium text-white truncate">{voice.name}</span>
                                        {voice.previewUrl && (
                                            <span
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (audioRef.current) {
                                                        audioRef.current.src = voice.previewUrl!;
                                                        audioRef.current.play();
                                                        setPlaying(true);
                                                    }
                                                }}
                                                className="w-5 h-5 rounded-full bg-violet-500/20 hover:bg-violet-500/40 flex items-center justify-center cursor-pointer transition-colors"
                                            >
                                                <Play className="w-2.5 h-2.5 text-violet-400" />
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400 truncate">{voice.description}</p>
                                    {voice.category && (
                                        <p className="text-[10px] text-gray-600 mt-0.5">{voice.category}</p>
                                    )}
                                </button>
                            ))}
                        </div>
                    ) : !loadingVoices ? (
                        <div className="text-sm text-gray-500 italic p-4 bg-gray-900/30 rounded-xl border border-gray-800">
                            No voices available. Check API key configuration.
                        </div>
                    ) : null}

                    {/* Narrator Style */}
                    <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                        Narrator Style
                    </h2>
                    <div className="space-y-1.5">
                        {NARRATOR_STYLES.map((style) => (
                            <button
                                key={style.id}
                                onClick={() => updateStyle(style.id)}
                                className={cn(
                                    "w-full flex items-center justify-between p-2.5 rounded-xl border transition-all",
                                    narratorStyle === style.id
                                        ? "bg-violet-500/10 border-violet-500/30"
                                        : "bg-gray-900/50 border-gray-800 hover:border-gray-700"
                                )}
                            >
                                <div className="text-left">
                                    <p className="text-sm font-medium text-white">{style.name}</p>
                                    <p className="text-xs text-gray-500">{style.desc}</p>
                                </div>
                                <span className="text-[10px] text-gray-600 font-mono">{style.speed}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Column */}
                <div className="space-y-4">
                    {/* Mix Mode */}
                    <h2 className="text-sm font-semibold text-white">Mix Mode</h2>
                    <div className="space-y-2">
                        {MIX_MODES.map((mode) => (
                            <button
                                key={mode.value}
                                onClick={() => updateMix(mode.value)}
                                className={cn(
                                    "w-full flex items-center justify-between p-3 rounded-xl border transition-all",
                                    mixMode === mode.value
                                        ? "bg-violet-500/10 border-violet-500/30"
                                        : "bg-gray-900/50 border-gray-800 hover:border-gray-700"
                                )}
                            >
                                <div>
                                    <p className="text-sm font-medium text-white">{mode.label}</p>
                                    <p className="text-xs text-gray-500">{mode.desc}</p>
                                </div>
                                {mixMode === mode.value && (
                                    <div className="w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center">
                                        <div className="w-2 h-2 rounded-full bg-white" />
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Balance Slider */}
                    {mixMode === "mix" && (
                        <div>
                            <div className="flex justify-between text-xs text-gray-400 mb-2">
                                <span>Original</span>
                                <span>Voiceover {balance}%</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={balance}
                                onChange={(e) => updateBalance(parseInt(e.target.value))}
                                className="w-full accent-violet-500"
                            />
                        </div>
                    )}

                    {/* Preview */}
                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 space-y-3">
                        <h3 className="text-xs font-semibold text-gray-400 uppercase">Preview</h3>
                        <textarea
                            value={previewText}
                            onChange={(e) => setPreviewText(e.target.value)}
                            rows={4}
                            placeholder="Enter text to preview narration..."
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 resize-none"
                        />

                        {error && (
                            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                {error}
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button
                                id="generate-preview-btn"
                                onClick={generatePreview}
                                disabled={generating || !previewText.trim() || !selectedVoice}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
                            >
                                {generating ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Mic className="w-4 h-4" />
                                )}
                                {generating ? "Generating..." : "Generate Preview"}
                            </button>

                            {audioUrl && (
                                <button
                                    onClick={togglePlayback}
                                    className="px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-800 hover:bg-gray-700 text-white transition-colors"
                                >
                                    {playing ? (
                                        <Pause className="w-4 h-4" />
                                    ) : (
                                        <Play className="w-4 h-4" />
                                    )}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Cost Estimate */}
                    <div className="bg-gray-900/30 border border-gray-800/50 rounded-xl p-3">
                        <p className="text-xs text-gray-500">
                            <strong className="text-gray-400">Cost:</strong>{" "}
                            {engine === "elevenlabs"
                                ? "~$0.30/1K characters via ElevenLabs API"
                                : "Free — self-hosted on RunPod (XTTS v2)"}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
