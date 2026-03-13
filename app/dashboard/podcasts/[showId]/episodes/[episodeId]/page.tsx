"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  FileText,
  Mic,
  Music,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Users,
  MessageSquare,
  Sparkles,
  Eye,
  Volume2,
  RefreshCw,
  RotateCcw,
  Edit3,
  Save,
  Play,
  Headphones,
  Brain,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────

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
  scriptJson: any;
  segments: Segment[];
  participants: { character: Character }[];
  show: {
    id: string;
    name: string;
    userId: string;
  };
  createdAt: string;
};

type StepId = "script" | "audio" | "mix" | "review";
type StepState = "done" | "active" | "pending" | "failed";

const STATUS_TO_STEP: Record<string, StepId> = {
  DRAFT: "script",
  SCRIPTING: "script",
  RECORDING: "audio",
  ASSEMBLING: "mix",
  READY: "review",
  APPROVED: "review",
  PUBLISHED: "review",
  FAILED_PODCAST: "script",
};

const STEP_ORDER: StepId[] = ["script", "audio", "mix", "review"];

const STEPS = [
  { id: "script" as StepId, label: "Script", icon: FileText, description: "Generate & edit dialogue" },
  { id: "audio" as StepId, label: "Audio", icon: Mic, description: "TTS voice generation" },
  { id: "mix" as StepId, label: "Mix", icon: Music, description: "Music & final mix" },
  { id: "review" as StepId, label: "Review", icon: Headphones, description: "Preview & publish" },
];

// ─── Main Page ───────────────────────────────────────────

