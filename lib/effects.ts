/**
 * Video Effects Preset System
 *
 * Each effect defines:
 * - id: unique identifier stored in segment.effects JSON
 * - label/description/icon/category: UI metadata
 * - buildFilter(params, meta): returns FFmpeg filter_complex string
 *
 * Effects are composed into a single filter_complex chain at render time.
 */

export type EffectCategory = "layout" | "color" | "texture" | "transition" | "speed";

export type EffectParam = {
    key: string;
    label: string;
    type: "number" | "string" | "boolean";
    default: any;
    min?: number;
    max?: number;
};

export type EffectPreset = {
    id: string;
    label: string;
    description: string;
    icon: string;
    category: EffectCategory;
    params: EffectParam[];
    buildFilter: (params: Record<string, any>, meta: RenderMeta) => string;
};

export type AppliedEffect = {
    type: string;
    params: Record<string, any>;
};

export type RenderMeta = {
    width: number;
    height: number;
    duration: number;
    fps: number;
};

// ─── Preset Registry ─────────────────────────────────────

const PRESETS: EffectPreset[] = [
    {
        id: "blur_background",
        label: "Blur Background",
        description: "Blurred full-frame background with sharp letterboxed video on top",
        icon: "🔲",
        category: "layout",
        params: [
            { key: "blur", label: "Blur Strength", type: "number", default: 25, min: 5, max: 60 },
            { key: "innerScale", label: "Inner Scale %", type: "number", default: 56, min: 30, max: 90 },
        ],
        buildFilter: (params, meta) => {
            const blur = params.blur || 25;
            const innerPct = (params.innerScale || 56) / 100;
            const innerH = Math.round(meta.height * innerPct);
            const innerW = Math.round(meta.width * innerPct);
            // The filter:
            // [0:v] → split into two streams
            // Stream 1: scale to fill, apply heavy blur → background
            // Stream 2: scale to fit within inner box → foreground
            // Overlay foreground centered on background
            return `[0:v]split=2[bg][fg];` +
                `[bg]scale=${meta.width}:${meta.height}:force_original_aspect_ratio=increase,` +
                `crop=${meta.width}:${meta.height},` +
                `boxblur=${blur}:${blur}[bgblur];` +
                `[fg]scale=${innerW}:${innerH}:force_original_aspect_ratio=decrease,` +
                `pad=${innerW}:${innerH}:(ow-iw)/2:(oh-ih)/2:color=black@0[fgpad];` +
                `[bgblur][fgpad]overlay=(W-w)/2:(H-h)/2`;
        },
    },
    {
        id: "warm_cinematic",
        label: "Warm Cinematic",
        description: "Warm orange/golden color grade",
        icon: "🌅",
        category: "color",
        params: [
            { key: "intensity", label: "Intensity", type: "number", default: 0.12, min: 0.05, max: 0.3 },
        ],
        buildFilter: (params) => {
            const i = params.intensity || 0.12;
            return `[0:v]colorbalance=rs=${i}:gs=${(i * 0.3).toFixed(3)}:bs=${(-i * 0.8).toFixed(3)},` +
                `curves=m='0/0 0.3/0.35 0.7/0.75 1/1'`;
        },
    },
    {
        id: "cool_blue",
        label: "Cool Blue",
        description: "Cold blue-tint color grade",
        icon: "❄️",
        category: "color",
        params: [
            { key: "intensity", label: "Intensity", type: "number", default: 0.10, min: 0.05, max: 0.3 },
        ],
        buildFilter: (params) => {
            const i = params.intensity || 0.10;
            return `[0:v]colorbalance=rs=${(-i).toFixed(3)}:gs=${(-i * 0.3).toFixed(3)}:bs=${i}`;
        },
    },
    {
        id: "film_grain",
        label: "Film Grain",
        description: "Analog film grain texture",
        icon: "🎞️",
        category: "texture",
        params: [
            { key: "amount", label: "Grain Amount", type: "number", default: 15, min: 5, max: 40 },
        ],
        buildFilter: (params) => {
            const amount = params.amount || 15;
            return `[0:v]noise=c0s=${amount}:c0f=t+u`;
        },
    },
    {
        id: "vignette",
        label: "Vignette",
        description: "Dark corner fade for cinematic focus",
        icon: "🔅",
        category: "texture",
        params: [
            { key: "angle", label: "Angle (radians)", type: "number", default: 0.4, min: 0.1, max: 1.0 },
        ],
        buildFilter: (params) => {
            const angle = params.angle || 0.4;
            return `[0:v]vignette=PI/${(Math.PI / angle).toFixed(2)}`;
        },
    },
    {
        id: "letterbox",
        label: "Letterbox",
        description: "Cinematic black bars top & bottom",
        icon: "⬛",
        category: "layout",
        params: [
            { key: "barHeight", label: "Bar Height %", type: "number", default: 12, min: 5, max: 25 },
        ],
        buildFilter: (params, meta) => {
            const barPct = (params.barHeight || 12) / 100;
            const barH = Math.round(meta.height * barPct);
            return `[0:v]drawbox=x=0:y=0:w=${meta.width}:h=${barH}:color=black@1:t=fill,` +
                `drawbox=x=0:y=${meta.height - barH}:w=${meta.width}:h=${barH}:color=black@1:t=fill`;
        },
    },
    {
        id: "fade_inout",
        label: "Fade In/Out",
        description: "Smooth black fade at start and end",
        icon: "🎬",
        category: "transition",
        params: [
            { key: "fadeDuration", label: "Fade Duration (frames)", type: "number", default: 30, min: 10, max: 90 },
        ],
        buildFilter: (params, meta) => {
            const frames = params.fadeDuration || 30;
            const totalFrames = Math.round(meta.duration * meta.fps);
            const outStart = Math.max(0, totalFrames - frames);
            return `[0:v]fade=t=in:st=0:d=${(frames / meta.fps).toFixed(2)},` +
                `fade=t=out:st=${(outStart / meta.fps).toFixed(2)}:d=${(frames / meta.fps).toFixed(2)}`;
        },
    },
    {
        id: "slow_mo",
        label: "Slow Motion",
        description: "Half speed playback",
        icon: "⏱️",
        category: "speed",
        params: [
            { key: "factor", label: "Speed Factor", type: "number", default: 0.5, min: 0.25, max: 0.75 },
        ],
        buildFilter: (params) => {
            const factor = params.factor || 0.5;
            return `[0:v]setpts=${(1 / factor).toFixed(2)}*PTS`;
        },
    },
    {
        id: "speed_up",
        label: "Speed Up",
        description: "1.5x speed playback",
        icon: "⏩",
        category: "speed",
        params: [
            { key: "factor", label: "Speed Factor", type: "number", default: 1.5, min: 1.1, max: 3.0 },
        ],
        buildFilter: (params) => {
            const factor = params.factor || 1.5;
            return `[0:v]setpts=${(1 / factor).toFixed(4)}*PTS`;
        },
    },
];

