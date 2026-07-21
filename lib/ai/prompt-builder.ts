/**
 * Centralized Kinematic Prompt Builder
 * 
 * Enforces strict Model Input Structuring for modern T5/LLaMA-based video diffusion transformers:
 * 1. ZERO Script Text Pollution: Spoken dialogue belongs in TTS audio generation ONLY, never inside visual prompts.
 * 2. ZERO Tag-Dumping: No comma-separated lists like "mood: wonder, lighting: warm, 8k, photorealistic".
 * 3. Kinematic Natural Prose Format:
 *    [Shot Framing] + [Subject & Facial Mechanics] + [Environment & Lighting] + [Camera Motion]
 */

export interface KinematicPromptOptions {
    modelType?: "wan2.1" | "wan2.3" | "seedance" | "ltx" | "flux";
    aspectRatio?: "9:16" | "16:9" | "1:1";
    shotType?: string;          // e.g. "close-up", "medium shot", "wide shot"
    cameraAngle?: string;       // e.g. "eye-level", "low-angle", "high-angle"
    cameraMovement?: string;    // e.g. "slow forward push-in", "static", "gentle pan right"
    subject?: string;           // e.g. "A friendly female UGC presenter in her 20s"
    action?: string;            // e.g. "holds up a sleek glass supplement bottle with a confident smile"
    environment?: string;       // e.g. "a sunlit modern kitchen with indoor plants"
    lighting?: string;          // e.g. "soft natural morning sunlight, warm ambiance"
    stylePreset?: string;       // e.g. "photorealistic UGC, crisp 35mm lens"
}

/**
 * Builds clean, model-optimized Kinematic Natural Prose.
 */
export function buildKinematicPrompt(opts: KinematicPromptOptions): string {
    const parts: string[] = [];

    // 1. Framing & Shot Specification
    const isVertical = opts.aspectRatio === "9:16";
    const framingPrefix = isVertical ? "Vertical 9:16 framing" : "Cinematic 16:9 framing";
    const shotType = (opts.shotType || "medium shot").toLowerCase();
    const cameraAngle = opts.cameraAngle && opts.cameraAngle !== "eye-level" ? `from a ${opts.cameraAngle}` : "";

    if (cameraAngle) {
        parts.push(`${framingPrefix}, ${shotType} ${cameraAngle}.`);
    } else {
        parts.push(`${framingPrefix}, ${shotType}.`);
    }

    // 2. Subject & Temporal Action Mechanics (Strictly Visual - NO narration script text)
    const rawSubject = (opts.subject || "a person").trim();
    // Clean out any accidental narration text or quotes
    const cleanedSubject = rawSubject.replace(/narration:.*$/gi, "").replace(/script:.*$/gi, "").trim();
    const action = opts.action ? opts.action.trim() : "gazing attentively forward";

    parts.push(`${cleanedSubject} ${action}.`);

    // 3. Environment & Atmospheric Lighting
    if (opts.environment || opts.lighting) {
        const env = opts.environment ? opts.environment.trim() : "a natural backdrop";
        const light = opts.lighting ? opts.lighting.trim() : "soft cinematic lighting";
        parts.push(`Set in ${env} with ${light}.`);
    }

    // 4. Camera Motion
    const movement = opts.cameraMovement && opts.cameraMovement !== "static"
        ? opts.cameraMovement.trim()
        : "gentle natural movement";
    parts.push(`Shot with a ${movement}.`);

    return parts.join(" ");
}

/**
 * Specifically formats UGC Spokesperson Ad prompts for video models
 */
export function buildUGCPrompt(
    avatarName: string,
    persona: string,
    actionDescription: string,
    productName?: string
): string {
    const subject = `A photorealistic spokesperson (${avatarName}, ${persona})`;
    const cleanAction = actionDescription || (productName ? `presenting ${productName} directly to the camera with natural eye contact and expressive hand gestures` : "speaking directly into the camera with natural eye contact");

    return buildKinematicPrompt({
        aspectRatio: "9:16",
        shotType: "close-up",
        subject,
        action: cleanAction,
        environment: "a modern sunlit living space",
        lighting: "soft directional key light, warm natural tone",
        cameraMovement: "subtle handheld camera stability"
    });
}
