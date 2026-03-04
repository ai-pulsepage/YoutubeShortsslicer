"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
    Settings,
    Key,
    Users,
    Server,
    BarChart3,
    Eye,
    EyeOff,
    Save,
    RefreshCw,
    Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
    { id: "keys", label: "API Keys", icon: Key },
    { id: "users", label: "Users", icon: Users },
    { id: "system", label: "System", icon: Server },
    { id: "stats", label: "Stats", icon: BarChart3 },
];

const API_KEY_FIELDS = [
    { key: "deepseek_api_key", label: "DeepSeek API Key", desc: "Primary AI segmentation" },
    { key: "gemini_api_key", label: "Gemini API Key", desc: "Fallback segmentation" },
    { key: "together_api_key", label: "Together.ai API Key", desc: "Qwen + Kokoro TTS" },
    { key: "whop_api_key", label: "Whop API Key", desc: "Content Rewards" },
    { key: "google_client_id", label: "Google Client ID", desc: "OAuth login" },
    { key: "google_client_secret", label: "Google Client Secret", desc: "OAuth login" },
    { key: "r2_access_key", label: "R2 Access Key", desc: "Cloudflare R2 Storage" },
    { key: "r2_secret_key", label: "R2 Secret Key", desc: "Cloudflare R2 Storage" },
];

export default function AdminPage() {
    const { data: session } = useSession();
    const [activeTab, setActiveTab] = useState("keys");
    const [keys, setKeys] = useState<Record<string, string>>({});
    const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
    const [saving, setSaving] = useState(false);

    const isAdmin = (session?.user as any)?.role === "ADMIN";

    if (!isAdmin) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <Shield className="w-16 h-16 text-red-400 mb-4" />
                <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
                <p className="text-gray-400 text-sm">
                    You need admin privileges to access this page.
                </p>
            </div>
        );
    }

    const toggleShowKey = (key: string) => {
        setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
                <p className="text-gray-400 text-sm mt-1">
                    System configuration and management
                </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-900/50 border border-gray-800 rounded-xl p-1">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex-1",
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

            {/* API Keys Tab */}
            {activeTab === "keys" && (
                <div className="space-y-4">
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                        <p className="text-sm text-amber-400">
                            <strong>Security:</strong> API keys are encrypted at rest and only
                            decrypted when needed. Changes take effect immediately.
                        </p>
                    </div>

                    <div className="space-y-3">
                        {API_KEY_FIELDS.map((field) => (
                            <div
                                key={field.key}
                                className="bg-gray-900/50 border border-gray-800 rounded-xl p-4"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <label className="text-sm font-medium text-white">
                                            {field.label}
                                        </label>
                                        <p className="text-xs text-gray-500">{field.desc}</p>
                                    </div>
                                    <button
                                        onClick={() => toggleShowKey(field.key)}
                                        className="p-2 text-gray-400 hover:text-white transition-colors"
                                    >
                                        {showKeys[field.key] ? (
                                            <EyeOff className="w-4 h-4" />
                                        ) : (
                                            <Eye className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                                <input
                                    type={showKeys[field.key] ? "text" : "password"}
                                    value={keys[field.key] || ""}
                                    onChange={(e) =>
                                        setKeys((prev) => ({ ...prev, [field.key]: e.target.value }))
                                    }
                                    placeholder="Enter key..."
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors font-mono"
                                />
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={async () => {
                            setSaving(true);
                            // Phase 11 will wire to actual API
                            setTimeout(() => setSaving(false), 1000);
                        }}
                        disabled={saving}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50"
                    >
                        {saving ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        {saving ? "Saving..." : "Save All Keys"}
                    </button>
                </div>
            )}

            {/* Users Tab */}
            {activeTab === "users" && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center">
                    <Users className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-white mb-2">User Management</h3>
                    <p className="text-gray-400 text-sm">
                        View and manage all registered users, roles, and permissions.
                        Full user management will be wired in Phase 11.
                    </p>
                </div>
            )}

            {/* System Tab */}
            {activeTab === "system" && (
                <div className="space-y-4">
                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-white mb-3">System Info</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <InfoRow label="Next.js Version" value="16.1.6" />
                            <InfoRow label="Prisma Version" value="7.4.2" />
                            <InfoRow label="Node Version" value="22.x" />
                            <InfoRow label="Database" value="Railway PostgreSQL" />
                        </div>
                    </div>
                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-white mb-3">Worker Status</h3>
                        <p className="text-sm text-gray-400">
                            BullMQ workers will be displayed here after Phase 3-4 setup.
                        </p>
                    </div>
                </div>
            )}

            {/* Stats Tab */}
            {activeTab === "stats" && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center">
                    <BarChart3 className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-white mb-2">Platform Analytics</h3>
                    <p className="text-gray-400 text-sm">
                        API usage, processing costs, and system-wide performance metrics.
                    </p>
                </div>
            )}
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
            <span className="text-sm text-gray-400">{label}</span>
            <span className="text-sm text-white font-mono">{value}</span>
        </div>
    );
}
