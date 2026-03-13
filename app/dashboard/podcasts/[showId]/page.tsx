"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Radio,
  Plus,
  Trash2,
  Edit3,
  Users,
  Mic,
  Loader2,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  Link2,
  Search,
  MessageSquare,
  X,
  Check,
  FileText,
  Save,
  Sparkles,
  Zap,
  Eye,
  Brain,
  Cpu,
  Volume2,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Segment = {
  id: string;
  order: number;
  type: string;
  durationMin: number;
  topicTitle: string | null;
  topicContent: string | null;
  sourceUrls: string[];
  sourceMode: string;
  sponsorId: string | null;
};

type Character = {
  id: string;
  name: string;
  role: string;
  archetype: string;
  avatarUrl: string | null;
  voiceId: string | null;
};

type Episode = {
  id: string;
  episodeNumber: number;
  title: string | null;
  durationMin: number;
  status: string;
  segments: Segment[];
  participants: { character: Character }[];
  createdAt: string;
};

type Show = {
  id: string;
  name: string;
  description: string | null;
  showFormat: string;
  contentFilter: string;
  defaultDurationMin: number;
  coverArtUrl: string | null;
  jingleUrl: string | null;
  jinglePrompt: string | null;
  language: string;
  hosts: { character: Character }[];
  defaultGuests: { character: Character }[];
  _count: { episodes: number };
};

type Sponsor = {
  id: string;
  brandName: string;
  promoCode: string | null;
  adStyle: string;
  active: boolean;
};

const SHOW_FORMATS = [
  { id: "SOLO", name: "Solo Host", icon: "🎙️" },
  { id: "TWO_HOST", name: "Two Hosts", icon: "🎙️🎙️" },
  { id: "HOST_PLUS_GUESTS", name: "Host + Guests", icon: "🎙️🗣️" },
  { id: "ROUNDTABLE", name: "Roundtable", icon: "🔄" },
];

const CONTENT_FILTERS = [
  { id: "UNHINGED", name: "Unhinged", color: "red" },
  { id: "MODERATE", name: "Moderate", color: "amber" },
  { id: "FAMILY_FRIENDLY", name: "Family Friendly", color: "emerald" },
];

const DURATIONS = [15, 30, 45, 60];

const SEGMENT_TYPE_INFO: Record<string, { icon: string; label: string }> = {
  INTRO: { icon: "🎬", label: "Intro" },
  TOPIC: { icon: "💬", label: "Topic" },
  AD_BREAK: { icon: "📢", label: "Ad Break" },
  OUTRO: { icon: "👋", label: "Outro" },
};

const SOURCE_MODES = [
  { id: "URLS", label: "Paste URLs" },
  { id: "AUTO_RESEARCH", label: "Auto-Research" },
  { id: "MANUAL_PREMISE", label: "Manual Premise" },
];

