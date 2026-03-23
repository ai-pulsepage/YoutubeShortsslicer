"use client";

import { useState, useEffect } from "react";
import {
    Calendar,
    ChevronLeft,
    ChevronRight,
    Clock,
    Plus,
    Youtube,
    Trash2,
    Settings,
    Film,
    Layers,
    Loader2,
    AlertCircle,
    Check,
    X,
    Edit3,
    Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Channel = {
    id: string;
    channelName: string;
    platform: string;
    defaults?: { thumbnail?: string } | null;
};

type Schedule = {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    postTimes: string[];
    postsPerDay: number;
    channel: Channel;
    _count: { publishJobs: number };
};

type PublishJob = {
    id: string;
    status: string;
    scheduledAt: string | null;
    publishedAt: string | null;
    title: string | null;
    description: string | null;
    errorMsg: string | null;
    scheduleId: string | null;
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

const STATUS_COLORS: Record<string, string> = {
    DRAFT: "bg-gray-500/15 text-gray-400 border-gray-500/20",
    SCHEDULED: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    PUBLISHING: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    PUBLISHED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    FAILED: "bg-red-500/15 text-red-400 border-red-500/20",
};

export default function SchedulerPage() {
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [jobs, setJobs] = useState<PublishJob[]>([]);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [editingJob, setEditingJob] = useState<PublishJob | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([
            fetch("/api/schedules").then((r) => r.json()),
            fetch("/api/publish").then((r) => r.json()),
            fetch("/api/channels").then((r) => r.json()),
        ]).then(([sched, pubs, chs]) => {
            setSchedules(Array.isArray(sched) ? sched : []);
            setJobs(Array.isArray(pubs) ? pubs : []);
            setChannels(Array.isArray(chs) ? chs : []);
            setLoading(false);
        });
    }, []);

    const deleteJob = async (jobId: string) => {
        if (!confirm("Delete this scheduled post? This cannot be undone.")) return;
        setDeletingId(jobId);
        try {
            const res = await fetch(`/api/publish?id=${jobId}`, { method: "DELETE" });
            if (res.ok) {
                setJobs(prev => prev.filter(j => j.id !== jobId));
            } else {
                const err = await res.json();
                alert(err.error || "Delete failed");
            }
        } catch (err) {
            console.error("Delete error:", err);
        } finally {
            setDeletingId(null);
        }
    };

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

    // Filter jobs by selected schedule
    const filteredJobs = selectedScheduleId
        ? jobs.filter((j) => j.scheduleId === selectedScheduleId)
        : jobs;

    const getJobsForDate = (day: number) => {
        return filteredJobs.filter((j) => {
            if (!j.scheduledAt) return false;
            const d = new Date(j.scheduledAt);
            return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
        });
    };

    const deleteSchedule = async (id: string) => {
        if (!confirm("Delete this schedule? Queued jobs will be unlinked.")) return;
        await fetch(`/api/schedules?id=${id}`, { method: "DELETE" });
        setSchedules((prev) => prev.filter((s) => s.id !== id));
        if (selectedScheduleId === id) setSelectedScheduleId(null);
    };

    const statusCounts = {
        DRAFT: filteredJobs.filter((j) => j.status === "DRAFT").length,
        SCHEDULED: filteredJobs.filter((j) => j.status === "SCHEDULED").length,
        PUBLISHED: filteredJobs.filter((j) => j.status === "PUBLISHED").length,
        FAILED: filteredJobs.filter((j) => j.status === "FAILED").length,
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex gap-6">
            {/* Left Sidebar — Schedules */}
            <div className="w-72 flex-shrink-0 space-y-3">
                <div className="flex items-center justify-between mb-1">
                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                        Schedules
                    </h2>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                        title="Create Schedule"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>

                {/* All Jobs button */}
                <button
                    onClick={() => setSelectedScheduleId(null)}
                    className={cn(
                        "w-full text-left rounded-xl p-3 border transition-colors",
                        !selectedScheduleId
                            ? "bg-violet-500/10 border-violet-500/20 text-violet-400"
                            : "bg-gray-900/50 border-gray-800 text-gray-400 hover:border-gray-700"
                    )}
                >
                    <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4" />
                        <span className="text-sm font-medium">All Schedules</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">
                        {jobs.length} total jobs
                    </p>
                </button>

                {/* Schedule cards */}
                {schedules.map((sched) => {
                    const thumb = (sched.channel.defaults as any)?.thumbnail;
                    return (
                        <div
                            key={sched.id}
                            onClick={() => setSelectedScheduleId(sched.id)}
                            className={cn(
                                "rounded-xl p-3 border cursor-pointer transition-colors group",
                                selectedScheduleId === sched.id
                                    ? "bg-violet-500/10 border-violet-500/20"
                                    : "bg-gray-900/50 border-gray-800 hover:border-gray-700"
                            )}
                        >
                            <div className="flex items-center gap-2.5">
                                {thumb ? (
                                    <img src={thumb} className="w-8 h-8 rounded-full" alt="" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
                                        <Youtube className="w-4 h-4 text-red-400" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-medium text-white truncate">
                                        {sched.name}
                                    </h3>
                                    <p className="text-[10px] text-gray-500 truncate">
                                        {sched.channel.channelName}
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteSchedule(sched.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-all"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>

                            <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
                                <span className="flex items-center gap-1">
                                    <Film className="w-3 h-3" />
                                    {sched._count.publishJobs} jobs
                                </span>
                                <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {sched.postsPerDay}x/day
                                </span>
                                <span
                                    className={cn(
                                        "w-1.5 h-1.5 rounded-full",
                                        sched.isActive ? "bg-emerald-500" : "bg-gray-600"
                                    )}
                                />
                            </div>

                            {sched.description && (
                                <p className="text-[10px] text-gray-600 mt-1 line-clamp-1">
                                    {sched.description}
                                </p>
                            )}
                        </div>
                    );
                })}

                {schedules.length === 0 && (
                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-center">
                        <Calendar className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                        <p className="text-xs text-gray-500 mb-2">No schedules yet</p>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="text-xs text-violet-400 hover:text-violet-300"
                        >
                            Create your first schedule
                        </button>
                    </div>
                )}
            </div>

            {/* Main Content */}
            <div className="flex-1 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-white">
                            {selectedScheduleId
                                ? schedules.find((s) => s.id === selectedScheduleId)?.name || "Schedule"
                                : "Content Scheduler"}
                        </h1>
                        <p className="text-gray-400 text-sm mt-0.5">
                            {selectedScheduleId
                                ? `${schedules.find((s) => s.id === selectedScheduleId)?.channel.channelName} · ${filteredJobs.length} jobs`
                                : `${jobs.length} total jobs across all schedules`}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedScheduleId && (
                            <button
                                onClick={() => setShowAssignModal(true)}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                            >
                                <Film className="w-4 h-4" /> Assign Videos
                            </button>
                        )}
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

                {/* Calendar / List View */}
                {viewMode === "calendar" ? (
                    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden">
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

                        <div className="grid grid-cols-7 border-b border-gray-800">
                            {DAYS.map((day) => (
                                <div key={day} className="px-2 py-2 text-center text-xs font-medium text-gray-500">
                                    {day}
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-7">
                            {Array.from({ length: firstDay }, (_, i) => (
                                <div key={`e-${i}`} className="h-24 border-b border-r border-gray-800/50" />
                            ))}
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
                                        <span className={cn("text-xs font-medium", isToday ? "text-violet-400" : "text-gray-500")}>
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
                                                    title={`${job.title || job.shortVideo?.segment?.title || "Short"} — ${job.status}${job.errorMsg ? `: ${job.errorMsg}` : ""}`}
                                                >
                                                    {job.title || job.shortVideo?.segment?.title || "Short"}
                                                </div>
                                            ))}
                                            {dayJobs.length > 3 && (
                                                <div className="text-[9px] text-gray-500 px-1">+{dayJobs.length - 3} more</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredJobs.length === 0 ? (
                            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center">
                                <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                                <h3 className="text-lg font-semibold text-white mb-2">No scheduled posts</h3>
                                <p className="text-gray-400 text-sm">
                                    {selectedScheduleId
                                        ? "Assign content to this schedule to see posts here."
                                        : "Create a schedule and assign content to get started."}
                                </p>
                            </div>
                        ) : (
                            filteredJobs
                                .sort((a, b) => {
                                    const aDate = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
                                    const bDate = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
                                    return aDate - bDate;
                                })
                                .map((job) => (
                                    <div
                                        key={job.id}
                                        className="flex items-center gap-4 bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-3 hover:border-gray-700 transition-colors"
                                    >
                                        <Youtube className="w-5 h-5 text-red-400 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-medium text-white truncate">
                                                {job.title || job.shortVideo?.segment?.title || "Short"}
                                            </h3>
                                            <p className="text-xs text-gray-500">
                                                {job.channel.channelName} ·{" "}
                                                {job.scheduledAt
                                                    ? new Date(job.scheduledAt).toLocaleDateString("en-US", {
                                                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                                                    })
                                                    : "No date set"}
                                            </p>
                                            {job.status === "FAILED" && job.errorMsg && (
                                                <p className="text-[10px] text-red-400 mt-0.5 flex items-center gap-1">
                                                    <AlertCircle className="w-2.5 h-2.5" />
                                                    {job.errorMsg}
                                                </p>
                                            )}
                                        </div>
                                    <span
                                            className={cn(
                                                "text-xs font-medium px-2.5 py-1 rounded-full border",
                                                STATUS_COLORS[job.status] || STATUS_COLORS.DRAFT
                                            )}
                                        >
                                            {job.status}
                                        </span>
                                        <button
                                            onClick={() => setEditingJob(job)}
                                            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                                            title="Edit job"
                                        >
                                            <Edit3 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => deleteJob(job.id)}
                                            disabled={deletingId === job.id}
                                            className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                                            title="Delete job"
                                        >
                                            {deletingId === job.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                ))
                        )}
                    </div>
                )}

                {/* Stats Bar */}
                <div className="grid grid-cols-4 gap-4">
                    {Object.entries(statusCounts).map(([status, count]) => (
                        <div
                            key={status}
                            className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-center"
                        >
                            <p className="text-2xl font-bold text-white">{count}</p>
                            <p className="text-xs text-gray-500 capitalize">{status.toLowerCase()}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Create Schedule Modal */}
            {showCreateModal && (
                <CreateScheduleModal
                    channels={channels}
                    onClose={() => setShowCreateModal(false)}
                    onCreate={(sched: Schedule) => {
                        setSchedules((prev) => [sched, ...prev]);
                        setSelectedScheduleId(sched.id);
                        setShowCreateModal(false);
                    }}
                />
            )}

            {/* Assign Videos Modal */}
            {showAssignModal && selectedScheduleId && (
                <AssignVideosModal
                    scheduleId={selectedScheduleId}
                    onClose={() => setShowAssignModal(false)}
                    onAssigned={() => {
                        setShowAssignModal(false);
                        fetch("/api/publish").then(r => r.json()).then(data => {
                            if (Array.isArray(data)) setJobs(data);
                        });
                    }}
                />
            )}

            {/* Edit Job Modal */}
            {editingJob && (
                <EditJobModal
                    job={editingJob}
                    onClose={() => setEditingJob(null)}
                    onSaved={(updated) => {
                        setJobs(prev => prev.map(j => j.id === updated.id ? { ...j, ...updated } : j));
                        setEditingJob(null);
                    }}
                />
            )}
        </div>
    );
}

// ─── Create Schedule Modal ───────────────────────

function CreateScheduleModal({
    channels,
    onClose,
    onCreate,
}: {
    channels: Channel[];
    onClose: () => void;
    onCreate: (s: any) => void;
}) {
    const [name, setName] = useState("");
    const [channelId, setChannelId] = useState(channels[0]?.id || "");
    const [description, setDescription] = useState("");
    const [postsPerDay, setPostsPerDay] = useState(3);
    const [postTimes, setPostTimes] = useState(["09:00", "13:00", "18:00"]);
    const [creating, setCreating] = useState(false);

    const handleCreate = async () => {
        if (!name || !channelId) return;
        setCreating(true);

        const res = await fetch("/api/schedules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name,
                channelId,
                description: description || undefined,
                postsPerDay,
                postTimes: postTimes.slice(0, postsPerDay),
            }),
        });

        const data = await res.json();
        if (res.ok) {
            // Reload to get full schedule with _count
            const fullRes = await fetch("/api/schedules");
            const fullData = await fullRes.json();
            const newSched = fullData.find((s: any) => s.id === data.id);
            onCreate(newSched || data);
        }
        setCreating(false);
    };

    const updatePostTime = (index: number, value: string) => {
        const updated = [...postTimes];
        updated[index] = value;
        setPostTimes(updated);
    };

    const addPostTime = () => {
        setPostTimes([...postTimes, "12:00"]);
        setPostsPerDay(postsPerDay + 1);
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold text-white">Create Schedule</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Name */}
                    <div>
                        <label className="text-xs text-gray-400 mb-1 block">Schedule Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Animal Clips, News Shorts"
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                        />
                    </div>

                    {/* Channel */}
                    <div>
                        <label className="text-xs text-gray-400 mb-1 block">YouTube Channel</label>
                        <select
                            value={channelId}
                            onChange={(e) => setChannelId(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                        >
                            {channels.length === 0 && (
                                <option value="">No channels connected</option>
                            )}
                            {channels.map((ch) => (
                                <option key={ch.id} value={ch.id}>
                                    {ch.channelName} ({ch.platform})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="text-xs text-gray-400 mb-1 block">Description (optional)</label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="e.g., 1-min clips about exotic animals"
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                        />
                    </div>

                    {/* Post Times */}
                    <div>
                        <label className="text-xs text-gray-400 mb-1 block">
                            Posting Times ({postTimes.length} per day)
                        </label>
                        <div className="space-y-2">
                            {postTimes.map((time, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5 text-gray-500" />
                                    <input
                                        type="time"
                                        value={time}
                                        onChange={(e) => updatePostTime(i, e.target.value)}
                                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-violet-500 focus:outline-none"
                                    />
                                    {postTimes.length > 1 && (
                                        <button
                                            onClick={() => {
                                                setPostTimes(postTimes.filter((_, j) => j !== i));
                                                setPostsPerDay(postsPerDay - 1);
                                            }}
                                            className="text-gray-500 hover:text-red-400"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button
                                onClick={addPostTime}
                                className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
                            >
                                <Plus className="w-3 h-3" /> Add time slot
                            </button>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-800 hover:bg-gray-700 text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={!name || !channelId || creating}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Create
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Assign Videos Modal ─────────────────────────

function AssignVideosModal({
    scheduleId,
    onClose,
    onAssigned,
}: {
    scheduleId: string;
    onClose: () => void;
    onAssigned: () => void;
}) {
    const [shorts, setShorts] = useState<any[]>([]);
    const [tags, setTags] = useState<any[]>([]);
    const [selectedTag, setSelectedTag] = useState("");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [assigning, setAssigning] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            fetch("/api/shorts").then(r => r.json()),
            fetch("/api/tags").then(r => r.json()),
        ]).then(([s, t]) => {
            setShorts(Array.isArray(s) ? s.filter((v: any) => v.status === "RENDERED") : []);
            setTags(Array.isArray(t) ? t : []);
            setLoading(false);
        });
    }, []);

    const filteredShorts = selectedTag
        ? shorts.filter((s: any) => s.segment?.video?.videoTags?.some((vt: any) => vt.tagId === selectedTag))
        : shorts;

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAll = () => {
        if (selectedIds.size === filteredShorts.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredShorts.map((s: any) => s.id)));
        }
    };

    const handleAssign = async () => {
        if (selectedIds.size === 0) return;
        setAssigning(true);
        try {
            await fetch(`/api/schedules/${scheduleId}/assign`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ shortVideoIds: Array.from(selectedIds) }),
            });
            onAssigned();
        } catch { }
        setAssigning(false);
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white">Assign Videos to Schedule</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tag filter */}
                <div className="flex items-center gap-2 mb-3">
                    <select
                        value={selectedTag}
                        onChange={(e) => setSelectedTag(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-violet-500 focus:outline-none flex-1"
                    >
                        <option value="">All Batches</option>
                        {tags.map((t: any) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                    <button
                        onClick={selectAll}
                        className="px-3 py-1.5 text-xs font-medium text-violet-400 hover:text-violet-300 bg-gray-800 rounded-lg border border-gray-700"
                    >
                        {selectedIds.size === filteredShorts.length ? "Deselect All" : "Select All"}
                    </button>
                </div>

                {/* Video list */}
                <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
                        </div>
                    ) : filteredShorts.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-8">No rendered shorts found</p>
                    ) : (
                        filteredShorts.map((s: any) => (
                            <button
                                key={s.id}
                                onClick={() => toggleSelect(s.id)}
                                className={cn(
                                    "w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center gap-3",
                                    selectedIds.has(s.id)
                                        ? "bg-violet-500/10 border-violet-500/30"
                                        : "bg-gray-800/50 border-gray-800 hover:border-gray-700"
                                )}
                            >
                                <div className={cn(
                                    "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0",
                                    selectedIds.has(s.id)
                                        ? "border-violet-500 bg-violet-500"
                                        : "border-gray-600"
                                )}>
                                    {selectedIds.has(s.id) && <Check className="w-3 h-3 text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white truncate">
                                        {s.segment?.title || "Untitled"}
                                    </p>
                                    <p className="text-[10px] text-gray-500">
                                        {s.segment?.video?.title || "Unknown"}
                                    </p>
                                </div>
                            </button>
                        ))
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4 pt-3 border-t border-gray-800">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-800 hover:bg-gray-700 text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleAssign}
                        disabled={selectedIds.size === 0 || assigning}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Assign {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Edit Job Modal ────────────────────────────────

function EditJobModal({
    job,
    onClose,
    onSaved,
}: {
    job: PublishJob;
    onClose: () => void;
    onSaved: (updated: any) => void;
}) {
    const [title, setTitle] = useState(job.title || job.shortVideo?.segment?.title || "");
    const [description, setDescription] = useState(job.description || "");
    const [scheduledAt, setScheduledAt] = useState(
        job.scheduledAt ? new Date(job.scheduledAt).toISOString().slice(0, 16) : ""
    );
    const [saving, setSaving] = useState(false);
    const [autoFilling, setAutoFilling] = useState(false);

    // Auto-fill description from campaign brief
    const handleAutoFill = async () => {
        setAutoFilling(true);
        try {
            // Fetch briefs and find one matching the platform
            const briefsRes = await fetch("/api/briefs");
            if (briefsRes.ok) {
                const briefs = await briefsRes.json();
                if (briefs.length > 0) {
                    // Use first available brief's build-description
                    const brief = briefs[0];
                    const buildRes = await fetch(`/api/briefs/${brief.id}/build-description`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            clipTitle: title,
                            platform: job.channel?.platform || "youtube",
                        }),
                    });
                    if (buildRes.ok) {
                        const { description: built } = await buildRes.json();
                        setDescription(built);
                    }
                }
            }
        } catch (err) {
            console.error("Auto-fill error:", err);
        } finally {
            setAutoFilling(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch("/api/publish", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jobId: job.id,
                    title,
                    description,
                    scheduledAt: scheduledAt || null,
                }),
            });
            if (res.ok) {
                const updated = await res.json();
                onSaved(updated);
            } else {
                const err = await res.json();
                alert(err.error || "Failed to save");
            }
        } catch (err) {
            console.error("Save error:", err);
        } finally {
            setSaving(false);
        }
    };

    const inputClass = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none";

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold text-white">Edit Scheduled Post</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-gray-400 mb-1 block">Title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Post title"
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-xs text-gray-400">Description</label>
                            <button
                                onClick={handleAutoFill}
                                disabled={autoFilling}
                                className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 disabled:opacity-50"
                            >
                                {autoFilling ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                    <Briefcase className="w-3 h-3" />
                                )}
                                Auto-fill from Campaign
                            </button>
                        </div>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Post description with tags and hashtags..."
                            className={`${inputClass} min-h-[120px] resize-y`}
                        />
                    </div>

                    <div>
                        <label className="text-xs text-gray-400 mb-1 block">Scheduled Date & Time</label>
                        <input
                            type="datetime-local"
                            value={scheduledAt}
                            onChange={(e) => setScheduledAt(e.target.value)}
                            className={inputClass}
                        />
                    </div>
                </div>

                <div className="flex gap-2 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-800 hover:bg-gray-700 text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}