export default function EpisodeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const showId = params.showId as string;
  const episodeId = params.episodeId as string;

  const [episode, setEpisode] = useState<Episode | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState<StepId>("script");
  const [scriptData, setScriptData] = useState<any>(null);
  const [loadingScript, setLoadingScript] = useState(false);
  const [generating, setGenerating] = useState(false);
  const hasInitialized = useRef(false);

  // Provider toggle — synced to localStorage
  const [provider, setProvider] = useState<"mistral" | "deepseek">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("podcast_llm_provider") as any) || "mistral";
    }
    return "mistral";
  });

  useEffect(() => {
    localStorage.setItem("podcast_llm_provider", provider);
  }, [provider]);

  const fetchEpisode = useCallback(async () => {
    try {
      const res = await fetch(`/api/podcast/episodes?showId=${showId}`);
      if (!res.ok) return;
      const episodes = await res.json();
      const ep = episodes.find((e: any) => e.id === episodeId);
      if (ep) {
        // Auto-fix stuck SCRIPTING status: if script already exists, it's done
        if (ep.status === "SCRIPTING" && ep.scriptJson) {
          // Script exists but status never got updated — fix it
          try {
            await fetch(`/api/podcast/episodes?id=${episodeId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "READY" }),
            });
            ep.status = "READY";
          } catch (fixErr) {
            console.warn("Failed to auto-fix status", fixErr);
          }
          setGenerating(false);
        }
        setEpisode(ep);
        // Only auto-set step on initial load — let user navigate freely after
        if (!hasInitialized.current) {
          const step = STATUS_TO_STEP[ep.status] || "script";
          setActiveStep(step);
          hasInitialized.current = true;
        }
      }
    } catch (err) {
      console.error("Failed to load episode", err);
    }
    setLoading(false);
  }, [showId, episodeId]);

  const fetchScript = useCallback(async () => {
    setLoadingScript(true);
    try {
      const res = await fetch(`/api/podcast/scripts?episodeId=${episodeId}`);
      if (res.ok) {
        const data = await res.json();
        setScriptData(data.script);
        // If script loaded successfully but we're still in generating state, clear it
        if (data.script && data.status && data.status !== "SCRIPTING") {
          setGenerating(false);
        }
      }
    } catch (err) {
      console.error("Failed to load script", err);
    }
    setLoadingScript(false);
  }, [episodeId]);

  useEffect(() => {
    fetchEpisode();
  }, [fetchEpisode]);

  // Load script when we reach the script step and script exists
  useEffect(() => {
    if (episode && episode.status !== "DRAFT" && !scriptData) {
      fetchScript();
    }
  }, [episode, scriptData, fetchScript]);

  // ─── Poll while SCRIPTING ────────────────────────────────
  // Auto-refresh every 10 seconds while episode is generating
  useEffect(() => {
    if (!episode || episode.status !== "SCRIPTING") return;

    setGenerating(true); // Keep button disabled during background generation

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/podcast/episodes?showId=${showId}`);
        if (!res.ok) return;
        const episodes = await res.json();
        const ep = episodes.find((e: any) => e.id === episodeId);
        if (ep) {
          setEpisode(ep);
          if (ep.status !== "SCRIPTING") {
            // Generation finished (READY or FAILED_PODCAST)
            setGenerating(false);
            clearInterval(interval);
            if (ep.status === "READY" || ep.scriptJson) {
              // Auto-load the completed script
              fetchScript();
            }
          }
        }
      } catch (err) {
        console.error("Polling error", err);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [episode?.status, showId, episodeId, fetchScript]);

  const generateScript = async () => {
    if (!episode) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/podcast/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: episode.id, provider }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Script generation failed: ${data.error || "Unknown error"}`);
        setGenerating(false);
      } else if (data.dispatched) {
        // Generation running in background — polling will detect completion
        await fetchEpisode();
        // Note: generating stays true — polling useEffect will clear it
      } else if (data.script) {
        // Direct result (unlikely now but kept as fallback)
        setScriptData(data.script);
        await fetchEpisode();
        setGenerating(false);
      }
    } catch (err: any) {
      alert(`Script generation failed: ${err.message}`);
      setGenerating(false);
    }
  };

  const resetToDraft = async () => {
    setGenerating(false); // Always clear generating state on reset
    try {
      const res = await fetch(`/api/podcast/episodes?id=${episodeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DRAFT", clearScript: true }),
      });
      if (res.ok) {
        setScriptData(null);
        hasInitialized.current = false; // Allow step to reset to script
        await fetchEpisode();
      }
    } catch (err) {
      console.error("Failed to reset", err);
    }
  };

  const markScriptReady = async () => {
    try {
      const res = await fetch(`/api/podcast/episodes?id=${episodeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RECORDING" }),
      });
      if (res.ok) {
        await fetchEpisode();
        setActiveStep("audio");
      }
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="max-w-5xl mx-auto p-6 text-center">
        <p className="text-gray-400 mb-4">Episode not found.</p>
        <Link href={`/dashboard/podcasts/${showId}`} className="text-violet-400 hover:underline">
          Go back
        </Link>
      </div>
    );
  }

  const currentStepIdx = STEP_ORDER.indexOf(STATUS_TO_STEP[episode.status] || "script");

  const getStepState = (stepId: StepId): StepState => {
    if (episode.status === "FAILED_PODCAST") return stepId === "script" ? "failed" : "pending";
    const stepIdx = STEP_ORDER.indexOf(stepId);
    if (stepIdx < currentStepIdx) return "done";
    if (stepIdx === currentStepIdx) return "active";
    return "pending";
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/podcasts/${showId}`}
          className="p-2 rounded-xl hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">
            Ep {episode.episodeNumber}: {episode.title || "Untitled"}
          </h1>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {episode.durationMin} min
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" /> {episode.participants.length} speakers
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />{" "}
              {episode.segments.filter((s) => s.type === "TOPIC").length} topics
            </span>
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-medium",
                episode.status === "DRAFT"
                  ? "bg-gray-500/20 text-gray-400"
                  : episode.status === "FAILED_PODCAST"
                  ? "bg-red-500/20 text-red-400"
                  : "bg-violet-500/20 text-violet-400"
              )}
            >
              {episode.status}
            </span>
          </div>
        </div>

        {/* Reset button — always enabled when not in DRAFT */}
        {episode.status !== "DRAFT" && (
          <button
            onClick={resetToDraft}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-red-500/10 text-red-400 hover:text-red-300 hover:bg-red-500/20 border border-red-500/20 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset to Draft
          </button>
        )}
      </div>

      {/* ─── Pipeline Stepper ─────────────────────────── */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
        <div className="flex items-start gap-2">
          {STEPS.map((step, i) => {
            const state = getStepState(step.id);
            const isClickable = state === "done" || state === "active";
            return (
              <div key={step.id} className="flex items-start flex-1 min-w-0">
                <div
                  className={cn("flex flex-col items-center flex-1 min-w-0", isClickable && "cursor-pointer")}
                  onClick={() => isClickable && setActiveStep(step.id)}
                >
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl border flex items-center justify-center mb-2 transition-all",
                      state === "done"
                        ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/30"
                        : state === "active"
                        ? "text-violet-400 bg-violet-500/15 border-violet-500/30"
                        : state === "failed"
                        ? "text-red-400 bg-red-500/15 border-red-500/30"
                        : "text-gray-600 bg-gray-800/50 border-gray-700/30",
                      activeStep === step.id && "ring-2 ring-violet-500/50"
                    )}
                  >
                    {state === "active" && episode.status === "SCRIPTING" && step.id === "script" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : state === "done" ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : state === "failed" ? (
                      <XCircle className="w-4 h-4" />
                    ) : (
                      <step.icon className="w-4 h-4" />
                    )}
                  </div>
                  <p
                    className={cn(
                      "text-xs font-medium mb-0.5 text-center",
                      state === "done"
                        ? "text-emerald-400"
                        : state === "active"
                        ? "text-violet-400"
                        : state === "failed"
                        ? "text-red-400"
                        : "text-gray-500"
                    )}
                  >
                    {step.label}
                  </p>
                  <p className="text-[10px] text-gray-600 text-center leading-tight">{step.description}</p>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "w-8 h-px mt-5 flex-shrink-0",
                      getStepState(STEPS[i + 1].id) !== "pending" ? "bg-emerald-500/40" : "bg-gray-700"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Step Content Panels ──────────────────────── */}

      {/* Step 1: Script */}
      {activeStep === "script" && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-violet-400" />
              Script
            </h2>
            <div className="flex gap-2">
              {episode.status === "DRAFT" && (
                <div className="flex items-center gap-2">
                  {/* Inline provider toggle */}
                  <div className="flex items-center bg-gray-800 rounded-lg p-0.5">
                    <button
                      onClick={() => setProvider("mistral")}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all",
                        provider === "mistral"
                          ? "bg-violet-600 text-white"
                          : "text-gray-500 hover:text-white"
                      )}
                    >
                      <Brain className="w-3 h-3" />
                      Mistral
                    </button>
                    <button
                      onClick={() => setProvider("deepseek")}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all",
                        provider === "deepseek"
                          ? "bg-emerald-600 text-white"
                          : "text-gray-500 hover:text-white"
                      )}
                    >
                      <Cpu className="w-3 h-3" />
                      DeepSeek
                    </button>
                  </div>
                  <button
                    onClick={generateScript}
                    disabled={generating}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                  >
                    {generating ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    {generating ? "Generating..." : "Generate Script"}
                  </button>
                </div>
              )}
              {scriptData && episode.status !== "DRAFT" && (
                <>
                  <button
                    onClick={() => {
                      fetchEpisode();
                      fetchScript();
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-gray-800 text-gray-400 hover:text-white border border-gray-700 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Refresh
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Script content */}
          {loadingScript ? (
            <div className="p-8 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
              <span className="ml-2 text-sm text-gray-500">Loading script...</span>
            </div>
          ) : scriptData ? (
            <div className="p-5 max-h-[600px] overflow-y-auto">
              {scriptData.segments?.map((seg: any, si: number) => (
                <div key={si} className="mb-6">
                  <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-3 flex items-center gap-2">
                    <span className="h-px flex-1 bg-gray-800" />
                    <span className="px-2">
                      {seg.type}: {seg.topicTitle || seg.type}
                    </span>
                    <span className="h-px flex-1 bg-gray-800" />
                  </div>
                  {seg.lines?.map((line: any, li: number) => (
                    <div
                      key={li}
                      className="flex gap-3 py-2 hover:bg-gray-800/30 rounded-lg px-3 -mx-3 transition-colors group/line"
                    >
                      <span className="text-xs font-semibold text-violet-400 whitespace-nowrap min-w-[120px] pt-0.5">
                        {line.speaker || line.characterName}:
                      </span>
                      <span className="text-sm text-gray-300 leading-relaxed flex-1">
                        {line.text || line.dialogue}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              {/* Fallback: raw JSON if no structured segments */}
              {!scriptData.segments && (
                <pre className="text-xs text-gray-400 whitespace-pre-wrap">
                  {JSON.stringify(scriptData, null, 2)}
                </pre>
              )}
            </div>
          ) : episode.status === "SCRIPTING" ? (
            <div className="p-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-violet-400 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Script is being generated with 3-pass AI architecture...</p>
              <p className="text-xs text-gray-600 mt-1">
                Content AI → Director AI → Voice AI — typically 15-25 minutes. Auto-checking every 10s.
              </p>
              <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-gray-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Polling for completion...
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <FileText className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No script yet</p>
              <p className="text-xs text-gray-600 mt-1">
                Click "Generate Script" to create dialogue for this episode.
              </p>
            </div>
          )}

          {/* Proceed button when script exists but status is stuck */}
          {scriptData && episode.status === "SCRIPTING" && (
            <div className="p-4 border-t border-gray-800 flex justify-end">
              <button
                onClick={markScriptReady}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                Proceed to Audio →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Audio */}
      {activeStep === "audio" && (
        <AudioStepPanel
          episode={episode}
          scriptData={scriptData}
          onRefresh={() => { fetchEpisode(); fetchScript(); }}
        />
      )}

      {/* Step 3: Mix */}
      {activeStep === "mix" && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center">
          <Music className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-white mb-2">Audio Mixing</h2>
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            Add background music, intro/outro jingles, and create the final mixed podcast audio file.
          </p>
        </div>
      )}

      {/* Step 4: Review */}
      {activeStep === "review" && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center">
          <Headphones className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-white mb-2">Review & Publish</h2>
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            Preview the final podcast audio, approve, and publish to your feeds.
          </p>
        </div>
      )}

      {/* Topics reference */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Episode Topics
        </h3>
        <div className="flex flex-wrap gap-2">
          {episode.segments
            .filter((s) => s.type === "TOPIC")
            .map((s) => (
              <span
                key={s.id}
                className="text-xs px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20"
              >
                {s.topicTitle || "Untitled Topic"}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}

// ─── Audio Step Panel ────────────────────────────────────

function AudioStepPanel({
  episode,
  scriptData,
  onRefresh,
}: {
  episode: Episode;
  scriptData: any;
  onRefresh: () => void;
}) {
  const [generatingAudio, setGeneratingAudio] = useState(episode.status === "RECORDING");
  const [audioResult, setAudioResult] = useState<any>(null);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);

  // Check if audio clips already exist in scriptData
  const existingClips = scriptData?.audioClips || [];
  const hasAudio = existingClips.filter((c: any) => c.url).length > 0;
  const audioProgress = scriptData?.audioProgress || null;
  const audioStats = scriptData?.audioStats || null;

  // Poll while RECORDING status — audio generating in background
  useEffect(() => {
    if (episode.status !== "RECORDING") {
      if (generatingAudio && episode.status !== "RECORDING") {
        setGeneratingAudio(false);
      }
      return;
    }

    setGeneratingAudio(true);
    const interval = setInterval(() => {
      onRefresh(); // Refresh episode + script data
    }, 10000);

    return () => clearInterval(interval);
  }, [episode.status, onRefresh, generatingAudio]);

  // Count dialogue lines
  const lineCount = scriptData?.segments?.reduce((sum: number, seg: any) =>
    sum + (seg.lines?.filter((l: any) => (l.text || l.dialogue)?.trim()).length || 0), 0
  ) || 0;

  // Voice assignment summary
  const voiceAssignments = episode.participants.map(p => ({
    name: p.character.name,
    voiceId: p.character.voiceId,
    hasVoice: !!p.character.voiceId,
  }));

  const allHaveVoices = voiceAssignments.every(v => v.hasVoice);

  const generateAudio = async () => {
    setGeneratingAudio(true);
    try {
      const res = await fetch("/api/podcast/audio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: episode.id }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.dispatched) {
          // Fire-and-forget — polling will detect completion
          onRefresh();
        } else {
          setAudioResult(data);
          onRefresh();
          setGeneratingAudio(false);
        }
      } else {
        alert(`Audio generation failed: ${data.error}`);
        setGeneratingAudio(false);
      }
    } catch (err: any) {
      alert(`Audio generation error: ${err.message}`);
      setGeneratingAudio(false);
    }
  };

  const playClip = (url: string, idx: number) => {
    if (audioRef) {
      audioRef.pause();
    }
    if (playingIdx === idx) {
      setPlayingIdx(null);
      return;
    }
    const audio = new Audio(url);
    audio.onended = () => setPlayingIdx(null);
    audio.play();
    setAudioRef(audio);
    setPlayingIdx(idx);
  };

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Mic className="w-4 h-4 text-violet-400" />
          Audio Generation
          {lineCount > 0 && (
            <span className="text-[10px] text-gray-500 font-normal">
              {lineCount} dialogue lines
            </span>
          )}
        </h2>
        <div className="flex gap-2">
          {!hasAudio && scriptData && (
            <button
              onClick={generateAudio}
              disabled={generatingAudio}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
            >
              {generatingAudio ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Volume2 className="w-3 h-3" />
              )}
              {generatingAudio ? "Generating..." : "Generate Audio"}
            </button>
          )}
          {hasAudio && (
            <>
              <button
                onClick={() => {
                  if (confirm("Regenerate all audio clips? This will use ElevenLabs credits.")) {
                    generateAudio();
                  }
                }}
                disabled={generatingAudio}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Regenerate
              </button>
              <button
                onClick={onRefresh}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-gray-800 text-gray-400 hover:text-white border border-gray-700 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-5">
        {/* Voice assignments */}
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">Voice Assignments</p>
          <div className="flex flex-wrap gap-2">
            {voiceAssignments.map((v) => (
              <div
                key={v.name}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border",
                  v.hasVoice
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                )}
              >
                {v.hasVoice ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <XCircle className="w-3 h-3" />
                )}
                {v.name}
                {!v.hasVoice && <span className="text-[9px] opacity-70">(default voice)</span>}
              </div>
            ))}
          </div>
          {!allHaveVoices && (
            <p className="text-[10px] text-amber-500/70 mt-2">
              Characters without assigned voices will use ElevenLabs default. Assign voices in the Characters tab for best results.
            </p>
          )}
        </div>

        {/* Generating state */}
        {generatingAudio && (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-violet-400 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Generating voice audio...</p>
            {audioProgress && audioProgress !== "complete" ? (
              <p className="text-xs text-violet-400 mt-1">
                Progress: {audioProgress} clips processed
              </p>
            ) : (
              <p className="text-xs text-gray-600 mt-1">
                {lineCount} lines × ElevenLabs TTS — this may take 10-15 minutes.
              </p>
            )}
            <p className="text-[10px] text-gray-600 mt-2">
              Auto-refreshing every 10s. Progress is saved incrementally — nothing will be lost.
            </p>
          </div>
        )}

        {/* Audio result summary */}
        {audioResult && !generatingAudio && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-4">
            <p className="text-sm font-medium text-emerald-400">
              ✅ Audio generated: {audioResult.successCount}/{audioResult.clips} clips
              {audioResult.failedCount > 0 && (
                <span className="text-amber-400"> ({audioResult.failedCount} failed)</span>
              )}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              ~{Math.round(audioResult.totalDurationSeconds / 60)} min total duration
            </p>
          </div>
        )}

        {/* Audio clips list */}
        {hasAudio && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">
              Audio Clips ({existingClips.length})
            </p>
            <div className="max-h-[400px] overflow-y-auto space-y-1">
              {existingClips.map((clip: any, i: number) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-3 py-2 px-3 rounded-lg transition-colors",
                    playingIdx === i ? "bg-violet-500/10" : "hover:bg-gray-800/30"
                  )}
                >
                  <button
                    onClick={() => clip.url && playClip(clip.url, i)}
                    disabled={!clip.url}
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
                      clip.url
                        ? playingIdx === i
                          ? "bg-violet-500 text-white"
                          : "bg-gray-800 text-gray-400 hover:bg-violet-500/20 hover:text-violet-400"
                        : "bg-red-500/20 text-red-400"
                    )}
                  >
                    {playingIdx === i ? (
                      <Volume2 className="w-3 h-3" />
                    ) : clip.url ? (
                      <Play className="w-3 h-3 ml-0.5" />
                    ) : (
                      <XCircle className="w-3 h-3" />
                    )}
                  </button>
                  <span className="text-xs font-semibold text-violet-400 whitespace-nowrap min-w-[100px]">
                    {clip.speaker}:
                  </span>
                  <span className="text-xs text-gray-400 truncate flex-1">
                    {clip.text}
                  </span>
                  <span className="text-[10px] text-gray-600 flex-shrink-0">
                    ~{Math.round(clip.durationEstimate)}s
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Proceed to next step */}
        {hasAudio && !generatingAudio && (
          <div className="mt-4 pt-4 border-t border-gray-800 flex justify-end">
            <button
              onClick={() => {
                // Advance status and switch step
                fetch(`/api/podcast/episodes?id=${episode.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "ASSEMBLING" }),
                }).then(() => onRefresh());
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              Proceed to Mix →
            </button>
          </div>
        )}

        {/* No script yet */}
        {!scriptData && (
          <div className="text-center py-8">
            <Mic className="w-10 h-10 text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Generate a script first</p>
            <p className="text-xs text-gray-600 mt-1">
              Go back to the Script step and generate dialogue before creating audio.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
