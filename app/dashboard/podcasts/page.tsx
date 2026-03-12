"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Headphones,
  Plus,
  Users,
  Radio,
  Megaphone,
  Loader2,
  Trash2,
  Edit3,
  Mic,
  Brain,
  User,
  ChevronDown,
  X,
  Check,
  Play,
  Pause,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Archetype Data (mirrors lib/podcast/archetypes.ts for client use) ──

const ARCHETYPE_FAMILIES = [
  { id: "aggressive", name: "Aggressive", icon: "🔥", color: "red" },
  { id: "intellectual", name: "Intellectual", icon: "🧠", color: "blue" },
  { id: "entertainer", name: "Entertainer", icon: "😂", color: "amber" },
  { id: "diplomatic", name: "Diplomatic", icon: "🕊️", color: "emerald" },
] as const;

const ARCHETYPES = [
  { id: "FIREBRAND", name: "Firebrand", family: "aggressive", icon: "🔥", tagline: "Attacks everything, backs down from nothing" },
  { id: "PROVOCATEUR", name: "Provocateur", family: "aggressive", icon: "😈", tagline: "Says the worst version of every take" },
  { id: "BULLDOZER", name: "Bulldozer", family: "aggressive", icon: "🚜", tagline: "Repeats their point louder until everyone gives up" },
  { id: "SNIPER", name: "Sniper", family: "aggressive", icon: "🎯", tagline: "Silent, then drops a devastating one-liner" },
  { id: "PROFESSOR", name: "Professor", family: "intellectual", icon: "🎓", tagline: "Cites studies, condescends when misunderstood" },
  { id: "PHILOSOPHER", name: "Philosopher", family: "intellectual", icon: "🤔", tagline: "Zooms out to ask what it all means" },
  { id: "ANALYST", name: "Analyst", family: "intellectual", icon: "📊", tagline: "Data-obsessed, rejects anecdotes as evidence" },
  { id: "SKEPTIC", name: "Skeptic", family: "intellectual", icon: "🔍", tagline: "Questions everything, never commits" },
  { id: "COMEDIAN", name: "Comedian", family: "entertainer", icon: "🎤", tagline: "Turns everything into a bit, truth bombs as jokes" },
  { id: "STORYTELLER", name: "Storyteller", family: "entertainer", icon: "📖", tagline: "Answers every question with an anecdote" },
  { id: "WILDCARD_PERSONALITY", name: "Wildcard", family: "entertainer", icon: "🃏", tagline: "Unpredictable, contradicts self, chaotic energy" },
  { id: "HYPE_MAN", name: "Hype Man", family: "entertainer", icon: "🔊", tagline: "Gets EXCITED about everything" },
  { id: "MEDIATOR", name: "Mediator", family: "diplomatic", icon: "🤝", tagline: "Finds common ground, eventually snaps" },
  { id: "DEVILS_ADVOCATE", name: "Devil's Advocate", family: "diplomatic", icon: "⚖️", tagline: "Takes the opposite position to test arguments" },
  { id: "EMPATH", name: "Empath", family: "diplomatic", icon: "💚", tagline: "Responds to emotion, disarms aggression" },
  { id: "ELDER", name: "Elder", family: "diplomatic", icon: "👴", tagline: "Decades of experience, calm authority" },
] as const;

const GENERATIONS = [
  { id: "SILENT", name: "Silent Gen", range: "1928–1945" },
  { id: "BOOMER", name: "Boomer", range: "1946–1964" },
  { id: "GEN_X", name: "Gen X", range: "1965–1980" },
  { id: "MILLENNIAL", name: "Millennial", range: "1981–1996" },
  { id: "GEN_Z", name: "Gen Z", range: "1997–2012" },
  { id: "GEN_ALPHA", name: "Gen Alpha", range: "2013–2025" },
] as const;

const ROLES = [
  { id: "HOST", name: "Host", icon: "🎙️" },
  { id: "GUEST", name: "Guest", icon: "🗣️" },
  { id: "WILDCARD", name: "Wildcard", icon: "🃏" },
] as const;

const IMAGE_MODELS = [
  { id: "FLUX", name: "Flux.1-dev", desc: "Clean, editorial portraits" },
  { id: "CHROMA", name: "Chroma FP16", desc: "Edgy, stylized portraits" },
  { id: "JUGGERNAUT", name: "Juggernaut XL", desc: "Photorealistic faces" },
] as const;

type Character = {
  id: string;
  name: string;
  role: string;
  archetype: string;
  generation: string;
  voiceId: string | null;
  avatarUrl: string | null;
  avatarPrompt: string | null;
  imageModel: string;
  speechRate: number;
  politicalLeaning: string | null;
  religiousView: string | null;
  coreBeliefs: string[];
  hotButtons: string[];
  episodeCount: number;
  createdAt: string;
  _count: { showHosts: number; showDefaultGuests: number; episodeParticipants: number };
};

