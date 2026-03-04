"use client";

import { useState } from "react";
import {
    DollarSign,
    TrendingUp,
    Eye,
    Star,
    ExternalLink,
    Search,
    Filter,
    Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Mock campaign data — will be populated from Whop API
const SAMPLE_CAMPAIGNS = [
    {
        id: "1",
        name: "Nature & Wildlife",
        payout: "$2.50",
        payoutPer: "per 1K views",
        category: "Education",
        requirements: "Original nature content, 30-60s, vertical format",
        minViews: 1000,
        status: "active",
    },
    {
        id: "2",
        name: "True Crime Stories",
        payout: "$3.00",
        payoutPer: "per 1K views",
        category: "Entertainment",
        requirements: "Factual content, proper sourcing, 30-60s",
        minViews: 5000,
        status: "active",
    },
    {
        id: "3",
        name: "Tech Explainers",
        payout: "$4.00",
        payoutPer: "per 1K views",
        category: "Technology",
        requirements: "Clear explanations, visual aids, under 60s",
        minViews: 2000,
        status: "active",
    },
    {
        id: "4",
        name: "Motivational Clips",
        payout: "$1.50",
        payoutPer: "per 1K views",
        category: "Self-Improvement",
        requirements: "Inspiring content, strong hook, 15-45s",
        minViews: 500,
        status: "active",
    },
];

export default function WhopPage() {
    const [search, setSearch] = useState("");
    const [activeTab, setActiveTab] = useState<"campaigns" | "earnings" | "top">("campaigns");

    const totalEarnings = 0;
    const pendingPayouts = 0;
    const totalViews = 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Whop Monetization</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Browse Content Rewards campaigns and track earnings
                    </p>
                </div>
                <a
                    href="https://whop.com/content-rewards"
                    target="_blank"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-violet-400 bg-violet-500/10 hover:bg-violet-500/15 border border-violet-500/20 transition-colors"
                >
                    <ExternalLink className="w-4 h-4" />
                    Whop Dashboard
                </a>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            <DollarSign className="w-5 h-5" />
                        </div>
                        <span className="text-sm text-gray-400">Total Earnings</span>
                    </div>
                    <p className="text-3xl font-bold text-white">${totalEarnings.toFixed(2)}</p>
                </div>
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-500/10 border border-amber-500/20 text-amber-400">
                            <Clock className="w-5 h-5" />
                        </div>
                        <span className="text-sm text-gray-400">Pending Payouts</span>
                    </div>
                    <p className="text-3xl font-bold text-white">${pendingPayouts.toFixed(2)}</p>
                </div>
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/10 border border-blue-500/20 text-blue-400">
                            <Eye className="w-5 h-5" />
                        </div>
                        <span className="text-sm text-gray-400">Total Views</span>
                    </div>
                    <p className="text-3xl font-bold text-white">{totalViews.toLocaleString()}</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-900/50 border border-gray-800 rounded-xl p-1">
                {[
                    { id: "campaigns" as const, label: "Campaigns", icon: Star },
                    { id: "earnings" as const, label: "Earnings", icon: DollarSign },
                    { id: "top" as const, label: "Top Performers", icon: Trophy },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex-1 justify-center",
                            activeTab === tab.id
                                ? "bg-violet-500/15 text-violet-400"
                                : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                        )}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Campaigns Tab */}
            {activeTab === "campaigns" && (
                <div className="space-y-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search campaigns..."
                            className="w-full bg-gray-900/50 border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {SAMPLE_CAMPAIGNS.filter(
                            (c) =>
                                !search ||
                                c.name.toLowerCase().includes(search.toLowerCase()) ||
                                c.category.toLowerCase().includes(search.toLowerCase())
                        ).map((campaign) => (
                            <div
                                key={campaign.id}
                                className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-colors"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <h3 className="text-sm font-semibold text-white">{campaign.name}</h3>
                                        <p className="text-xs text-gray-500">{campaign.category}</p>
                                    </div>
                                    <span className="text-lg font-bold text-emerald-400">{campaign.payout}</span>
                                </div>
                                <p className="text-xs text-gray-400 mb-3">{campaign.requirements}</p>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-gray-500">
                                        Min {campaign.minViews.toLocaleString()} views · {campaign.payoutPer}
                                    </span>
                                    <button className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors">
                                        Apply
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Earnings Tab */}
            {activeTab === "earnings" && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center">
                    <TrendingUp className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-white mb-2">No Earnings Yet</h3>
                    <p className="text-gray-400 text-sm">
                        Submit shorts to campaigns and track your earnings here.
                    </p>
                </div>
            )}

            {/* Top Performers Tab */}
            {activeTab === "top" && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center">
                    <Trophy className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-white mb-2">Track Top Content</h3>
                    <p className="text-gray-400 text-sm">
                        Your best-performing shorts across all campaigns will appear here.
                    </p>
                </div>
            )}
        </div>
    );
}

function Clock({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
        </svg>
    );
}
