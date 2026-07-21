import { buildKinematicPrompt } from "@/lib/ai/prompt-builder";

export interface UGCPromptConfig {
    avatarName: string;
    persona: string;
    productName: string;
    productCategory?: string;
    adFormat: "problem_solution" | "product_demo" | "unboxing" | "reasons_why";
    productAction: "holding_to_camera" | "applying_using" | "drinking_gasping" | "unboxing_opening";
    targetPainPoint?: string;
}

export interface UGCPromptOutput {
    spokenScript: string;
    kinematicVisualPrompt: string;
    actionDescription: string;
}

/**
 * Prepares high-converting UGC Ad Script & Kinematic Visual Prompts
 * tailored for TikTok, Instagram Reels, and YouTube Shorts.
 */
export function buildHighConvertingUGCPrompt(config: UGCPromptConfig): UGCPromptOutput {
    const product = config.productName || "featured product";
    const avatar = config.avatarName || "Spokesperson";
    const painPoint = config.targetPainPoint || "daily fatigue";

    let spokenScript = "";
    let actionDescription = "";
    let visualMotion = "";

    // 1. Determine Ad Script Framework
    switch (config.adFormat) {
        case "problem_solution":
            spokenScript = `[surprised] Stop scrolling if you struggle with ${painPoint}! [happy] I tried ${product} and it literally changed my morning routine. Look at this label — click the link below before it sells out!`;
            actionDescription = `Holding ${product} container directly to camera lens, pointing finger to front label with energetic smile`;
            visualMotion = `lifts ${product} up close to smartphone lens, turning it slightly to capture light reflections while smiling directly into camera`;
            break;

        case "product_demo":
            spokenScript = `[happy] Watch what happens when I use ${product} right now. [excited] Look at that instant result! You need to try this today.`;
            actionDescription = `Demonstrating ${product} usage directly on camera, showcasing texture and instant result`;
            visualMotion = `holds ${product} container in left hand, demonstrating application with right hand, looking up with genuine enthusiasm`;
            break;

        case "unboxing":
            spokenScript = `[excited] My ${product} package finally arrived! [surprised] Wow, the packaging is incredible. Let's try it out together right now!`;
            actionDescription = `Opening unboxing package, lifting ${product} out of box with wide expressive eyes`;
            visualMotion = `unboxes package, lifting sleek ${product} container out of shipping box into clear view of camera lens`;
            break;

        case "reasons_why":
        default:
            spokenScript = `[excited] Here are 3 reasons why everyone is obsessed with ${product}. [happy] First, it works in seconds. Second, look at these results. Click below for 20% off!`;
            actionDescription = `Holding ${product} in right hand, holding up 3 fingers on left hand, gesturing enthusiastically`;
            visualMotion = `holds ${product} upright in right hand while gesturing with left hand, stepping slightly closer to camera`;
            break;
    }

    // 2. Specific Physical Hand & Product Motion Overrides
    if (config.productAction === "applying_using") {
        visualMotion = `holding ${product} container, gently applying sample to face, smiling with radiant expression`;
    } else if (config.productAction === "drinking_gasping") {
        visualMotion = `taking a refreshingly smooth sip from ${product} bottle, looking at camera with delighted energetic gasp`;
    } else if (config.productAction === "unboxing_opening") {
        visualMotion = `opening outer box, pulling out ${product} with amazed wide-eyed expression`;
    }

    // 3. Build Clean Kinematic Visual Prompt (Strictly NO raw narration text pollution)
    const kinematicVisualPrompt = buildKinematicPrompt({
        aspectRatio: "9:16",
        shotType: "close-up UGC smartphone shot",
        subject: `${avatar}, a ${config.persona}, holding ${product} in hand`,
        action: visualMotion,
        environment: "modern sunlit room, clean lifestyle kitchen background, soft key lighting",
        cameraMovement: "gentle tracking push-in toward product",
        stylePreset: "authentic TikTok UGC video, crisp smartphone 4k camera quality, natural skin tones"
    });

    return {
        spokenScript,
        kinematicVisualPrompt,
        actionDescription
    };
}