export default function PodcastsPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadCharacters();
  }, []);

  const loadCharacters = () => {
    setLoading(true);
    fetch("/api/podcast/characters")
      .then((r) => r.json())
      .then((data) => {
        setCharacters(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const deleteCharacter = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/podcast/characters?id=${id}`, { method: "DELETE" });
    setCharacters((prev) => prev.filter((c) => c.id !== id));
  };

  const hosts = characters.filter((c) => c.role === "HOST");
  const guests = characters.filter((c) => c.role !== "HOST");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Headphones className="w-7 h-7 text-violet-400" />
            AI Podcasts
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Create AI hosts and guests with distinct personalities, then produce shows
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setEditingId(null); }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-all hover:scale-[1.02]"
        >
          <Plus className="w-4 h-4" />
          New Character
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Users} label="Characters" value={characters.length} color="violet" />
        <StatCard icon={Mic} label="Hosts" value={hosts.length} color="blue" />
        <StatCard icon={User} label="Guests" value={guests.length} color="emerald" />
        <StatCard icon={Radio} label="Shows" value={0} color="amber" />
      </div>

      {/* Characters Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      ) : characters.length === 0 ? (
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-16 text-center">
          <Brain className="w-16 h-16 text-gray-700 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No characters yet</h3>
          <p className="text-gray-400 text-sm max-w-md mx-auto mb-6">
            Create your first AI podcast character — give them a personality archetype,
            worldview, and voice. They&apos;ll debate, argue, and make callbacks to past episodes.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create First Character
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Hosts */}
          {hosts.length > 0 && (
            <>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <Mic className="w-4 h-4" /> Hosts
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {hosts.map((c) => (
                  <CharacterCard
                    key={c.id}
                    character={c}
                    onEdit={() => { setEditingId(c.id); setShowCreate(true); }}
                    onDelete={() => deleteCharacter(c.id, c.name)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Guests */}
          {guests.length > 0 && (
            <>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2 mt-6">
                <User className="w-4 h-4" /> Guests
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {guests.map((c) => (
                  <CharacterCard
                    key={c.id}
                    character={c}
                    onEdit={() => { setEditingId(c.id); setShowCreate(true); }}
                    onDelete={() => deleteCharacter(c.id, c.name)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showCreate && (
        <CharacterModal
          editCharacter={editingId ? characters.find((c) => c.id === editingId) : undefined}
          onClose={() => { setShowCreate(false); setEditingId(null); }}
          onSaved={() => { setShowCreate(false); setEditingId(null); loadCharacters(); }}
        />
      )}
    </div>
  );
}

// ─── Character Card ─────────────────────────────────────

function CharacterCard({
  character,
  onEdit,
  onDelete,
}: {
  character: Character;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const arch = ARCHETYPES.find((a) => a.id === character.archetype);
  const gen = GENERATIONS.find((g) => g.id === character.generation);
  const family = ARCHETYPE_FAMILIES.find((f) => f.id === arch?.family);

  const familyColorMap: Record<string, string> = {
    aggressive: "border-red-500/30 bg-red-500/5",
    intellectual: "border-blue-500/30 bg-blue-500/5",
    entertainer: "border-amber-500/30 bg-amber-500/5",
    diplomatic: "border-emerald-500/30 bg-emerald-500/5",
  };

  return (
    <div className={cn(
      "rounded-2xl border p-5 transition-all hover:scale-[1.01] group",
      familyColorMap[arch?.family || ""] || "border-gray-800 bg-gray-900/50"
    )}>
      {/* Top row: Avatar + Name */}
      <div className="flex items-start gap-3 mb-3">
        {character.avatarUrl ? (
          <img
            src={character.avatarUrl}
            alt={character.name}
            className="w-12 h-12 rounded-full object-cover border-2 border-gray-700"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-xl border-2 border-gray-700">
            {arch?.icon || "🎙️"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">{character.name}</h3>
          <p className="text-[10px] text-gray-500 flex items-center gap-1.5">
            {character.role === "HOST" ? "🎙️ Host" : character.role === "WILDCARD" ? "🃏 Wildcard" : "🗣️ Guest"}
            {gen && <span>• {gen.name}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Archetype Badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{arch?.icon}</span>
        <div>
          <p className="text-xs font-medium text-white">{arch?.name || character.archetype}</p>
          <p className="text-[10px] text-gray-500">{arch?.tagline}</p>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {character.voiceId && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
            Voice Assigned
          </span>
        )}
        {character.politicalLeaning && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
            {character.politicalLeaning.slice(0, 20)}{character.politicalLeaning.length > 20 ? "…" : ""}
          </span>
        )}
        {(character.coreBeliefs as string[])?.length > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
            {(character.coreBeliefs as string[]).length} beliefs
          </span>
        )}
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
          {character.episodeCount} eps
        </span>
      </div>
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: {
  icon: any; label: string; value: number; color: string;
}) {
  const colorMap: Record<string, string> = {
    violet: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  };

  return (
    <div className={cn("rounded-2xl border p-4 text-center", colorMap[color])}>
      <Icon className="w-5 h-5 mx-auto mb-1" />
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}

// ─── Character Create/Edit Modal ────────────────────────

function CharacterModal({
  editCharacter,
  onClose,
  onSaved,
}: {
  editCharacter?: Character;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!editCharacter;

  // Form state
  const [name, setName] = useState(editCharacter?.name || "");
  const [role, setRole] = useState(editCharacter?.role || "GUEST");
  const [archetype, setArchetype] = useState(editCharacter?.archetype || "ANALYST");
  const [generation, setGeneration] = useState(editCharacter?.generation || "MILLENNIAL");
  const [imageModel, setImageModel] = useState(editCharacter?.imageModel || "FLUX");
  const [politicalLeaning, setPoliticalLeaning] = useState(editCharacter?.politicalLeaning || "");
  const [religiousView, setReligiousView] = useState(editCharacter?.religiousView || "");
  const [coreBeliefs, setCoreBeliefs] = useState<string[]>(editCharacter?.coreBeliefs || []);
  const [hotButtons, setHotButtons] = useState<string[]>(editCharacter?.hotButtons || []);
  const [newBelief, setNewBelief] = useState("");
  const [newHotButton, setNewHotButton] = useState("");

  // Voice state
  const [voices, setVoices] = useState<any[]>([]);
  const [voiceId, setVoiceId] = useState(editCharacter?.voiceId || "");
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);

  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0); // 0: personality, 1: worldview, 2: voice

  // Load voices
  useEffect(() => {
    if (step === 2) {
      setLoadingVoices(true);
      fetch("/api/voiceover/voices?engine=elevenlabs")
        .then((r) => r.ok ? r.json() : { voices: [] })
        .then((data) => setVoices(data.voices || []))
        .finally(() => setLoadingVoices(false));
    }
  }, [step]);

  const playPreview = (id: string, previewUrl?: string) => {
    if (audioRef) { audioRef.pause(); audioRef.currentTime = 0; }
    if (playingPreview === id) { setPlayingPreview(null); return; }
    if (!previewUrl) return;
    const audio = new Audio(previewUrl);
    audio.onended = () => setPlayingPreview(null);
    audio.onerror = () => setPlayingPreview(null);
    audio.play();
    setAudioRef(audio);
    setPlayingPreview(id);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);

    const payload = {
      name: name.trim(),
      role,
      archetype,
      generation,
      imageModel,
      voiceId: voiceId || null,
      politicalLeaning: politicalLeaning || null,
      religiousView: religiousView || null,
      coreBeliefs,
      hotButtons,
    };

    try {
      if (isEdit) {
        await fetch(`/api/podcast/characters?id=${editCharacter!.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/podcast/characters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch {
      // handle error
    }
    setSaving(false);
  };

  const addBelief = () => {
    if (newBelief.trim()) {
      setCoreBeliefs([...coreBeliefs, newBelief.trim()]);
      setNewBelief("");
    }
  };

  const addHotButton = () => {
    if (newHotButton.trim()) {
      setHotButtons([...hotButtons, newHotButton.trim()]);
      setNewHotButton("");
    }
  };

  const selectedFamily = ARCHETYPES.find((a) => a.id === archetype)?.family;
  const steps = ["Personality", "Worldview", "Voice"];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? `Edit ${editCharacter?.name}` : "New Character"}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Tabs */}
        <div className="flex items-center gap-1 px-6 pt-4">
          {steps.map((s, i) => (
            <button
              key={s}
              onClick={() => setStep(i)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-medium transition-colors",
                step === i
                  ? "bg-violet-500/15 text-violet-400"
                  : "text-gray-500 hover:text-gray-300"
              )}
            >
              {i + 1}. {s}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {step === 0 && (
            <>
              {/* Name */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Character Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Dr. Marcus Chen"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                />
              </div>

              {/* Role */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Role</label>
                <div className="flex gap-2">
                  {ROLES.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setRole(r.id)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-colors flex-1",
                        role === r.id
                          ? "bg-violet-500/15 border-violet-500/30 text-violet-400"
                          : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                      )}
                    >
                      <span>{r.icon}</span>
                      {r.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generation */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Generation</label>
                <div className="grid grid-cols-3 gap-2">
                  {GENERATIONS.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setGeneration(g.id)}
                      className={cn(
                        "px-3 py-2 rounded-lg text-xs border transition-colors text-left",
                        generation === g.id
                          ? "bg-violet-500/15 border-violet-500/30 text-violet-400"
                          : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                      )}
                    >
                      <p className="font-medium">{g.name}</p>
                      <p className="text-[10px] text-gray-500">{g.range}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Archetype */}
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Personality Archetype</label>
                {ARCHETYPE_FAMILIES.map((fam) => (
                  <div key={fam.id} className="mb-3">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      {fam.icon} {fam.name}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {ARCHETYPES.filter((a) => a.family === fam.id).map((a) => (
                        <button
                          key={a.id}
                          onClick={() => setArchetype(a.id)}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors text-left",
                            archetype === a.id
                              ? "bg-violet-500/15 border-violet-500/30 text-violet-400"
                              : "bg-gray-800/50 border-gray-800 text-gray-400 hover:border-gray-700"
                          )}
                        >
                          <span className="text-sm">{a.icon}</span>
                          <div>
                            <p className="font-medium">{a.name}</p>
                            <p className="text-[10px] text-gray-500 line-clamp-1">{a.tagline}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Portrait Model */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Portrait Image Model</label>
                <div className="grid grid-cols-3 gap-2">
                  {IMAGE_MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setImageModel(m.id)}
                      className={cn(
                        "px-3 py-2 rounded-lg text-xs border transition-colors text-left",
                        imageModel === m.id
                          ? "bg-violet-500/15 border-violet-500/30 text-violet-400"
                          : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                      )}
                    >
                      <p className="font-medium">{m.name}</p>
                      <p className="text-[10px] text-gray-500">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              {/* Political Leaning */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Political Leaning</label>
                <input
                  type="text"
                  value={politicalLeaning}
                  onChange={(e) => setPoliticalLeaning(e.target.value)}
                  placeholder="e.g., fiscal conservative, social libertarian"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                />
              </div>

              {/* Religious View */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Religious / Spiritual View</label>
                <input
                  type="text"
                  value={religiousView}
                  onChange={(e) => setReligiousView(e.target.value)}
                  placeholder="e.g., agnostic, devout Catholic, atheist"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                />
              </div>

              {/* Core Beliefs */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  Core Beliefs <span className="text-gray-600">— hard convictions they never abandon</span>
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newBelief}
                    onChange={(e) => setNewBelief(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addBelief()}
                    placeholder="e.g., AI will create more jobs than it destroys"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                  />
                  <button
                    onClick={addBelief}
                    className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-1">
                  {coreBeliefs.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-800/50 rounded-lg px-3 py-1.5 text-xs text-gray-300">
                      <span className="flex-1">{b}</span>
                      <button onClick={() => setCoreBeliefs(coreBeliefs.filter((_, j) => j !== i))} className="text-gray-500 hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hot Buttons */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  Hot-Button Topics <span className="text-gray-600">— topics that trigger emotional escalation</span>
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newHotButton}
                    onChange={(e) => setNewHotButton(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addHotButton()}
                    placeholder="e.g., gun control, student debt"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                  />
                  <button
                    onClick={addHotButton}
                    className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {hotButtons.map((h, i) => (
                    <span key={i} className="flex items-center gap-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full px-2.5 py-0.5 text-[10px]">
                      {h}
                      <button onClick={() => setHotButtons(hotButtons.filter((_, j) => j !== i))} className="hover:text-red-300">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {/* Voice Selection */}
              <div>
                <label className="text-xs text-gray-400 mb-2 block">ElevenLabs Voice</label>
                {loadingVoices ? (
                  <div className="flex items-center gap-2 py-8 justify-center text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading voices...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5 max-h-[400px] overflow-y-auto">
                    {voices.map((v: any) => (
                      <button
                        key={v.voice_id || v.id}
                        onClick={() => setVoiceId(v.voice_id || v.id)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors",
                          voiceId === (v.voice_id || v.id)
                            ? "bg-violet-500/15 border-violet-500/30"
                            : "bg-gray-800/50 border-gray-800 hover:border-gray-700"
                        )}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playPreview(v.voice_id || v.id, v.preview_url);
                          }}
                          className="p-1.5 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400"
                        >
                          {playingPreview === (v.voice_id || v.id) ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{v.name}</p>
                          <p className="text-[10px] text-gray-500 truncate">
                            {v.labels?.accent || ""} {v.labels?.gender || ""} {v.labels?.age || ""}
                          </p>
                        </div>
                        {voiceId === (v.voice_id || v.id) && (
                          <Check className="w-4 h-4 text-violet-400 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                    {voices.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-8">
                        No voices found. Add voices to your ElevenLabs account first.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-gray-800">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-800 hover:bg-gray-700 text-white transition-colors"
            >
              Back
            </button>
          )}
          <div className="flex-1" />
          {step < 2 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 0 && !name.trim()}
              className="px-6 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={!name.trim() || saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {isEdit ? "Save Changes" : "Create Character"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
