"use client";

import { useState } from "react";
import {
    Mic,
    Play,
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
    const [balance, setBalance] = useState(70); // % voiceover volume
    const [generating, setGenerating] = useState(false);
    const [previewText, setPreviewText] = useState(
        "In the heart of the Amazon, a remarkable creature emerges from the shadows."
    );

    const generatePreview = async () => {
        setGenerating(true);
        // Phase 7 wiring: call Together.ai Kokoro API
        setTimeout(() => setGenerating(false), 2000);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Voiceover Studio</h1>
                <p className="text-gray-400 text-sm mt-1">
                    Add AI-generated narration using Together.ai Kokoro TTS
                </p>
            </div>

            <div className="grid grid-cols-2 gap-6">
                {/* Voice Selection */}
                <div className="space-y-4">
                    <h2 className="text-sm font-semibold text-white">Choose Voice</h2>
                    <div className="grid grid-cols-2 gap-2">
                        {KOKORO_VOICES.map((voice) => (
                            <button
                                key={voice.id}
                                onClick={() => setSelectedVoice(voice.id)}
                                className={cn(
                                    "p-3 rounded-xl border text-left transition-all",
                                    selectedVoice === voice.id
                                        ? "bg-violet-500/10 border-violet-500/30"
                                        : "bg-gray-900/50 border-gray-800 hover:border-gray-700"
                                )}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium text-white">{voice.name}</span>
                                    <span className="text-[10px] text-gray-500">{voice.gender}</span>
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
                                onClick={() => setMixMode(mode.value)}
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
                                onChange={(e) => setBalance(parseInt(e.target.value))}
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
                        <button
                            onClick={generatePreview}
                            disabled={generating}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
                        >
                            {generating ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Play className="w-4 h-4" />
                            )}
                            {generating ? "Generating..." : "Generate Preview"}
                        </button>
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
