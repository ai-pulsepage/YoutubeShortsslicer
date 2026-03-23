"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Briefcase,
    Plus,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Trash2,
    Edit3,
    X,
    ChevronDown,
    ChevronRight,
    ExternalLink,
    Copy,
    Film,
    DollarSign,
    Hash,
    AtSign,
    Shield,
    Image as ImageIcon,
    Type,
    FileText,
    Ban,
    Clock,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────

interface PlatformTag {
    platform: string;
    tags: string[];
}

interface CampaignBrief {
    id: string;
    name: string;
    brand: string | null;
    status: string;
    contentSourceUrls: string[];
    contentSourceNotes: string | null;
    targetPlatforms: string[];
    captionGuidelines: string | null;
    suggestedCaptions: string[];

    platformTags: PlatformTag[];
    requiredHashtags: string[];
    optionalHashtags: string[];
    disclosureRequired: boolean;
    disclosureOptions: string[];
    disclosurePlacement: string | null;
    onScreenTextNotes: string | null;
    onScreenSuggestions: string[];
    formatNotes: string | null;
    minLengthSec: number | null;
    maxLengthSec: number | null;
    watermarkRequired: boolean;
    watermarkUrl: string | null;
    watermarkNotes: string | null;
    subtitleStyle: any;
    cpmRate: number | null;
    engagementRateMin: number | null;
    minPostDays: number | null;
    requirements: string[];
    notAllowed: string[];
    _count: { clipProjects: number };
    createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────

const PLATFORMS = [
    { id: "tiktok", label: "TikTok", color: "text-pink-400" },
    { id: "instagram", label: "Instagram", color: "text-purple-400" },
    { id: "youtube", label: "YouTube", color: "text-red-400" },
];

function PlatformBadges({ platforms }: { platforms: string[] }) {
    return (
        <div className="flex gap-1">
            {platforms.map((p) => {
                const cfg = PLATFORMS.find((x) => x.id === p);
                return (
                    <span
                        key={p}
                        className={`text-[10px] px-1.5 py-0.5 rounded-full bg-gray-800 ${cfg?.color || "text-gray-400"}`}
                    >
                        {cfg?.label || p}
                    </span>
                );
            })}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const colors: Record<string, string> = {
        active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
        paused: "bg-amber-500/15 text-amber-400 border-amber-500/20",
        completed: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    };
    return (
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${colors[status] || "bg-gray-500/15 text-gray-400 border-gray-500/20"}`}>
            {status}
        </span>
    );
}

// ─── Main Page ───────────────────────────────────────────

export default function CampaignsPage() {
    const [briefs, setBriefs] = useState<CampaignBrief[]>([]);
    const [loading, setLoading] = useState(true);
    const [showEditor, setShowEditor] = useState(false);
    const [editingBrief, setEditingBrief] = useState<CampaignBrief | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const fetchBriefs = useCallback(async () => {
        try {
            const res = await fetch("/api/briefs");
            if (res.ok) {
                const data = await res.json();
                setBriefs(data);
            }
        } catch (err) {
            console.error("Failed to fetch briefs:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBriefs();
    }, [fetchBriefs]);

    const handleDelete = async (id: string) => {
        if (!confirm("Archive this campaign brief? It will be hidden but not deleted.")) return;
        try {
            await fetch(`/api/briefs/${id}`, { method: "DELETE" });
            setBriefs((prev) => prev.filter((b) => b.id !== id));
        } catch (err) {
            console.error("Delete error:", err);
        }
    };

    const handleEdit = (brief: CampaignBrief) => {
        setEditingBrief(brief);
        setShowEditor(true);
    };

    const handleCreate = () => {
        setEditingBrief(null);
        setShowEditor(true);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600">
                            <Briefcase className="w-7 h-7 text-white" />
                        </div>
                        Campaigns
                    </h1>
                    <p className="text-gray-400 mt-1">
                        Configure campaign briefs with requirements, disclosures, and auto-descriptions
                    </p>
                </div>
                <button
                    onClick={handleCreate}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-amber-500/20"
                >
                    <Plus className="w-5 h-5" />
                    New Campaign
                </button>
            </div>

            {/* Campaign List */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                </div>
            ) : briefs.length === 0 ? (
                <div className="text-center py-16 bg-gray-900/40 rounded-2xl border border-gray-800/50">
                    <Briefcase className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400">No campaigns yet</p>
                    <p className="text-gray-500 text-sm mt-1">
                        Create your first campaign brief to define requirements for your clips
                    </p>
                    <button
                        onClick={handleCreate}
                        className="mt-4 text-sm text-amber-400 hover:text-amber-300"
                    >
                        + Create Campaign
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {briefs.map((brief) => (
                        <div
                            key={brief.id}
                            className="bg-gray-900/60 backdrop-blur border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors"
                        >
                            {/* Campaign Header */}
                            <div
                                className="p-4 cursor-pointer"
                                onClick={() => setExpandedId(expandedId === brief.id ? null : brief.id)}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="flex-shrink-0">
                                            {expandedId === brief.id ? (
                                                <ChevronDown className="w-5 h-5 text-gray-400" />
                                            ) : (
                                                <ChevronRight className="w-5 h-5 text-gray-400" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-white font-semibold text-lg truncate">{brief.name}</h3>
                                                <StatusBadge status={brief.status} />
                                            </div>
                                            {brief.brand && (
                                                <p className="text-gray-500 text-xs mt-0.5">{brief.brand}</p>
                                            )}
                                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                                <PlatformBadges platforms={brief.targetPlatforms} />
                                                <span className="flex items-center gap-1">
                                                    <Film className="w-3 h-3" />
                                                    {brief._count.clipProjects} projects
                                                </span>
                                                {brief.cpmRate && (
                                                    <span className="flex items-center gap-1 text-emerald-400">
                                                        <DollarSign className="w-3 h-3" />
                                                        ${brief.cpmRate}/1k
                                                    </span>
                                                )}
                                                {brief.requiredHashtags.length > 0 && (
                                                    <span className="flex items-center gap-1 text-blue-400">
                                                        <Hash className="w-3 h-3" />
                                                        {brief.requiredHashtags.length} required
                                                    </span>
                                                )}
                                                {brief.disclosureRequired && (
                                                    <span className="flex items-center gap-1 text-amber-400">
                                                        <Shield className="w-3 h-3" />
                                                        Disclosure
                                                    </span>
                                                )}
                                                {brief.watermarkRequired && (
                                                    <span className="flex items-center gap-1 text-purple-400">
                                                        <ImageIcon className="w-3 h-3" />
                                                        Watermark
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleEdit(brief); }}
                                            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                                            title="Edit campaign"
                                        >
                                            <Edit3 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(brief.id); }}
                                            className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                            title="Archive campaign"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Expanded Details */}
                            {expandedId === brief.id && (
                                <div className="border-t border-gray-800 p-4 bg-gray-900/30 space-y-4">
                                    {/* Content Sources */}
                                    {brief.contentSourceUrls.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <ExternalLink className="w-3 h-3" /> Content Sources
                                            </h4>
                                            <div className="space-y-1">
                                                {brief.contentSourceUrls.map((url, i) => (
                                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 block truncate">
                                                        {url}
                                                    </a>
                                                ))}
                                            </div>
                                            {brief.contentSourceNotes && (
                                                <p className="text-xs text-gray-500 mt-1 italic">{brief.contentSourceNotes}</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Caption Rules */}
                                    {(brief.captionGuidelines || brief.suggestedCaptions.length > 0) && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <Type className="w-3 h-3" /> Caption Rules
                                            </h4>
                                            {brief.captionGuidelines && (
                                                <p className="text-xs text-gray-300 mb-2">{brief.captionGuidelines}</p>
                                            )}

                                            {brief.suggestedCaptions.length > 0 && (
                                                <div className="space-y-1.5">
                                                    <p className="text-[10px] text-gray-500 uppercase font-medium">Suggested captions:</p>
                                                    {brief.suggestedCaptions.slice(0, 5).map((cap, i) => (
                                                        <div key={i} className="flex items-center gap-2 group">
                                                            <p className="text-xs text-gray-400 flex-1 truncate">&ldquo;{cap}&rdquo;</p>
                                                            <button
                                                                onClick={() => navigator.clipboard.writeText(cap)}
                                                                className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-white transition-all"
                                                            >
                                                                <Copy className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    {brief.suggestedCaptions.length > 5 && (
                                                        <p className="text-[10px] text-gray-600">+{brief.suggestedCaptions.length - 5} more</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Tags & Hashtags */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {(brief.platformTags as PlatformTag[]).length > 0 && (
                                            <div>
                                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                    <AtSign className="w-3 h-3" /> Platform Tags
                                                </h4>
                                                {(brief.platformTags as PlatformTag[]).map((pt, i) => (
                                                    <div key={i} className="text-xs text-gray-300">
                                                        <span className="text-gray-500">{pt.platform}:</span> {pt.tags.join(", ")}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {brief.requiredHashtags.length > 0 && (
                                            <div>
                                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                    <Hash className="w-3 h-3" /> Required Hashtags
                                                </h4>
                                                <div className="flex flex-wrap gap-1">
                                                    {brief.requiredHashtags.map((tag, i) => (
                                                        <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Disclosure */}
                                    {brief.disclosureRequired && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <Shield className="w-3 h-3" /> Disclosure
                                            </h4>
                                            <div className="flex flex-wrap gap-1 mb-1">
                                                {brief.disclosureOptions.map((opt, i) => (
                                                    <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
                                                        {opt}
                                                    </span>
                                                ))}
                                            </div>
                                            {brief.disclosurePlacement && (
                                                <p className="text-[10px] text-gray-500 italic">{brief.disclosurePlacement}</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Video Settings */}
                                    {(brief.minLengthSec || brief.maxLengthSec || brief.formatNotes) && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <Clock className="w-3 h-3" /> Video Settings
                                            </h4>
                                            <div className="flex flex-wrap gap-3 text-xs text-gray-300">
                                                {brief.minLengthSec && <span>Min: {brief.minLengthSec}s</span>}
                                                {brief.maxLengthSec && <span>Max: {brief.maxLengthSec}s</span>}
                                                {brief.formatNotes && <span className="text-gray-500">{brief.formatNotes}</span>}
                                            </div>
                                        </div>
                                    )}

                                    {/* Requirements & Restrictions */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {brief.requirements.length > 0 && (
                                            <div>
                                                <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                    <CheckCircle2 className="w-3 h-3" /> Requirements ({brief.requirements.length})
                                                </h4>
                                                <ul className="space-y-1">
                                                    {brief.requirements.map((req, i) => (
                                                        <li key={i} className="text-[10px] text-gray-400 flex items-start gap-1.5">
                                                            <span className="text-emerald-500 mt-0.5">✓</span>
                                                            {req}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {brief.notAllowed.length > 0 && (
                                            <div>
                                                <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                    <Ban className="w-3 h-3" /> Not Allowed ({brief.notAllowed.length})
                                                </h4>
                                                <ul className="space-y-1">
                                                    {brief.notAllowed.map((item, i) => (
                                                        <li key={i} className="text-[10px] text-gray-400 flex items-start gap-1.5">
                                                            <span className="text-red-500 mt-0.5">✗</span>
                                                            {item}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>

                                    {/* On-Screen Text */}
                                    {(brief.onScreenTextNotes || brief.onScreenSuggestions.length > 0) && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <Type className="w-3 h-3" /> On-Screen Text
                                            </h4>
                                            {brief.onScreenTextNotes && (
                                                <p className="text-xs text-gray-300 mb-2 italic">{brief.onScreenTextNotes}</p>
                                            )}
                                            {brief.onScreenSuggestions.length > 0 && (
                                                <div className="space-y-1.5">
                                                    <p className="text-[10px] text-gray-500 uppercase font-medium">Suggested on-screen text:</p>
                                                    {brief.onScreenSuggestions.map((text, i) => (
                                                        <div key={i} className="flex items-center gap-2 group">
                                                            <p className="text-xs text-gray-400 flex-1 truncate">&ldquo;{text}&rdquo;</p>
                                                            <button
                                                                onClick={() => navigator.clipboard.writeText(text)}
                                                                className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-white transition-all"
                                                            >
                                                                <Copy className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Campaign Editor Modal */}
            {showEditor && (
                <CampaignEditorModal
                    brief={editingBrief}
                    onClose={() => { setShowEditor(false); setEditingBrief(null); }}
                    onSaved={() => { setShowEditor(false); setEditingBrief(null); fetchBriefs(); }}
                />
            )}
        </div>
    );
}

// ─── Campaign Editor Modal ───────────────────────────────

function CampaignEditorModal({
    brief,
    onClose,
    onSaved,
}: {
    brief: CampaignBrief | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const isEditing = !!brief;
    const [saving, setSaving] = useState(false);

    // Basic
    const [name, setName] = useState(brief?.name || "");
    const [brand, setBrand] = useState(brief?.brand || "");
    const [status, setStatus] = useState(brief?.status || "active");

    // Content Source
    const [contentSourceUrls, setContentSourceUrls] = useState<string[]>(brief?.contentSourceUrls || [""]);
    const [contentSourceNotes, setContentSourceNotes] = useState(brief?.contentSourceNotes || "");

    // Platforms
    const [platforms, setPlatforms] = useState<string[]>(brief?.targetPlatforms || []);

    // Caption
    const [captionGuidelines, setCaptionGuidelines] = useState(brief?.captionGuidelines || "");
    const [suggestedCaptions, setSuggestedCaptions] = useState<string[]>(brief?.suggestedCaptions || [""]);


    // Tags
    const [platformTags, setPlatformTags] = useState<PlatformTag[]>(
        (brief?.platformTags as PlatformTag[]) || []
    );
    const [requiredHashtags, setRequiredHashtags] = useState<string[]>(brief?.requiredHashtags || [""]);
    const [optionalHashtags, setOptionalHashtags] = useState<string[]>(brief?.optionalHashtags || []);

    // Disclosure
    const [disclosureRequired, setDisclosureRequired] = useState(brief?.disclosureRequired || false);
    const [disclosureOptions, setDisclosureOptions] = useState<string[]>(brief?.disclosureOptions || [""]);
    const [disclosurePlacement, setDisclosurePlacement] = useState(brief?.disclosurePlacement || "");

    // Video
    const [formatNotes, setFormatNotes] = useState(brief?.formatNotes || "");
    const [minLengthSec, setMinLengthSec] = useState(brief?.minLengthSec?.toString() || "");
    const [maxLengthSec, setMaxLengthSec] = useState(brief?.maxLengthSec?.toString() || "");

    // Watermark
    const [watermarkRequired, setWatermarkRequired] = useState(brief?.watermarkRequired || false);
    const [watermarkUrl, setWatermarkUrl] = useState(brief?.watermarkUrl || "");
    const [watermarkNotes, setWatermarkNotes] = useState(brief?.watermarkNotes || "");

    // Monetization
    const [cpmRate, setCpmRate] = useState(brief?.cpmRate?.toString() || "");
    const [engagementRateMin, setEngagementRateMin] = useState(brief?.engagementRateMin?.toString() || "");
    const [minPostDays, setMinPostDays] = useState(brief?.minPostDays?.toString() || "");

    // Req / Not Allowed
    const [requirements, setRequirements] = useState<string[]>(brief?.requirements || [""]);
    const [notAllowed, setNotAllowed] = useState<string[]>(brief?.notAllowed || [""]);

    // On-Screen Text
    const [onScreenTextNotes, setOnScreenTextNotes] = useState(brief?.onScreenTextNotes || "");
    const [onScreenSuggestions, setOnScreenSuggestions] = useState<string[]>(brief?.onScreenSuggestions || [""]);


    // Section toggles
    const [openSections, setOpenSections] = useState<Set<string>>(new Set(["basic", "caption", "tags"]));
    const toggleSection = (s: string) => setOpenSections((prev) => {
        const next = new Set(prev);
        if (next.has(s)) next.delete(s); else next.add(s);
        return next;
    });

    const cleanArray = (arr: string[]) => arr.filter((s) => s.trim().length > 0);

    const handleSave = async () => {
        if (!name.trim()) return alert("Campaign name is required");
        setSaving(true);

        const payload = {
            name: name.trim(),
            brand: brand.trim() || null,
            status,
            contentSourceUrls: cleanArray(contentSourceUrls),
            contentSourceNotes: contentSourceNotes.trim() || null,
            targetPlatforms: platforms,
            captionGuidelines: captionGuidelines.trim() || null,
            suggestedCaptions: cleanArray(suggestedCaptions),

            platformTags: platformTags.filter((pt) => pt.tags.some((t) => t.trim().length > 0)),
            requiredHashtags: cleanArray(requiredHashtags),
            optionalHashtags: cleanArray(optionalHashtags),
            disclosureRequired,
            disclosureOptions: cleanArray(disclosureOptions),
            disclosurePlacement: disclosurePlacement.trim() || null,
            formatNotes: formatNotes.trim() || null,
            minLengthSec: minLengthSec ? parseInt(minLengthSec) : null,
            maxLengthSec: maxLengthSec ? parseInt(maxLengthSec) : null,
            watermarkRequired,
            watermarkUrl: watermarkUrl.trim() || null,
            watermarkNotes: watermarkNotes.trim() || null,
            cpmRate: cpmRate ? parseFloat(cpmRate) : null,
            engagementRateMin: engagementRateMin ? parseFloat(engagementRateMin) : null,
            minPostDays: minPostDays ? parseInt(minPostDays) : null,
            requirements: cleanArray(requirements),
            notAllowed: cleanArray(notAllowed),
            onScreenTextNotes: onScreenTextNotes.trim() || null,
            onScreenSuggestions: cleanArray(onScreenSuggestions),
        };

        try {
            const url = isEditing ? `/api/briefs/${brief!.id}` : "/api/briefs";
            const method = isEditing ? "PATCH" : "POST";
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                onSaved();
            } else {
                const err = await res.json();
                alert(err.error || "Failed to save campaign");
            }
        } catch (err) {
            console.error("Save error:", err);
        } finally {
            setSaving(false);
        }
    };

    // Dynamic list helpers
    const updateListItem = (setter: (fn: (prev: string[]) => string[]) => void, index: number, value: string) => {
        setter((prev) => prev.map((item, i) => i === index ? value : item));
    };
    const addListItem = (setter: (fn: (prev: string[]) => string[]) => void) => {
        setter((prev) => [...prev, ""]);
    };
    const removeListItem = (setter: (fn: (prev: string[]) => string[]) => void, index: number) => {
        setter((prev) => prev.filter((_, i) => i !== index));
    };

    const renderSection = (
        id: string,
        title: string,
        icon: React.ReactNode,
        children: React.ReactNode
    ) => (
        <div className="border-b border-gray-800/50 last:border-0">
            <button
                onClick={() => toggleSection(id)}
                className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-gray-300 hover:text-white transition-colors"
            >
                <span className="flex items-center gap-2">{icon}{title}</span>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${openSections.has(id) ? "rotate-180" : ""}`} />
            </button>
            {openSections.has(id) && (
                <div className="px-5 pb-4 space-y-3">{children}</div>
            )}
        </div>
    );

    const inputClass = "w-full bg-gray-800/80 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-amber-500 focus:outline-none";
    const labelClass = "block text-xs text-gray-400 mb-1 font-medium";

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start justify-center pt-6 overflow-y-auto">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl mx-4 mb-8 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                    <h2 className="text-lg font-bold text-white">
                        {isEditing ? "Edit Campaign Brief" : "New Campaign Brief"}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Sections */}
                <div className="max-h-[70vh] overflow-y-auto">
                    {/* Basic Info */}
                    {renderSection("basic", "Name & Brand", <Briefcase className="w-4 h-4 text-amber-400" />, (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelClass}>Campaign Name *</label>
                                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Call of Duty BO7" className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Brand</label>
                                    <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Call of Duty" className={inputClass} />
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>Status</label>
                                <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
                                    <option value="active">Active</option>
                                    <option value="paused">Paused</option>
                                    <option value="completed">Completed</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Target Platforms</label>
                                <div className="flex gap-3">
                                    {PLATFORMS.map((p) => (
                                        <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={platforms.includes(p.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setPlatforms([...platforms, p.id]);
                                                    else setPlatforms(platforms.filter((x) => x !== p.id));
                                                }}
                                                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-amber-500 focus:ring-amber-500"
                                            />
                                            <span className={`text-sm ${p.color}`}>{p.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </>
                    ))}

                    {/* Content Source */}
                    {renderSection("content", "Content Sources", <ExternalLink className="w-4 h-4 text-blue-400" />, (
                        <>
                            {contentSourceUrls.map((url, i) => (
                                <div key={i} className="flex gap-2">
                                    <input type="url" value={url} onChange={(e) => updateListItem(setContentSourceUrls, i, e.target.value)} placeholder="https://frame.io/... or Dropbox link" className={`${inputClass} flex-1`} />
                                    {contentSourceUrls.length > 1 && (
                                        <button onClick={() => removeListItem(setContentSourceUrls, i)} className="text-gray-500 hover:text-red-400"><X className="w-4 h-4" /></button>
                                    )}
                                </div>
                            ))}
                            <button onClick={() => addListItem(setContentSourceUrls)} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
                                <Plus className="w-3 h-3" /> Add URL
                            </button>
                            <div>
                                <label className={labelClass}>Notes</label>
                                <input type="text" value={contentSourceNotes} onChange={(e) => setContentSourceNotes(e.target.value)} placeholder="e.g. Use official assets only" className={inputClass} />
                            </div>
                        </>
                    ))}

                    {/* Caption Rules */}
                    {renderSection("caption", "Caption & Description", <Type className="w-4 h-4 text-violet-400" />, (
                        <>
                            <div>
                                <label className={labelClass}>Caption Guidelines</label>
                                <textarea value={captionGuidelines} onChange={(e) => setCaptionGuidelines(e.target.value)} placeholder="Free-text guidance about what captions should say..." className={`${inputClass} min-h-[60px] resize-y`} />
                            </div>

                            <div>
                                <label className={labelClass}>Suggested Captions</label>
                                {suggestedCaptions.map((cap, i) => (
                                    <div key={i} className="flex gap-2 mb-1">
                                        <input type="text" value={cap} onChange={(e) => updateListItem(setSuggestedCaptions, i, e.target.value)} placeholder="Enter a suggested caption..." className={`${inputClass} flex-1`} />
                                        {suggestedCaptions.length > 1 && (
                                            <button onClick={() => removeListItem(setSuggestedCaptions, i)} className="text-gray-500 hover:text-red-400"><X className="w-4 h-4" /></button>
                                        )}
                                    </div>
                                ))}
                                <button onClick={() => addListItem(setSuggestedCaptions)} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
                                    <Plus className="w-3 h-3" /> Add caption
                                </button>
                            </div>
                        </>
                    ))}

                    {/* Tags & Hashtags */}
                    {renderSection("tags", "Tags & Hashtags", <Hash className="w-4 h-4 text-blue-400" />, (
                        <>
                            <div>
                                <label className={labelClass}>Platform @Tags</label>
                                {platforms.map((plat) => {
                                    const existing = platformTags.find((pt) => pt.platform === plat);
                                    return (
                                        <div key={plat} className="flex items-center gap-2 mb-1">
                                            <span className="text-xs text-gray-500 w-20">{plat}:</span>
                                            <input
                                                type="text"
                                                value={existing?.tags.join(", ") || ""}
                                                onChange={(e) => {
                                                    const tags = e.target.value.split(",").map((t) => t.trim()).filter(Boolean);
                                                    setPlatformTags((prev) => {
                                                        const idx = prev.findIndex((pt) => pt.platform === plat);
                                                        if (idx >= 0) {
                                                            const next = [...prev];
                                                            next[idx] = { platform: plat, tags };
                                                            return next;
                                                        }
                                                        return [...prev, { platform: plat, tags }];
                                                    });
                                                }}
                                                placeholder="@handle1, @handle2"
                                                className={`${inputClass} flex-1`}
                                            />
                                        </div>
                                    );
                                })}
                                {platforms.length === 0 && <p className="text-xs text-gray-600">Select platforms first</p>}
                            </div>
                            <div>
                                <label className={labelClass}>Required Hashtags</label>
                                {requiredHashtags.map((tag, i) => (
                                    <div key={i} className="flex gap-2 mb-1">
                                        <input type="text" value={tag} onChange={(e) => updateListItem(setRequiredHashtags, i, e.target.value)} placeholder="#arenazero" className={`${inputClass} flex-1`} />
                                        {requiredHashtags.length > 1 && (
                                            <button onClick={() => removeListItem(setRequiredHashtags, i)} className="text-gray-500 hover:text-red-400"><X className="w-4 h-4" /></button>
                                        )}
                                    </div>
                                ))}
                                <button onClick={() => addListItem(setRequiredHashtags)} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
                                    <Plus className="w-3 h-3" /> Add hashtag
                                </button>
                            </div>
                        </>
                    ))}

                    {/* Disclosure */}
                    {renderSection("disclosure", "Disclosure / FTC", <Shield className="w-4 h-4 text-amber-400" />, (
                        <>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={disclosureRequired} onChange={(e) => setDisclosureRequired(e.target.checked)} className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-amber-500 focus:ring-amber-500" />
                                <span className="text-sm text-gray-300">Disclosure Required</span>
                            </label>
                            {disclosureRequired && (
                                <>
                                    <div>
                                        <label className={labelClass}>Disclosure Options</label>
                                        {disclosureOptions.map((opt, i) => (
                                            <div key={i} className="flex gap-2 mb-1">
                                                <input type="text" value={opt} onChange={(e) => updateListItem(setDisclosureOptions, i, e.target.value)} placeholder="#Ad or #Sponsored" className={`${inputClass} flex-1`} />
                                                {disclosureOptions.length > 1 && (
                                                    <button onClick={() => removeListItem(setDisclosureOptions, i)} className="text-gray-500 hover:text-red-400"><X className="w-4 h-4" /></button>
                                                )}
                                            </div>
                                        ))}
                                        <button onClick={() => addListItem(setDisclosureOptions)} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
                                            <Plus className="w-3 h-3" /> Add option
                                        </button>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Placement Rules</label>
                                        <textarea value={disclosurePlacement} onChange={(e) => setDisclosurePlacement(e.target.value)} placeholder="e.g. Must be on its own line, first hashtag after caption text" className={`${inputClass} min-h-[40px] resize-y`} />
                                    </div>
                                </>
                            )}
                        </>
                    ))}

                    {/* Video Settings */}
                    {renderSection("video", "Video Settings", <Film className="w-4 h-4 text-emerald-400" />, (
                        <>
                            <div>
                                <label className={labelClass}>Format Notes</label>
                                <input type="text" value={formatNotes} onChange={(e) => setFormatNotes(e.target.value)} placeholder="e.g. Voiceover narration style" className={inputClass} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelClass}>Min Length (seconds)</label>
                                    <input type="number" value={minLengthSec} onChange={(e) => setMinLengthSec(e.target.value)} placeholder="60" className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Max Length (seconds)</label>
                                    <input type="number" value={maxLengthSec} onChange={(e) => setMaxLengthSec(e.target.value)} placeholder="180" className={inputClass} />
                                </div>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={watermarkRequired} onChange={(e) => setWatermarkRequired(e.target.checked)} className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-amber-500 focus:ring-amber-500" />
                                <span className="text-sm text-gray-300">Watermark Required</span>
                            </label>
                            {watermarkRequired && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={labelClass}>Watermark URL (PNG)</label>
                                        <input type="url" value={watermarkUrl} onChange={(e) => setWatermarkUrl(e.target.value)} placeholder="https://..." className={inputClass} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Watermark Notes</label>
                                        <input type="text" value={watermarkNotes} onChange={(e) => setWatermarkNotes(e.target.value)} placeholder="e.g. ¼ screen, top-right" className={inputClass} />
                                    </div>
                                </div>
                            )}
                        </>
                    ))}

                    {/* Monetization */}
                    {renderSection("money", "Monetization", <DollarSign className="w-4 h-4 text-emerald-400" />, (
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className={labelClass}>CPM Rate ($/1k views)</label>
                                <input type="number" step="0.01" value={cpmRate} onChange={(e) => setCpmRate(e.target.value)} placeholder="1.50" className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Min Engagement (%)</label>
                                <input type="number" step="0.01" value={engagementRateMin} onChange={(e) => setEngagementRateMin(e.target.value)} placeholder="0.20" className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Min Post Days</label>
                                <input type="number" value={minPostDays} onChange={(e) => setMinPostDays(e.target.value)} placeholder="30" className={inputClass} />
                            </div>
                        </div>
                    ))}

                    {/* Requirements */}
                    {renderSection("requirements", "Requirements", <CheckCircle2 className="w-4 h-4 text-emerald-400" />, (
                        <>
                            {requirements.map((req, i) => (
                                <div key={i} className="flex gap-2">
                                    <input type="text" value={req} onChange={(e) => updateListItem(setRequirements, i, e.target.value)} placeholder="Enter a requirement..." className={`${inputClass} flex-1`} />
                                    {requirements.length > 1 && (
                                        <button onClick={() => removeListItem(setRequirements, i)} className="text-gray-500 hover:text-red-400"><X className="w-4 h-4" /></button>
                                    )}
                                </div>
                            ))}
                            <button onClick={() => addListItem(setRequirements)} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
                                <Plus className="w-3 h-3" /> Add requirement
                            </button>
                        </>
                    ))}

                    {/* Not Allowed */}
                    {renderSection("notallowed", "Not Allowed", <Ban className="w-4 h-4 text-red-400" />, (
                        <>
                            {notAllowed.map((item, i) => (
                                <div key={i} className="flex gap-2">
                                    <input type="text" value={item} onChange={(e) => updateListItem(setNotAllowed, i, e.target.value)} placeholder="Enter a restriction..." className={`${inputClass} flex-1`} />
                                    {notAllowed.length > 1 && (
                                        <button onClick={() => removeListItem(setNotAllowed, i)} className="text-gray-500 hover:text-red-400"><X className="w-4 h-4" /></button>
                                    )}
                                </div>
                            ))}
                            <button onClick={() => addListItem(setNotAllowed)} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
                                <Plus className="w-3 h-3" /> Add restriction
                            </button>
                        </>
                    ))}

                    {/* On-Screen Text */}
                    {renderSection("onscreen", "On-Screen Text", <Type className="w-4 h-4 text-pink-400" />, (
                        <>
                            <div>
                                <label className={labelClass}>On-Screen Text Notes</label>
                                <textarea value={onScreenTextNotes} onChange={(e) => setOnScreenTextNotes(e.target.value)} placeholder='e.g. "Flexible — can reinforce gameplay moments or mode name"' className={`${inputClass} min-h-[60px] resize-y`} />
                            </div>
                            <div>
                                <label className={labelClass}>Suggested On-Screen Text</label>
                                {onScreenSuggestions.map((text, i) => (
                                    <div key={i} className="flex gap-2 mb-1">
                                        <input type="text" value={text} onChange={(e) => updateListItem(setOnScreenSuggestions, i, e.target.value)} placeholder="Enter suggested on-screen text..." className={`${inputClass} flex-1`} />
                                        {onScreenSuggestions.length > 1 && (
                                            <button onClick={() => removeListItem(setOnScreenSuggestions, i)} className="text-gray-500 hover:text-red-400"><X className="w-4 h-4" /></button>
                                        )}
                                    </div>
                                ))}
                                <button onClick={() => addListItem(setOnScreenSuggestions)} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
                                    <Plus className="w-3 h-3" /> Add text
                                </button>
                            </div>
                        </>
                    ))}
                </div>

                {/* Footer */}
                <div className="flex gap-2 px-5 py-4 border-t border-gray-800">
                    <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-800 hover:bg-gray-700 text-white transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!name.trim() || saving}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        {isEditing ? "Save Changes" : "Create Campaign"}
                    </button>
                </div>
            </div>
        </div>
    );
}