export default function ShowDetailPage() {
  const params = useParams();
  const showId = params.showId as string;

  const [show, setShow] = useState<Show | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [allCharacters, setAllCharacters] = useState<Character[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"episodes" | "settings">("episodes");
  const [llmProvider, setLlmProvider] = useState<"mistral" | "deepseek">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("podcast_llm_provider") as any) || "mistral";
    }
    return "mistral";
  });

  // Sync provider toggle to localStorage
  useEffect(() => {
    localStorage.setItem("podcast_llm_provider", llmProvider);
  }, [llmProvider]);
  const [episodeModal, setEpisodeModal] = useState<{
    open: boolean;
    editEpisode?: Episode;
  }>({ open: false });

  const loadAll = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/podcast/shows`).then((r) => r.json()),
      fetch(`/api/podcast/episodes?showId=${showId}`).then((r) => r.json()),
      fetch(`/api/podcast/characters`).then((r) => r.json()),
      fetch(`/api/podcast/sponsors`).then((r) => r.json()),
    ])
      .then(([shows, eps, chars, spons]) => {
        const s = (Array.isArray(shows) ? shows : []).find(
          (s: Show) => s.id === showId
        );
        setShow(s || null);
        setEpisodes(Array.isArray(eps) ? eps : []);
        setAllCharacters(Array.isArray(chars) ? chars : []);
        setSponsors(Array.isArray(spons) ? spons : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [showId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const saveEpisode = async (data: {
    title: string;
    durationMin: number;
    participantIds: string[];
    segments: any[];
    editId?: string;
  }) => {
    if (data.editId) {
      // Update existing episode title/duration
      await fetch(`/api/podcast/episodes?id=${data.editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.title || undefined,
          durationMin: data.durationMin,
        }),
      });
      // Update each segment
      for (const seg of data.segments) {
        if (seg.id) {
          await fetch(`/api/podcast/segments?id=${seg.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: seg.type,
              durationMin: seg.durationMin,
              topicTitle: seg.topicTitle || null,
              topicContent: seg.topicContent || null,
              sourceUrls: seg.sourceUrls?.filter((u: string) => u.trim()) || [],
              sourceMode: seg.sourceMode,
              sponsorId: seg.sponsorId || null,
            }),
          });
        }
      }
    } else {
      // Create new
      await fetch("/api/podcast/episodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showId, ...data }),
      });
    }
    setEpisodeModal({ open: false });
    loadAll();
  };

  const deleteEpisode = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    await fetch(`/api/podcast/episodes?id=${id}`, { method: "DELETE" });
    setEpisodes(episodes.filter((e) => e.id !== id));
  };

  const generateScript = async (id: string) => {
    const res = await fetch("/api/podcast/scripts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeId: id, provider: llmProvider }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.dispatched) {
        alert("Script generation dispatched to Mistral on RunPod. It will appear when ready.");
      }
      loadAll();
    } else {
      const err = await res.json();
      alert(`Script generation failed: ${err.error}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
      </div>
    );
  }

  if (!show) {
    return (
      <div className="text-center py-20 text-gray-500">
        Show not found.{" "}
        <Link
          href="/dashboard/podcasts"
          className="text-violet-400 hover:underline"
        >
          Go back
        </Link>
      </div>
    );
  }

  const hostChars = show.hosts.map((h) => h.character);
  const guestChars = show.defaultGuests.map((g) => g.character);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/podcasts"
          className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Radio className="w-6 h-6 text-violet-400" />
            {show.name}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {show.showFormat.replace(/_/g, " ")} •{" "}
            {show.defaultDurationMin} min • {show._count.episodes} episodes
          </p>
        </div>
        <button
          onClick={() => setEpisodeModal({ open: true })}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-all"
        >
          <Plus className="w-4 h-4" />
          New Episode
        </button>
      </div>

      {/* LLM Provider Toggle */}
      <div className="flex items-center gap-3 bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-2.5">
        <span className="text-xs text-gray-500 uppercase tracking-wider">AI Engine</span>
        <div className="flex items-center bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => setLlmProvider("mistral")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              llmProvider === "mistral"
                ? "bg-violet-600 text-white shadow-lg"
                : "text-gray-400 hover:text-white"
            )}
          >
            <Brain className="w-3.5 h-3.5" />
            Mistral (RunPod)
          </button>
          <button
            onClick={() => setLlmProvider("deepseek")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              llmProvider === "deepseek"
                ? "bg-emerald-600 text-white shadow-lg"
                : "text-gray-400 hover:text-white"
            )}
          >
            <Cpu className="w-3.5 h-3.5" />
            DeepSeek (API)
          </button>
        </div>
        <span className="text-[10px] text-gray-600">
          {llmProvider === "mistral" ? "Self-hosted • Brave Search" : "Cloud API • Fallback"}
        </span>
      </div>

      {/* Cast */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">
          Cast
        </h3>
        <div className="flex items-center gap-3 flex-wrap">
          {hostChars.map((c) => (
            <CharacterBadge key={c.id} character={c} role="Host" />
          ))}
          {guestChars.map((c) => (
            <CharacterBadge key={c.id} character={c} role="Guest" />
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 pb-0">
        <button
          onClick={() => setTab("episodes")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-[1px] transition-colors",
            tab === "episodes"
              ? "border-violet-500 text-violet-400"
              : "border-transparent text-gray-500 hover:text-gray-300"
          )}
        >
          Episodes ({episodes.length})
        </button>
        <button
          onClick={() => setTab("settings")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-[1px] transition-colors",
            tab === "settings"
              ? "border-violet-500 text-violet-400"
              : "border-transparent text-gray-500 hover:text-gray-300"
          )}
        >
          Settings
        </button>
      </div>

      {/* Episodes List */}
      {tab === "episodes" && (
        <div className="space-y-3">
          {episodes.length === 0 ? (
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center">
              <FileText className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <h3 className="text-white font-semibold mb-1">No episodes yet</h3>
              <p className="text-gray-500 text-sm mb-4">
                Create your first episode — set topics, add guests, assign
                sponsors
              </p>
              <button
                onClick={() => setEpisodeModal({ open: true })}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm bg-violet-600 hover:bg-violet-500 text-white"
              >
                <Plus className="w-4 h-4" /> Create Episode
              </button>
            </div>
          ) : (
            episodes.map((ep) => (
              <EpisodeCard
                key={ep.id}
                episode={ep}
                showId={show.id}
                onEdit={() => setEpisodeModal({ open: true, editEpisode: ep })}
                onDelete={() =>
                  deleteEpisode(
                    ep.id,
                    ep.title || `Ep ${ep.episodeNumber}`
                  )
                }
                onGenerateScript={() => generateScript(ep.id)}
              />
            ))
          )}
        </div>
      )}

      {/* Settings — now editable */}
      {tab === "settings" && (
        <ShowSettingsEditor
          show={show}
          allCharacters={allCharacters}
          onSaved={loadAll}
        />
      )}

      {/* Episode Modal (create + edit) */}
      {episodeModal.open && (
        <EpisodeModal
          show={show}
          allCharacters={allCharacters}
          sponsors={sponsors}
          editEpisode={episodeModal.editEpisode}
          onClose={() => setEpisodeModal({ open: false })}
          onSave={saveEpisode}
        />
      )}
    </div>
  );
}