// ─── Public API ──────────────────────────────────────────

/** Get all available effect presets */
export function getEffectPresets(): EffectPreset[] {
    return PRESETS;
}

/** Get a specific preset by ID */
export function getEffectPreset(id: string): EffectPreset | undefined {
    return PRESETS.find(p => p.id === id);
}

/** Get presets grouped by category */
export function getEffectsByCategory(): Record<EffectCategory, EffectPreset[]> {
    const groups: Record<EffectCategory, EffectPreset[]> = {
        layout: [],
        color: [],
        texture: [],
        transition: [],
        speed: [],
    };
    for (const p of PRESETS) {
        groups[p.category].push(p);
    }
    return groups;
}

/**
 * Build a complete FFmpeg filter_complex string from an array of applied effects.
 * Effects are chained in order. Layout effects (blur_background) are applied first
 * since they restructure the video stream.
 *
 * Returns null if no effects are applied.
 */
export function buildEffectChain(
    effects: AppliedEffect[],
    meta: RenderMeta
): string | null {
    if (!effects || effects.length === 0) return null;

    // Sort: layout first, then color, texture, transition, speed
    const order: EffectCategory[] = ["layout", "color", "texture", "transition", "speed"];
    const sorted = [...effects].sort((a, b) => {
        const pa = PRESETS.find(p => p.id === a.type);
        const pb = PRESETS.find(p => p.id === b.type);
        return order.indexOf(pa?.category || "speed") - order.indexOf(pb?.category || "speed");
    });

    // Check if we have a layout effect (these use split/overlay and produce complex chains)
    const layoutEffect = sorted.find(e => {
        const p = PRESETS.find(p => p.id === e.type);
        return p?.category === "layout";
    });

    const nonLayoutEffects = sorted.filter(e => {
        const p = PRESETS.find(p => p.id === e.type);
        return p?.category !== "layout";
    });

    if (layoutEffect && nonLayoutEffects.length === 0) {
        // Just the layout effect
        const preset = PRESETS.find(p => p.id === layoutEffect.type);
        if (!preset) return null;
        return preset.buildFilter(layoutEffect.params || {}, meta);
    }

    if (layoutEffect && nonLayoutEffects.length > 0) {
        // Layout effect first, then chain non-layout effects
        const preset = PRESETS.find(p => p.id === layoutEffect.type);
        if (!preset) return null;
        const layoutFilter = preset.buildFilter(layoutEffect.params || {}, meta);

        // Non-layout effects: build simple chain on the output
        const postFilters = nonLayoutEffects
            .map(e => {
                const p = PRESETS.find(p => p.id === e.type);
                if (!p) return null;
                const raw = p.buildFilter(e.params || {}, meta);
                // Strip the [0:v] input label since we're chaining
                return raw.replace(/^\[0:v\]/, "");
            })
            .filter(Boolean)
            .join(",");

        if (postFilters) {
            // The layout filter outputs unlabeled; tag it and chain
            return `${layoutFilter}[layoutout];[layoutout]${postFilters}`;
        }
        return layoutFilter;
    }

    // No layout effects — simple chain
    const filters = nonLayoutEffects
        .map(e => {
            const p = PRESETS.find(p => p.id === e.type);
            if (!p) return null;
            const raw = p.buildFilter(e.params || {}, meta);
            return raw.replace(/^\[0:v\]/, "");
        })
        .filter(Boolean);

    if (filters.length === 0) return null;
    return `[0:v]${filters.join(",")}`;
}

/**
 * Build the audio filter for speed effects.
 * If slow_mo or speed_up is applied, the audio needs tempo adjustment.
 * Returns null if no audio adjustment needed.
 */
export function buildAudioSpeedFilter(effects: AppliedEffect[]): string | null {
    if (!effects || effects.length === 0) return null;

    const speedEffect = effects.find(e => e.type === "slow_mo" || e.type === "speed_up");
    if (!speedEffect) return null;

    const preset = PRESETS.find(p => p.id === speedEffect.type);
    if (!preset) return null;

    if (speedEffect.type === "slow_mo") {
        const factor = speedEffect.params?.factor || 0.5;
        return `[0:a]atempo=${factor}[aout]`;
    } else {
        const factor = speedEffect.params?.factor || 1.5;
        // atempo only supports 0.5-100.0; for factors > 2, chain multiple
        if (factor <= 2.0) {
            return `[0:a]atempo=${factor}[aout]`;
        }
        return `[0:a]atempo=2.0,atempo=${(factor / 2).toFixed(4)}[aout]`;
    }
}
