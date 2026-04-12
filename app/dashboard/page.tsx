import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
    Film,
    Scissors,
    Upload,
    Clock,
    TrendingUp,
    Zap,
    Plus,
    ExternalLink,
} from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
    const session = await auth();
    const userName = session?.user?.name?.split(" ")[0] || "there";
    const isAdmin = (session?.user as any)?.role === "ADMIN";
    const userId = session?.user?.id;

    // Fetch live stats
    let stats = { totalVideos: 0, totalSegments: 0, totalPublished: 0, pendingJobs: 0 };
    let recentVideos: any[] = [];

    if (userId) {
        const [totalVideos, totalSegments, totalPublished, pendingJobs, recent] =
            await Promise.all([
                prisma.video.count({ where: { userId } }),
                prisma.segment.count({
                    where: {
                        video: { userId },
                        status: { in: ["APPROVED", "RENDERED"] },
                    },
                }),
                prisma.publishJob.count({
                    where: {
                        shortVideo: { segment: { video: { userId } } },
                        status: "PUBLISHED",
                    },
                }),
                prisma.publishJob.count({
                    where: {
                        shortVideo: { segment: { video: { userId } } },
                        status: { in: ["DRAFT", "SCHEDULED"] },
                    },
                }),
                prisma.video.findMany({
                    where: { userId },
                    orderBy: { createdAt: "desc" },
                    take: 5,
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        thumbnail: true,
                        platform: true,
                        createdAt: true,
                        _count: { select: { segments: true } },
                    },
                }),
            ]);

        stats = { totalVideos, totalSegments, totalPublished, pendingJobs };
        recentVideos = recent;
    }

    const STATUS_COLORS: Record<string, string> = {
        PENDING: "text-gray-400",
        DOWNLOADING: "text-blue-400",
        TRANSCRIBING: "text-cyan-400",
        SEGMENTING: "text-violet-400",
        READY: "text-emerald-400",
        FAILED: "text-red-400",
    };

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
                    value={stats.totalVideos.toString()}
                    color="violet"
                />
                <StatCard
                    icon={<Scissors className="w-5 h-5" />}
                    label="Shorts Ready"
                    value={stats.totalSegments.toString()}
                    color="blue"
                />
                <StatCard
                    icon={<Upload className="w-5 h-5" />}
                    label="Published"
                    value={stats.totalPublished.toString()}
                    color="emerald"
                />
                <StatCard
                    icon={<Clock className="w-5 h-5" />}
                    label="In Queue"
                    value={stats.pendingJobs.toString()}
                    color="amber"
                />
            </div>

            {/* Quick Actions */}
            <div>
                <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <QuickAction
                        href="/dashboard/library"
                        icon={<Upload className="w-6 h-6" />}
                        label="Add Video"
                        description="Import a new video to process"
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
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white">Recent Videos</h2>
                    {recentVideos.length > 0 && (
                        <Link
                            href="/dashboard/library"
                            className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
                        >
                            View all →
                        </Link>
                    )}
                </div>
                {recentVideos.length === 0 ? (
                    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center">
                        <TrendingUp className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-400 text-sm">
                            No activity yet. Start by ingesting your first video!
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {recentVideos.map((video: any) => (
                            <Link
                                key={video.id}
                                href={`/dashboard/studio?video=${video.id}`}
                                className="flex items-center gap-4 bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-3 hover:border-gray-700 transition-colors group"
                            >
                                <div className="w-16 h-10 bg-gray-800 rounded-lg flex-shrink-0 overflow-hidden">
                                    {video.thumbnail ? (
                                        <img
                                            src={video.thumbnail}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Film className="w-4 h-4 text-gray-600" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-medium text-white truncate">
                                        {video.title || "Untitled"}
                                    </h3>
                                    <p className="text-xs text-gray-500">
                                        {video._count.segments} segments · {video.platform}
                                    </p>
                                </div>
                                <span
                                    className={`text-xs font-medium ${STATUS_COLORS[video.status] || "text-gray-400"
                                        }`}
                                >
                                    {video.status}
                                </span>
                                <ExternalLink className="w-4 h-4 text-gray-600 group-hover:text-violet-400 transition-colors" />
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function StatCard({
    icon,
    label,
    value,
    color,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
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
        <Link
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
        </Link>
    );
}
