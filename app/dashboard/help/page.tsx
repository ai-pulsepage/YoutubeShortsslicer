"use client";

import { useState } from "react";
import {
    HelpCircle,
    ChevronDown,
    ChevronRight,
    Download,
    Scissors,
    Film,
    Type,
    Mic,
    Share2,
    Calendar,
    BarChart3,
    Zap,
    AlertCircle,
    ArrowRight,
    Play,
    Settings,
    Library,
    Sparkles,
    CheckCircle,
    XCircle,
    RefreshCw,
    Save,
    Wand2,
    Send,
    Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Section = {
    id: string;
    title: string;
    icon: any;
    content: React.ReactNode;
};

export default function HelpPage() {
    const [openSection, setOpenSection] = useState<string>("pipeline");

    const toggle = (id: string) =>
        setOpenSection(openSection === id ? "" : id);

    const sections: Section[] = [
        {
            id: "pipeline",
            title: "How the Pipeline Works",
            icon: Zap,
            content: (
                <div className="space-y-4">
                    <p className="text-sm text-gray-300">
                        The platform automates the journey from a long-form video to published Shorts.
                        The first 3 steps are fully automatic — you take control starting at step 4.
                    </p>
                    <div className="space-y-0">
                        {[
                            { step: "1", label: "Add Video", page: "Library → Add Video", desc: "Paste any video URL (YouTube, Vimeo, Twitter, etc.). The system downloads the full video. You can tag it for organization.", color: "violet" },
                            { step: "2", label: "Transcribe", page: "Automatic", desc: "Audio is extracted and transcribed with word-level timestamps. Happens automatically after download — no action needed.", color: "blue" },
                            { step: "3", label: "AI Segment", page: "Automatic", desc: "AI analyzes the transcript and suggests the best 30–60 second clips, scoring each for engagement potential, hook strength, and emotional arc.", color: "cyan" },
                            { step: "4", label: "Review & Style", page: "Studio", desc: "Review AI suggestions. Approve the best segments. Customize subtitle style, add hook text overlays, apply video effects (blur background, color grading, etc.).", color: "emerald" },
                            { step: "5", label: "Render", page: "Studio", desc: "Render approved segments into vertical 9:16 video with burned-in subtitles, effects, and hook text. Re-render anytime after editing.", color: "amber" },
                            { step: "6", label: "Export & Publish", page: "Export", desc: "Download rendered clips, publish directly to YouTube, or schedule for future posting. Batch assign to channel schedules.", color: "orange" },
                        ].map((item, i) => (
                            <div key={item.step} className="flex gap-4 items-start">
                                <div className="flex flex-col items-center">
                                    <div className={`w-8 h-8 rounded-full bg-${item.color}-500/15 border border-${item.color}-500/20 flex items-center justify-center text-xs font-bold text-${item.color}-400`}>
                                        {item.step}
                                    </div>
                                    {i < 5 && <div className="w-px h-6 bg-gray-800" />}
                                </div>
                                <div className="pb-4">
                                    <h4 className="text-sm font-semibold text-white">{item.label}</h4>
                                    <p className="text-[10px] text-gray-600 mb-0.5">{item.page}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-gray-400">
                            <strong className="text-blue-400">Automatic:</strong> Steps 1–3 happen without any input from you. Just paste the URL and wait. Status progresses: Downloading → Transcribing → Segmenting → Ready.
                        </p>
                    </div>
                </div>
            ),
        },
        {
            id: "library",
            title: "Library — Your Video Hub",
            icon: Library,
            content: (
                <div className="space-y-3 text-sm text-gray-300">
                    <p>The Library is your home base — it shows every video you&apos;ve imported. This is where you start.</p>
                    <h4 className="text-xs font-semibold text-white mt-3">Buttons & Actions</h4>
                    <ul className="space-y-2 text-gray-400 ml-4 list-disc">
                        <li><strong className="text-white">+ Add Video</strong> — Opens the Ingest page to paste a new video URL. This begins the automated pipeline (download → transcribe → segment).</li>
                        <li><strong className="text-white">Grid/List toggle</strong> — Switch between visual thumbnail grid and compact list view.</li>
                        <li><strong className="text-white">Status filter</strong> — Filter by pipeline stage: Pending, Downloading, Transcribing, Segmenting, Ready, Failed. Use &quot;Ready&quot; to find videos that are done processing and ready for the Studio.</li>
                        <li><strong className="text-white">Tags</strong> — Create color-coded tags (e.g., &quot;Animals&quot;, &quot;Gaming&quot;, &quot;News&quot;) to organize videos by category. Click the Tags button to manage.</li>
                        <li><strong className="text-white">Search</strong> — Search by video title.</li>
                        <li><strong className="text-white">Video card click</strong> — Opens the video in <strong className="text-violet-400">Studio</strong> for editing.</li>
                        <li><strong className="text-white">⋮ Menu → Delete</strong> — Permanently deletes the video, all its segments, rendered shorts, and cloud storage files. Cannot be undone.</li>
                    </ul>
                    <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3 mt-3">
                        <p className="text-xs text-gray-400">
                            <strong className="text-amber-400">Tip:</strong> The Library auto-refreshes every 5 seconds while videos are processing. You&apos;ll see the status badge update in real time.
                        </p>
                    </div>
                </div>
            ),
        },
        {
            id: "campaigns",
            title: "Campaigns — Brand Briefs",
            icon: Briefcase,
            content: (
                <div className="space-y-3 text-sm text-gray-300">
                    <p>Campaigns let you define brand requirements that apply to your clips. This is useful for sponsored content or multi-channel operations.</p>
                    <h4 className="text-xs font-semibold text-white mt-3">What a Campaign Brief Contains</h4>
                    <ul className="space-y-1 text-gray-400 ml-4 list-disc">
                        <li><strong className="text-white">Target platforms</strong> — TikTok, Instagram, YouTube</li>
                        <li><strong className="text-white">Caption guidelines</strong> — Pre-written captions and rules</li>
                        <li><strong className="text-white">Required hashtags</strong> — Auto-included on publish</li>
                        <li><strong className="text-white">Disclosure/FTC</strong> — Automatic disclosure placement for sponsored content</li>
                        <li><strong className="text-white">Watermark</strong> — Watermark image URL burned into rendered clips</li>
                        <li><strong className="text-white">Video settings</strong> — Min/max clip length constraints</li>
                        <li><strong className="text-white">Requirements / Not Allowed</strong> — Checklist of do&apos;s and don&apos;ts</li>
                    </ul>
                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3 mt-3">
                        <p className="text-xs text-gray-400">
                            <strong className="text-blue-400">How it connects:</strong> When a video is linked to a campaign, the render worker automatically applies watermarks and the scheduler includes required hashtags in the upload description.
                        </p>
                    </div>
                </div>
            ),
        },
        {
            id: "studio",
            title: "Studio — Edit, Style & Render",
            icon: Wand2,
            content: (
                <div className="space-y-4 text-sm text-gray-300">
                    <p>The Studio is the central editing hub. This is where you review AI suggestions, customize styling, apply effects, and render your final clips.</p>

                    <h4 className="text-xs font-semibold text-white">Segment Status Lifecycle</h4>
                    <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-3 text-xs">
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium">AI SUGGESTED</span>
                            <span className="text-gray-500">→</span>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">APPROVED</span>
                            <span className="text-gray-500">→</span>
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">RENDERING</span>
                            <span className="text-gray-500">→</span>
                            <span className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-medium">RENDERED</span>
                        </div>
                        <p className="text-[10px] text-gray-500">You can also reject segments or reconsider rejected ones. Rendered segments can be re-rendered after style changes.</p>
                    </div>

                    <h4 className="text-xs font-semibold text-white mt-3">Action Buttons (per segment)</h4>
                    <ul className="space-y-2 text-gray-400 ml-4 list-disc">
                        <li><strong className="text-emerald-400">✓ Approve</strong> — Marks the segment as approved. This is the gate: only approved segments can be rendered. Use this to confirm an AI suggestion is worth keeping.</li>
                        <li><strong className="text-red-400">✗ Reject</strong> — Marks the segment as rejected. It won&apos;t be rendered. Available from both AI Suggested and Approved states.</li>
                        <li><strong className="text-gray-300">↻ Reconsider</strong> — Un-rejects a rejected segment, returning it to AI Suggested so you can re-evaluate it.</li>
                        <li><strong className="text-violet-400">🎬 Render</strong> — Sends this specific segment to the render worker. Produces a 9:16 vertical video with your chosen subtitles, effects, and hook text.</li>
                        <li><strong className="text-amber-400">↻ Re-render</strong> — Available on already-rendered segments. Use after changing style, effects, or hooks. Replaces the existing clip.</li>
                        <li><strong className="text-blue-400">▶ Preview</strong> — Plays the rendered clip inline in the Studio.</li>
                        <li><strong className="text-emerald-400">⬇ Download</strong> — Downloads the rendered MP4 file.</li>
                        <li><strong className="text-violet-400">Render All Approved (N)</strong> — Bottom-left button. Batch-renders all approved segments in one click.</li>
                    </ul>

                    <h4 className="text-xs font-semibold text-white mt-3">Style Tab</h4>
                    <p className="text-gray-400">Controls how burned-in subtitles look on the final video.</p>
                    <ul className="space-y-1 text-gray-400 ml-4 list-disc">
                        <li><strong className="text-white">Font Family</strong> — Montserrat, Arial, Impact, etc.</li>
                        <li><strong className="text-white">Font Size</strong> — Slider from 24px to 200px</li>
                        <li><strong className="text-white">Text Color</strong> — Color picker + hex input (main subtitle text color)</li>
                        <li><strong className="text-white">Highlight Color</strong> — The color used to highlight the currently spoken word</li>
                        <li><strong className="text-white">Animation</strong> — How words appear: word-highlight (karaoke-style), fade, pop, slide-up</li>
                        <li><strong className="text-white">Position</strong> — Where subtitles sit: bottom, center, or top of frame</li>
                    </ul>
                    <p className="text-[10px] text-gray-600 mt-1">Changes are saved per-segment. Click &quot;Save&quot; (only appears when you make changes). Re-render to see updates.</p>

                    <h4 className="text-xs font-semibold text-white mt-3">Effects Tab</h4>
                    <p className="text-gray-400">Apply video effects that are processed by FFmpeg during rendering.</p>
                    <ul className="space-y-1 text-gray-400 ml-4 list-disc">
                        <li><strong className="text-white">🔲 Blur Background</strong> — Full-frame blurred copy behind a sharp, centered letterboxed version (the &quot;video on blurred video&quot; look popular on TikTok)</li>
                        <li><strong className="text-white">🌅 Warm Cinematic</strong> — Orange/golden color grade (documentary feel)</li>
                        <li><strong className="text-white">❄️ Cool Blue</strong> — Cold blue tint (tech/night feel)</li>
                        <li><strong className="text-white">🎞️ Film Grain</strong> — Analog film grain texture overlay</li>
                        <li><strong className="text-white">🔅 Vignette</strong> — Dark corner fade for cinematic focus</li>
                        <li><strong className="text-white">⬛ Letterbox</strong> — Black cinematic bars top &amp; bottom</li>
                        <li><strong className="text-white">🎬 Fade In/Out</strong> — Smooth black fade at start and end of clip</li>
                        <li><strong className="text-white">⏱️ Slow Motion</strong> — Half-speed playback (audio tempo adjusted)</li>
                        <li><strong className="text-white">⏩ Speed Up</strong> — 1.5x speed playback (audio tempo adjusted)</li>
                    </ul>
                    <p className="text-[10px] text-gray-600 mt-1">Multiple effects can stack. Click preset to add, trash icon to remove. Save, then render/re-render to see results.</p>

                    <h4 className="text-xs font-semibold text-white mt-3">Hooks Tab</h4>
                    <p className="text-gray-400">Add a prominent on-screen title at the top of your video — the &quot;hook&quot; text that grabs attention in the first seconds.</p>
                    <ul className="space-y-1 text-gray-400 ml-4 list-disc">
                        <li><strong className="text-white">Hook Text</strong> — The text shown on screen (e.g., &quot;You won&apos;t believe what happens next&quot;)</li>
                        <li><strong className="text-white">Font Size</strong> — Slider (auto-shrinks if text is too long for the frame)</li>
                        <li><strong className="text-white">UPPERCASE</strong> — Toggle to force all-caps</li>
                        <li><strong className="text-white">Box Color</strong> — Background highlight behind the text (default yellow)</li>
                        <li><strong className="text-white">Font Color</strong> — Text color (default white)</li>
                        <li><strong className="text-white">Live Preview</strong> — Shows how hook will look before rendering</li>
                    </ul>
                </div>
            ),
        },
        {
            id: "export",
            title: "Export — Download, Publish & Schedule",
            icon: Send,
            content: (
                <div className="space-y-3 text-sm text-gray-300">
                    <p>Export is the final step. All rendered clips appear here with three actions per clip.</p>
                    <h4 className="text-xs font-semibold text-white mt-3">Actions Per Clip</h4>
                    <ul className="space-y-2 text-gray-400 ml-4 list-disc">
                        <li><strong className="text-white">📥 Download</strong> — Downloads the MP4 file to your computer. Use for manual upload to TikTok, Instagram, etc.</li>
                        <li><strong className="text-white">🚀 Publish Now</strong> — Immediately uploads to YouTube via the Data API. Uses the first connected channel. Adds #Shorts and hashtags automatically.</li>
                        <li><strong className="text-white">📅 Schedule</strong> — Opens a scheduling modal where you pick:
                            <ul className="ml-4 mt-1 space-y-0.5 list-disc">
                                <li>Which connected channel to post to</li>
                                <li>Date and time for the upload</li>
                                <li>Title and description</li>
                            </ul>
                            The scheduler worker picks it up and publishes at the scheduled time.
                        </li>
                    </ul>
                    <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3 mt-3">
                        <p className="text-xs text-gray-400">
                            <strong className="text-amber-400">Requires:</strong> At least one YouTube channel connected via the Channels page. A banner appears if no channels are detected.
                        </p>
                    </div>
                </div>
            ),
        },
        {
            id: "channels",
            title: "Channels — YouTube Connection",
            icon: Share2,
            content: (
                <div className="space-y-3 text-sm text-gray-300">
                    <p>Connect your YouTube channels for automatic publishing.</p>
                    <ul className="space-y-1 text-gray-400 ml-4 list-disc">
                        <li><strong className="text-white">Connect</strong> — Click &quot;Connect YouTube Channel&quot; to authorize via Google OAuth</li>
                        <li><strong className="text-white">Multiple channels</strong> — All channels on your Google account are auto-detected</li>
                        <li><strong className="text-white">Token refresh</strong> — Tokens are silently refreshed when you visit this page (no re-login needed)</li>
                        <li><strong className="text-white">Channel cards</strong> — Click to expand and see subscriber count, video count, properties</li>
                        <li><strong className="text-white">Disconnect</strong> — Remove a channel and its tokens</li>
                        <li><strong className="text-white">View on YouTube</strong> — Direct link to the channel</li>
                    </ul>
                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3">
                        <p className="text-xs text-gray-400">
                            <strong className="text-blue-400">Note:</strong> You only need to re-authenticate if you revoke access in your Google Account settings.
                        </p>
                    </div>
                </div>
            ),
        },
        {
            id: "scheduler",
            title: "Scheduler — Automated Posting",
            icon: Calendar,
            content: (
                <div className="space-y-3 text-sm text-gray-300">
                    <p>Create named schedules for each YouTube channel and batch-assign content.</p>
                    <ul className="space-y-1 text-gray-400 ml-4 list-disc">
                        <li><strong className="text-white">Create a schedule</strong> — Click &quot;+&quot; in the sidebar → name it, pick a channel, set post times</li>
                        <li><strong className="text-white">Posting times</strong> — Configure exact times (e.g., 9am, 1pm, 6pm)</li>
                        <li><strong className="text-white">Per-channel view</strong> — Click a schedule in the sidebar to filter the calendar to just that channel</li>
                        <li><strong className="text-white">Calendar view</strong> — See scheduled posts on a monthly calendar</li>
                        <li><strong className="text-white">List view</strong> — Sorted list with status and error messages</li>
                        <li><strong className="text-white">Batch assign</strong> — Assign multiple rendered shorts at once; they auto-fill the next open time slots</li>
                    </ul>
                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3">
                        <p className="text-xs text-gray-400">
                            <strong className="text-emerald-400">Example:</strong> Create &quot;Animal Clips&quot; → linked to your Animals channel → set to post 3x/day. Then batch-assign 21 rendered animal shorts — they&apos;ll auto-fill the next 7 days of slots.
                        </p>
                    </div>
                </div>
            ),
        },
        {
            id: "admin",
            title: "Admin Panel",
            icon: Settings,
            content: (
                <div className="space-y-3 text-sm text-gray-300">
                    <p>Admin-only features for system management.</p>
                    <ul className="space-y-1 text-gray-400 ml-4 list-disc">
                        <li><strong className="text-white">API Keys</strong> — Manage DeepSeek, Gemini, Together.ai, and other service keys</li>
                        <li><strong className="text-white">Users</strong> — View registered users and roles</li>
                        <li><strong className="text-white">System</strong> — System info, configuration, and stuck job cleanup</li>
                        <li><strong className="text-white">Stuck Job Cleanup</strong> — One-click reset for jobs stuck in INITIALIZING or PROCESSING for more than 30 minutes. Resets them to FAILED so they can be retried.</li>
                        <li><strong className="text-white">Stats</strong> — Overall platform statistics</li>
                    </ul>
                    <p className="text-gray-400">Only users with the ADMIN role can access this page.</p>
                </div>
            ),
        },
        {
            id: "glossary",
            title: "Glossary — Key Terms",
            icon: HelpCircle,
            content: (
                <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-1 gap-2">
                        {[
                            { term: "Segment", def: "A clip cut from the original video. AI suggests segments based on engagement potential. Each has a start time, end time, title, and AI score." },
                            { term: "AI Score", def: "0–10 rating of a segment's viral potential. Higher = more likely to perform well. Based on pacing, emotional arc, and hook strength." },
                            { term: "Hook Strength", def: "0–10 rating of how attention-grabbing the opening seconds are. A strong hook keeps viewers from scrolling past." },
                            { term: "Approve", def: "Human confirmation that a segment is worth rendering. The AI suggests, but YOU decide what ships. Only approved segments can be rendered." },
                            { term: "Render", def: "The process of cutting the segment from the source video, converting to 9:16 vertical, burning in subtitles/effects/hooks, and uploading to cloud storage." },
                            { term: "Re-render", def: "Available on already-rendered segments. Overwrites the existing clip with updated style, effects, or hook changes." },
                            { term: "Effects", def: "FFmpeg video filters applied during rendering. Includes blur background, color grading, film grain, speed changes, and more. Stored as JSON on each segment." },
                            { term: "Hook Text", def: "Bold on-screen text at the top of the video that grabs attention. Rendered with a colored background box." },
                            { term: "Ingest", def: "The process of downloading a video from a URL and storing it in cloud storage. Transcription and segmentation start automatically after ingest." },
                            { term: "BullMQ", def: "The job queue system that processes downloads, transcriptions, renders, and publishes in the background via Redis." },
                            { term: "R2", def: "Cloudflare R2 — the cloud storage where source videos and rendered shorts are kept." },
                        ].map(item => (
                            <div key={item.term} className="bg-gray-800/30 rounded-lg px-3 py-2">
                                <span className="text-xs font-semibold text-violet-400">{item.term}</span>
                                <p className="text-xs text-gray-400 mt-0.5">{item.def}</p>
                            </div>
                        ))}
                    </div>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6 max-w-3xl">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <HelpCircle className="w-6 h-6 text-violet-400" />
                    Help & Documentation
                </h1>
                <p className="text-gray-400 text-sm mt-1">
                    Complete guide to every page, button, and feature in the platform
                </p>
            </div>

            {/* Quick Start */}
            <div className="bg-gradient-to-r from-violet-500/10 to-blue-500/10 border border-violet-500/15 rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-white mb-3">⚡ Quick Start</h2>
                <div className="flex items-center gap-3 text-xs text-gray-300 flex-wrap">
                    <span className="bg-gray-800/60 px-2.5 py-1.5 rounded-lg">1. Connect YouTube</span>
                    <ArrowRight className="w-3 h-3 text-gray-600" />
                    <span className="bg-gray-800/60 px-2.5 py-1.5 rounded-lg">2. Library → Add Video</span>
                    <ArrowRight className="w-3 h-3 text-gray-600" />
                    <span className="bg-gray-800/60 px-2.5 py-1.5 rounded-lg">3. Wait for AI</span>
                    <ArrowRight className="w-3 h-3 text-gray-600" />
                    <span className="bg-gray-800/60 px-2.5 py-1.5 rounded-lg">4. Studio → Approve</span>
                    <ArrowRight className="w-3 h-3 text-gray-600" />
                    <span className="bg-gray-800/60 px-2.5 py-1.5 rounded-lg">5. Style & Effects</span>
                    <ArrowRight className="w-3 h-3 text-gray-600" />
                    <span className="bg-gray-800/60 px-2.5 py-1.5 rounded-lg">6. Render</span>
                    <ArrowRight className="w-3 h-3 text-gray-600" />
                    <span className="bg-gray-800/60 px-2.5 py-1.5 rounded-lg">7. Export / Schedule</span>
                </div>
            </div>

            {/* Accordion Sections */}
            <div className="space-y-2">
                {sections.map((section) => {
                    const isOpen = openSection === section.id;
                    const Icon = section.icon;
                    return (
                        <div
                            key={section.id}
                            className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden"
                        >
                            <button
                                onClick={() => toggle(section.id)}
                                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-800/30 transition-colors"
                            >
                                <Icon className={cn("w-5 h-5", isOpen ? "text-violet-400" : "text-gray-500")} />
                                <span className={cn("text-sm font-medium flex-1", isOpen ? "text-white" : "text-gray-300")}>
                                    {section.title}
                                </span>
                                {isOpen ? (
                                    <ChevronDown className="w-4 h-4 text-gray-500" />
                                ) : (
                                    <ChevronRight className="w-4 h-4 text-gray-500" />
                                )}
                            </button>
                            {isOpen && (
                                <div className="px-5 pb-5 pt-1 border-t border-gray-800/50">
                                    {section.content}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="bg-gray-900/30 border border-gray-800 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500">
                    YouTube Shorts Slicer v2.0 · Built with Next.js, Prisma, BullMQ, FFmpeg
                </p>
            </div>
        </div>
    );
}
