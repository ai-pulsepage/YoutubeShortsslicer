# Output Panel — Complete Spec
## YouTube Shorts Slicer · Studio Page
**Date:** July 2026

This is the single source of truth for everything between "Approve segment" and "final rendered video".

---

## The Problem

Right now clicking "Render" fires the job immediately with defaults. There is no moment where the user configures output options. The fix is a **render configuration drawer** that opens when the user clicks "Render". User configures everything, hits "Render now", drawer closes, job fires.

---

## Part 1 — UI: The Output Drawer

**File:** `app/dashboard/studio/page.tsx`

### How it opens

Replace current "Render" button behavior. Instead of calling `renderSegment()` directly, clicking "Render" opens the drawer with `setOutputDrawerOpen(true)`.

The drawer is a 420px panel sliding in from the right of the Studio editor. Add it as a third column that conditionally renders inside the existing `flex h-[calc(100vh-4rem)]` layout.

### State to add to StudioContent

```typescript
const [outputDrawerOpen, setOutputDrawerOpen] = useState(false);
const [outputConfig, setOutputConfig] = useState<OutputConfig>({
  mirrorFlip: false,
  speedFactor: 1.0,
  colorGrade: "none",
  cropZoom: false,
  blurBackground: false,
  filmGrain: false,
  vignette: false,
  letterbox: false,
  narratorMode: "none",
  narratorVoiceEngine: "elevenlabs",
  narratorVoiceId: "",
  narratorAudioMix: "replace",
  camOverlayEnabled: false,
  camRecordingPath: null,
  camPosition: { x: 20, y: 20 },
  camSize: { w: 30, h: 30 },
  camShape: "circle",
  camBorderColor: "#FFFFFF",
  camBorderWidth: 3,
  camBgRemoval: true,
});
```

### TypeScript type (add at top of file)

```typescript
type OutputConfig = {
  mirrorFlip: boolean;
  speedFactor: number;
  colorGrade: string;
  cropZoom: boolean;
  blurBackground: boolean;
  filmGrain: boolean;
  vignette: boolean;
  letterbox: boolean;
  narratorMode: string;
  narratorVoiceEngine: string;
  narratorVoiceId: string;
  narratorAudioMix: string;
  camOverlayEnabled: boolean;
  camRecordingPath: string | null;
  camPosition: { x: number; y: number };
  camSize: { w: number; h: number };
  camShape: string;
  camBorderColor: string;
  camBorderWidth: number;
  camBgRemoval: boolean;
};
```

---

## Drawer Layout

```
┌─────────────────────────────────────────────────┐
│ Output configuration             [× Close]       │
│ "Segment title" · 42s                            │
├─────────────────────────────────────────────────┤
│ ▼ VIDEO TRANSFORMS              [3 active]       │
│   2-column grid of toggle cards with sliders     │
├─────────────────────────────────────────────────┤
│ ▼ AI NARRATOR                   [1 active]       │
│   Radio buttons for mode                         │
│   Voice picker (only when mode ≠ none)           │
│   Preview script button                          │
├─────────────────────────────────────────────────┤
│ ▼ WEBCAM OVERLAY                [off]            │
│   Enable toggle                                  │
│   Camera setup (getUserMedia + MediaPipe)        │
│   Record clip button                             │
│   Position/size/shape controls                   │
├─────────────────────────────────────────────────┤
│ ▼ SUBTITLES                     [on]             │
│   Read-only summary of Style tab settings        │
│   "Edit in Style tab →" link                     │
├─────────────────────────────────────────────────┤
│  [ Cancel ]    [ ▶ Render now ]                  │
└─────────────────────────────────────────────────┘
```

---

## Section 1 — Video Transforms

2-column grid of toggle cards. Each card = icon + label + optional control when toggled on.

