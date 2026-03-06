"use client";

import { useState } from "react";
import {
    DollarSign,
    TrendingUp,
    Eye,
    Star,
    ExternalLink,
    Search,
    Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function WhopPage() {
    const [activeTab, setActiveTab] = useState<"campaigns" | "earnings" | "top">("campaigns");

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
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center">
                    <Star className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-white mb-2">Connect Whop to Get Started</h3>
                    <p className="text-gray-400 text-sm mb-4 max-w-md mx-auto">
                        Configure your Whop API key in the Admin panel to browse and apply to
                        Content Rewards campaigns directly from here.
                    </p>
                    <a
                        href="/dashboard/admin"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                    >
                        Configure API Keys
                    </a>
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
