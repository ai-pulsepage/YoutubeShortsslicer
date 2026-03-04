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
                        The YouTube Shorts Slicer automates the entire process from a long-form
                        video to published YouTube Shorts. Each step triggers the next automatically.
                    </p>
                    <div className="space-y-0">
                        {[
                            { step: "1", label: "Ingest", desc: "Paste a YouTube URL. The system downloads the full video and stores it in cloud storage.", color: "violet" },
                            { step: "2", label: "Transcribe", desc: "Audio is extracted and transcribed into text with word-level timestamps. Happens automatically after download.", color: "blue" },
                            { step: "3", label: "AI Segment", desc: "AI analyzes the transcript and suggests the best 30–60 second clips with engagement scores, hook strength, and emotional arc ratings.", color: "cyan" },
                            { step: "4", label: "Edit", desc: "Review the AI suggestions. Approve, reject, or adjust the in/out points. Split segments, add voiceover text. You have full control.", color: "emerald" },
                            { step: "5", label: "Render", desc: "Approved segments are cut into vertical 9:16 format with burned-in subtitles, ready for YouTube Shorts.", color: "amber" },
                            { step: "6", label: "Schedule", desc: "Assign rendered shorts to a channel schedule. Set posting times (e.g., 3x/day at 9am, 1pm, 6pm). Content auto-fills the next open slots.", color: "orange" },
                            { step: "7", label: "Publish", desc: "At the scheduled time, the system uploads to YouTube with #Shorts metadata, title, description, and hashtags. Errors show suggestions for fixes.", color: "red" },
                        ].map((item, i) => (
                            <div key={item.step} className="flex gap-4 items-start">
                                <div className="flex flex-col items-center">
                                    <div className={`w-8 h-8 rounded-full bg-${item.color}-500/15 border border-${item.color}-500/20 flex items-center justify-center text-xs font-bold text-${item.color}-400`}>
                                        {item.step}
                                    </div>
                                    {i < 6 && <div className="w-px h-6 bg-gray-800" />}
                                </div>
                                <div className="pb-4">
                                    <h4 className="text-sm font-semibold text-white">{item.label}</h4>
                                    <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-gray-400">
                            <strong className="text-blue-400">Automatic:</strong> Steps 1–3 happen without any input from you. Just paste the URL and wait. You take over at step 4 (Edit).
                        </p>
                    </div>
                </div>
            ),
        },
        {
            id: "ingest",
            title: "Ingest — Importing Videos",
            icon: Download,
            content: (
                <div className="space-y-3 text-sm text-gray-300">
                    <p>The Ingest page is where you start. Paste any YouTube video URL and the system will:</p>
                    <ol className="list-decimal list-inside space-y-1 text-gray-400 ml-2">
                        <li>Detect the platform and fetch video metadata (title, thumbnail, duration)</li>
                        <li>Show you a preview so you can confirm</li>
                        <li>Let you assign tags for organization</li>
                        <li>Queue the download — the worker picks it up and downloads the video</li>
                    </ol>
                    <p className="text-gray-400">After download completes, transcription and segmentation start <strong className="text-white">automatically</strong>.</p>
                    <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3">
                        <p className="text-xs text-gray-400">
                            <strong className="text-amber-400">Tip:</strong> You can check download progress on the Dashboard or Library page. Status will show as &quot;Downloading&quot; → &quot;Transcribing&quot; → &quot;Segmenting&quot; → &quot;Ready&quot;.
                        </p>
                    </div>
                </div>
            ),
        },
        {
            id: "library",
            title: "Library — Managing Your Videos",
            icon: Library,
            content: (
                <div className="space-y-3 text-sm text-gray-300">
                    <p>The Library shows all your ingested videos with search, filters, and organization tools.</p>
                    <ul className="space-y-1 text-gray-400 ml-4 list-disc">
                        <li><strong className="text-white">Grid/List view</strong> — toggle between visual grid and compact list</li>
                        <li><strong className="text-white">Tags</strong> — color-coded tags for organizing by category (animals, news, influencers, etc.)</li>
                        <li><strong className="text-white">Status filters</strong> — filter by processing status to find videos ready for editing</li>
                        <li><strong className="text-white">Search</strong> — search by title or description</li>
                        <li><strong className="text-white">Channel flags</strong> — flag videos for specific channels</li>
                    </ul>
                </div>
            ),
        },
        {
            id: "editor",
            title: "Editor — Review & Adjust Segments",
            icon: Scissors,
            content: (
                <div className="space-y-3 text-sm text-gray-300">
                    <p>The Segment Editor is where you review AI suggestions and decide what becomes a Short.</p>
                    <ul className="space-y-1 text-gray-400 ml-4 list-disc">
                        <li><strong className="text-white">Visual timeline</strong> — colored regions show each segment on a zoomable timeline</li>
                        <li><strong className="text-white">Video preview</strong> — scrub and play any segment inline</li>
                        <li><strong className="text-white">Segment details</strong> — title, AI score, hook strength, emotional arc</li>
                        <li><strong className="text-white">Approve/Reject</strong> — approve segments to queue for rendering, reject ones that don&apos;t work</li>
                        <li><strong className="text-white">Adjust in/out points</strong> — drag segment boundaries or type exact timestamps</li>
                        <li><strong className="text-white">Split at playhead</strong> — cut a segment into two at the current playback position</li>
                        <li><strong className="text-white">Voiceover toggle</strong> — mark segments for AI narration</li>
                    </ul>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-2">Keyboard shortcuts:</p>
                        <div className="grid grid-cols-2 gap-1 text-xs text-gray-400">
                            <span><kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300">Space</kbd> Play/Pause</span>
                            <span><kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300">J/K/L</kbd> Rev/Pause/Fwd</span>
                            <span><kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300">I/O</kbd> Set In/Out</span>
                            <span><kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300">←/→</kbd> Frame step</span>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            id: "render",
            title: "Render — Create Final Shorts",
            icon: Film,
            content: (
                <div className="space-y-3 text-sm text-gray-300">
                    <p>Rendering takes your approved segments and converts them into vertical 9:16 YouTube Shorts.</p>
                    <ul className="space-y-1 text-gray-400 ml-4 list-disc">
                        <li>Automatically cuts to the exact segment timestamps</li>
                        <li>Converts to 1080×1920 vertical format with padding</li>
                        <li>Burns in subtitles using your selected style preset</li>
                        <li>Uploads the rendered file to cloud storage (R2)</li>
                        <li>Mark segments as &quot;Rendered&quot; — ready for scheduling</li>
                    </ul>
                </div>
            ),
        },
        {
            id: "subtitles",
            title: "Subtitles — Style Your Text",
            icon: Type,
            content: (
                <div className="space-y-3 text-sm text-gray-300">
                    <p>Customize how subtitles appear on your Shorts.</p>
                    <ul className="space-y-1 text-gray-400 ml-4 list-disc">
                        <li><strong className="text-white">14 fonts</strong> — Montserrat, Oswald, Bangers, and more</li>
                        <li><strong className="text-white">Colors</strong> — text color, outline, shadow</li>
                        <li><strong className="text-white">Position</strong> — top, center, or bottom</li>
                        <li><strong className="text-white">6 animations</strong> — word highlight, fade, pop, slide, typewriter, karaoke</li>
                        <li><strong className="text-white">5 presets</strong> — BBC Nature, True Crime, Motivational, Clean, Bold</li>
                        <li><strong className="text-white">Live preview</strong> — see your changes in real-time on a 9:16 canvas</li>
                    </ul>
                </div>
            ),
        },
        {
            id: "voiceover",
            title: "Voiceover — AI Narration",
            icon: Mic,
            content: (
                <div className="space-y-3 text-sm text-gray-300">
                    <p>Add AI-generated narration to your Shorts using Together.ai Kokoro TTS.</p>
                    <ul className="space-y-1 text-gray-400 ml-4 list-disc">
                        <li><strong className="text-white">8 voices</strong> — male and female options with different tones</li>
                        <li><strong className="text-white">3 mix modes</strong> — replace original audio, overlay, or ducking (lower original when narrating)</li>
                        <li><strong className="text-white">Balance slider</strong> — control the mix ratio between narration and original audio</li>
                        <li><strong className="text-white">Cost estimation</strong> — see the estimated cost before generating</li>
                    </ul>
                    <p className="text-gray-400">Toggle voiceover per segment in the Editor — only marked segments will get narration.</p>
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
                        <li><strong className="text-white">Connect</strong> — click &quot;Connect YouTube Channel&quot; to authorize via Google OAuth</li>
                        <li><strong className="text-white">Multiple channels</strong> — all channels on your Google account are auto-detected</li>
                        <li><strong className="text-white">Token refresh</strong> — tokens are silently refreshed when you visit this page (no re-login needed)</li>
                        <li><strong className="text-white">Channel cards</strong> — click to expand and see subscriber count, video count, properties</li>
                        <li><strong className="text-white">Disconnect</strong> — remove a channel and its tokens</li>
                        <li><strong className="text-white">View on YouTube</strong> — direct link to the channel</li>
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
            title: "Scheduler — Per-Channel Schedules",
            icon: Calendar,
            content: (
                <div className="space-y-3 text-sm text-gray-300">
                    <p>Create named schedules for each YouTube channel and batch-assign content.</p>
                    <ul className="space-y-1 text-gray-400 ml-4 list-disc">
                        <li><strong className="text-white">Create a schedule</strong> — click &quot;+&quot; in the sidebar → name it, pick a channel, set post times</li>
                        <li><strong className="text-white">Posting times</strong> — configure exact times (e.g., 9am, 1pm, 6pm)</li>
                        <li><strong className="text-white">Per-channel view</strong> — click a schedule in the sidebar to filter the calendar to just that channel</li>
                        <li><strong className="text-white">Calendar view</strong> — see scheduled posts on a monthly calendar</li>
                        <li><strong className="text-white">List view</strong> — sorted list with status and error messages</li>
                        <li><strong className="text-white">Batch assign</strong> — assign multiple rendered shorts at once; they auto-fill the next open time slots</li>
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
            id: "publishing",
            title: "Publishing — How Uploads Work",
            icon: Play,
            content: (
                <div className="space-y-3 text-sm text-gray-300">
                    <p>When a scheduled time arrives, the system automatically:</p>
                    <ol className="list-decimal list-inside space-y-1 text-gray-400 ml-2">
                        <li>Refreshes the YouTube OAuth token (silently)</li>
                        <li>Downloads the rendered short from R2 storage</li>
                        <li>Adds <strong className="text-white">#Shorts</strong> to the title and hashtags to the description</li>
                        <li>Uploads via YouTube Data API as a public video</li>
                        <li>Saves the YouTube video ID for tracking</li>
                    </ol>
                    <p className="mt-2"><strong className="text-white">If it fails:</strong></p>
                    <ul className="space-y-1 text-gray-400 ml-4 list-disc">
                        <li>The job shows as <span className="text-red-400">FAILED</span> with a clear error message</li>
                        <li>Suggestions are provided (e.g., &quot;Re-connect your channel&quot;, &quot;Quota exceeded, try tomorrow&quot;)</li>
                        <li>You can retry from the scheduler</li>
                    </ul>
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
                        <li><strong className="text-white">API Keys</strong> — manage DeepSeek, Gemini, Together.ai, and other service keys</li>
                        <li><strong className="text-white">Users</strong> — view registered users and roles</li>
                        <li><strong className="text-white">System</strong> — system info and configuration</li>
                        <li><strong className="text-white">Stats</strong> — overall platform statistics</li>
                    </ul>
                    <p className="text-gray-400">Only users with the ADMIN role can access this page.</p>
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
                    Everything you need to know about using YouTube Shorts Slicer
                </p>
            </div>

            {/* Quick Start */}
            <div className="bg-gradient-to-r from-violet-500/10 to-blue-500/10 border border-violet-500/15 rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-white mb-3">⚡ Quick Start</h2>
                <div className="flex items-center gap-3 text-xs text-gray-300 flex-wrap">
                    <span className="bg-gray-800/60 px-2.5 py-1.5 rounded-lg">1. Connect YouTube</span>
                    <ArrowRight className="w-3 h-3 text-gray-600" />
                    <span className="bg-gray-800/60 px-2.5 py-1.5 rounded-lg">2. Paste Video URL</span>
                    <ArrowRight className="w-3 h-3 text-gray-600" />
                    <span className="bg-gray-800/60 px-2.5 py-1.5 rounded-lg">3. Wait for AI</span>
                    <ArrowRight className="w-3 h-3 text-gray-600" />
                    <span className="bg-gray-800/60 px-2.5 py-1.5 rounded-lg">4. Approve Segments</span>
                    <ArrowRight className="w-3 h-3 text-gray-600" />
                    <span className="bg-gray-800/60 px-2.5 py-1.5 rounded-lg">5. Render</span>
                    <ArrowRight className="w-3 h-3 text-gray-600" />
                    <span className="bg-gray-800/60 px-2.5 py-1.5 rounded-lg">6. Schedule & Publish</span>
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
                    YouTube Shorts Slicer v1.0 · Built with Next.js, Prisma, BullMQ, FFmpeg
                </p>
            </div>
        </div>
    );
}