// ─── Character Badge ────────────────────────────────────

function CharacterBadge({
  character,
  role,
}: {
  character: Character;
  role: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-gray-800/50 rounded-full px-3 py-1.5 border border-gray-700">
      {character.avatarUrl ? (
        <img src={character.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
      ) : (
        <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs">
          {role === "Host" ? "🎙️" : "🗣️"}
        </div>
      )}
      <span className="text-xs font-medium text-white">{character.name}</span>
      <span className="text-[9px] uppercase text-gray-500 tracking-wider">
        {role}
      </span>
    </div>
  );
}

// ─── Episode Card (with Edit button) ────────────────────

function EpisodeCard({
  episode,
  showId,
  onEdit,
  onDelete,
  onGenerateScript,
}: {
  episode: Episode;
  showId: string;
  onEdit: () => void;
  onDelete: () => void;
  onGenerateScript: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [scriptData, setScriptData] = useState<any>(null);
  const [loadingScript, setLoadingScript] = useState(false);

  const statusColors: Record<string, string> = {
    DRAFT: "bg-gray-500/20 text-gray-400",
    SCRIPTING: "bg-blue-500/20 text-blue-400",
    RECORDING: "bg-violet-500/20 text-violet-400",
    ASSEMBLING: "bg-amber-500/20 text-amber-400",
    READY: "bg-emerald-500/20 text-emerald-400",
    APPROVED: "bg-green-500/20 text-green-400",
    PUBLISHED: "bg-green-600/20 text-green-300",
    REJECTED: "bg-red-500/20 text-red-400",
    FAILED_PODCAST: "bg-red-500/20 text-red-400",
  };

  const topicSegments = episode.segments.filter((s) => s.type === "TOPIC");
  const canGenerate = episode.status === "DRAFT" && topicSegments.length > 0;
  const hasScript = episode.status !== "DRAFT";

  const handleGenerate = async () => {
    setGenerating(true);
    await onGenerateScript();
    setGenerating(false);
  };

  const toggleScript = async () => {
    if (scriptOpen) {
      setScriptOpen(false);
      return;
    }
    if (!scriptData) {
      setLoadingScript(true);
      try {
        const res = await fetch(`/api/podcast/scripts?episodeId=${episode.id}`);
        if (res.ok) {
          const data = await res.json();
          setScriptData(data.script);
        }
      } catch (err) {
        console.error("Failed to load script", err);
      }
      setLoadingScript(false);
    }
    setScriptOpen(true);
  };

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl hover:border-gray-700 transition-colors group">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-lg font-bold text-violet-400 flex-shrink-0">
            {episode.episodeNumber}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Link href={`/dashboard/podcasts/${showId}/episodes/${episode.id}`}>
                <h3 className="text-sm font-semibold text-white truncate hover:text-violet-400 transition-colors cursor-pointer">
                  {episode.title || `Episode ${episode.episodeNumber}`}
                </h3>
              </Link>
              <span
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-medium",
                  statusColors[episode.status] || statusColors.DRAFT
                )}
              >
                {episode.status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-gray-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {episode.durationMin} min
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" /> {episode.participants.length}{" "}
                speakers
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> {topicSegments.length}{" "}
                topics
              </span>
            </div>
            {topicSegments.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {topicSegments.map((s) => (
                  <span
                    key={s.id}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20"
                  >
                    {s.topicTitle || "Untitled Topic"}
                  </span>
                ))}
              </div>
            )}
            {/* Action buttons */}
            <div className="flex gap-2 mt-3">
              {canGenerate && (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                >
                  {generating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  {generating ? "Generating..." : "Generate Script"}
                </button>
              )}
              {hasScript && (
                <>
                  <button
                    onClick={toggleScript}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors cursor-pointer"
                  >
                    {loadingScript ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : scriptOpen ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <Eye className="w-3 h-3" />
                    )}
                    {scriptOpen ? "Hide Script" : "View Script"}
                  </button>
                  <Link
                    href={`/dashboard/podcasts/${showId}/episodes/${episode.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                  >
                    Open Episode →
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white"
              title="Edit episode"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400"
              title="Delete episode"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Script Viewer Panel */}
      {scriptOpen && scriptData && (
        <div className="border-t border-gray-800 bg-gray-950/50 rounded-b-2xl">
          <div className="p-4 max-h-[500px] overflow-y-auto space-y-1">
            {scriptData.segments?.map((seg: any, si: number) => (
              <div key={si} className="mb-4">
                <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-2 flex items-center gap-2">
                  <span className="h-px flex-1 bg-gray-800" />
                  <span>{seg.type}: {seg.topicTitle || seg.type}</span>
                  <span className="h-px flex-1 bg-gray-800" />
                </div>
                {seg.lines?.map((line: any, li: number) => (
                  <div
                    key={li}
                    className="flex gap-3 py-1.5 hover:bg-gray-800/30 rounded-lg px-2 -mx-2 transition-colors"
                  >
                    <span className="text-[11px] font-semibold text-violet-400 whitespace-nowrap min-w-[100px]">
                      {line.speaker || line.characterName}:
                    </span>
                    <span className="text-[12px] text-gray-300 leading-relaxed">
                      {line.text || line.dialogue}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {!scriptData.segments && (
              <pre className="text-[11px] text-gray-400 whitespace-pre-wrap">
                {JSON.stringify(scriptData, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Show Settings Editor ───────────────────────────────

function ShowSettingsEditor({
  show,
  allCharacters,
  onSaved,
}: {
  show: Show;
  allCharacters: Character[];
  onSaved: () => void;
}) {
  const [name, setName] = useState(show.name);
  const [description, setDescription] = useState(show.description || "");
  const [showFormat, setShowFormat] = useState(show.showFormat);
  const [contentFilter, setContentFilter] = useState(show.contentFilter);
  const [defaultDurationMin, setDefaultDurationMin] = useState(
    show.defaultDurationMin
  );
  const [hostIds, setHostIds] = useState(
    show.hosts.map((h) => h.character.id)
  );
  const [guestIds, setGuestIds] = useState(
    show.defaultGuests.map((g) => g.character.id)
  );
  const [saving, setSaving] = useState(false);

  // Any character can be a host OR guest — mutual exclusion only
  const availableForHost = allCharacters.filter((c) => !guestIds.includes(c.id));
  const availableForGuest = allCharacters.filter((c) => !hostIds.includes(c.id));

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/podcast/shows?id=${show.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || null,
        showFormat,
        contentFilter,
        defaultDurationMin,
        hostIds,
        defaultGuestIds: guestIds,
      }),
    });
    setSaving(false);
    onSaved();
  };

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Show Settings</h3>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          Save Changes
        </button>
      </div>

      {/* Name */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Show Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Format */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Format</label>
          <div className="grid grid-cols-2 gap-1.5">
            {SHOW_FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setShowFormat(f.id)}
                className={cn(
                  "px-2 py-1.5 rounded-lg text-[10px] border transition-colors text-left",
                  showFormat === f.id
                    ? "bg-violet-500/15 border-violet-500/30 text-violet-400"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                )}
              >
                {f.icon} {f.name}
              </button>
            ))}
          </div>
        </div>

        {/* Content Filter */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">
            Content Filter
          </label>
          <div className="flex gap-1.5">
            {CONTENT_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setContentFilter(f.id)}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-[10px] border text-center transition-colors",
                  contentFilter === f.id
                    ? "bg-violet-500/15 border-violet-500/30 text-violet-400"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                )}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Duration */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">
          Default Duration
        </label>
        <div className="flex gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDefaultDurationMin(d)}
              className={cn(
                "flex-1 py-2 rounded-lg text-xs border text-center transition-colors",
                defaultDurationMin === d
                  ? "bg-violet-500/15 border-violet-500/30 text-violet-400"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
              )}
            >
              {d}m
            </button>
          ))}
        </div>
      </div>

      {/* Hosts — any character can be assigned */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">
          Hosts{" "}
          <span className="text-gray-600">
            — auto-included in every episode
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          {availableForHost.map((c) => (
            <button
              key={c.id}
              onClick={() =>
                setHostIds(
                  hostIds.includes(c.id)
                    ? hostIds.filter((id) => id !== c.id)
                    : [...hostIds, c.id]
                )
              }
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors",
                hostIds.includes(c.id)
                  ? "bg-blue-500/15 border-blue-500/30 text-blue-400"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
              )}
            >
              🎙️ {c.name}{" "}
              {hostIds.includes(c.id) && <Check className="w-3 h-3" />}
            </button>
          ))}
        </div>
      </div>

      {/* Default Guests — excludes anyone already assigned as host */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">
          Default Guests{" "}
          <span className="text-gray-600">— characters not assigned as hosts</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {availableForGuest.map((c) => (
            <button
              key={c.id}
              onClick={() =>
                setGuestIds(
                  guestIds.includes(c.id)
                    ? guestIds.filter((id) => id !== c.id)
                    : [...guestIds, c.id]
                )
              }
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors",
                guestIds.includes(c.id)
                  ? "bg-violet-500/15 border-violet-500/30 text-violet-400"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
              )}
            >
              🗣️ {c.name}{" "}
              {guestIds.includes(c.id) && <Check className="w-3 h-3" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Episode Modal (Create + Edit) ──────────────────────

function EpisodeModal({
  show,
  allCharacters,
  sponsors,
  editEpisode,
  onClose,
  onSave,
}: {
  show: Show;
  allCharacters: Character[];
  sponsors: Sponsor[];
  editEpisode?: Episode;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const isEdit = !!editEpisode;

  const [title, setTitle] = useState(editEpisode?.title || "");
  const [durationMin, setDurationMin] = useState(
    editEpisode?.durationMin || show.defaultDurationMin
  );
  const [selectedGuests, setSelectedGuests] = useState<string[]>(() => {
    if (editEpisode) {
      // For editing: show all non-host participants as selected guests
      const hostCharIds = show.hosts.map((h) => h.character.id);
      return editEpisode.participants
        .map((p) => p.character.id)
        .filter((id) => !hostCharIds.includes(id));
    }
    return show.defaultGuests.map((g) => g.character.id);
  });
  const [segments, setSegments] = useState<
    {
      id?: string;
      type: string;
      durationMin: number;
      topicTitle: string;
      topicContent: string;
      sourceUrls: string[];
      sourceMode: string;
      sponsorId: string;
    }[]
  >(() => {
    if (editEpisode?.segments?.length) {
      return editEpisode.segments.map((s) => ({
        id: s.id,
        type: s.type,
        durationMin: s.durationMin,
        topicTitle: s.topicTitle || "",
        topicContent: s.topicContent || "",
        sourceUrls: s.sourceUrls || [],
        sourceMode: s.sourceMode || "MANUAL_PREMISE",
        sponsorId: s.sponsorId || "",
      }));
    }
    return [
      { type: "INTRO", durationMin: 2, topicTitle: "", topicContent: "", sourceUrls: [], sourceMode: "MANUAL_PREMISE", sponsorId: "" },
      { type: "TOPIC", durationMin: durationMin - 4, topicTitle: "", topicContent: "", sourceUrls: [], sourceMode: "MANUAL_PREMISE", sponsorId: "" },
      { type: "OUTRO", durationMin: 2, topicTitle: "", topicContent: "", sourceUrls: [], sourceMode: "MANUAL_PREMISE", sponsorId: "" },
    ];
  });
  const [saving, setSaving] = useState(false);

  // Host characters are LOCKED IN — they are not selectable as guests
  const hostCharIds = show.hosts.map((h) => h.character.id);
  const hostChars = show.hosts.map((h) => h.character);

  // Only show non-host characters in the guest picker
  const availableGuests = allCharacters.filter(
    (c) => !hostCharIds.includes(c.id)
  );

  const addSegment = (type: string) => {
    const newSeg = {
      type,
      durationMin: type === "AD_BREAK" ? 2 : 10,
      topicTitle: "",
      topicContent: "",
      sourceUrls: [],
      sourceMode: "MANUAL_PREMISE",
      sponsorId: "",
    };
    const outroIndex = segments.findIndex((s) => s.type === "OUTRO");
    if (outroIndex >= 0) {
      const copy = [...segments];
      copy.splice(outroIndex, 0, newSeg);
      setSegments(copy);
    } else {
      setSegments([...segments, newSeg]);
    }
  };

  const removeSegment = (index: number) => {
    setSegments(segments.filter((_, i) => i !== index));
  };

  const updateSegment = (index: number, field: string, value: any) => {
    const copy = [...segments];
    (copy[index] as any)[field] = value;
    setSegments(copy);
  };

  const addSourceUrl = (index: number) => {
    const copy = [...segments];
    copy[index].sourceUrls = [...copy[index].sourceUrls, ""];
    setSegments(copy);
  };

  const updateSourceUrl = (segIndex: number, urlIndex: number, value: string) => {
    const copy = [...segments];
    copy[segIndex].sourceUrls[urlIndex] = value;
    setSegments(copy);
  };

  const removeSourceUrl = (segIndex: number, urlIndex: number) => {
    const copy = [...segments];
    copy[segIndex].sourceUrls = copy[segIndex].sourceUrls.filter(
      (_, i) => i !== urlIndex
    );
    setSegments(copy);
  };

  const handleSave = () => {
    setSaving(true);
    onSave({
      editId: editEpisode?.id,
      title: title || undefined,
      durationMin,
      participantIds: selectedGuests,
      segments: segments.map((s) => ({
        id: s.id,
        type: s.type,
        durationMin: s.durationMin,
        topicTitle: s.topicTitle || null,
        topicContent: s.topicContent || null,
        sourceUrls: s.sourceUrls?.filter((u) => u.trim()) || [],
        sourceMode: s.sourceMode,
        sponsorId: s.sponsorId || null,
      })),
    });
  };

  const totalDuration = segments.reduce((sum, s) => sum + s.durationMin, 0);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? `Edit Episode ${editEpisode.episodeNumber}` : "New Episode"}{" "}
            — {show.name}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Title & Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                Episode Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Optional — auto-generated from topics"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                Target Duration
              </label>
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDurationMin(d)}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-sm border transition-colors",
                      durationMin === d
                        ? "bg-violet-500/15 border-violet-500/30 text-violet-400"
                        : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                    )}
                  >
                    {d}m
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* HOSTS — locked in, not selectable */}
          {hostChars.length > 0 && (
            <div>
              <label className="text-xs text-gray-400 mb-2 block">
                Hosts{" "}
                <span className="text-blue-400/60">
                  — always included (set in show settings)
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                {hostChars.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border bg-blue-500/10 border-blue-500/20 text-blue-400"
                  >
                    🎙️ {c.name}
                    <Mic className="w-3 h-3 text-blue-500/50" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GUESTS — selectable */}
          <div>
            <label className="text-xs text-gray-400 mb-2 block">
              Guests{" "}
              <span className="text-gray-600">— select who to include</span>
            </label>
            {availableGuests.length === 0 ? (
              <p className="text-xs text-gray-600">
                No guest characters available.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableGuests.map((c) => (
                  <button
                    key={c.id}
                    onClick={() =>
                      setSelectedGuests(
                        selectedGuests.includes(c.id)
                          ? selectedGuests.filter((id) => id !== c.id)
                          : [...selectedGuests, c.id]
                      )
                    }
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border transition-colors",
                      selectedGuests.includes(c.id)
                        ? "bg-violet-500/15 border-violet-500/30 text-violet-400"
                        : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                    )}
                  >
                    🗣️ {c.name}
                    {selectedGuests.includes(c.id) && (
                      <Check className="w-3 h-3" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Segment Rundown */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400">
                Rundown{" "}
                <span
                  className={cn(
                    "ml-1",
                    Math.abs(totalDuration - durationMin) > 5
                      ? "text-red-400"
                      : "text-gray-600"
                  )}
                >
                  ({totalDuration} / {durationMin} min)
                </span>
              </label>
              <div className="flex gap-1">
                <button
                  onClick={() => addSegment("TOPIC")}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20"
                >
                  <Plus className="w-3 h-3" /> Topic
                </button>
                <button
                  onClick={() => addSegment("AD_BREAK")}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20"
                >
                  <Plus className="w-3 h-3" /> Ad
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {segments.map((seg, i) => {
                const info =
                  SEGMENT_TYPE_INFO[seg.type] || SEGMENT_TYPE_INFO.TOPIC;
                return (
                  <div
                    key={i}
                    className="bg-gray-800/50 border border-gray-800 rounded-xl p-3 space-y-2"
                  >
                    {/* Segment Header */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{info.icon}</span>
                      <span className="text-xs font-medium text-white flex-1">
                        {info.label}
                      </span>
                      <input
                        type="number"
                        value={seg.durationMin}
                        onChange={(e) =>
                          updateSegment(
                            i,
                            "durationMin",
                            parseInt(e.target.value) || 1
                          )
                        }
                        className="w-14 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white text-center"
                        min={1}
                        max={60}
                      />
                      <span className="text-[10px] text-gray-500">min</span>
                      {seg.type !== "INTRO" && seg.type !== "OUTRO" && (
                        <button
                          onClick={() => removeSegment(i)}
                          className="p-1 text-gray-500 hover:text-red-400"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Topic fields */}
                    {seg.type === "TOPIC" && (
                      <>
                        <input
                          type="text"
                          value={seg.topicTitle}
                          onChange={(e) =>
                            updateSegment(i, "topicTitle", e.target.value)
                          }
                          placeholder="Topic title (e.g., 'Is AI Taking Jobs?')"
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                        />

                        {/* Source Mode */}
                        <div className="flex gap-1">
                          {SOURCE_MODES.map((m) => (
                            <button
                              key={m.id}
                              onClick={() =>
                                updateSegment(i, "sourceMode", m.id)
                              }
                              className={cn(
                                "px-2.5 py-1.5 rounded-lg text-[10px] border transition-colors flex-1",
                                seg.sourceMode === m.id
                                  ? "bg-violet-500/15 border-violet-500/30 text-violet-400"
                                  : "bg-gray-900 border-gray-700 text-gray-500 hover:border-gray-600"
                              )}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>

                        {/* URL inputs */}
                        {seg.sourceMode === "URLS" && (
                          <div className="space-y-1">
                            {seg.sourceUrls.map((url, ui) => (
                              <div key={ui} className="flex gap-1">
                                <input
                                  type="url"
                                  value={url}
                                  onChange={(e) =>
                                    updateSourceUrl(i, ui, e.target.value)
                                  }
                                  placeholder="https://news-article-link.com/..."
                                  className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[10px] text-white placeholder-gray-600 focus:border-violet-500 focus:outline-none"
                                />
                                <button
                                  onClick={() => removeSourceUrl(i, ui)}
                                  className="text-gray-500 hover:text-red-400"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() => addSourceUrl(i)}
                              className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300"
                            >
                              <Plus className="w-3 h-3" /> Add URL
                            </button>
                          </div>
                        )}

                        {/* Manual premise */}
                        {seg.sourceMode === "MANUAL_PREMISE" && (
                          <textarea
                            value={seg.topicContent}
                            onChange={(e) =>
                              updateSegment(i, "topicContent", e.target.value)
                            }
                            placeholder="Describe the debate premise..."
                            rows={2}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none resize-none"
                          />
                        )}
                      </>
                    )}

                    {/* Ad Break */}
                    {seg.type === "AD_BREAK" && (
                      <select
                        value={seg.sponsorId}
                        onChange={(e) =>
                          updateSegment(i, "sponsorId", e.target.value)
                        }
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
                      >
                        <option value="">Select sponsor...</option>
                        {sponsors
                          .filter((s) => s.active)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.brandName}{" "}
                              {s.promoCode ? `(${s.promoCode})` : ""}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-gray-800">
          <div className="flex-1" />
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {isEdit ? "Save Changes" : "Create Episode"}
          </button>
        </div>
      </div>
    </div>
  );
}
