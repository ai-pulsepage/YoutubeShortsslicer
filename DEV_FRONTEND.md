# Frontend Dev Instructions — UGC Studio UI & Navigation Improvements
**Project:** YouTube Shorts Slicer  
**Stack:** Next.js 16 · React 19 · Tailwind v4 · Lucide icons  
**Design:** Dark theme — gray-950 page bg, gray-900 sidebar, violet accents  
**Date:** July 2026

---

## Context — do not change existing pages

Studio, Library, Campaigns, Documentary, Podcasts are built. Add new pages and modify only `sidebar.tsx` and the dashboard quick actions.

---

## Task 1 — Sidebar additions (`components/sidebar.tsx`)

### 1a. Add two entries to `aiStudioItems`

```typescript
const aiStudioItems = [
  { label: "Documentary", href: "/dashboard/documentary", icon: Video },
  { label: "Podcasts", href: "/dashboard/podcasts", icon: Headphones },
  { label: "Characters", href: "/dashboard/podcasts/characters", icon: Users },
  { label: "UGC Studio", href: "/dashboard/ugc", icon: Sparkles },       // ADD
  { label: "Animated Shorts", href: "/dashboard/animated", icon: Wand2 }, // ADD
];
```

### 1b. Update `isInStudio` detection

Find:
```typescript
const isInStudio = pathname.startsWith("/dashboard/documentary") || pathname.startsWith("/dashboard/podcasts");
```

Replace with:
```typescript
const isInStudio =
  pathname.startsWith("/dashboard/documentary") ||
  pathname.startsWith("/dashboard/podcasts") ||
  pathname.startsWith("/dashboard/ugc") ||
  pathname.startsWith("/dashboard/animated");
```

### 1c. Add Ingest to top nav

Add to `topNavItems` array:
```typescript
{ label: "Ingest", href: "/dashboard/ingest", icon: Download },
```
`Download` is already imported at the top of sidebar.tsx.

---

## Task 2 — Dashboard quick actions (`app/dashboard/page.tsx`)

Add a fourth quick action card in the grid:
```tsx
<QuickAction
  href="/dashboard/ugc"
  icon={<Sparkles className="w-6 h-6" />}
  label="UGC Studio"
  description="Create affiliate videos with AI avatars"
  gradient="from-pink-500 to-rose-600"
/>
```

`Sparkles` and `QuickAction` are already in the file.

---

## Task 3 — UGC Studio page

**New file:** `app/dashboard/ugc/page.tsx`

Three-tab page: Avatars · Products · Generate

```tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Sparkles, Plus, Upload, Trash2, Loader2, CheckCircle2,
  XCircle, ExternalLink, Play, User, Package, Wand2, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Avatar = {
  id: string; name: string; persona: string | null;
  referenceImageUrl: string | null; voiceEngine: string; voiceId: string | null;
};
type Product = {
  id: string; name: string; description: string | null;
  price: string | null; imageUrls: string[]; sourceUrl: string; brand: string | null;
};
type UGCJob = {
  id: string; status: string; script: string | null; outputUrl: string | null;
  hookStyle: string; avatar: { name: string }; product: { name: string };
};

const HOOK_STYLES = [
  { value: "TESTIMONIAL", label: "Testimonial", desc: '"I tried this and..."' },
  { value: "PROBLEM_SOLUTION", label: "Problem / Solution", desc: '"Struggling with X?"' },
  { value: "UNBOXING", label: "Unboxing", desc: "Reveal style" },
  { value: "COMPARISON", label: "Comparison", desc: '"Before vs after"' },
  { value: "TUTORIAL", label: "Tutorial", desc: "Step by step" },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "text-gray-400",
  GENERATING_SCRIPT: "text-blue-400",
  GENERATING_VIDEO: "text-violet-400",
  COMPOSITING: "text-cyan-400",
  DONE: "text-emerald-400",
  FAILED: "text-red-400",
};

// ─── Avatars Panel ────────────────────────────────────────
function AvatarPanel() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", persona: "", voiceEngine: "elevenlabs", voiceId: "" });
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeAvatarId = useRef<string | null>(null);

  const fetchAvatars = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/avatars");
    setAvatars(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAvatars(); }, [fetchAvatars]);

  const createAvatar = async () => {
    if (!form.name.trim()) return;
    setCreating(true);
    await fetch("/api/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ name: "", persona: "", voiceEngine: "elevenlabs", voiceId: "" });
    setShowForm(false);
    setCreating(false);
    fetchAvatars();
  };

  const uploadImage = async (avatarId: string, file: File) => {
    setUploadingId(avatarId);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", "image");
    await fetch(`/api/avatars/${avatarId}/upload`, { method: "POST", body: fd });
    setUploadingId(null);
    fetchAvatars();
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">{avatars.length} avatar{avatars.length !== 1 ? "s" : ""}</p>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-500/15 text-violet-400 text-sm font-medium hover:bg-violet-500/25 transition-colors">
          <Plus className="w-4 h-4" /> New avatar
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Create avatar</h3>
          <input type="text" placeholder="Name (e.g. 'Sarah — fitness creator')" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500" />
          <textarea placeholder="Persona (optional — tone, style, generation...)" value={form.persona}
            onChange={e => setForm(f => ({ ...f, persona: e.target.value }))} rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500 resize-none" />
          <div className="grid grid-cols-2 gap-3">
            <select value={form.voiceEngine} onChange={e => setForm(f => ({ ...f, voiceEngine: e.target.value }))}
              className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500">
              <option value="elevenlabs">ElevenLabs</option>
              <option value="xtts">XTTS (self-hosted)</option>
              <option value="dia">Dia (RunPod)</option>
            </select>
            <input type="text" placeholder="Voice ID" value={form.voiceId}
              onChange={e => setForm(f => ({ ...f, voiceId: e.target.value }))}
              className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500" />
          </div>
          <div className="flex gap-3">
            <button onClick={createAvatar} disabled={creating || !form.name.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 disabled:opacity-50 transition-colors">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white">Cancel</button>
          </div>
        </div>
      )}

      {avatars.length === 0 ? (
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center">
          <User className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No avatars yet. Create one above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {avatars.map(avatar => (
            <div key={avatar.id} className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4 space-y-3">
              <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-gray-800 flex items-center justify-center">
                {avatar.referenceImageUrl ? (
                  <img src={`/api/storage/signed?key=${avatar.referenceImageUrl}`} alt={avatar.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-gray-600"><User className="w-8 h-8" /><span className="text-xs">No photo</span></div>
                )}
                {uploadingId === avatar.id && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-white" /></div>
                )}
              </div>
              <div>
                <p className="font-semibold text-white text-sm">{avatar.name}</p>
                {avatar.persona && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{avatar.persona}</p>}
                <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400">{avatar.voiceEngine}</span>
              </div>
              <button onClick={() => { activeAvatarId.current = avatar.id; fileRef.current?.click(); }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-gray-700 text-xs text-gray-400 hover:border-violet-500 hover:text-violet-400 transition-colors">
                <Upload className="w-3.5 h-3.5" />
                {avatar.referenceImageUrl ? "Replace photo" : "Upload photo"}
              </button>
            </div>
          ))}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file && activeAvatarId.current) uploadImage(activeAvatarId.current, file);
        }} />
    </div>
  );
}

// ─── Products Panel ───────────────────────────────────────
function ProductPanel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [error, setError] = useState("");

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/products");
    setProducts(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const ingestProduct = async () => {
    if (!url.trim()) return;
    setIngesting(true);
    setError("");
    try {
      const res = await fetch("/api/products/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error("Failed to scrape product");
      setUrl("");
      fetchProducts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4">
        <p className="text-sm text-gray-400 mb-3">Paste any product or affiliate URL to auto-fill details</p>
        <div className="flex gap-3">
          <input type="url" placeholder="https://amzn.to/... or any product page" value={url}
            onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && ingestProduct()}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500" />
          <button onClick={ingestProduct} disabled={ingesting || !url.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 disabled:opacity-50 transition-colors whitespace-nowrap">
            {ingesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />} Add product
          </button>
        </div>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>
      ) : products.length === 0 ? (
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center">
          <Package className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No products yet. Paste a URL above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map(product => (
            <div key={product.id} className="flex items-center gap-4 bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-3 hover:border-gray-700 transition-colors">
              <div className="w-14 h-14 rounded-xl bg-gray-800 overflow-hidden flex-shrink-0">
                {product.imageUrls[0] ? <img src={product.imageUrls[0]} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package className="w-5 h-5 text-gray-600" /></div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{product.name}</p>
                {product.price && <p className="text-xs text-emerald-400">{product.price}</p>}
                {product.brand && <p className="text-xs text-gray-500">{product.brand}</p>}
              </div>
              <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-violet-400 transition-colors">
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Generate Panel ───────────────────────────────────────
function GeneratePanel() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [jobs, setJobs] = useState<UGCJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAvatar, setSelectedAvatar] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [hookStyle, setHookStyle] = useState("TESTIMONIAL");
  const [customScript, setCustomScript] = useState("");
  const [useCustomScript, setUseCustomScript] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [lastJobId, setLastJobId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [avRes, prRes, jobRes] = await Promise.all([
      fetch("/api/avatars"), fetch("/api/products"), fetch("/api/ugc"),
    ]);
    const [av, pr, jo] = await Promise.all([avRes.json(), prRes.json(), jobRes.json()]);
    setAvatars(Array.isArray(av) ? av : []);
    setProducts(Array.isArray(pr) ? pr : []);
    setJobs(Array.isArray(jo) ? jo : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!lastJobId) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/ugc/${lastJobId}`);
      const job = await res.json();
      if (job.status === "DONE" || job.status === "FAILED") {
        setLastJobId(null);
        fetchData();
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [lastJobId, fetchData]);

  const generate = async () => {
    if (!selectedAvatar || !selectedProduct) return;
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/ugc/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarId: selectedAvatar, productId: selectedProduct, hookStyle, customScript: useCustomScript ? customScript : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setLastJobId(data.jobId);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>;

  return (
    <div className="space-y-6">
      {(avatars.length === 0 || products.length === 0) && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-300">
            {avatars.length === 0 && "Create an avatar in the Avatars tab first. "}
            {products.length === 0 && "Add a product in the Products tab first."}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Avatar</label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {avatars.map(a => (
              <button key={a.id} onClick={() => setSelectedAvatar(a.id)}
                className={cn("flex items-center gap-3 w-full px-3 py-2.5 rounded-xl border text-left transition-all",
                  selectedAvatar === a.id ? "border-violet-500 bg-violet-500/10" : "border-gray-800 bg-gray-900/50 hover:border-gray-700")}>
                <div className="w-8 h-8 rounded-lg bg-gray-800 flex-shrink-0 overflow-hidden">
                  {a.referenceImageUrl ? <img src={`/api/storage/signed?key=${a.referenceImageUrl}`} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><User className="w-4 h-4 text-gray-600" /></div>}
                </div>
                <div><p className="text-sm font-medium text-white">{a.name}</p><p className="text-xs text-gray-500">{a.voiceEngine}</p></div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Product</label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {products.map(p => (
              <button key={p.id} onClick={() => setSelectedProduct(p.id)}
                className={cn("flex items-center gap-3 w-full px-3 py-2.5 rounded-xl border text-left transition-all",
                  selectedProduct === p.id ? "border-violet-500 bg-violet-500/10" : "border-gray-800 bg-gray-900/50 hover:border-gray-700")}>
                <div className="w-8 h-8 rounded-lg bg-gray-800 flex-shrink-0 overflow-hidden">
                  {p.imageUrls[0] ? <img src={p.imageUrls[0]} alt="" className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-gray-600" />}
                </div>
                <div className="min-w-0"><p className="text-sm font-medium text-white truncate">{p.name}</p>{p.price && <p className="text-xs text-emerald-400">{p.price}</p>}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Hook style</label>
        <div className="flex flex-wrap gap-2">
          {HOOK_STYLES.map(h => (
            <button key={h.value} onClick={() => setHookStyle(h.value)}
              className={cn("px-3 py-1.5 rounded-xl text-xs font-medium border transition-all",
                hookStyle === h.value ? "border-violet-500 bg-violet-500/15 text-violet-400" : "border-gray-800 text-gray-400 hover:border-gray-700")}>
              {h.label} <span className="text-gray-600">{h.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={useCustomScript} onChange={e => setUseCustomScript(e.target.checked)} className="rounded" />
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Write my own script</span>
        </label>
        {useCustomScript && (
          <textarea placeholder="Write the exact words the avatar should say (30-45 seconds when spoken)..."
            value={customScript} onChange={e => setCustomScript(e.target.value)} rows={5}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500 resize-none" />
        )}
      </div>

      {error && <div className="flex items-center gap-2 text-red-400 text-sm"><XCircle className="w-4 h-4" /> {error}</div>}

      <button onClick={generate} disabled={!selectedAvatar || !selectedProduct || generating}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-violet-500 text-white font-medium hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        {generating ? <><Loader2 className="w-5 h-5 animate-spin" /> Generating...</> : <><Wand2 className="w-5 h-5" /> Generate UGC video</>}
      </button>

      {jobs.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="text-sm font-semibold text-white">Recent jobs</h3>
          {jobs.slice(0, 8).map(job => (
            <div key={job.id} className="flex items-center gap-4 bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{job.avatar.name} × {job.product.name}</p>
                <p className="text-xs text-gray-500">{job.hookStyle}</p>
              </div>
              <span className={cn("text-xs font-medium", STATUS_COLORS[job.status] || "text-gray-400")}>
                {["GENERATING_VIDEO", "COMPOSITING", "GENERATING_SCRIPT"].includes(job.status) && <Loader2 className="w-3 h-3 animate-spin inline mr-1" />}
                {job.status}
              </span>
              {job.status === "DONE" && job.outputUrl && (
                <a href={`/api/storage/signed?key=${job.outputUrl}`} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300">
                  <Play className="w-4 h-4" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────
export default function UGCStudioPage() {
  const [tab, setTab] = useState<"avatars" | "products" | "generate">("avatars");
  const tabs = [
    { id: "avatars" as const, label: "Avatars", icon: User },
    { id: "products" as const, label: "Products", icon: Package },
    { id: "generate" as const, label: "Generate", icon: Wand2 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">UGC Studio</h1>
        <p className="text-gray-400 mt-1">Create AI avatar videos for TikTok affiliate marketing</p>
      </div>
      <div className="flex gap-1 bg-gray-900/50 border border-gray-800 rounded-2xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
              tab === t.id ? "bg-violet-500/15 text-violet-400" : "text-gray-400 hover:text-white")}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>
      <div>
        {tab === "avatars" && <AvatarPanel />}
        {tab === "products" && <ProductPanel />}
        {tab === "generate" && <GeneratePanel />}
      </div>
    </div>
  );
}
```

---

## Task 4 — Animated Shorts page

**New file:** `app/dashboard/animated/page.tsx`

```tsx
"use client";
import { useState } from "react";
import { Wand2, Loader2, Play, AlertCircle } from "lucide-react";

export default function AnimatedShortsPage() {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const generate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/animated/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, aspectRatio: "9:16" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-white">Animated Shorts</h1>
        <p className="text-gray-400 mt-1">Generate fully animated YouTube Shorts — script, voiceover, visuals, all from a topic</p>
      </div>
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-4">
        <label className="block text-sm font-medium text-gray-300">Topic or title</label>
        <textarea placeholder="e.g. '5 things you didn't know about the Roman Empire'" value={topic}
          onChange={e => setTopic(e.target.value)} rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500 resize-none" />
        {error && <div className="flex items-center gap-2 text-red-400 text-sm"><AlertCircle className="w-4 h-4" /> {error}</div>}
        <button onClick={generate} disabled={loading || !topic.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-violet-500 text-white font-medium hover:bg-violet-600 disabled:opacity-50 transition-colors">
          {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Generating (takes a few minutes)...</> : <><Wand2 className="w-5 h-5" /> Generate animated short</>}
        </button>
      </div>
      {result && (
        <div className="bg-gray-900/50 border border-emerald-500/30 rounded-2xl p-6">
          <p className="text-emerald-400 font-medium mb-3">Video ready</p>
          {result.video_url && (
            <a href={result.video_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300">
              <Play className="w-4 h-4" /> Watch video
            </a>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## Task 5 — Supporting API routes

### `app/api/ugc/route.ts` (GET list of jobs)
```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jobs = await prisma.uGCJob.findMany({
    where: { userId: session.user.id },
    include: { avatar: { select: { name: true } }, product: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json(jobs);
}
```

### `app/api/storage/signed/route.ts` (signed R2 URLs for image preview)
```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT || "",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME || "youtubeshorts", Key: key }),
    { expiresIn: 3600 }
  );
  return NextResponse.redirect(url);
}
```

---

## Checklist

| # | File | Effort |
|---|------|--------|
| 1 | `components/sidebar.tsx` — add UGC Studio, Animated Shorts, Ingest to nav | 10 min |
| 2 | `app/dashboard/page.tsx` — add UGC Studio quick action | 5 min |
| 3 | `app/dashboard/ugc/page.tsx` — full UGC Studio page | 90 min |
| 4 | `app/dashboard/animated/page.tsx` — Animated Shorts page | 20 min |
| 5 | `app/api/ugc/route.ts` — job list GET | 5 min |
| 6 | `app/api/storage/signed/route.ts` — signed URL helper | 10 min |

**Total: ~2.5 hours**

---

## Design notes

- Violet accent: `violet-500/15` bg, `violet-400` text — match every other page exactly
- Cards: `bg-gray-900/50 border border-gray-800 rounded-2xl` — same as Library and Dashboard
- Status colors: emerald = done, red = failed, violet = processing, blue = queued
- Loading states: always `<Loader2 className="w-6 h-6 animate-spin text-violet-400" />`
- Empty states: gray icon + short gray text — same pattern as Library
- No new frontend dependencies needed — all built with existing Tailwind + Lucide
