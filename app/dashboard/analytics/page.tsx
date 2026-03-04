"use client";

import { useState } from "react";
import {
    BarChart3,
    TrendingUp,
    Eye,
    DollarSign,
    Film,
    Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function AnalyticsPage() {
    const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "all">("30d");

    // Placeholder data — will be populated from DB
    const stats = {
        totalViews: 0,
        totalShorts: 0,
        totalRevenue: 0,
        avgViews: 0,
        topPlatform: "YouTube",
        publishRate: 0,
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Analytics</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Track performance across all published content
                    </p>
                </div>
                <div className="flex items-center bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
                    {(["7d", "30d", "90d", "all"] as const).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={cn(
                                "px-3 py-2 text-xs font-medium transition-colors",
                                period === p
                                    ? "bg-violet-500/15 text-violet-400"
                                    : "text-gray-400 hover:text-white"
                            )}
                        >
                            {p === "all" ? "All Time" : p}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4">
                <StatCard
                    icon={Eye}
                    label="Total Views"
                    value={stats.totalViews.toLocaleString()}
                    change="+0%"
                    color="blue"
                />
                <StatCard
                    icon={Film}
                    label="Shorts Published"
                    value={stats.totalShorts.toString()}
                    change="+0"
                    color="violet"
                />
                <StatCard
                    icon={DollarSign}
                    label="Revenue"
                    value={`$${stats.totalRevenue.toFixed(2)}`}
                    change="+$0"
                    color="emerald"
                />
            </div>

            {/* Chart Placeholder */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-white mb-4">Views Over Time</h3>
                <div className="h-64 flex items-center justify-center">
                    <div className="text-center">
                        <BarChart3 className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                        <p className="text-sm text-gray-500">
                            Charts will populate once shorts are published and data is collected.
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                            Powered by Recharts — views, engagement, revenue over time
                        </p>
                    </div>
                </div>
            </div>

            {/* Per-Channel & Per-Video tables will go here */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
                    <h3 className="text-sm font-semibold text-white mb-3">Per Channel</h3>
                    <p className="text-xs text-gray-500">
                        Channel-level analytics (views, engagement, revenue) will appear here
                        once you connect channels and publish content.
                    </p>
                </div>
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
                    <h3 className="text-sm font-semibold text-white mb-3">Top Videos</h3>
                    <p className="text-xs text-gray-500">
                        Your best-performing shorts ranked by views, engagement,
                        and earnings will appear here.
                    </p>
                </div>
            </div>
        </div>
    );
}

function StatCard({
    icon: Icon,
    label,
    value,
    change,
    color,
}: {
    icon: any;
    label: string;
    value: string;
    change: string;
    color: string;
}) {
    const colorMap: Record<string, string> = {
        blue: "bg-blue-500/10 border-blue-500/20 text-blue-400",
        violet: "bg-violet-500/10 border-violet-500/20 text-violet-400",
        emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    };

    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center border", colorMap[color])}>
                    <Icon className="w-5 h-5" />
                </div>
                <span className="text-sm text-gray-400">{label}</span>
            </div>
            <div className="flex items-end justify-between">
                <p className="text-3xl font-bold text-white">{value}</p>
                <span className="text-xs text-gray-500">{change}</span>
            </div>
        </div>
    );
}