| Toggle ID | Label | Icon | Control when on |
|-----------|-------|------|-----------------|
| `mirrorFlip` | Mirror / Flip | 🪞 | None — just a toggle |
| `blurBackground` | Blur background | 🔲 | Slider: blur strength 5–60 |
| `speedFactor` | Speed up | ⏩ | 4 preset buttons: 1.0× / 1.25× / 1.5× / 2.0× |
| `colorGrade` | Colour grade | 🎨 | Dropdown: None / Warm / Cool / Desaturate / High contrast / Vintage / Dark |
| `cropZoom` | Zoom in 110% | 📐 | None — just a toggle |
| `filmGrain` | Film grain | 🎞️ | Slider: amount 5–40 |
| `vignette` | Vignette | 🔅 | Slider: intensity 0.1–1.0 |
| `letterbox` | Cinematic bars | ⬛ | Slider: bar height 5–25% |

**Copyright safe preset** — single toggle below the grid:
```
[ ] Copyright safe mode
    Enables: Mirror + Speed 1.25× + Warm colour grade + Film grain
```
This just sets the four individual toggles — no special render path.

---

## Section 2 — AI Narrator

Radio button selection. When mode ≠ none, show voice config.

| Mode value | Label | Description |
|------------|-------|-------------|
| `none` | No narrator | Original audio plays through |
| `explanatory` | Explanatory narrator | Calm, educational. Like a documentary voice. |
| `sarcastic` | Sarcastic / Rage-bait | Outrageous takes to trigger comments. |
| `wrong` | Blatantly wrong | Hilariously misinterprets what's happening. |
| `dramatic` | Dramatic retelling | Epic, suspenseful. "Little did they know..." |
| `eli5` | Explain like I'm 5 | Simplest possible language. |

When mode ≠ none, show:
- Voice engine selector: ElevenLabs / XTTS / Dia
- Voice ID text input
- Audio mix radio: "Replace original audio" (default) OR "Layer under original (quieter)"
- **"Preview script" button** → calls `/api/videos/[videoId]/narrator-preview` → shows generated script in expandable editable box → if user edits it, that custom script is passed to the render job

---

## Section 3 — Webcam Overlay

**Enable toggle** — off by default. When on, expands to:

### Step 1: Camera setup
```
Camera source: [ Select camera ▼ ]   ← navigator.mediaDevices.getUserMedia()
[ Start preview ]
┌──────────────────┐
│  Live preview    │  ← <video> element
│  [ BG removal ✓ ]│  ← MediaPipe Selfie Segmentation toggle
└──────────────────┘
[ ● Record clip ]   ← records for exactly the segment duration
Status: No clip recorded / ✓ Clip ready (12s)
```

### Step 2: Position and size (shown after clip is recorded)
```
X from left:  [====●====] 20%    (slider 0–80%)
Y from top:   [=●=======] 10%    (slider 0–70%)
Width:        [===●=====] 28%    (slider 10–50%)
Shape:  [● Circle]  [ Rounded]  [ Square]
Border color: [■] #FFFFFF   Width: [3px]
[ Preview overlay position ]  ← static mockup showing position on 9:16 frame
```

### How position → FFmpeg pixels
```
x_pixels = (camPosition.x / 100) * 1080
y_pixels = (camPosition.y / 100) * 1920
w_pixels = (camSize.w / 100) * 1080
h_pixels = w_pixels  (square before shaping)
```

### IMPORTANT: recording must happen before render
The workflow: user records clip in drawer → clip uploads to R2 at `ugc/cam-overlays/{userId}/{segmentId}/cam.webm` → path saved in outputConfig.camRecordingPath → render worker reads it from R2 and composites via FFmpeg.

If user clicks "Render now" with cam enabled but no clip: show error "Record a webcam clip first."

### MediaPipe background removal (browser-only, no server)
Load via CDN:
```
https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js
```
Load dynamically when cam overlay section is expanded. Run SelfieSegmentation in requestAnimationFrame loop. Draw masked output to a canvas. Capture canvas stream for MediaRecorder. Upload resulting webm blob to `/api/cam-overlay/upload`.

---

## Section 4 — Subtitles (read-only)

Just a summary — editing happens in the Style tab:
```
Font: Montserrat · 64px · word-highlight
Position: Bottom · White / Cyan highlight
[ Edit subtitle style → ]   ← closes drawer, switches to Style tab
```

---

## Bottom bar

```
[ Cancel ]    [ ▶ Render now ]
```

"Render now" calls `renderSegmentWithConfig(segmentId, outputConfig)` — new function that passes outputConfig in the render API request body.

---

