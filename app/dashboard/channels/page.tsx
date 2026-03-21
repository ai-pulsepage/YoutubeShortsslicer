"use client";

import { useState, useEffect } from "react";
import {
    Share2,
    Youtube,
    Instagram,
    Trash2,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    Settings,
    ExternalLink,
    AlertCircle,
    Check,
    Users,
    Film,
    Send,
    Flag,
    Loader2,
    Music2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Channel = {
    id: string;
    platform: string;
    channelName: string;
    channelId: string | null;
    isActive: boolean;
    createdAt: string;
    defaults?: {
        thumbnail?: string;
        subscriberCount?: string;
        videoCount?: string;
        description?: string;
    } | null;
    _count: { publishJobs: number; channelFlags: number };
};

const PLATFORM_COLORS: Record<string, string> = {
    YOUTUBE: "text-red-400 bg-red-500/10 border-red-500/20",
    INSTAGRAM: "text-pink-400 bg-pink-500/10 border-pink-500/20",
    TIKTOK: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
};

const PLATFORM_ICONS: Record<string, any> = {
    YOUTUBE: Youtube,
    INSTAGRAM: Instagram,
    TIKTOK: Music2,
};

export default function ChannelsPage() {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        loadChannels();

        // Check URL params for connection result
        const params = new URLSearchParams(window.location.search);
        if (params.get("connected")) {
            setSuccessMsg(`Successfully connected ${params.get("connected")} YouTube channel(s)!`);
            window.history.replaceState({}, "", "/dashboard/channels");
        }
        if (params.get("error")) {
            const errMap: Record<string, string> = {
                no_channels: "No YouTube channels found on this account.",
                token_failed: "Failed to get access token from Google.",
                server_error: "Server error during connection.",
                access_denied: "You denied access to your YouTube account.",
            };
            setErrorMsg(errMap[params.get("error")!] || `Error: ${params.get("error")}`);
            window.history.replaceState({}, "", "/dashboard/channels");
        }
    }, []);

    const loadChannels = () => {
        setLoading(true);
        fetch("/api/channels")
            .then((r) => r.json())
            .then((data) => {
                setChannels(Array.isArray(data) ? data : []);
                setLoading(false);
                // Silently refresh tokens in background
                fetch("/api/channels/refresh", { method: "POST" }).catch(() => { });
            })
            .catch(() => setLoading(false));
    };

    const connectYouTube = () => {
        setConnecting(true);
        // Redirect to our custom YouTube OAuth flow
        window.location.href = `/api/youtube/connect?origin=${encodeURIComponent(window.location.origin)}`;
    };

    const connectTikTok = () => {
        setConnecting(true);
        window.location.href = `/api/tiktok/connect?origin=${encodeURIComponent(window.location.origin)}`;
    };

    const connectInstagram = () => {
        setConnecting(true);
        window.location.href = `/api/instagram/connect?origin=${encodeURIComponent(window.location.origin)}`;
    };

    const disconnectChannel = async (id: string, name: string) => {
        if (!confirm(`Disconnect "${name}"? This will remove the channel and its tokens.`)) return;
        await fetch(`/api/channels?id=${id}`, { method: "DELETE" });
        setChannels((prev) => prev.filter((c) => c.id !== id));
        if (expandedId === id) setExpandedId(null);
    };

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };

    const formatDate = (d: string) =>
        new Date(d).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });

    const formatNumber = (n: string | undefined) => {
        if (!n) return "0";
        const num = parseInt(n);
        if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
        if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
        return num.toString();
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Channels</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Connect and manage your social accounts for publishing
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={connectTikTok}
                        disabled={connecting}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 border border-cyan-600/20 transition-all hover:scale-[1.02] disabled:opacity-50"
                    >
                        {connecting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Music2 className="w-4 h-4" />
                        )}
                        TikTok
                    </button>
                    <button
                        onClick={connectInstagram}
                        disabled={connecting}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-pink-600/20 hover:bg-pink-600/30 text-pink-400 border border-pink-600/20 transition-all hover:scale-[1.02] disabled:opacity-50"
                    >
                        {connecting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Instagram className="w-4 h-4" />
                        )}
                        Instagram
                    </button>
                    <button
                        onClick={connectYouTube}
                        disabled={connecting}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/20 transition-all hover:scale-[1.02] disabled:opacity-50"
                    >
                        {connecting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Youtube className="w-4 h-4" />
                        )}
                        YouTube
                    </button>
                </div>
            </div>

            {/* Success / Error banners */}
            {successMsg && (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl px-4 py-3 text-sm">
                    <Check className="w-4 h-4 flex-shrink-0" />
                    {successMsg}
                    <button onClick={() => setSuccessMsg(null)} className="ml-auto text-emerald-500 hover:text-emerald-300">✕</button>
                </div>
            )}
            {errorMsg && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {errorMsg}
                    <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-500 hover:text-red-300">✕</button>
                </div>
            )}

            {/* Channel Cards */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
                </div>
            ) : channels.length > 0 ? (
                <div className="space-y-3">
                    {channels.map((channel) => {
                        const isExpanded = expandedId === channel.id;
                        const defaults = (channel.defaults || {}) as any;
                        const thumbnail = defaults?.thumbnail;
                        const colorClass = PLATFORM_COLORS[channel.platform] || "text-gray-400 bg-gray-500/10 border-gray-500/20";

                        return (
                            <div
                                key={channel.id}
                                className="bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden hover:border-gray-700 transition-colors"
                            >
                                {/* Main Row */}
                                <div
                                    className="flex items-center gap-4 p-5 cursor-pointer"
                                    onClick={() => toggleExpand(channel.id)}
                                >
                                    {/* Avatar / Icon */}
                                    <div className="flex-shrink-0">
                                        {thumbnail ? (
                                            <img
                                                src={thumbnail}
                                                alt={channel.channelName}
                                                className="w-12 h-12 rounded-full border-2 border-gray-700"
                                            />
                                        ) : (
                                            <div className={cn("w-12 h-12 rounded-full flex items-center justify-center border", colorClass)}>
                                                {(() => { const PIcon = PLATFORM_ICONS[channel.platform] || Youtube; return <PIcon className="w-6 h-6" />; })()}
                                            </div>
                                        )}
                                    </div>

                                    {/* Name + platform */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-semibold text-white truncate">
                                            {channel.channelName}
                                        </h3>
                                        <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                                            {(() => { const PIcon = PLATFORM_ICONS[channel.platform] || Youtube; return <PIcon className="w-3 h-3" />; })()}
                                            {channel.platform}
                                            {channel.channelId && (
                                                <span className="text-gray-600">• {channel.channelId}</span>
                                            )}
                                        </p>
                                    </div>

                                    {/* Quick Stats */}
                                    <div className="hidden md:flex items-center gap-6">
                                        {defaults?.subscriberCount && (
                                            <div className="text-center">
                                                <p className="text-sm font-bold text-white">
                                                    {formatNumber(defaults.subscriberCount)}
                                                </p>
                                                <p className="text-[10px] text-gray-500">Subscribers</p>
                                            </div>
                                        )}
                                        <div className="text-center">
                                            <p className="text-sm font-bold text-white">
                                                {channel._count.publishJobs}
                                            </p>
                                            <p className="text-[10px] text-gray-500">Published</p>
                                        </div>
                                    </div>

                                    {/* Status + Expand */}
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1.5">
                                            <span className={cn(
                                                "w-2 h-2 rounded-full",
                                                channel.isActive ? "bg-emerald-500" : "bg-red-500"
                                            )} />
                                            <span className="text-xs text-gray-500">
                                                {channel.isActive ? "Active" : "Inactive"}
                                            </span>
                                        </div>
                                        {isExpanded ? (
                                            <ChevronUp className="w-4 h-4 text-gray-500" />
                                        ) : (
                                            <ChevronDown className="w-4 h-4 text-gray-500" />
                                        )}
                                    </div>
                                </div>

                                {/* Expanded Details */}
                                {isExpanded && (
                                    <div className="border-t border-gray-800 px-5 py-4 bg-gray-950/50">
                                        {/* Stats Grid */}
                                        <div className="grid grid-cols-4 gap-3 mb-5">
                                            <StatMini
                                                icon={Users}
                                                label="Subscribers"
                                                value={formatNumber(defaults?.subscriberCount)}
                                                color="violet"
                                            />
                                            <StatMini
                                                icon={Film}
                                                label="Videos"
                                                value={formatNumber(defaults?.videoCount)}
                                                color="blue"
                                            />
                                            <StatMini
                                                icon={Send}
                                                label="Published"
                                                value={channel._count.publishJobs.toString()}
                                                color="emerald"
                                            />
                                            <StatMini
                                                icon={Flag}
                                                label="Flagged"
                                                value={channel._count.channelFlags.toString()}
                                                color="amber"
                                            />
                                        </div>

                                        {/* Properties */}
                                        <div className="space-y-2 mb-5">
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                                Properties
                                            </h4>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <Property label="Channel ID" value={channel.channelId || "—"} />
                                                <Property label="Platform" value={channel.platform} />
                                                <Property label="Connected" value={formatDate(channel.createdAt)} />
                                                <Property label="Status" value={channel.isActive ? "Active" : "Inactive"} />
                                            </div>
                                            {defaults?.description && (
                                                <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                                                    {defaults.description}
                                                </p>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-2">
                                            {channel.channelId && (
                                                <a
                                                    href={`https://youtube.com/channel/${channel.channelId}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 text-white transition-colors"
                                                >
                                                    <ExternalLink className="w-3 h-3" /> View on YouTube
                                                </a>
                                            )}
                                            <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 text-white transition-colors">
                                                <RefreshCw className="w-3 h-3" /> Refresh Token
                                            </button>
                                            <button
                                                onClick={() => disconnectChannel(channel.id, channel.channelName)}
                                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors ml-auto"
                                            >
                                                <Trash2 className="w-3 h-3" /> Disconnect
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-16 text-center">
                    <Share2 className="w-14 h-14 text-gray-700 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-2">No channels connected</h3>
                    <p className="text-gray-400 text-sm max-w-md mx-auto mb-6">
                        Connect your social accounts to enable direct publishing of your clips.
                    </p>
                    <div className="flex items-center justify-center gap-3">
                        <button
                            onClick={connectTikTok}
                            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium bg-cyan-600 hover:bg-cyan-700 text-white transition-colors"
                        >
                            <Music2 className="w-4 h-4" />
                            Connect TikTok
                        </button>
                        <button
                            onClick={connectInstagram}
                            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white transition-colors"
                        >
                            <Instagram className="w-4 h-4" />
                            Connect Instagram
                        </button>
                        <button
                            onClick={connectYouTube}
                            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
                        >
                            <Youtube className="w-4 h-4" />
                            Connect YouTube
                        </button>
                    </div>
                </div>
            )}

            {/* How it works */}
            <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4">
                <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-gray-400 space-y-1">
                        <p>
                            <strong className="text-blue-400">How it works:</strong> Clicking
                            &quot;Connect YouTube Channel&quot; opens Google OAuth asking for YouTube access.
                            All channels on your account are automatically detected and added.
                        </p>
                        <p>
                            <strong className="text-blue-400">Multiple channels:</strong> If your
                            Google account has multiple YouTube channels, all of them will appear here.
                            You can disconnect any you don&apos;t want to use.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatMini({ icon: Icon, label, value, color }: {
    icon: any; label: string; value: string; color: string;
}) {
    const colorMap: Record<string, string> = {
        violet: "text-violet-400 bg-violet-500/10",
        blue: "text-blue-400 bg-blue-500/10",
        emerald: "text-emerald-400 bg-emerald-500/10",
        amber: "text-amber-400 bg-amber-500/10",
    };

    return (
        <div className="bg-gray-800/50 rounded-xl p-3 text-center">
            <Icon className={cn("w-4 h-4 mx-auto mb-1", colorMap[color]?.split(" ")[0])} />
            <p className="text-sm font-bold text-white">{value}</p>
            <p className="text-[10px] text-gray-500">{label}</p>
        </div>
    );
}

function Property({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-gray-800/30 rounded-lg px-3 py-2">
            <p className="text-[10px] text-gray-500 mb-0.5">{label}</p>
            <p className="text-xs text-white font-medium truncate">{value}</p>
        </div>
    );
}
