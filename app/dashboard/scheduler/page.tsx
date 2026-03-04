"use client";

import { useState, useEffect } from "react";
import {
    Calendar,
    ChevronLeft,
    ChevronRight,
    Clock,
    Film,
    Youtube,
    Instagram,
    Trash2,
    Edit3,
    Play,
    Pause,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PublishJob = {
    id: string;
    status: string;
    scheduledAt: string | null;
    publishedAt: string | null;
    shortVideo: {
        id: string;
        segment: {
            title: string;
            video: { title: string };
        };
    };
    channel: {
        channelName: string;
        platform: string;
    };
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

export default function SchedulerPage() {
    const [jobs, setJobs] = useState<PublishJob[]>([]);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/publish")
            .then((r) => r.json())
            .then((data) => {
                setJobs(Array.isArray(data) ? data : []);
                setLoading(false);
            });
    }, []);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

    const getJobsForDate = (day: number) => {
        return jobs.filter((j) => {
            if (!j.scheduledAt) return false;
            const d = new Date(j.scheduledAt);
            return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
        });
    };

    const STATUS_COLORS: Record<string, string> = {
        DRAFT: "bg-gray-500/15 text-gray-400",
        SCHEDULED: "bg-blue-500/15 text-blue-400",
        PUBLISHING: "bg-amber-500/15 text-amber-400",
        PUBLISHED: "bg-emerald-500/15 text-emerald-400",
        FAILED: "bg-red-500/15 text-red-400",
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Content Scheduler</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Plan and automate your posting calendar
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
                        <button
                            onClick={() => setViewMode("calendar")}
                            className={cn(
                                "px-3 py-2 text-xs font-medium transition-colors",
                                viewMode === "calendar" ? "bg-violet-500/15 text-violet-400" : "text-gray-400 hover:text-white"
                            )}
                        >
                            Calendar
                        </button>
                        <button
                            onClick={() => setViewMode("list")}
                            className={cn(
                                "px-3 py-2 text-xs font-medium transition-colors",
                                viewMode === "list" ? "bg-violet-500/15 text-violet-400" : "text-gray-400 hover:text-white"
                            )}
                        >
                            List
                        </button>
                    </div>
                </div>
            </div>

            {viewMode === "calendar" ? (
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden">
                    {/* Month Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                        <button onClick={prevMonth} className="p-1.5 text-gray-400 hover:text-white transition-colors">
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <h2 className="text-lg font-semibold text-white">
                            {MONTHS[month]} {year}
                        </h2>
                        <button onClick={nextMonth} className="p-1.5 text-gray-400 hover:text-white transition-colors">
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Day Headers */}
                    <div className="grid grid-cols-7 border-b border-gray-800">
                        {DAYS.map((day) => (
                            <div key={day} className="px-2 py-2 text-center text-xs font-medium text-gray-500">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7">
                        {/* Empty cells before first day */}
                        {Array.from({ length: firstDay }, (_, i) => (
                            <div key={`empty-${i}`} className="h-24 border-b border-r border-gray-800/50" />
                        ))}

                        {/* Day cells */}
                        {Array.from({ length: daysInMonth }, (_, i) => {
                            const day = i + 1;
                            const dayJobs = getJobsForDate(day);
                            const isToday =
                                new Date().getDate() === day &&
                                new Date().getMonth() === month &&
                                new Date().getFullYear() === year;

                            return (
                                <div
                                    key={day}
                                    className={cn(
                                        "h-24 border-b border-r border-gray-800/50 p-1.5",
                                        isToday && "bg-violet-500/5"
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "text-xs font-medium",
                                            isToday ? "text-violet-400" : "text-gray-500"
                                        )}
                                    >
                                        {day}
                                    </span>
                                    <div className="mt-1 space-y-0.5">
                                        {dayJobs.slice(0, 3).map((job) => (
                                            <div
                                                key={job.id}
                                                className={cn(
                                                    "text-[9px] px-1 py-0.5 rounded truncate",
                                                    STATUS_COLORS[job.status] || STATUS_COLORS.DRAFT
                                                )}
                                            >
                                                {job.shortVideo.segment.title}
                                            </div>
                                        ))}
                                        {dayJobs.length > 3 && (
                                            <div className="text-[9px] text-gray-500 px-1">
                                                +{dayJobs.length - 3} more
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                /* List View */
                <div className="space-y-2">
                    {jobs.length === 0 ? (
                        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center">
                            <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-white mb-2">No scheduled posts</h3>
                            <p className="text-gray-400 text-sm">
                                Schedule shorts from the editor to see them here.
                            </p>
                        </div>
                    ) : (
                        jobs.map((job) => (
                            <div
                                key={job.id}
                                className="flex items-center gap-4 bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-3 hover:border-gray-700 transition-colors"
                            >
                                <div className="flex-shrink-0">
                                    {job.channel.platform === "youtube" ? (
                                        <Youtube className="w-5 h-5 text-red-400" />
                                    ) : (
                                        <Instagram className="w-5 h-5 text-pink-400" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-medium text-white truncate">
                                        {job.shortVideo.segment.title}
                                    </h3>
                                    <p className="text-xs text-gray-500">
                                        {job.channel.channelName} ·{" "}
                                        {job.scheduledAt
                                            ? new Date(job.scheduledAt).toLocaleDateString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })
                                            : "No date set"}
                                    </p>
                                </div>
                                <span
                                    className={cn(
                                        "text-xs font-medium px-2.5 py-1 rounded-full",
                                        STATUS_COLORS[job.status] || STATUS_COLORS.DRAFT
                                    )}
                                >
                                    {job.status}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Stats Bar */}
            <div className="grid grid-cols-4 gap-4">
                {["DRAFT", "SCHEDULED", "PUBLISHED", "FAILED"].map((status) => {
                    const count = jobs.filter((j) => j.status === status).length;
                    return (
                        <div
                            key={status}
                            className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-center"
                        >
                            <p className="text-2xl font-bold text-white">{count}</p>
                            <p className="text-xs text-gray-500 capitalize">{status.toLowerCase()}</p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
