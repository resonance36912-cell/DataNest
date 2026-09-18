import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, BookmarkPlus, Check, Download, Loader2, Sparkles, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { downloadUrl, saveToLibrary } from "@/lib/library";
import SEO from "@/components/SEO";
import { ResonanceFooter } from "@/components/brand/ResonanceFooter";
import { handlePremiumGatePayload } from "@/lib/errorHandlers";

const STYLES = [
  { id: "icon+text", label: "Icon + Text" },
  { id: "wordmark", label: "Wordmark" },
  { id: "lettermark", label: "Monogram" },
  { id: "icon", label: "Icon only" },
];

const VIBES = [
  "Modern & minimal", "Bold & confident", "Playful & friendly",
  "Luxury & refined", "Tech & futuristic", "Earthy & organic",
];

interface Concept {
  id: number;
  status: "idle" | "loading" | "done" | "error";
  dataUrl?: string;
  error?: string;
  savedId?: string;
  saving?: boolean;
}

const LogoDesigner = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [authChecked, setAuthChecked] = useState(false);

  const [brandName, setBrandName] = useState("");
  const [tagline, setTagline] = useState("");
  const [industry, setIndustry] = useState("");
  const [vibe, setVibe] = useState(VIBES[0]);
  const [colors, setColors] = useState("");
  const [style, setStyle] = useState("icon+text");

  const [concepts, setConcepts] = useState<Concept[]>(
    [1, 2, 3, 4].map((id) => ({ id, status: "idle" })),
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate("/login?return_to=/logo-designer");
        return;
      }
      setAuthChecked(true);
    });
  }, [navigate]);

  const generateOne = async (variant: number): Promise<void> => {
    setConcepts((prev) => prev.map((c) => (c.id === variant ? { ...c, status: "loading", error: undefined, dataUrl: undefined, savedId: undefined } : c)));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not signed in");

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-logo`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ brandName, tagline, industry, vibe, colors, style, variant }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 402 && (json as any)?.requiresPremium) {
          handlePremiumGatePayload(toast, json, "Logo generation");
          setConcepts((prev) => prev.map((c) => (c.id === variant ? { ...c, status: "error", error: "Premium required" } : c)));
          return;
        }
        throw new Error(json?.error || "Generation failed");
      }

      setConcepts((prev) =>
        prev.map((c) => (c.id === variant ? { ...c, status: "done", dataUrl: json.dataUrl } : c)),
      );
    } catch (e) {
      const msg = (e as Error).message;
      setConcepts((prev) => prev.map((c) => (c.id === variant ? { ...c, status: "error", error: msg } : c)));
      toast({ title: `Concept ${variant} failed`, description: msg, variant: "destructive" });
    }
  };

  const handleGenerate = async () => {
    if (!brandName.trim()) {
      toast({ title: "Brand name required", description: "Tell us what to design for.", variant: "destructive" });
      return;
    }
    await Promise.all([1, 2, 3, 4].map((v) => generateOne(v)));
  };

  const handleDownload = async (c: Concept) => {
    if (!c.dataUrl) return;
    const safe = brandName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "logo";
    await downloadUrl(c.dataUrl, `${safe}-concept-${c.id}.png`);
  };

  const handleSave = async (c: Concept) => {
    if (!c.dataUrl) return;
    setConcepts((prev) => prev.map((x) => (x.id === c.id ? { ...x, saving: true } : x)));
    try {
      const item = await saveToLibrary({
        url: c.dataUrl,
        kind: "logo",
        label: `${brandName} — concept ${c.id}`,
        aspectRatio: "1:1",
        brief: { brandName, tagline, industry, vibe, colors, style, variant: c.id },
      });
      setConcepts((prev) => prev.map((x) => (x.id === c.id ? { ...x, saving: false, savedId: item.id } : x)));
      toast({ title: "Saved to Library", description: `Concept ${c.id} is in your Library.` });
    } catch (e) {
      setConcepts((prev) => prev.map((x) => (x.id === c.id ? { ...x, saving: false } : x)));
      toast({ title: "Couldn't save", description: (e as Error).message, variant: "destructive" });
    }
  };

  const anyLoading = concepts.some((c) => c.status === "loading");

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="AI Logo Designer — Resonance Creative Studio"
        description="Describe your brand and generate four refined AI logo concepts in seconds. Save to your Library or download instantly."
        path="/logo-designer"
      />

      <nav className="sticky top-0 z-30 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl px-4 sm:px-6">
        <div className="h-16 max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/studio" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Back to Studio
          </Link>
          <Link to="/library" className="text-sm text-muted-foreground hover:text-foreground">
            My Library →
          </Link>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-card/60 px-3 py-1 text-xs text-muted-foreground mb-4">
            <Sparkles className="w-3.5 h-3.5 text-primary" /> New · AI Logo Designer
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold leading-tight">
            Design a <span className="studio-gradient-text">logo</span> from a brand prompt.
          </h1>
          <p className="text-muted-foreground mt-3 max-w-2xl">
            Tell us about your brand. We'll generate four distinct concepts you can refine, download or save to your Library.
          </p>
        </div>

        <div className="grid lg:grid-cols-[380px_1fr] gap-8">
          {/* Form */}
          <div className="studio-card p-5 space-y-4 h-fit">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand name *</label>
              <input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="e.g. Aurora Studio"
                className="mt-1.5 w-full rounded-md bg-secondary/60 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tagline (optional)</label>
              <input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Light, made loud"
                className="mt-1.5 w-full rounded-md bg-secondary/60 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Industry</label>
              <input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="Coffee roastery, fintech, music studio…"
                className="mt-1.5 w-full rounded-md bg-secondary/60 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vibe</label>
              <select
                value={vibe}
                onChange={(e) => setVibe(e.target.value)}
                className="mt-1.5 w-full rounded-md bg-secondary/60 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {VIBES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Colors</label>
              <input
                value={colors}
                onChange={(e) => setColors(e.target.value)}
                placeholder="deep navy + warm gold"
                className="mt-1.5 w-full rounded-md bg-secondary/60 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Logo style</label>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStyle(s.id)}
                    className={`rounded-md border px-3 py-2 text-xs transition-colors ${
                      style === s.id
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-white/10 bg-secondary/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={anyLoading}
              className="w-full studio-gradient-bg text-primary-foreground font-semibold text-sm px-4 py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {anyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {anyLoading ? "Designing concepts…" : "Generate 4 concepts"}
            </button>
            <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
              Each render takes 10–25 seconds. Save the ones you love — refine the rest by clicking regenerate on a single concept.
            </p>
          </div>

          {/* Concept grid */}
          <div className="grid sm:grid-cols-2 gap-4">
            {concepts.map((c) => (
              <motion.div
                key={c.id}
                layout
                className="studio-card overflow-hidden flex flex-col"
              >
                <div className="aspect-square bg-white/[0.02] border-b border-white/5 flex items-center justify-center relative">
                  {c.status === "idle" && (
                    <div className="text-xs text-muted-foreground/70 text-center px-4">
                      Concept {c.id}<br />
                      <span className="opacity-60">Awaiting brief</span>
                    </div>
                  )}
                  {c.status === "loading" && (
                    <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      Rendering concept {c.id}…
                    </div>
                  )}
                  {c.status === "error" && (
                    <div className="text-xs text-destructive text-center px-4">
                      {c.error || "Failed"}
                    </div>
                  )}
                  {c.status === "done" && c.dataUrl && (
                    <img
                      src={c.dataUrl}
                      alt={`${brandName} concept ${c.id}`}
                      className="w-full h-full object-contain bg-white"
                    />
                  )}
                </div>
                <div className="p-3 flex items-center justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Concept {c.id}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => generateOne(c.id)}
                      disabled={c.status === "loading" || !brandName.trim()}
                      title="Regenerate this concept"
                      className="text-xs px-2.5 py-1.5 rounded-md border border-white/10 hover:bg-white/[0.05] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ↻
                    </button>
                    <button
                      onClick={() => handleDownload(c)}
                      disabled={c.status !== "done"}
                      title="Download PNG"
                      className="text-xs px-2.5 py-1.5 rounded-md border border-white/10 hover:bg-white/[0.05] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleSave(c)}
                      disabled={c.status !== "done" || c.saving || !!c.savedId}
                      title={c.savedId ? "Saved to Library" : "Save to Library"}
                      className="text-xs px-2.5 py-1.5 rounded-md border border-white/10 hover:bg-white/[0.05] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60 flex items-center gap-1"
                    >
                      {c.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : c.savedId ? <Check className="w-3.5 h-3.5 text-primary" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      <ResonanceFooter currentApp="Creative Studio" />
    </div>
  );
};

export default LogoDesigner;
