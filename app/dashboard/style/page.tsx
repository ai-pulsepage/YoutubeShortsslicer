"use client";

import { useState, useEffect } from "react";
import {
    Type,
    Save,
    Plus,
    Trash2,
    Check,
    Palette,
    AlignCenter,
    AlignLeft,
    AlignRight,
    MoveVertical,
    Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Preset = {
    id?: string;
    name: string;
    font: string;
    size: number;
    color: string;
    outline: string;
    shadow: string;
    position: string;
    animation: string;
};

const GOOGLE_FONTS = [
    "Inter", "Roboto", "Montserrat", "Poppins", "Open Sans",
    "Lato", "Oswald", "Raleway", "Nunito", "Bebas Neue",
    "Bangers", "Creepster", "Permanent Marker", "Abril Fatface",
];

const ANIMATIONS = [
    { value: "none", label: "None" },
    { value: "word-by-word", label: "Word by Word" },
    { value: "fade", label: "Fade In" },
    { value: "pop", label: "Pop" },
    { value: "slide-up", label: "Slide Up" },
    { value: "typewriter", label: "Typewriter" },
];

const POSITIONS = [
    { value: "bottom", label: "Bottom" },
    { value: "center", label: "Center" },
    { value: "top", label: "Top" },
];

const TEMPLATE_PRESETS: Preset[] = [
    {
        name: "BBC Nature",
        font: "Montserrat",
        size: 28,
        color: "#FFFFFF",
        outline: "#000000",
        shadow: "#00000080",
        position: "bottom",
        animation: "word-by-word",
    },
    {
        name: "True Crime",
        font: "Creepster",
        size: 32,
        color: "#FF3333",
        outline: "#000000",
        shadow: "#66000080",
        position: "center",
        animation: "fade",
    },
    {
        name: "Motivational",
        font: "Bebas Neue",
        size: 36,
        color: "#FFD700",
        outline: "#1A1A1A",
        shadow: "#00000060",
        position: "center",
        animation: "pop",
    },
    {
        name: "Clean & Minimal",
        font: "Inter",
        size: 22,
        color: "#FFFFFF",
        outline: "#333333",
        shadow: "#00000040",
        position: "bottom",
        animation: "fade",
    },
    {
        name: "Bold Impact",
        font: "Bangers",
        size: 40,
        color: "#00FF88",
        outline: "#000000",
        shadow: "#00000080",
        position: "center",
        animation: "slide-up",
    },
];

export default function StylePage() {
    const [active, setActive] = useState<Preset>(TEMPLATE_PRESETS[0]);
    const [savedPresets, setSavedPresets] = useState<Preset[]>([]);
    const [previewText, setPreviewText] = useState("The world's most incredible creatures");

    // Load saved presets from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem("subtitle-presets");
            if (saved) setSavedPresets(JSON.parse(saved));
        } catch { }
    }, []);

    const savePreset = () => {
        const name = prompt("Preset name:", active.name || "My Preset");
        if (!name) return;
        const preset: Preset = { ...active, name, id: `custom-${Date.now()}` };
        const updated = [...savedPresets, preset];
        setSavedPresets(updated);
        localStorage.setItem("subtitle-presets", JSON.stringify(updated));
    };

    const deletePreset = (id: string) => {
        const updated = savedPresets.filter((p) => p.id !== id);
        setSavedPresets(updated);
        localStorage.setItem("subtitle-presets", JSON.stringify(updated));
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Subtitle Styles</h1>
                <p className="text-gray-400 text-sm mt-1">
                    Customize subtitle appearance and save presets for quick reuse
                </p>
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* Preview Panel */}
                <div className="col-span-2">
                    <div className="aspect-[9/16] max-h-[500px] bg-gray-900 rounded-2xl overflow-hidden relative border border-gray-800">
                        {/* Preview area — simulates 9:16 short */}
                        <div className="absolute inset-0 bg-gradient-to-b from-gray-800/50 to-black/50" />

                        <div
                            className={cn(
                                "absolute left-0 right-0 px-6 text-center",
                                active.position === "top" ? "top-12" :
                                    active.position === "center" ? "top-1/2 -translate-y-1/2" :
                                        "bottom-16"
                            )}
                        >
                            <p
                                className="font-bold drop-shadow-lg leading-tight"
                                style={{
                                    fontFamily: active.font,
                                    fontSize: `${active.size}px`,
                                    color: active.color,
                                    WebkitTextStroke: `1px ${active.outline}`,
                                    textShadow: `2px 2px 4px ${active.shadow}`,
                                }}
                            >
                                {previewText}
                            </p>
                        </div>

                        {/* Copyright risk indicator */}
                        <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 rounded-full px-2.5 py-1">
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="text-[10px] text-gray-300 font-medium">Low Risk</span>
                        </div>
                    </div>

                    <div className="mt-3">
                        <input
                            type="text"
                            value={previewText}
                            onChange={(e) => setPreviewText(e.target.value)}
                            placeholder="Preview text..."
                            className="w-full bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500"
                        />
                    </div>
                </div>

                {/* Controls Panel */}
                <div className="space-y-4">
                    {/* Font */}
                    <div>
                        <label className="text-xs text-gray-400 mb-1.5 block">Font Family</label>
                        <select
                            value={active.font}
                            onChange={(e) => setActive({ ...active, font: e.target.value })}
                            className="w-full bg-gray-900/50 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                        >
                            {GOOGLE_FONTS.map((f) => (
                                <option key={f} value={f}>{f}</option>
                            ))}
                        </select>
                    </div>

                    {/* Size */}
                    <div>
                        <label className="text-xs text-gray-400 mb-1.5 block">
                            Size: {active.size}px
                        </label>
                        <input
                            type="range"
                            min="14"
                            max="60"
                            value={active.size}
                            onChange={(e) => setActive({ ...active, size: parseInt(e.target.value) })}
                            className="w-full accent-violet-500"
                        />
                    </div>

                    {/* Colors */}
                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="text-[10px] text-gray-500 mb-1 block">Text</label>
                            <input
                                type="color"
                                value={active.color}
                                onChange={(e) => setActive({ ...active, color: e.target.value })}
                                className="w-full h-8 rounded cursor-pointer bg-transparent border border-gray-700"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-500 mb-1 block">Outline</label>
                            <input
                                type="color"
                                value={active.outline}
                                onChange={(e) => setActive({ ...active, outline: e.target.value })}
                                className="w-full h-8 rounded cursor-pointer bg-transparent border border-gray-700"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-500 mb-1 block">Shadow</label>
                            <input
                                type="color"
                                value={active.shadow.slice(0, 7)}
                                onChange={(e) => setActive({ ...active, shadow: e.target.value + "80" })}
                                className="w-full h-8 rounded cursor-pointer bg-transparent border border-gray-700"
                            />
                        </div>
                    </div>

                    {/* Position */}
                    <div>
                        <label className="text-xs text-gray-400 mb-1.5 block">Position</label>
                        <div className="flex gap-1">
                            {POSITIONS.map((p) => (
                                <button
                                    key={p.value}
                                    onClick={() => setActive({ ...active, position: p.value })}
                                    className={cn(
                                        "flex-1 py-2 rounded-lg text-xs font-medium transition-colors",
                                        active.position === p.value
                                            ? "bg-violet-500/15 text-violet-400"
                                            : "bg-gray-800 text-gray-400 hover:text-white"
                                    )}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Animation */}
                    <div>
                        <label className="text-xs text-gray-400 mb-1.5 block">Animation</label>
                        <select
                            value={active.animation}
                            onChange={(e) => setActive({ ...active, animation: e.target.value })}
                            className="w-full bg-gray-900/50 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                        >
                            {ANIMATIONS.map((a) => (
                                <option key={a.value} value={a.value}>{a.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Save */}
                    <button
                        onClick={savePreset}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                    >
                        <Save className="w-4 h-4" />
                        Save as Preset
                    </button>
                </div>
            </div>

            {/* Saved Presets */}
            {savedPresets.length > 0 && (
                <div>
                    <h2 className="text-sm font-semibold text-white mb-3">Your Presets</h2>
                    <div className="grid grid-cols-5 gap-3">
                        {savedPresets.map((preset) => (
                            <div
                                key={preset.id}
                                className={cn(
                                    "p-3 rounded-xl border text-left transition-all relative group cursor-pointer",
                                    active.name === preset.name
                                        ? "bg-violet-500/10 border-violet-500/30"
                                        : "bg-gray-900/50 border-gray-800 hover:border-gray-700"
                                )}
                                onClick={() => setActive(preset)}
                            >
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deletePreset(preset.id!);
                                    }}
                                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Trash2 className="w-2.5 h-2.5" />
                                </button>
                                <p
                                    className="text-lg font-bold mb-1 truncate"
                                    style={{
                                        fontFamily: preset.font,
                                        color: preset.color,
                                        textShadow: `1px 1px 2px ${preset.shadow}`,
                                    }}
                                >
                                    Aa
                                </p>
                                <p className="text-[10px] text-gray-400 truncate">{preset.name}</p>
                                <p className="text-[9px] text-gray-600">{preset.font} · {preset.size}px</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Template Presets */}
            <div>
                <h2 className="text-sm font-semibold text-white mb-3">Template Presets</h2>
                <div className="grid grid-cols-5 gap-3">
                    {TEMPLATE_PRESETS.map((preset) => (
                        <button
                            key={preset.name}
                            onClick={() => setActive(preset)}
                            className={cn(
                                "p-3 rounded-xl border text-left transition-all",
                                active.name === preset.name
                                    ? "bg-violet-500/10 border-violet-500/30"
                                    : "bg-gray-900/50 border-gray-800 hover:border-gray-700"
                            )}
                        >
                            <p
                                className="text-lg font-bold mb-1 truncate"
                                style={{
                                    fontFamily: preset.font,
                                    color: preset.color,
                                    textShadow: `1px 1px 2px ${preset.shadow}`,
                                }}
                            >
                                Aa
                            </p>
                            <p className="text-[10px] text-gray-400 truncate">{preset.name}</p>
                            <p className="text-[9px] text-gray-600">{preset.font} · {preset.size}px</p>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
