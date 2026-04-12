"use client";

import { useState, useEffect } from "react";
import {
    Film,
    Download,
    Play,
    Loader2,
    RefreshCw,
    Clock,
    CheckCircle,
    XCircle,
    Briefcase,
    ChevronDown,
    ChevronRight,
    DollarSign,
    Send,
    Calendar,
    Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TagType = { id: string; name: string; color: string };

type Channel = {
    id: string;
    channelName: string;
    platform: string;
};

type ClipProjectBrief = {
    id: string;
    campaignName: string | null;
    campaignCpm: number | null;
    briefId: string | null;
    brief: {
        id: string;
        name: string;
        brand: string | null;
        targetPlatforms: string[];
        cpmRate: number | null;
    } | null;
};

type ShortVideo = {
    id: string;
    segmentId: string;
    storagePath: string;
    duration: number;
    status: string;
    createdAt: string;
    segment: {
        id: string;
        title: string;
        startTime: number;
        endTime: number;
        aiScore: number | null;
        video: {
            id: string;
            title: string | null;
            clipProjects?: ClipProjectBrief[];
        };
    };
};

type CampaignGroup = {
    key: string;
    name: string;
    brand: string | null;
    cpm: number | null;
    platforms: string[];
    shorts: ShortVideo[];
};

const PLATFORM_COLORS: Record<string, string> = {
    tiktok: "text-pink-400",
    instagram: "text-purple-400",
    youtube: "text-red-400",
};

export default function ExportPage() {
    const [shorts, setShorts] = useState<ShortVideo[]>([]);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loading, setLoading] = useState(true);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [tags, setTags] = useState<TagType[]>([]);
    const [selectedTag, setSelectedTag] = useState<string>("");
    const [selectedCampaign, setSelectedCampaign] = useState<string>("");
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const [publishingId, setPublishingId] = useState<string | null>(null);
    const [scheduleModal, setScheduleModal] = useState<{ shortId: string; title: string } | null>(null);

    const loadShorts = (tagId?: string) => {
        const url = tagId ? `/api/shorts?tag=${tagId}` : "/api/shorts";
        fetch(url)
            .then((r) => r.json())
            .then((data) => {
                if (Array.isArray(data)) setShorts(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        loadShorts();
        Promise.all([
            fetch("/api/tags").then(r => r.ok ? r.json() : []),
            fetch("/api/channels").then(r => r.ok ? r.json() : []),
        ]).then(([tagData, channelData]) => {
            setTags(Array.isArray(tagData) ? tagData : []);
            setChannels(Array.isArray(channelData) ? channelData : []);
        }).catch(() => {});

        const interval = setInterval(() => {
            const url = selectedTag ? `/api/shorts?tag=${selectedTag}` : "/api/shorts";
            fetch(url)
                .then((r) => r.json())
                .then((data) => { if (Array.isArray(data)) setShorts(data); })
                .catch(() => {});
        }, 10000);
        return () => clearInterval(interval);
    }, []);

    // Publish now handler
    const publishNow = async (short: ShortVideo) => {
        if (channels.length === 0) {
            alert("No channels connected. Go to Channels to connect your YouTube, TikTok, or Instagram account.");
            return;
        }
        const channelId = channels[0].id; // Default to first channel
        setPublishingId(short.id);
        try {
            // Create publish job
            const res = await fetch("/api/publish", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    shortVideoId: short.id,
                    channelId,
                    title: short.segment?.title || "Short",
                    status: "SCHEDULED",
                    scheduledAt: new Date().toISOString(),
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(`Publish failed: ${err.error || res.statusText}`);
                return;
            }
            const job = await res.json();
            // Trigger immediate publish
            const pubRes = await fetch("/api/publish/youtube", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ publishJobId: job.id }),
            });
            if (pubRes.ok) {
                alert("Published successfully!");
            } else {
                const err = await pubRes.json().catch(() => ({}));
                alert(`Publish failed: ${err.error || "Unknown error"}`);
            }
        } catch (err: any) {
            alert(`Publish failed: ${err.message || "Network error"}`);
        } finally {
            setPublishingId(null);
        }
    };

    // Group shorts by campaign
    const campaignGroups: CampaignGroup[] = (() => {
        const groups = new Map<string, CampaignGroup>();
        for (const short of shorts) {
            const project = short.segment?.video?.clipProjects?.[0];
            const brief = project?.brief;
            const key = brief?.id || project?.campaignName || "__none__";
            const name = brief?.name || project?.campaignName || "No Campaign";
            const brand = brief?.brand || null;
            const cpm = brief?.cpmRate || project?.campaignCpm || null;
            const platforms = brief?.targetPlatforms || [];
            if (!groups.has(key)) {
                groups.set(key, { key, name, brand, cpm, platforms, shorts: [] });
            }
            groups.get(key)!.shorts.push(short);
        }
        return Array.from(groups.values()).sort((a, b) => {
            if (a.key === "__none__") return 1;
            if (b.key === "__none__") return -1;
            return a.name.localeCompare(b.name);
        });
    })();

    const filteredGroups = selectedCampaign
        ? campaignGroups.filter(g => g.key === selectedCampaign)
        : campaignGroups;

    const campaignOptions = campaignGroups.filter(g => g.key !== "__none__");

    const toggleGroup = (key: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const formatTime = (secs: number) => {
        if (!isFinite(secs) || isNaN(secs)) return "0:00";
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = Math.floor(secs % 60);
        if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    const statusIcon = (status: string) => {
        switch (status) {
            case "RENDERED": return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
            case "RENDERING": return <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />;
            case "FAILED": return <XCircle className="w-3.5 h-3.5 text-red-400" />;
            default: return <Clock className="w-3.5 h-3.5 text-gray-400" />;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Export</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        {shorts.length} clip{shorts.length !== 1 ? "s" : ""} ready to download or publish
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {campaignOptions.length > 0 && (
                        <select
                            value={selectedCampaign}
                            onChange={(e) => setSelectedCampaign(e.target.value)}
                            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                        >
                            <option value="">All Campaigns</option>
                            {campaignOptions.map(g => (
                                <option key={g.key} value={g.key}>{g.name} ({g.shorts.length})</option>
                            ))}
                        </select>
                    )}
                    <select
                        value={selectedTag}
                        onChange={(e) => {
                            setSelectedTag(e.target.value);
                            loadShorts(e.target.value || undefined);
                        }}
                        className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                    >
                        <option value="">All Batches</option>
                        {tags.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                    <button
                        onClick={() => {
                            setLoading(true);
                            loadShorts(selectedTag || undefined);
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gray-800 hover:bg-gray-700 text-white transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Connected channels banner */}
            {channels.length === 0 && (
                <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                    <Share2 className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <p className="text-sm text-amber-400 flex-1">
                        Connect a channel to enable direct publishing.
                    </p>
                    <a
                        href="/dashboard/channels"
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors"
                    >
                        Connect Channel
                    </a>
                </div>
            )}

            {shorts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
                        <Film className="w-8 h-8 text-blue-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-white mb-2">No rendered clips yet</h2>
                    <p className="text-gray-400 text-sm max-w-md">
                        Open a video in Studio, configure styles and effects, then render clips.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredGroups.map((group) => (
                        <div key={group.key} className="bg-gray-900/40 border border-gray-800/50 rounded-2xl overflow-hidden">
                            {/* Campaign Group Header */}
                            <button
                                onClick={() => toggleGroup(group.key)}
                                className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-800/30 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    {collapsedGroups.has(group.key) ? (
                                        <ChevronRight className="w-4 h-4 text-gray-500" />
                                    ) : (
                                        <ChevronDown className="w-4 h-4 text-gray-500" />
                                    )}
                                    <div className="flex items-center gap-2">
                                        <Briefcase className={`w-4 h-4 ${group.key === "__none__" ? "text-gray-600" : "text-amber-400"}`} />
                                        <span className="text-white font-semibold text-sm">{group.name}</span>
                                        {group.brand && (
                                            <span className="text-gray-500 text-xs">by {group.brand}</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 ml-3">
                                        {group.platforms.map(p => (
                                            <span key={p} className={`text-[9px] px-1.5 py-0.5 rounded-full bg-gray-800 ${PLATFORM_COLORS[p] || "text-gray-400"}`}>
                                                {p}
                                            </span>
                                        ))}
                                        {group.cpm && (
                                            <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                                                <DollarSign className="w-3 h-3" />${group.cpm}/1k
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded-lg">
                                    {group.shorts.length} clip{group.shorts.length !== 1 ? "s" : ""}
                                </span>
                            </button>

                            {/* Clips Grid */}
                            {!collapsedGroups.has(group.key) && (
                                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 px-4 pb-4">
                                    {group.shorts.map((short) => (
                                        <div
                                            key={short.id}
                                            className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors group"
                                        >
                                            {/* Video preview */}
                                            <div className="aspect-[9/16] bg-black relative">
                                                {playingId === short.id ? (
                                                    <video
                                                        src={`/api/shorts/${short.id}/stream`}
                                                        controls
                                                        autoPlay
                                                        className="w-full h-full object-contain"
                                                        onEnded={() => setPlayingId(null)}
                                                    />
                                                ) : (
                                                    <button
                                                        onClick={() => setPlayingId(short.id)}
                                                        className="absolute inset-0 flex items-center justify-center bg-gray-900/80 hover:bg-gray-900/60 transition-colors"
                                                    >
                                                        <div className="w-14 h-14 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                                                            <Play className="w-6 h-6 text-violet-400 ml-0.5" />
                                                        </div>
                                                    </button>
                                                )}
                                                <div className="absolute bottom-2 right-2 bg-black/70 rounded px-1.5 py-0.5 text-[10px] text-white font-medium">
                                                    {formatTime(short.duration)}
                                                </div>
                                            </div>

                                            {/* Info */}
                                            <div className="p-3 space-y-2">
                                                <p className="text-sm text-white font-medium truncate">
                                                    {short.segment?.title || "Untitled"}
                                                </p>
                                                <p className="text-[10px] text-gray-500 truncate">
                                                    from: {short.segment?.video?.title || "Unknown video"}
                                                </p>

                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-1.5">
                                                        {statusIcon(short.status)}
                                                        <span className="text-[10px] text-gray-500 uppercase">{short.status}</span>
                                                    </div>
                                                    <span className="text-[10px] text-gray-500">
                                                        {formatTime(short.segment?.startTime || 0)} → {formatTime(short.segment?.endTime || 0)}
                                                    </span>
                                                </div>

                                                {/* Action buttons — Download / Publish / Schedule */}
                                                {short.status === "RENDERED" && (
                                                    <div className="flex gap-1.5 pt-1">
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    const res = await fetch(`/api/shorts/${short.id}/stream`);
                                                                    if (!res.ok) throw new Error("Download failed");
                                                                    const blob = await res.blob();
                                                                    const url = URL.createObjectURL(blob);
                                                                    const a = document.createElement("a");
                                                                    a.href = url;
                                                                    a.download = `${short.segment?.title || "short"}.mp4`;
                                                                    document.body.appendChild(a);
                                                                    a.click();
                                                                    document.body.removeChild(a);
                                                                    URL.revokeObjectURL(url);
                                                                } catch (err) {
                                                                    console.error("Download error:", err);
                                                                    alert("Download failed.");
                                                                }
                                                            }}
                                                            className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                                                        >
                                                            <Download className="w-3 h-3" />
                                                            Download
                                                        </button>
                                                        <button
                                                            onClick={() => publishNow(short)}
                                                            disabled={publishingId === short.id || channels.length === 0}
                                                            className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-40"
                                                            title={channels.length === 0 ? "Connect a channel first" : "Publish now"}
                                                        >
                                                            {publishingId === short.id ? (
                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                            ) : (
                                                                <Send className="w-3 h-3" />
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => setScheduleModal({ shortId: short.id, title: short.segment?.title || "Short" })}
                                                            disabled={channels.length === 0}
                                                            className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40"
                                                            title={channels.length === 0 ? "Connect a channel first" : "Schedule"}
                                                        >
                                                            <Calendar className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Schedule Modal */}
            {scheduleModal && (
                <ScheduleModal
                    shortVideoId={scheduleModal.shortId}
                    title={scheduleModal.title}
                    channels={channels}
                    onClose={() => setScheduleModal(null)}
                />
            )}
        </div>
    );
}

function ScheduleModal({
    shortVideoId,
    title,
    channels,
    onClose,
}: {
    shortVideoId: string;
    title: string;
    channels: Channel[];
    onClose: () => void;
}) {
    const [channelId, setChannelId] = useState(channels[0]?.id || "");
    const [scheduledDate, setScheduledDate] = useState("");
    const [scheduledTime, setScheduledTime] = useState("12:00");
    const [postTitle, setPostTitle] = useState(title);
    const [description, setDescription] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleSchedule = async () => {
        if (!channelId || !scheduledDate) return;
        setSubmitting(true);
        try {
            const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();
            const res = await fetch("/api/publish", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    shortVideoId,
                    channelId,
                    title: postTitle,
                    description,
                    status: "SCHEDULED",
                    scheduledAt,
                }),
            });
            if (res.ok) {
                alert("Scheduled successfully!");
                onClose();
            } else {
                const err = await res.json().catch(() => ({}));
                alert(`Schedule failed: ${err.error || res.statusText}`);
            }
        } catch (err: any) {
            alert(`Schedule failed: ${err.message || "Network error"}`);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                <h2 className="text-lg font-semibold text-white mb-4">Schedule Post</h2>

                <div className="space-y-3">
                    <div>
                        <label className="text-xs text-gray-400 mb-1 block">Channel</label>
                        <select
                            value={channelId}
                            onChange={(e) => setChannelId(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                        >
                            {channels.map(ch => (
                                <option key={ch.id} value={ch.id}>{ch.channelName} ({ch.platform})</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-xs text-gray-400 mb-1 block">Title</label>
                        <input
                            type="text"
                            value={postTitle}
                            onChange={(e) => setPostTitle(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="text-xs text-gray-400 mb-1 block">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            placeholder="Add a description, hashtags, etc."
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none resize-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-gray-400 mb-1 block">Date</label>
                            <input
                                type="date"
                                value={scheduledDate}
                                onChange={(e) => setScheduledDate(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-400 mb-1 block">Time</label>
                            <input
                                type="time"
                                value={scheduledTime}
                                onChange={(e) => setScheduledTime(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 mt-5">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-800 hover:bg-gray-700 text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSchedule}
                        disabled={!channelId || !scheduledDate || submitting}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                        Schedule
                    </button>
                </div>
            </div>
        </div>
    );
}