## Part 2 — Narrator Preview API

**New file:** `app/api/videos/[videoId]/narrator-preview/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const NARRATOR_PROMPTS: Record<string, string> = {
  explanatory: `You are a calm educational documentary narrator. Rewrite this transcript as a clear narration explaining what's happening. Sound like David Attenborough. Keep it concise — must fit original duration when spoken naturally. Output ONLY the narration script.`,
  sarcastic: `You are a sarcastic social media commentator. Rewrite this as outrageous sarcastic commentary designed to make viewers laugh and comment angrily. Output ONLY the narration script.`,
  wrong: `You are a comedy narrator who intentionally misinterprets everything. Describe what's happening in a completely wrong, hilarious way. Output ONLY the narration script.`,
  dramatic: `You are a dramatic film narrator. Rewrite as if this is the most epic moment in history. Use "Little did they know...", "In a world where...", dramatic pauses. Output ONLY the narration script.`,
  eli5: `Explain this to a curious 5-year-old. Short sentences, simple words, enthusiasm. Output ONLY the narration script.`,
};

export async function POST(req: NextRequest, { params }: { params: { videoId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { segmentId, narratorMode } = await req.json();

  const transcript = await prisma.transcript.findUnique({ where: { videoId: params.videoId } });
  if (!transcript) return NextResponse.json({ error: "No transcript" }, { status: 404 });

  const segment = await prisma.segment.findUnique({ where: { id: segmentId } });
  if (!segment) return NextResponse.json({ error: "Segment not found" }, { status: 404 });

  const allWords = (transcript.segments as any[]) || [];
  const segmentWords = allWords.filter(
    (w: any) => w.start >= segment.startTime && w.end <= segment.endTime
  );
  const segmentText = segmentWords.map((w: any) => w.text).join(" ") || "";

  const systemPrompt = NARRATOR_PROMPTS[narratorMode];
  if (!systemPrompt) return NextResponse.json({ error: "Unknown mode" }, { status: 400 });

  let apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const dbKey = await prisma.apiKey.findUnique({ where: { service: "deepseek_api_key" } });
    if (dbKey?.key) apiKey = Buffer.from(dbKey.key, "base64").toString("utf8");
  }
  if (!apiKey) return NextResponse.json({ error: "No DeepSeek API key" }, { status: 500 });

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Transcript:\n${segmentText}` },
      ],
      temperature: 0.8,
      max_tokens: 500,
    }),
  });

  const data = await res.json();
  const script = data.choices?.[0]?.message?.content?.trim() || "";
  return NextResponse.json({ script });
}
```

---

## Part 3 — Webcam Upload API

**New file:** `app/api/cam-overlay/upload/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadFileToR2 } from "@/lib/storage";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const segmentId = formData.get("segmentId") as string;
  if (!file || !segmentId) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const key = `ugc/cam-overlays/${session.user.id}/${segmentId}/cam.webm`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await uploadFileToR2(buffer, key, "video/webm");
  return NextResponse.json({ key });
}
```

---

## Part 4 — New effects to add to `lib/effects.ts`

Add these to the PRESETS array:

```typescript
// Mirror flip
{
  id: "mirror_flip",
  label: "Mirror / Flip",
  description: "Flip video left-right",
  icon: "🪞",
  category: "color" as EffectCategory,
  params: [],
  buildFilter: () => `[0:v]hflip`,
},

// Desaturate
{
  id: "desaturate",
  label: "Desaturate",
  description: "Black and white",
  icon: "⬜",
  category: "color" as EffectCategory,
  params: [{ key: "amount", label: "Amount", type: "number", default: 1.0, min: 0.3, max: 1.0 }],
  buildFilter: (params) => `[0:v]hue=s=${1 - (params.amount || 1.0)}`,
},

// High contrast
{
  id: "high_contrast",
  label: "High Contrast",
  description: "Punchy blacks and whites",
  icon: "◐",
  category: "color" as EffectCategory,
  params: [{ key: "contrast", label: "Contrast", type: "number", default: 1.5, min: 1.1, max: 2.5 }],
  buildFilter: (params) => `[0:v]eq=contrast=${params.contrast || 1.5}:brightness=-0.05:saturation=1.2`,
},

// Vintage
{
  id: "vintage",
  label: "Vintage",
  description: "Faded retro look",
  icon: "📼",
  category: "color" as EffectCategory,
  params: [],
  buildFilter: () =>
    `[0:v]curves=r='0/0.1 1/0.9':g='0/0.05 1/0.85':b='0/0.0 1/0.7',hue=s=0.7,noise=c0s=8:c0f=t+u`,
},

// Dark dramatic
{
  id: "dark_dramatic",
  label: "Dark Dramatic",
  description: "Dark moody cinematic",
  icon: "🌑",
  category: "color" as EffectCategory,
  params: [],
  buildFilter: () =>
    `[0:v]eq=brightness=-0.08:contrast=1.3:saturation=0.85,colorbalance=rs=-0.05:gs=-0.02:bs=0.05`,
},

// Crop zoom
{
  id: "crop_zoom",
  label: "Zoom In 110%",
  description: "Slight zoom — changes framing",
  icon: "📐",
  category: "layout" as EffectCategory,
  params: [],
  buildFilter: (_, meta) => {
    const cropW = Math.round(meta.width / 1.1);
    const cropH = Math.round(meta.height / 1.1);
    return `[0:v]crop=${cropW}:${cropH}:(iw-${cropW})/2:(ih-${cropH})/2,scale=${meta.width}:${meta.height}`;
  },
},
```

---

## Part 5 — Render Worker Changes (`workers/index.ts`)

### API route change first

In `app/api/videos/[videoId]/render/route.ts`, forward `outputConfig` from request body into the BullMQ job data.

### New render steps — add in this order

After existing Step 3.5 (subtitles) and before Step 3.6 (hook text):

**Step 3.55 — Video transforms (mirror, color grade, zoom)**

```typescript
if (job.data.outputConfig) {
  const cfg = job.data.outputConfig;
  const transforms: string[] = [];

  if (cfg.mirrorFlip) transforms.push("hflip");

  const colorFilters: Record<string, string> = {
    warm: "colorbalance=rs=0.12:gs=0.04:bs=-0.10",
    cool: "colorbalance=rs=-0.10:gs=-0.03:bs=0.10",
    desaturate: "hue=s=0",
    high_contrast: "eq=contrast=1.5:brightness=-0.05:saturation=1.2",
    vintage: "curves=r='0/0.1 1/0.9':g='0/0.05 1/0.85':b='0/0.0 1/0.7',hue=s=0.7,noise=c0s=8:c0f=t+u",
    dark: "eq=brightness=-0.08:contrast=1.3:saturation=0.85,colorbalance=rs=-0.05:gs=-0.02:bs=0.05",
  };
  if (cfg.colorGrade && cfg.colorGrade !== "none" && colorFilters[cfg.colorGrade]) {
    transforms.push(colorFilters[cfg.colorGrade]);
  }

  if (cfg.cropZoom) {
    const cropW = Math.round(outW / 1.1);
    const cropH = Math.round(outH / 1.1);
    transforms.push(`crop=${cropW}:${cropH}:(iw-${cropW})/2:(ih-${cropH})/2,scale=${outW}:${outH}`);
  }

  if (transforms.length > 0) {
    const transformOutput = path.join(renderDir, "transformed.mp4");
    execSync(
      `ffmpeg -i "${outputPath}" -filter_complex "[0:v]${transforms.join(",")}[vout]" -map "[vout]" -map 0:a -c:v libx264 -preset fast -crf 23 -c:a copy "${transformOutput}" -y`,
      { timeout: 300000 }
    );
    fs.renameSync(transformOutput, outputPath);
  }

  // Speed change (separate — needs audio filter)
  if (cfg.speedFactor && cfg.speedFactor !== 1.0) {
    const factor = cfg.speedFactor;
    const aFilter = factor > 2.0 ? `atempo=2.0,atempo=${(factor/2).toFixed(2)}` : `atempo=${factor}`;
    const speedOutput = path.join(renderDir, "sped.mp4");
    execSync(
      `ffmpeg -i "${outputPath}" -filter_complex "[0:v]setpts=${(1/factor).toFixed(4)}*PTS[v];[0:a]${aFilter}[a]" -map "[v]" -map "[a]" -c:v libx264 -preset fast -crf 23 -c:a aac "${speedOutput}" -y`,
      { timeout: 300000 }
    );
    fs.renameSync(speedOutput, outputPath);
  }
}
```

**Step 3.56 — AI Narrator**

```typescript
if (job.data.outputConfig?.narratorMode && job.data.outputConfig.narratorMode !== "none") {
  const cfg = job.data.outputConfig;
  try {
    let narratorScript = job.data.outputConfig.customNarratorScript || "";

    if (!narratorScript) {
      const PROMPTS: Record<string, string> = {
        explanatory: "Calm educational documentary narrator. Rewrite as clear narration. Output ONLY script.",
        sarcastic: "Sarcastic social media commentator. Outrageous takes to trigger comments. Output ONLY script.",
        wrong: "Comedy narrator who misinterprets everything hilariously. Output ONLY script.",
        dramatic: "Epic dramatic narrator. 'Little did they know...'. Output ONLY script.",
        eli5: "Explain to a 5-year-old. Simple words, short sentences. Output ONLY script.",
      };

      let apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) {
        const dbKey = await prisma.apiKey.findUnique({ where: { service: "deepseek_api_key" } });
        if (dbKey?.key) apiKey = Buffer.from(dbKey.key, "base64").toString("utf8");
      }

      if (apiKey) {
        const tx = (segment.video as any).transcript;
        const allWords = tx?.segments ? (typeof tx.segments === "string" ? JSON.parse(tx.segments) : tx.segments) : [];
        const segText = allWords
          .filter((w: any) => w.start >= segment.startTime && w.end <= segment.endTime)
          .map((w: any) => w.text).join(" ");

        const genRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              { role: "system", content: PROMPTS[cfg.narratorMode] || PROMPTS.explanatory },
              { role: "user", content: `Transcript:\n${segText}` },
            ],
            temperature: 0.8,
            max_tokens: 500,
          }),
        });
        const genData = await genRes.json();
        narratorScript = genData.choices?.[0]?.message?.content?.trim() || "";
      }
    }

    if (narratorScript) {
      const { generateVoiceover } = await import("../lib/tts");
      const audioBuffer = await generateVoiceover({
        text: narratorScript,
        engine: cfg.narratorVoiceEngine || "elevenlabs",
        voiceId: cfg.narratorVoiceId || "21m00Tcm4TlvDq8ikWAM",
        narratorStyle: "documentary",
      });

      const narratorPath = path.join(renderDir, "narrator.mp3");
      fs.writeFileSync(narratorPath, audioBuffer);

      const mixOutput = path.join(renderDir, "narrated.mp4");
      const origVol = cfg.narratorAudioMix === "replace" ? "0" : "0.2";
      execSync(
        `ffmpeg -i "${outputPath}" -i "${narratorPath}" ` +
        `-filter_complex "[0:a]volume=${origVol}[orig];[1:a]volume=1.0[narr];[orig][narr]amix=inputs=2:duration=first[aout]" ` +
        `-map 0:v -map "[aout]" -c:v copy -c:a aac "${mixOutput}" -y`,
        { timeout: 300000 }
      );
      fs.renameSync(mixOutput, outputPath);
      console.log(`[Render] ✓ Narrator applied: ${cfg.narratorMode}`);
    }
  } catch (err: any) {
    console.warn(`[Render] Narrator failed (non-fatal): ${err.message}`);
  }
}
```

**Step 3.57 — Webcam overlay composite**

```typescript
if (job.data.outputConfig?.camOverlayEnabled && job.data.outputConfig?.camRecordingPath) {
  const cfg = job.data.outputConfig;
  try {
    const camLocalPath = path.join(renderDir, "cam.webm");
    const { downloadFileFromR2 } = await import("../lib/storage");
    await downloadFileFromR2(cfg.camRecordingPath, camLocalPath);

    const xPx = Math.round((cfg.camPosition.x / 100) * outW);
    const yPx = Math.round((cfg.camPosition.y / 100) * outH);
    const wPx = Math.round((cfg.camSize.w / 100) * outW);
    const hPx = wPx;

    const camScaledPath = path.join(renderDir, "cam_scaled.mp4");
    execSync(
      `ffmpeg -i "${camLocalPath}" -vf "scale=${wPx}:${hPx}" -c:v libx264 -preset fast -crf 23 -an "${camScaledPath}" -y`,
      { timeout: 120000 }
    );

    const overlayOutput = path.join(renderDir, "overlaid.mp4");

    if (cfg.camShape === "circle") {
      const maskedCam = path.join(renderDir, "cam_masked.mp4");
      execSync(
        `ffmpeg -i "${camScaledPath}" -vf "format=yuva420p,geq=lum='p(X,Y)':a='if(lte(hypot(X-W/2,Y-H/2),W/2),255,0)'" -c:v libx264 -preset fast -crf 23 "${maskedCam}" -y`,
        { timeout: 120000 }
      );
      const borderHex = cfg.camBorderColor.replace("#", "0x");
      const bw = cfg.camBorderWidth || 3;
      execSync(
        `ffmpeg -i "${outputPath}" -i "${maskedCam}" ` +
        `-filter_complex "[0:v]drawbox=x=${xPx-bw}:y=${yPx-bw}:w=${wPx+bw*2}:h=${hPx+bw*2}:color=${borderHex}@1:t=fill[base];[base][1:v]overlay=${xPx}:${yPx}:format=auto[vout]" ` +
        `-map "[vout]" -map 0:a -c:v libx264 -preset fast -crf 23 -c:a copy "${overlayOutput}" -y`,
        { timeout: 300000 }
      );
    } else {
      execSync(
        `ffmpeg -i "${outputPath}" -i "${camScaledPath}" ` +
        `-filter_complex "[0:v][1:v]overlay=${xPx}:${yPx}[vout]" ` +
        `-map "[vout]" -map 0:a -c:v libx264 -preset fast -crf 23 -c:a copy "${overlayOutput}" -y`,
        { timeout: 300000 }
      );
    }

    fs.renameSync(overlayOutput, outputPath);
    console.log(`[Render] ✓ Webcam overlay composited`);
  } catch (err: any) {
    console.warn(`[Render] Webcam overlay failed (non-fatal): ${err.message}`);
  }
}
```

---

## Part 6 — Full render pipeline order after changes

1. Download source video from R2
2. Size + crop to aspect ratio
3. Burn subtitles (existing Step 3.5)
4. Hook text overlay (existing Step 3.6)
5. Watermark overlay (existing Step 3.7)
6. Video effects from Effects tab (existing Step 3.8)
7. **NEW: Output transforms — mirror, color grade, zoom (Step 3.55)**
8. **NEW: Speed change (Step 3.55 continued)**
9. **NEW: AI narrator — script + TTS + audio mix (Step 3.56)**
10. **NEW: Webcam overlay composite (Step 3.57)**
11. Voiceover mix (existing Step 4)
12. Upload to R2 (existing Step 5)
13. Save to DB (existing Step 6)

---

## Part 7 — Files changed summary

| File | Change |
|------|--------|
| `app/dashboard/studio/page.tsx` | Add OutputConfig type, drawer state, OutputDrawer component, update Render buttons |
| `lib/effects.ts` | Add 6 new presets: mirror_flip, desaturate, high_contrast, vintage, dark_dramatic, crop_zoom |
| `workers/index.ts` | Add Steps 3.55, 3.56, 3.57 in render worker. Accept outputConfig in job data. |
| `app/api/videos/[videoId]/render/route.ts` | Forward outputConfig into BullMQ job data |
| `app/api/videos/[videoId]/narrator-preview/route.ts` | NEW — generate narrator script preview |
| `app/api/cam-overlay/upload/route.ts` | NEW — accept webcam clip upload |

**No Prisma schema changes needed.** All data flows through existing segment.effects JSON + BullMQ job data.

---

## Dev notes

- All three new render steps are try/catch — a narrator failure does NOT abort the render
- Speed changes use atempo for audio too — without this video and audio go out of sync
- MediaPipe BG removal is entirely browser-side — no server access to the camera
- WebM from MediaRecorder is natively supported by FFmpeg for overlay compositing
- The narrator preview API does NOT save to DB — it just returns the script text for preview
