"use client";

import { useState, useRef, useEffect } from "react";
import {
    Mic,
    Play,
    Pause,
    Volume2,
    RefreshCw,
    Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Voice = {
    id: string;
    name: string;
    description: string;
    accent: string;
    gender: string;
};

const KOKORO_VOICES: Voice[] = [
    { id: "af_bella", name: "Bella", description: "Warm, professional", accent: "American", gender: "Female" },
    { id: "af_sarah", name: "Sarah", description: "Clear, authoritative", accent: "American", gender: "Female" },
    { id: "am_adam", name: "Adam", description: "Deep, conversational", accent: "American", gender: "Male" },
    { id: "am_michael", name: "Michael", description: "Energetic, narrator", accent: "American", gender: "Male" },
    { id: "bf_emma", name: "Emma", description: "Elegant, storyteller", accent: "British", gender: "Female" },
    { id: "bm_george", name: "George", description: "Attenborough-style", accent: "British", gender: "Male" },
    { id: "bm_lewis", name: "Lewis", description: "Documentary narrator", accent: "British", gender: "Male" },
    { id: "af_nicole", name: "Nicole", description: "Friendly, upbeat", accent: "American", gender: "Female" },
];

const MIX_MODES = [
    { value: "replace", label: "Replace Original", desc: "Only voiceover audio" },
    { value: "mix", label: "Mix with Original", desc: "Both tracks blended" },
    { value: "original", label: "Original Only", desc: "No voiceover" },
];

export default function VoiceoverPage() {
    const [selectedVoice, setSelectedVoice] = useState<string>("bm_george");
    const [mixMode, setMixMode] = useState("mix");
    const [balance, setBalance] = useState(70);

    // Load saved settings on mount (SSR-safe)
    useEffect(() => {
        const v = localStorage.getItem("vo_voice");
        const m = localStorage.getItem("vo_mixMode");
        const b = localStorage.getItem("vo_balance");
        if (v) setSelectedVoice(v);
        if (m) setMixMode(m);
        if (b) setBalance(parseInt(b));
    }, []);
    const [generating, setGenerating] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewText, setPreviewText] = useState(
        "In the heart of the Amazon, a remarkable creature emerges from the shadows."
    );
    const audioRef = useRef<HTMLAudioElement>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    // Persist settings to localStorage for editor to read
    const updateVoice = (v: string) => { setSelectedVoice(v); localStorage.setItem("vo_voice", v); };
    const updateMix = (m: string) => { setMixMode(m); localStorage.setItem("vo_mixMode", m); };
    const updateBalance = (b: number) => { setBalance(b); localStorage.setItem("vo_balance", String(b)); };

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
                    speed: 1.0,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.details || err.error || "Preview failed");
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            setAudioUrl(url);

            // Auto-play
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
                    Add AI-generated narration using Together.ai Kokoro TTS
                </p>
            </div>

            <audio
                ref={audioRef}
                onEnded={() => setPlaying(false)}
                className="hidden"
            />

            <div className="grid grid-cols-2 gap-6">
                {/* Voice Selection */}
                <div className="space-y-4">
                    <h2 className="text-sm font-semibold text-white">Choose Voice</h2>
                    <div className="grid grid-cols-2 gap-2">
                        {KOKORO_VOICES.map((voice) => (
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
                                    <span className="text-sm font-medium text-white">{voice.name}</span>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-gray-500">{voice.gender}</span>
                                        <span
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                updateVoice(voice.id);
                                                // Small delay so state updates before generatePreview reads it
                                                setTimeout(() => {
                                                    const btn = document.getElementById("generate-preview-btn");
                                                    if (btn) btn.click();
                                                }, 100);
                                            }}
                                            className="w-5 h-5 rounded-full bg-violet-500/20 hover:bg-violet-500/40 flex items-center justify-center cursor-pointer transition-colors"
                                        >
                                            <Play className="w-2.5 h-2.5 text-violet-400" />
                                        </span>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-400">{voice.description}</p>
                                <p className="text-[10px] text-gray-600 mt-0.5">{voice.accent}</p>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Mix Controls + Preview */}
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
                            rows={3}
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
                                disabled={generating || !previewText.trim()}
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
                            <strong className="text-gray-400">Cost estimate:</strong>{" "}
                            ~$0.003/minute via Together.ai Kokoro.
                            A 45s voiceover costs ~$0.002.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
