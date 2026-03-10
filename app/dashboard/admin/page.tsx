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
    Trash2,
    HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
    { id: "keys", label: "API Keys", icon: Key },
    { id: "users", label: "Users", icon: Users },
    { id: "system", label: "System", icon: Server },
    { id: "storage", label: "Storage", icon: HardDrive },
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
    const [savedKeys, setSavedKeys] = useState<Record<string, string>>({});
    const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
    const [saving, setSaving] = useState(false);
    const [loadingKeys, setLoadingKeys] = useState(true);

    const isAdmin = (session?.user as any)?.role === "ADMIN";

    // Fetch existing keys on mount
    useEffect(() => {
        if (!isAdmin) return;
        fetch("/api/admin/keys")
            .then((r) => r.json())
            .then((data: any[]) => {
                const existing: Record<string, string> = {};
                data.forEach((k) => {
                    existing[k.service] = k.key; // masked value like "sk-1...xYz4"
                });
                setSavedKeys(existing);
            })
            .catch(console.error)
            .finally(() => setLoadingKeys(false));
    }, [isAdmin]);

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

    const handleSaveKeys = async () => {
        setSaving(true);
        try {
            // Only save keys that have been edited (non-empty)
            const entries = Object.entries(keys).filter(([_, v]) => v.trim() !== "");
            for (const [service, key] of entries) {
                await fetch("/api/admin/keys", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ service, key, label: service }),
                });
            }
            // Refresh saved state
            const res = await fetch("/api/admin/keys");
            const data = await res.json();
            const existing: Record<string, string> = {};
            data.forEach((k: any) => { existing[k.service] = k.key; });
            setSavedKeys(existing);
            setKeys({}); // Clear input fields after save
        } catch (err) {
            console.error("Failed to save keys:", err);
        } finally {
            setSaving(false);
        }
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

                    {loadingKeys ? (
                        <div className="flex items-center justify-center py-8">
                            <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
                            <span className="ml-2 text-sm text-gray-400">Loading keys...</span>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {API_KEY_FIELDS.map((field) => {
                                const isConfigured = !!savedKeys[field.key];
                                return (
                                    <div
                                        key={field.key}
                                        className="bg-gray-900/50 border border-gray-800 rounded-xl p-4"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className={cn(
                                                    "w-2 h-2 rounded-full",
                                                    isConfigured ? "bg-green-500" : "bg-gray-600"
                                                )} />
                                                <div>
                                                    <label className="text-sm font-medium text-white">
                                                        {field.label}
                                                    </label>
                                                    <p className="text-xs text-gray-500">{field.desc}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {isConfigured && !keys[field.key] && (
                                                    <span className="text-xs font-mono text-green-400 bg-green-500/10 px-2 py-1 rounded">
                                                        {savedKeys[field.key]}
                                                    </span>
                                                )}
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
                                        </div>
                                        <input
                                            type={showKeys[field.key] ? "text" : "password"}
                                            value={keys[field.key] || ""}
                                            onChange={(e) =>
                                                setKeys((prev) => ({ ...prev, [field.key]: e.target.value }))
                                            }
                                            placeholder={isConfigured ? "Enter new value to update..." : "Enter key..."}
                                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors font-mono"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <button
                        onClick={handleSaveKeys}
                        disabled={saving || Object.values(keys).every((v) => !v.trim())}
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
            {activeTab === "users" && <UserManager />}

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
                    <QueueManager />
                </div>
            )}

            {/* Storage Tab */}
            {activeTab === "storage" && <StorageManager />}

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

type QueueStat = { name: string; waiting: number; active: number; completed: number; failed: number; delayed: number };

function QueueManager() {
    const [queues, setQueues] = useState<QueueStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [clearing, setClearing] = useState<string | null>(null);

    const fetchQueues = () => {
        fetch("/api/admin/queues")
            .then((r) => r.json())
            .then(setQueues)
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { fetchQueues(); }, []);

    const clearQueue = async (queue: string, type: string) => {
        setClearing(`${queue}-${type}`);
        try {
            await fetch("/api/admin/queues", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ queue, type }),
            });
            fetchQueues();
        } finally {
            setClearing(null);
        }
    };

    const ICONS: Record<string, string> = {
        "video-download": "📥",
        transcription: "🎤",
        segmentation: "🧠",
        render: "🎬",
    };

    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Worker Queues</h3>
                <div className="flex gap-2">
                    <button
                        onClick={() => clearQueue("all", "failed")}
                        disabled={clearing !== null}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50"
                    >
                        <Trash2 className="w-3 h-3" />
                        Clear All Failed
                    </button>
                    <button
                        onClick={() => { setLoading(true); fetchQueues(); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-800 text-gray-300 hover:text-white transition-colors"
                    >
                        <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
                        Refresh
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-6">
                    <RefreshCw className="w-4 h-4 text-gray-500 animate-spin" />
                    <span className="ml-2 text-sm text-gray-500">Loading queues...</span>
                </div>
            ) : (
                <div className="space-y-3">
                    {queues.map((q) => (
                        <div key={q.name} className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">{ICONS[q.name] || "📦"}</span>
                                <div>
                                    <p className="text-sm font-medium text-white">{q.name}</p>
                                    <div className="flex gap-2 mt-1">
                                        {q.active > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">{q.active} active</span>}
                                        {q.waiting > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400">{q.waiting} waiting</span>}
                                        {q.delayed > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400">{q.delayed} delayed</span>}
                                        {q.failed > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">{q.failed} failed</span>}
                                        {q.completed > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/15 text-green-400">{q.completed} done</span>}
                                        {q.active === 0 && q.waiting === 0 && q.failed === 0 && q.delayed === 0 && q.completed === 0 && (
                                            <span className="text-xs text-gray-600">empty</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {q.failed > 0 && (
                                <button
                                    onClick={() => clearQueue(q.name, "failed")}
                                    disabled={clearing !== null}
                                    className="text-xs px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/15 transition-colors disabled:opacity-50"
                                >
                                    {clearing === `${q.name}-failed` ? "Clearing..." : "Clear Failed"}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

type UserData = {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    role: string;
    createdAt: string;
    _count: { videos: number; channels: number };
    subscription: { plan: string; status: string; currentPeriodEnd: string | null } | null;
};

function UserManager() {
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);

    const fetchUsers = () => {
        fetch("/api/admin/users")
            .then((r) => r.json())
            .then(setUsers)
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { fetchUsers(); }, []);

    const toggleRole = async (userId: string, currentRole: string) => {
        const newRole = currentRole === "ADMIN" ? "USER" : "ADMIN";
        setUpdating(userId);
        try {
            await fetch("/api/admin/users", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, role: newRole }),
            });
            fetchUsers();
        } finally {
            setUpdating(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-4 h-4 text-gray-500 animate-spin" />
                <span className="ml-2 text-sm text-gray-500">Loading users...</span>
            </div>
        );
    }

    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">{users.length} Registered Users</h3>
                <button
                    onClick={() => { setLoading(true); fetchUsers(); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-800 text-gray-300 hover:text-white transition-colors"
                >
                    <RefreshCw className="w-3 h-3" /> Refresh
                </button>
            </div>
            <div className="divide-y divide-gray-800">
                {users.map((user) => (
                    <div key={user.id} className="flex items-center justify-between px-5 py-3">
                        <div className="flex items-center gap-3">
                            {user.image ? (
                                <img src={user.image} alt="" className="w-8 h-8 rounded-full" />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs text-gray-400">
                                    {(user.name || user.email)[0]?.toUpperCase()}
                                </div>
                            )}
                            <div>
                                <p className="text-sm font-medium text-white">{user.name || "—"}</p>
                                <p className="text-xs text-gray-500">{user.email}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <span className="text-xs text-gray-400">{user._count.videos} videos · {user._count.channels} channels</span>
                                {user.subscription && (
                                    <p className="text-[10px] text-gray-600">{user.subscription.plan} ({user.subscription.status})</p>
                                )}
                            </div>
                            <button
                                onClick={() => toggleRole(user.id, user.role)}
                                disabled={updating === user.id}
                                className={cn(
                                    "text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors",
                                    user.role === "ADMIN"
                                        ? "bg-violet-500/15 text-violet-400 border border-violet-500/30"
                                        : "bg-gray-800 text-gray-300 border border-gray-700 hover:border-gray-600"
                                )}
                            >
                                {updating === user.id ? "..." : user.role}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

type StorageStats = {
    totalObjects: number;
    totalSizeMB: string;
    prefixes: Record<string, { count: number; sizeMB: string }>;
};

function StorageManager() {
    const [stats, setStats] = useState<StorageStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [cleaning, setCleaning] = useState(false);
    const [cleanResult, setCleanResult] = useState<string | null>(null);

    const fetchStats = () => {
        setLoading(true);
        fetch("/api/admin/storage")
            .then((r) => r.json())
            .then(setStats)
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { fetchStats(); }, []);

    const cleanOrphans = async () => {
        setCleaning(true);
        setCleanResult(null);
        try {
            const res = await fetch("/api/admin/storage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "clean-orphans" }),
            });
            const data = await res.json();
            setCleanResult(data.message || "Done");
            fetchStats(); // Refresh stats
        } catch (err) {
            setCleanResult("Cleanup failed");
        } finally {
            setCleaning(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-white">R2 Storage — Documentary Assets</h3>
                    <div className="flex gap-2">
                        <button
                            onClick={cleanOrphans}
                            disabled={cleaning}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50"
                        >
                            <Trash2 className="w-3 h-3" />
                            {cleaning ? "Cleaning..." : "Clean Orphans"}
                        </button>
                        <button
                            onClick={fetchStats}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-800 text-gray-300 hover:text-white transition-colors"
                        >
                            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
                            Refresh
                        </button>
                    </div>
                </div>

                {cleanResult && (
                    <div className="mb-3 p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-400">
                        {cleanResult}
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-6">
                        <RefreshCw className="w-4 h-4 text-gray-500 animate-spin" />
                        <span className="ml-2 text-sm text-gray-500">Loading storage stats...</span>
                    </div>
                ) : stats ? (
                    <div className="space-y-4">
                        {/* Summary */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-gray-800/50 rounded-lg p-3">
                                <p className="text-xs text-gray-500">Total Objects</p>
                                <p className="text-lg font-bold text-white">{stats.totalObjects}</p>
                            </div>
                            <div className="bg-gray-800/50 rounded-lg p-3">
                                <p className="text-xs text-gray-500">Total Size</p>
                                <p className="text-lg font-bold text-white">{stats.totalSizeMB} MB</p>
                            </div>
                        </div>

                        {/* Prefix breakdown */}
                        <div>
                            <p className="text-xs text-gray-500 mb-2">Breakdown by Type</p>
                            <div className="space-y-2">
                                {Object.entries(stats.prefixes).map(([prefix, data]) => (
                                    <div key={prefix} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                                        <span className="text-sm text-gray-300 font-mono">{prefix}</span>
                                        <div className="flex gap-3">
                                            <span className="text-xs text-gray-400">{data.count} files</span>
                                            <span className="text-xs text-white font-medium">{data.sizeMB} MB</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">Unable to load storage stats</p>
                )}
            </div>
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
