# Backend Dev Instructions — UGC Pipeline & Missing Pieces
**Project:** YouTube Shorts Slicer  
**Stack:** Next.js 16 · Prisma 7 · PostgreSQL · BullMQ · Redis · S3/R2 · TypeScript  
**Date:** July 2026

---

## Context — what already works (do not touch)

The core slicer pipeline is complete and solid:
- `workers/index.ts` — Download → Transcription → Segmentation → Render workers, all wired
- `lib/ai.ts` — DeepSeek segmentation with Gemini fallback, chunking for long videos
- `lib/subtitles.ts` + `lib/ass-subtitles.ts` — ASS subtitle generation, word-level timestamps
- `lib/tts.ts` — ElevenLabs / XTTS / Dia router, all three engines working
- `lib/storage.ts` — R2 upload/download helpers
- `lib/effects.ts` — FFmpeg filter chain builder
- All publish flows (TikTok, YouTube, Instagram) — in `lib/` and `app/api/publish/`
- Prisma schema — Video, Transcript, Segment, ShortVideo, PublishJob, Channel, Documentary, Podcast system

**Do not refactor any of the above.** Additive changes only.

---

## Task 1 — Prisma schema additions

Add these three models to `prisma/schema.prisma`. Place them after the `CampaignBrief` model block.

```prisma
// ─── UGC System ──────────────────────────────────────────

enum UGCJobStatus {
  PENDING
  GENERATING_SCRIPT
  GENERATING_VIDEO
  COMPOSITING
  DONE
  FAILED
}

enum UGCHookStyle {
  TESTIMONIAL
  PROBLEM_SOLUTION
  UNBOXING
  COMPARISON
  TUTORIAL
}

model UGCAvatar {
  id                String   @id @default(cuid())
  userId            String
  name              String
  referenceImageUrl String?
  referenceVideoUrl String?
  thumbnailUrl      String?
  voiceEngine       String   @default("elevenlabs")
  voiceId           String?
  voiceRefPath      String?
  persona           String?  @db.Text
  isActive          Boolean  @default(true)

  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  ugcJobs UGCJob[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model UGCProduct {
  id            String    @id @default(cuid())
  userId        String
  sourceUrl     String
  name          String
  description   String?   @db.Text
  price         String?
  imageUrls     String[]
  affiliateLink String?
  brand         String?
  category      String?
  scrapedAt     DateTime?

  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  ugcJobs UGCJob[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model UGCJob {
  id          String       @id @default(cuid())
  userId      String
  avatarId    String
  productId   String
  hookStyle   UGCHookStyle @default(TESTIMONIAL)
  script      String?      @db.Text
  outputUrl   String?
  thumbnailUrl String?
  duration    Float?
  aspectRatio String       @default("9:16")
  status      UGCJobStatus @default(PENDING)
  errorMsg    String?      @db.Text
  metadata    Json?

  avatar  UGCAvatar  @relation(fields: [avatarId], references: [id], onDelete: Cascade)
  product UGCProduct @relation(fields: [productId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Also add to the User model:
```prisma
  ugcAvatars  UGCAvatar[]
  ugcProducts UGCProduct[]
  ugcJobs     UGCJob[]
```

After editing, run:
```bash
npx prisma migrate dev --name add_ugc_system
npx prisma generate
```

---

## Task 2 — API routes

### 2a. `app/api/avatars/route.ts`
GET — list avatars. POST — create avatar (name + persona, no file yet).

### 2b. `app/api/avatars/[id]/upload/route.ts`
POST — multipart upload for reference image/video/voice. type param = "image" | "video" | "voice". Use uploadFileToR2 from lib/storage.ts.

### 2c. `app/api/products/ingest/route.ts`
POST with { url } — scrape with cheerio (npm install cheerio), extract og:title, og:description, og:image, price. Save UGCProduct.

### 2d. `app/api/products/route.ts`
GET — list products for logged-in user.

### 2e. `app/api/ugc/generate/route.ts`
POST with { avatarId, productId, hookStyle, customScript } — generate script via DeepSeek, create UGCJob, queue ugc-generation BullMQ job.

### 2f. `app/api/ugc/[id]/route.ts`
GET — return job status + avatar + product relations.

### 2g. `app/api/ugc/route.ts`
GET — list last 20 UGC jobs for user with avatar+product included.

Full code for all routes is in the DEV_FRONTEND.md and DEV_OUTPUT_PANEL.md files in this folder.

---

## Task 3 — `workers/ugc.ts`

New BullMQ worker for the ugc-generation queue. Steps:
1. Generate TTS audio from script using existing lib/tts.ts
2. Download avatar reference image from R2
3. Call Hedra API (HEDRA_API_KEY) for talking-head generation — poll until complete
4. Optionally call Together.ai Wan 2.7 for product B-roll
5. FFmpeg composite: talking head + B-roll stacked
6. Upload final.mp4 to R2, update UGCJob status to DONE

Add to workers/index.ts:
```typescript
import { ugcWorker } from "./ugc";
// add to workers array: { name: "UGC", worker: ugcWorker }
```

---

## Task 4 — Wire MoneyPrinterTurbo

Add `MONEY_PRINTER_URL=http://localhost:8080` to .env.
Create `app/api/animated/generate/route.ts` that proxies POST to MoneyPrinterTurbo's FastAPI.
Read `/MoneyPrinterTurbo/app/` to confirm the exact API route and field names before implementing.

---

## Task 5 — New env vars needed

```env
HEDRA_API_KEY=        # talking-head generation (hedra.com)
MONEY_PRINTER_URL=http://localhost:8080
```

---

## Task 6 — New dependency

```bash
npm install cheerio
```

---

## Checklist

| # | Task | Effort |
|---|------|--------|
| 1 | Prisma models + migration | 20 min |
| 2 | Avatar + product + UGC API routes | 90 min |
| 3 | workers/ugc.ts | 60 min |
| 4 | Wire MoneyPrinterTurbo | 20 min |
| 5 | Env vars + npm install | 5 min |

**Total: ~3.5 hours**
