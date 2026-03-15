"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Loader2,
  Plus,
  Trash2,
  Save,
  X,
  Users,
  Mic,
  Brain,
  MessageSquare,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ─── Enums ───────────────────────────────────────────────

const ROLES = ["HOST", "GUEST", "WILDCARD"] as const;
const ARCHETYPES = [
  "FIREBRAND", "PROVOCATEUR", "BULLDOZER", "SNIPER", "PROFESSOR",
  "PHILOSOPHER", "ANALYST", "SKEPTIC", "COMEDIAN", "STORYTELLER",
  "WILDCARD_PERSONALITY", "HYPE_MAN", "MEDIATOR", "DEVILS_ADVOCATE", "EMPATH", "ELDER",
] as const;
const GENERATIONS = ["SILENT", "BOOMER", "GEN_X", "MILLENNIAL", "GEN_Z", "GEN_ALPHA"] as const;
const IMAGE_MODELS = ["FLUX", "CHROMA", "JUGGERNAUT"] as const;

type Character = {
  id: string;
  name: string;
  role: string;
  archetype: string;
  generation: string;
  voiceId: string | null;
  voiceRefPath: string | null;
  speechRate: number;
  imageModel: string;
  avatarUrl: string | null;
  politicalLeaning: string | null;
  religiousView: string | null;
  coreBeliefs: string[];
  hotButtons: string[];
  episodeCount: number;
  _count?: { showHosts: number; showDefaultGuests: number; episodeParticipants: number };
  createdAt: string;
  updatedAt: string;
};

const EMPTY_CHARACTER = {
  name: "",
  role: "GUEST",
  archetype: "ANALYST",
  generation: "MILLENNIAL",
  voiceId: "",
  voiceRefPath: "",
  speechRate: 1.0,
  imageModel: "FLUX",
  politicalLeaning: "",
  religiousView: "",
  coreBeliefs: [] as string[],
  hotButtons: [] as string[],
};

