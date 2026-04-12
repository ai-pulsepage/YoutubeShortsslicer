"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Download,
    Scissors,
    Film,
    Type,
    Mic,
    Share2,
    Calendar,
    BarChart3,
    DollarSign,
    Settings,
    LogOut,
    Clapperboard,
    Library,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    HelpCircle,
    Video,
    Headphones,
    Sparkles,
    Users,
    Briefcase,
    PackageOpen,
    Wand2,
} from "lucide-react";
import { useState } from "react";

const topNavItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Library", href: "/dashboard/library", icon: Library },
    { label: "Campaigns", href: "/dashboard/campaigns", icon: Briefcase },
    { label: "Studio", href: "/dashboard/studio", icon: Wand2 },
    { label: "Export", href: "/dashboard/export", icon: PackageOpen },
    { label: "Channels", href: "/dashboard/channels", icon: Share2 },
    { label: "Scheduler", href: "/dashboard/scheduler", icon: Calendar },
];

const aiStudioItems = [
    { label: "Documentary", href: "/dashboard/documentary", icon: Video },
    { label: "Podcasts", href: "/dashboard/podcasts", icon: Headphones },
    { label: "Characters", href: "/dashboard/podcasts/characters", icon: Users },
];

const bottomNavItems = [
    { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
    { label: "Whop", href: "/dashboard/whop", icon: DollarSign },
    { label: "Help", href: "/dashboard/help", icon: HelpCircle },
    { label: "Admin", href: "/dashboard/admin", icon: Settings, adminOnly: true },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { data: session } = useSession();
    const [collapsed, setCollapsed] = useState(false);
    const isAdmin = (session?.user as any)?.role === "ADMIN";

    // Auto-expand AI Studio if we're on a route inside it
    const isInStudio = pathname.startsWith("/dashboard/documentary") || pathname.startsWith("/dashboard/podcasts");
    const [studioOpen, setStudioOpen] = useState(isInStudio);

    const renderNavLink = (item: { label: string; href: string; icon: any; adminOnly?: boolean }, indent = false) => {
        const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
        return (
            <Link
                key={item.href}
                href={item.href}
                className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                    indent && !collapsed && "pl-9",
                    isActive
                        ? "bg-violet-500/15 text-violet-400 shadow-sm shadow-violet-500/10"
                        : "text-gray-400 hover:text-white hover:bg-gray-800/60"
                )}
                title={collapsed ? item.label : undefined}
            >
                <item.icon
                    className={cn(
                        "w-5 h-5 flex-shrink-0",
                        isActive ? "text-violet-400" : "text-gray-500"
                    )}
                />
                {!collapsed && <span>{item.label}</span>}
            </Link>
        );
    };

    return (
        <aside
            className={cn(
                "flex flex-col h-screen bg-gray-900/50 backdrop-blur-xl border-r border-gray-800 transition-all duration-300",
                collapsed ? "w-[72px]" : "w-64"
            )}
        >
            {/* Logo */}
            <div className="flex items-center gap-3 px-4 h-16 border-b border-gray-800">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center">
                    <Clapperboard className="w-5 h-5 text-white" />
                </div>
                {!collapsed && (
                    <span className="font-semibold text-sm text-white truncate">
                        Shorts Slicer
                    </span>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
                {/* Top nav items */}
                {topNavItems.map((item) => renderNavLink(item))}

                {/* AI Studio group */}
                <div className="pt-2">
                    <button
                        onClick={() => setStudioOpen(!studioOpen)}
                        className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full",
                            isInStudio
                                ? "text-violet-400"
                                : "text-gray-400 hover:text-white hover:bg-gray-800/60"
                        )}
                        title={collapsed ? "AI Studio" : undefined}
                    >
                        <Sparkles
                            className={cn(
                                "w-5 h-5 flex-shrink-0",
                                isInStudio ? "text-violet-400" : "text-gray-500"
                            )}
                        />
                        {!collapsed && (
                            <>
                                <span className="flex-1 text-left">AI Studio</span>
                                <ChevronDown
                                    className={cn(
                                        "w-4 h-4 text-gray-500 transition-transform duration-200",
                                        studioOpen && "rotate-180"
                                    )}
                                />
                            </>
                        )}
                    </button>

                    {(studioOpen || collapsed) && (
                        <div className={cn("space-y-0.5", !collapsed && "mt-0.5")}>
                            {aiStudioItems.map((item) => renderNavLink(item, true))}
                        </div>
                    )}
                </div>

                {/* Bottom nav items */}
                <div className="pt-2 border-t border-gray-800/50 mt-2">
                    {bottomNavItems
                        .filter((item) => !item.adminOnly || isAdmin)
                        .map((item) => renderNavLink(item))}
                </div>
            </nav>

            {/* Bottom section */}
            <div className="border-t border-gray-800 p-3 space-y-2">
                {/* Collapse toggle */}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="flex items-center gap-3 px-3 py-2 w-full rounded-xl text-sm text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors"
                >
                    {collapsed ? (
                        <ChevronRight className="w-5 h-5 flex-shrink-0" />
                    ) : (
                        <>
                            <ChevronLeft className="w-5 h-5 flex-shrink-0" />
                            <span>Collapse</span>
                        </>
                    )}
                </button>

                {/* User info & sign out */}
                {session?.user && (
                    <div className="flex items-center gap-3 px-3 py-2">
                        {session.user.image ? (
                            <img
                                src={session.user.image}
                                alt=""
                                className="w-8 h-8 rounded-full flex-shrink-0"
                            />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-700 flex-shrink-0 flex items-center justify-center text-xs font-bold">
                                {session.user.name?.[0] || "U"}
                            </div>
                        )}
                        {!collapsed && (
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">
                                    {session.user.name}
                                </p>
                                <p className="text-xs text-gray-500 truncate">
                                    {(session.user as any).role === "ADMIN" ? "Admin" : "User"}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="flex items-center gap-3 px-3 py-2 w-full rounded-xl text-sm text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title={collapsed ? "Sign out" : undefined}
                >
                    <LogOut className="w-5 h-5 flex-shrink-0" />
                    {!collapsed && <span>Sign Out</span>}
                </button>
            </div>
        </aside>
    );
}
