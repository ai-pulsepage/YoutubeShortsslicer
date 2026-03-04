"use client";

import { useState, useEffect } from "react";
import {
    Share2,
    Plus,
    Youtube,
    Instagram,
    Trash2,
    RefreshCw,
    Check,
    ExternalLink,
    AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Channel = {
    id: string;
    platform: string;
    channelName: string;
    channelId: string;
    avatar: string | null;
    isActive: boolean;
    createdAt: string;
    _count: { publishJobs: number; channelFlags: number };
};

const PLATFORM_ICONS: Record<string, any> = {
    youtube: Youtube,
    instagram: Instagram,
};

const PLATFORM_COLORS: Record<string, string> = {
    youtube: "text-red-400 bg-red-500/10 border-red-500/20",
    instagram: "text-pink-400 bg-pink-500/10 border-pink-500/20",
};

export default function ChannelsPage() {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/channels")
            .then((r) => r.json())
            .then((data) => {
                setChannels(Array.isArray(data) ? data : []);
                setLoading(false);
            });
    }, []);

    const connectChannel = (platform: string) => {
        if (platform === "youtube") {
            // Initiate Google OAuth with YouTube upload scopes
            window.location.href = "/api/auth/signin?callbackUrl=/dashboard/channels";
        }
    };

    const disconnectChannel = async (id: string) => {
        await fetch(`/api/channels?id=${id}`, { method: "DELETE" });
        setChannels((prev) => prev.filter((c) => c.id !== id));
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Channels</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Connect and manage your publishing destinations
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => connectChannel("youtube")}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/20 transition-colors"
                    >
                        <Youtube className="w-4 h-4" />
                        Connect YouTube
                    </button>
                    <button
                        onClick={() => connectChannel("instagram")}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-pink-600/20 hover:bg-pink-600/30 text-pink-400 border border-pink-600/20 transition-colors"
                    >
                        <Instagram className="w-4 h-4" />
                        Connect Instagram
                    </button>
                </div>
            </div>

            {/* Connected Channels */}
            {channels.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {channels.map((channel) => {
                        const Icon = PLATFORM_ICONS[channel.platform] || Share2;
                        const colorClass = PLATFORM_COLORS[channel.platform] || "text-gray-400 bg-gray-500/10 border-gray-500/20";

                        return (
                            <div
                                key={channel.id}
                                className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-colors"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center border", colorClass)}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-semibold text-white">{channel.channelName}</h3>
                                            <p className="text-xs text-gray-500 capitalize">{channel.platform}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className={cn(
                                            "w-2 h-2 rounded-full",
                                            channel.isActive ? "bg-emerald-500" : "bg-red-500"
                                        )} />
                                        <span className="text-[10px] text-gray-500">
                                            {channel.isActive ? "Active" : "Inactive"}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <div className="bg-gray-800/50 rounded-lg p-2.5 text-center">
                                        <p className="text-lg font-bold text-white">{channel._count.publishJobs}</p>
                                        <p className="text-[10px] text-gray-500">Published</p>
                                    </div>
                                    <div className="bg-gray-800/50 rounded-lg p-2.5 text-center">
                                        <p className="text-lg font-bold text-white">{channel._count.channelFlags}</p>
                                        <p className="text-[10px] text-gray-500">Flagged</p>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <button className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 text-white transition-colors">
                                        <RefreshCw className="w-3 h-3" /> Refresh Token
                                    </button>
                                    <button
                                        onClick={() => disconnectChannel(channel.id)}
                                        className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center">
                    <Share2 className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-2">No channels connected</h3>
                    <p className="text-gray-400 text-sm max-w-md mx-auto">
                        Connect your YouTube or Instagram channels above to enable direct publishing of your shorts.
                    </p>
                </div>
            )}

            {/* Info */}
            <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4">
                <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-gray-400 space-y-1">
                        <p>
                            <strong className="text-blue-400">YouTube:</strong> Requires Google OAuth with YouTube
                            upload scope. Your Google account must have a YouTube channel.
                        </p>
                        <p>
                            <strong className="text-pink-400">Instagram:</strong> Requires a Facebook Business
                            account connected to your Instagram Professional account.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
