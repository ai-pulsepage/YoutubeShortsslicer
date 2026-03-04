import { auth } from "@/lib/auth";
import {
    Film,
    Scissors,
    Upload,
    Clock,
    TrendingUp,
    Zap,
} from "lucide-react";

export default async function DashboardPage() {
    const session = await auth();
    const userName = session?.user?.name?.split(" ")[0] || "there";
    const isAdmin = (session?.user as any)?.role === "ADMIN";

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white">
                    Welcome back, {userName} 👋
                </h1>
                <p className="text-gray-400 mt-1">
                    Here&apos;s what&apos;s happening with your content pipeline
                </p>
                {isAdmin && (
                    <span className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-500/15 text-violet-400 border border-violet-500/20">
                        <Zap className="w-3 h-3" />
                        Admin
                    </span>
                )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    icon={<Film className="w-5 h-5" />}
                    label="Videos Processed"
                    value="0"
                    trend="+0 this week"
                    color="violet"
                />
                <StatCard
                    icon={<Scissors className="w-5 h-5" />}
                    label="Shorts Generated"
                    value="0"
                    trend="+0 this week"
                    color="blue"
                />
                <StatCard
                    icon={<Upload className="w-5 h-5" />}
                    label="Published"
                    value="0"
                    trend="+0 this week"
                    color="emerald"
                />
                <StatCard
                    icon={<Clock className="w-5 h-5" />}
                    label="In Queue"
                    value="0"
                    trend="0 processing"
                    color="amber"
                />
            </div>

            {/* Quick Actions */}
            <div>
                <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <QuickAction
                        href="/dashboard/ingest"
                        icon={<Upload className="w-6 h-6" />}
                        label="Ingest Video"
                        description="Paste a URL to start processing"
                        gradient="from-violet-500 to-purple-600"
                    />
                    <QuickAction
                        href="/dashboard/library"
                        icon={<Film className="w-6 h-6" />}
                        label="Browse Library"
                        description="View all videos and shorts"
                        gradient="from-blue-500 to-cyan-600"
                    />
                    <QuickAction
                        href="/dashboard/scheduler"
                        icon={<Clock className="w-6 h-6" />}
                        label="Schedule Content"
                        description="Plan your posting calendar"
                        gradient="from-emerald-500 to-teal-600"
                    />
                </div>
            </div>

            {/* Recent Activity */}
            <div>
                <h2 className="text-lg font-semibold text-white mb-4">
                    Recent Activity
                </h2>
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center">
                    <TrendingUp className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">
                        No activity yet. Start by ingesting your first video!
                    </p>
                </div>
            </div>
        </div>
    );
}

function StatCard({
    icon,
    label,
    value,
    trend,
    color,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    trend: string;
    color: string;
}) {
    const colorClasses: Record<string, string> = {
        violet: "bg-violet-500/10 text-violet-400 border-violet-500/20",
        blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    };

    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-colors">
            <div className="flex items-center gap-3 mb-3">
                <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center border ${colorClasses[color]}`}
                >
                    {icon}
                </div>
                <span className="text-sm text-gray-400">{label}</span>
            </div>
            <p className="text-3xl font-bold text-white">{value}</p>
            <p className="text-xs text-gray-500 mt-1">{trend}</p>
        </div>
    );
}

function QuickAction({
    href,
    icon,
    label,
    description,
    gradient,
}: {
    href: string;
    icon: React.ReactNode;
    label: string;
    description: string;
    gradient: string;
}) {
    return (
        <a
            href={href}
            className="group relative overflow-hidden bg-gray-900/50 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-all duration-300 hover:shadow-lg"
        >
            <div
                className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}
            />
            <div className="relative z-10">
                <div className="text-gray-400 group-hover:text-white transition-colors mb-3">
                    {icon}
                </div>
                <h3 className="font-semibold text-white mb-1">{label}</h3>
                <p className="text-sm text-gray-500">{description}</p>
            </div>
        </a>
    );
}