export default function CharactersPage() {
  const router = useRouter();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Character | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState(EMPTY_CHARACTER);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newBelief, setNewBelief] = useState("");
  const [newHotButton, setNewHotButton] = useState("");
  const [diaVoices, setDiaVoices] = useState<{ predefined: any[]; reference: any[] }>({ predefined: [], reference: [] });
  const [loadingVoices, setLoadingVoices] = useState(true);

  const fetchCharacters = useCallback(async () => {
    try {
      const res = await fetch("/api/podcast/characters");
      if (res.ok) {
        const data = await res.json();
        setCharacters(data);
      }
    } catch (err) {
      console.error("Failed to fetch characters", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCharacters();
    // Fetch Dia voices
    fetch("/api/podcast/dia/voices")
      .then((r) => r.json())
      .then((data) => {
        setDiaVoices({ predefined: data.predefined || [], reference: data.reference || [] });
        setLoadingVoices(false);
      })
      .catch(() => setLoadingVoices(false));
  }, [fetchCharacters]);

  const selectCharacter = (char: Character) => {
    setSelected(char);
    setIsNew(false);
    setForm({
      name: char.name,
      role: char.role,
      archetype: char.archetype,
      generation: char.generation,
      voiceId: char.voiceId || "",
      voiceRefPath: char.voiceRefPath || "",
      speechRate: char.speechRate,
      imageModel: char.imageModel,
      politicalLeaning: char.politicalLeaning || "",
      religiousView: char.religiousView || "",
      coreBeliefs: Array.isArray(char.coreBeliefs) ? char.coreBeliefs : [],
      hotButtons: Array.isArray(char.hotButtons) ? char.hotButtons : [],
    });
  };

  const startNew = () => {
    setSelected(null);
    setIsNew(true);
    setForm({ ...EMPTY_CHARACTER });
  };

  const save = async () => {
    if (!form.name.trim()) return alert("Name is required");
    setSaving(true);
    try {
      const body = {
        ...form,
        voiceId: form.voiceId || null,
        voiceRefPath: form.voiceRefPath || null,
        politicalLeaning: form.politicalLeaning || null,
        religiousView: form.religiousView || null,
      };

      if (isNew) {
        await fetch("/api/podcast/characters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else if (selected) {
        await fetch(`/api/podcast/characters?id=${selected.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      await fetchCharacters();
      setIsNew(false);
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    }
    setSaving(false);
  };

  const deleteChar = async () => {
    if (!selected) return;
    if (!confirm(`Delete "${selected.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/podcast/characters?id=${selected.id}`, { method: "DELETE" });
      setSelected(null);
      setIsNew(false);
      await fetchCharacters();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
    setDeleting(false);
  };

  const addBelief = () => {
    if (!newBelief.trim()) return;
    setForm({ ...form, coreBeliefs: [...form.coreBeliefs, newBelief.trim()] });
    setNewBelief("");
  };

  const removeBelief = (idx: number) => {
    setForm({ ...form, coreBeliefs: form.coreBeliefs.filter((_, i) => i !== idx) });
  };

  const addHotButton = () => {
    if (!newHotButton.trim()) return;
    setForm({ ...form, hotButtons: [...form.hotButtons, newHotButton.trim()] });
    setNewHotButton("");
  };

  const removeHotButton = (idx: number) => {
    setForm({ ...form, hotButtons: form.hotButtons.filter((_, i) => i !== idx) });
  };

  const roleColor = (role: string) => {
    if (role === "HOST") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    if (role === "WILDCARD") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    return "text-violet-400 bg-violet-500/10 border-violet-500/20";
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/podcasts"
              className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-lg font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-violet-400" />
                Characters
              </h1>
              <p className="text-xs text-gray-500">{characters.length} characters</p>
            </div>
          </div>
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            <Plus className="w-3 h-3" />
            New Character
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 flex gap-6">
        {/* Left: Character List */}
        <div className="w-80 flex-shrink-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
            </div>
          ) : characters.length === 0 && !isNew ? (
            <div className="text-center py-12">
              <Users className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No characters yet</p>
              <button
                onClick={startNew}
                className="mt-3 text-xs text-violet-400 hover:text-violet-300"
              >
                Create your first character →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {characters.map((char) => (
                <button
                  key={char.id}
                  onClick={() => selectCharacter(char)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl border transition-all",
                    selected?.id === char.id && !isNew
                      ? "bg-violet-500/10 border-violet-500/30"
                      : "bg-gray-900/50 border-gray-800 hover:border-gray-700"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-white">{char.name}</span>
                    <span className={cn("text-[9px] px-1.5 py-0.5 rounded-md border font-medium", roleColor(char.role))}>
                      {char.role}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {char.archetype.replace(/_/g, " ")} • {char.generation.replace(/_/g, " ")}
                    {char.voiceRefPath && " • 🎤 Voice"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Edit Panel */}
        <div className="flex-1 min-w-0">
          {!selected && !isNew ? (
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center">
              <Users className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Select a character to edit, or create a new one</p>
            </div>
          ) : (
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden">
              {/* Panel Header */}
              <div className="p-5 border-b border-gray-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">
                  {isNew ? "✨ New Character" : `Edit: ${selected?.name}`}
                </h2>
                <div className="flex gap-2">
                  {selected && !isNew && (
                    <button
                      onClick={deleteChar}
                      disabled={deleting}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  )}
                  <button
                    onClick={save}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
                  >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    {saving ? "Saving..." : "Save Character"}
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
                {/* ─── Identity ─── */}
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Brain className="w-3 h-3" /> Identity
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-[10px] text-gray-500 mb-1 block">Name</label>
                      <input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Ray Colton"
                        className="w-full bg-gray-800 text-sm text-white rounded-lg border border-gray-700 px-3 py-2 focus:outline-none focus:border-violet-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">Role</label>
                      <select
                        value={form.role}
                        onChange={(e) => setForm({ ...form, role: e.target.value })}
                        className="w-full bg-gray-800 text-sm text-white rounded-lg border border-gray-700 px-3 py-2 focus:outline-none focus:border-violet-500"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">Archetype</label>
                      <select
                        value={form.archetype}
                        onChange={(e) => setForm({ ...form, archetype: e.target.value })}
                        className="w-full bg-gray-800 text-sm text-white rounded-lg border border-gray-700 px-3 py-2 focus:outline-none focus:border-violet-500"
                      >
                        {ARCHETYPES.map((a) => (
                          <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">Generation</label>
                      <select
                        value={form.generation}
                        onChange={(e) => setForm({ ...form, generation: e.target.value })}
                        className="w-full bg-gray-800 text-sm text-white rounded-lg border border-gray-700 px-3 py-2 focus:outline-none focus:border-violet-500"
                      >
                        {GENERATIONS.map((g) => (
                          <option key={g} value={g}>{g.replace(/_/g, " ")}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">Image Model</label>
                      <select
                        value={form.imageModel}
                        onChange={(e) => setForm({ ...form, imageModel: e.target.value })}
                        className="w-full bg-gray-800 text-sm text-white rounded-lg border border-gray-700 px-3 py-2 focus:outline-none focus:border-violet-500"
                      >
                        {IMAGE_MODELS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>

                {/* ─── Voice Settings ─── */}
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Mic className="w-3 h-3" /> Voice Settings
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-[10px] text-gray-500 mb-1 block">Dia Voice</label>
                      {loadingVoices ? (
                        <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
                          <Loader2 className="w-3 h-3 animate-spin" /> Loading voices...
                        </div>
                      ) : (
                        <select
                          value={form.voiceRefPath}
                          onChange={(e) => setForm({ ...form, voiceRefPath: e.target.value })}
                          className="w-full bg-gray-800 text-sm text-white rounded-lg border border-gray-700 px-3 py-2 focus:outline-none focus:border-violet-500"
                        >
                          <option value="">— No voice selected —</option>
                          {diaVoices.predefined.length > 0 && (
                            <optgroup label="Predefined Voices">
                              {diaVoices.predefined.map((v: any) => (
                                <option key={v.filename} value={v.filename}>
                                  {v.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {diaVoices.reference.length > 0 && (
                            <optgroup label="Clone References (Uploaded)">
                              {diaVoices.reference.map((v: any) => (
                                <option key={v.filename} value={v.filename}>
                                  {v.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      )}
                      {form.voiceRefPath && (
                        <p className="text-[9px] text-gray-600 mt-1">
                          Selected: <span className="text-violet-400">{form.voiceRefPath}</span>
                          {diaVoices.predefined.some((v: any) => v.filename === form.voiceRefPath)
                            ? " (predefined)"
                            : " (clone reference)"}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">ElevenLabs Voice ID</label>
                      <input
                        value={form.voiceId}
                        onChange={(e) => setForm({ ...form, voiceId: e.target.value })}
                        placeholder="Optional — for ElevenLabs engine"
                        className="w-full bg-gray-800 text-sm text-white rounded-lg border border-gray-700 px-3 py-2 focus:outline-none focus:border-violet-500"
                      />
                    </div>
                    <div className="flex items-end">
                      <div className="w-full">
                        <label className="text-[10px] text-gray-500 mb-1 block">
                          Speech Rate: <span className="text-violet-400 font-medium">{form.speechRate.toFixed(1)}x</span>
                        </label>
                        <input
                          type="range"
                          min="0.5"
                          max="2.0"
                          step="0.1"
                          value={form.speechRate}
                          onChange={(e) => setForm({ ...form, speechRate: parseFloat(e.target.value) })}
                          className="w-full accent-violet-500"
                        />
                        <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                          <span>0.5x Slow</span>
                          <span>1.0x Normal</span>
                          <span>2.0x Fast</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* ─── Worldview ─── */}
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <MessageSquare className="w-3 h-3" /> Worldview
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">Political Leaning</label>
                      <textarea
                        value={form.politicalLeaning}
                        onChange={(e) => setForm({ ...form, politicalLeaning: e.target.value })}
                        placeholder="e.g., Classically liberal, disillusioned, believes the system was designed well..."
                        rows={2}
                        className="w-full bg-gray-800 text-sm text-white rounded-lg border border-gray-700 px-3 py-2 focus:outline-none focus:border-violet-500 resize-y"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">Religious View</label>
                      <textarea
                        value={form.religiousView}
                        onChange={(e) => setForm({ ...form, religiousView: e.target.value })}
                        placeholder="e.g., Agnostic, respects faith but follows evidence..."
                        rows={2}
                        className="w-full bg-gray-800 text-sm text-white rounded-lg border border-gray-700 px-3 py-2 focus:outline-none focus:border-violet-500 resize-y"
                      />
                    </div>
                  </div>
                </section>

                {/* ─── Core Beliefs ─── */}
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Brain className="w-3 h-3" /> Core Beliefs
                    <span className="text-gray-600 font-normal">({form.coreBeliefs.length})</span>
                  </h3>
                  <div className="space-y-1.5 mb-2">
                    {form.coreBeliefs.map((belief, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 bg-gray-800/50 rounded-lg px-3 py-2 group"
                      >
                        <span className="text-xs text-gray-300 flex-1">{belief}</span>
                        <button
                          onClick={() => removeBelief(i)}
                          className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={newBelief}
                      onChange={(e) => setNewBelief(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addBelief()}
                      placeholder="Add a core belief..."
                      className="flex-1 bg-gray-800 text-xs text-white rounded-lg border border-gray-700 px-3 py-2 focus:outline-none focus:border-violet-500"
                    />
                    <button
                      onClick={addBelief}
                      className="px-3 py-2 rounded-lg text-xs bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </section>

                {/* ─── Hot Buttons ─── */}
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Zap className="w-3 h-3" /> Hot Buttons
                    <span className="text-gray-600 font-normal">({form.hotButtons.length})</span>
                  </h3>
                  <div className="space-y-1.5 mb-2">
                    {form.hotButtons.map((btn, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 bg-gray-800/50 rounded-lg px-3 py-2 group"
                      >
                        <span className="text-xs text-gray-300 flex-1">{btn}</span>
                        <button
                          onClick={() => removeHotButton(i)}
                          className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={newHotButton}
                      onChange={(e) => setNewHotButton(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addHotButton()}
                      placeholder="Add a hot button..."
                      className="flex-1 bg-gray-800 text-xs text-white rounded-lg border border-gray-700 px-3 py-2 focus:outline-none focus:border-violet-500"
                    />
                    <button
                      onClick={addHotButton}
                      className="px-3 py-2 rounded-lg text-xs bg-amber-600 hover:bg-amber-500 text-white transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
