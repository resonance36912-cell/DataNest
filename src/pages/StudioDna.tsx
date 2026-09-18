import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Save, Sparkles, ArrowRight, Copy, Check, Pencil, Trash2, BookmarkPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import StudioNav from "@/components/studio/StudioNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  getMyBrandDna,
  upsertMyBrandDna,
  type BrandDna,
} from "@/lib/brandDna";
import StudioSubNav from "@/components/studio/StudioSubNav";
import SEO from "@/components/SEO";
import TemplateEditorDialog from "@/components/studio/TemplateEditorDialog";
import {
  BUILTIN_TEMPLATES,
  EMPTY_TEMPLATE_DATA,
  type DnaTemplate,
  type DnaTemplateData,
  type SavedTemplate,
  deleteSavedTemplate,
  listSavedTemplates,
  saveTemplate,
  updateSavedTemplate,
} from "@/lib/dnaTemplates";

const toLines = (xs: string[] | null | undefined) => (xs ?? []).join("\n");
const fromLines = (s: string) =>
  s.split("\n").map((x) => x.trim()).filter(Boolean);

const StudioDna = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [dna, setDna] = useState<Partial<BrandDna>>({});

  // form mirrors of array fields
  const [valueProps, setValueProps] = useState("");
  const [wordsUse, setWordsUse] = useState("");
  const [wordsAvoid, setWordsAvoid] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Templates: built-in + user-saved + editor dialog state.
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTemplate, setEditorTemplate] = useState<DnaTemplate | null>(null);
  const allTemplates = useMemo<DnaTemplate[]>(
    () => [...savedTemplates, ...BUILTIN_TEMPLATES],
    [savedTemplates],
  );

  const applyTemplateData = (data: DnaTemplateData, label?: string) => {
    setDna({
      ...dna,
      brand_name: data.brand_name,
      website_url: data.website_url,
      tagline: data.tagline,
      mission: data.mission,
      voice_tone: data.voice_tone,
      audience: data.audience,
      competitors: data.competitors,
      extra_guidelines: data.extra_guidelines,
    });
    setValueProps(data.value_props.join("\n"));
    setWordsUse(data.voice_words_use.join("\n"));
    setWordsAvoid(data.voice_words_avoid.join("\n"));
    toast.success(label ? `Loaded "${label}" template` : "Template applied", {
      description: "Edit any field to make it yours, then Save DNA.",
    });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const applyTemplate = (t: DnaTemplate) => applyTemplateData(t.data, t.label);

  const openEditor = (t: DnaTemplate) => {
    setEditorTemplate(t);
    setEditorOpen(true);
  };

  const openBlankEditor = () => {
    const blank: SavedTemplate = {
      id: "__blank__",
      label: "New template",
      blurb: "Build from scratch",
      icon: BookmarkPlus,
      accent: "from-primary/15 to-transparent ring-primary/30",
      data: { ...EMPTY_TEMPLATE_DATA },
      builtIn: false,
      updated_at: new Date().toISOString(),
    };
    setEditorTemplate(blank);
    setEditorOpen(true);
  };

  const handleSaveAs = async (name: string, data: DnaTemplateData) => {
    try {
      const saved = await saveTemplate(name, data);
      setSavedTemplates((prev) => [saved, ...prev.filter((s) => s.id !== saved.id)]);
      toast.success(`Saved template "${saved.label}"`);
      setEditorOpen(false);
    } catch (e) {
      toast.error((e as Error).message || "Could not save template");
    }
  };

  const handleUpdateSaved = async (
    id: string,
    name: string,
    data: DnaTemplateData,
    expectedUpdatedAt?: string,
  ): Promise<string> => {
    // Let the dialog handle errors (including TemplateConflictError) directly.
    const newUpdatedAt = await updateSavedTemplate(id, { name, data }, expectedUpdatedAt);
    setSavedTemplates((prev) =>
      prev.map((s) => (s.id === id ? { ...s, label: name, data, updated_at: newUpdatedAt } : s)),
    );
    toast.success("Template updated");
    return newUpdatedAt;
  };


  const handleDeleteSaved = async (id: string, label: string) => {
    if (!confirm(`Delete template "${label}"? This can't be undone.`)) return;
    try {
      await deleteSavedTemplate(id);
      setSavedTemplates((prev) => prev.filter((s) => s.id !== id));
      toast.success("Template deleted");
    } catch (e) {
      toast.error((e as Error).message || "Could not delete template");
    }
  };


  const copySample = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1500);
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  };


  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        navigate("/login?next=/studio/dna");
        return;
      }
      setAuthed(true);
      try {
        const row = await getMyBrandDna();
        if (row) {
          setDna(row);
          setValueProps(toLines(row.value_props));
          setWordsUse(toLines(row.voice_words_use));
          setWordsAvoid(toLines(row.voice_words_avoid));
        }
        try {
          const saved = await listSavedTemplates();
          setSavedTemplates(saved);
        } catch (e) {
          console.error("Failed to load saved templates", e);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const save = async () => {
    setSaving(true);
    try {
      const row = await upsertMyBrandDna({
        brand_name: dna.brand_name ?? null,
        website_url: dna.website_url ?? null,
        tagline: dna.tagline ?? null,
        mission: dna.mission ?? null,
        audience: dna.audience ?? null,
        competitors: dna.competitors ?? null,
        voice_tone: dna.voice_tone ?? null,
        extra_guidelines: dna.extra_guidelines ?? null,
        value_props: fromLines(valueProps),
        voice_words_use: fromLines(wordsUse),
        voice_words_avoid: fromLines(wordsAvoid),
      });
      setDna(row);
      toast.success("Brand DNA saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO
        title="Brand DNA — Resonance Creative Studio"
        description="Define your brand identity once. Every generation uses it."
        path="/studio/dna"
      />
      <StudioNav isAnalyzing={false} isAuthenticated={authed} />
      <StudioSubNav />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="space-y-1">
          <h1 className="font-display text-2xl studio-gradient-text">Brand DNA</h1>
          <p className="text-sm text-muted-foreground">
            Set this once. Studio Generate reads from here so it never has to scrape your site at request time.
          </p>
        </header>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {!dna.id && (
              <Card className="p-6 bg-gradient-to-br from-primary/10 via-accent/5 to-transparent ring-1 ring-primary/20">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-full studio-gradient-bg flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div className="space-y-2 flex-1 min-w-0">
                    <h2 className="font-display text-lg leading-tight">Let's set up your Brand DNA</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Tell Studio who you are once. From then on, every poster, video and social post
                      generates from your voice — no scraping, no waiting.
                    </p>
                    <div className="rounded-lg bg-background/60 ring-1 ring-white/[0.08] p-3 mt-2">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-primary mb-1.5 font-medium">Fill these first (60-second version)</p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        <li>• <span className="text-foreground">Brand name</span> — what to call you in headlines</li>
                        <li>• <span className="text-foreground">Tagline</span> — one line that captures the promise</li>
                        <li>• <span className="text-foreground">Voice / tone</span> — 3-5 words (e.g. "calm, confident, conscious")</li>
                        <li>• <span className="text-foreground">Audience</span> — who you're talking to</li>
                      </ul>
                      <p className="text-[11px] text-muted-foreground mt-2">The rest (mission, value props, words to avoid, competitors) sharpens output but isn't required.</p>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {!dna.id && (
              <Card className="p-5 space-y-4">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="font-display text-base">Start from a template</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      One click applies a starter. Or hit <span className="text-foreground">Customize</span> to tweak it first
                      and save your own version for next time.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={openBlankEditor}
                    className="text-xs"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5 mr-1.5" />
                    New template
                  </Button>
                </div>

                {savedTemplates.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-primary font-medium">Your saved templates</p>
                    <div className="grid sm:grid-cols-3 gap-3">
                      {savedTemplates.map((t) => {
                        const Icon = t.icon;
                        return (
                          <div
                            key={t.id}
                            className={`rounded-xl p-3.5 bg-gradient-to-br ${t.accent} ring-1 ring-primary/30 group relative`}
                          >
                            <button
                              type="button"
                              onClick={() => applyTemplate(t)}
                              className="text-left w-full"
                            >
                              <div className="flex items-center gap-2 mb-1.5 pr-12">
                                <Icon className="w-4 h-4 text-foreground/90" />
                                <span className="font-display text-sm truncate">{t.label}</span>
                              </div>
                              <p className="text-[11px] leading-snug text-muted-foreground line-clamp-2">
                                {t.data.tagline || t.data.brand_name || "Custom template"}
                              </p>
                              <p className="text-[10.5px] mt-2 text-primary inline-flex items-center gap-1 opacity-80 group-hover:opacity-100">
                                Apply <ArrowRight className="w-3 h-3" />
                              </p>
                            </button>
                            <div className="absolute top-2 right-2 flex gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => openEditor(t)}
                                title="Edit template"
                                className="p-1 rounded hover:bg-white/10 text-foreground/80"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSaved(t.id, t.label)}
                                title="Delete template"
                                className="p-1 rounded hover:bg-destructive/20 text-foreground/80 hover:text-destructive"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {savedTemplates.length > 0 && (
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-medium">Built-in starters</p>
                  )}
                  <div className="grid sm:grid-cols-3 gap-3">
                    {BUILTIN_TEMPLATES.map((t) => {
                      const Icon = t.icon;
                      return (
                        <div
                          key={t.id}
                          className={`rounded-xl p-3.5 bg-gradient-to-br ${t.accent} ring-1 hover:ring-2 transition-all group relative`}
                        >
                          <button
                            type="button"
                            onClick={() => applyTemplate(t)}
                            className="text-left w-full"
                          >
                            <div className="flex items-center gap-2 mb-1.5">
                              <Icon className="w-4 h-4 text-foreground/90" />
                              <span className="font-display text-sm">{t.label}</span>
                            </div>
                            <p className="text-[11px] leading-snug text-muted-foreground">{t.blurb}</p>
                            <p className="text-[10.5px] mt-2 text-primary inline-flex items-center gap-1 opacity-80 group-hover:opacity-100">
                              Use this template <ArrowRight className="w-3 h-3" />
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditor(t)}
                            title="Customize before applying"
                            className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] bg-background/70 ring-1 ring-white/10 hover:ring-primary/40 text-foreground/85 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                            Customize
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>


                <details className="rounded-lg bg-background/60 ring-1 ring-white/[0.06] open:ring-white/[0.12]">
                  <summary className="cursor-pointer list-none px-3.5 py-2.5 text-xs font-medium text-foreground/85 flex items-center justify-between">
                    <span>Or copy individual field samples</span>
                    <span className="text-[10px] text-muted-foreground">click to expand</span>
                  </summary>
                  <div className="px-3.5 pb-3.5 pt-1 space-y-2.5">
                    {[
                      { key: "tagline", label: "Tagline", samples: BUILTIN_TEMPLATES.map((t) => t.data.tagline) },
                      { key: "mission", label: "Mission", samples: BUILTIN_TEMPLATES.map((t) => t.data.mission) },
                      { key: "voice_tone", label: "Voice / tone", samples: BUILTIN_TEMPLATES.map((t) => t.data.voice_tone) },
                      { key: "audience", label: "Audience", samples: BUILTIN_TEMPLATES.map((t) => t.data.audience) },
                      {
                        key: "value_props",
                        label: "Value propositions (one per line)",
                        samples: BUILTIN_TEMPLATES.map((t) => t.data.value_props.join("\n")),
                      },
                      {
                        key: "voice_words_use",
                        label: "Words to use",
                        samples: BUILTIN_TEMPLATES.map((t) => t.data.voice_words_use.join(", ")),
                      },
                      {
                        key: "voice_words_avoid",
                        label: "Words to avoid",
                        samples: BUILTIN_TEMPLATES.map((t) => t.data.voice_words_avoid.join(", ")),
                      },
                    ].map((field) => (
                      <div key={field.key} className="space-y-1.5">
                        <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">{field.label}</p>
                        <div className="grid sm:grid-cols-3 gap-1.5">
                          {field.samples.map((sample, i) => {
                            const k = `${field.key}-${i}`;
                            const copied = copiedKey === k;
                            return (
                              <button
                                key={k}
                                type="button"
                                onClick={() => copySample(k, sample)}
                                title="Click to copy"
                                className="text-left rounded-md bg-white/[0.03] hover:bg-white/[0.06] ring-1 ring-white/[0.06] hover:ring-primary/40 p-2 text-[11px] leading-snug text-foreground/85 transition-colors group relative"
                              >
                                <span className="line-clamp-3 whitespace-pre-line pr-5">{sample}</span>
                                <span className="absolute top-1.5 right-1.5 text-muted-foreground group-hover:text-primary">
                                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </Card>
            )}




          <Card className="p-5 space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center gap-2">Brand name <span className="text-[10px] uppercase tracking-wider text-primary">Required</span></Label>
                <Input
                  value={dna.brand_name ?? ""}
                  onChange={(e) => setDna({ ...dna, brand_name: e.target.value })}
                  placeholder="e.g. Aurum Naturals"
                />
                <p className="text-[11px] text-muted-foreground mt-1">How Studio refers to you in headlines.</p>
              </div>
              <div>
                <Label className="flex items-center gap-2">Website <span className="text-[10px] text-muted-foreground">Optional</span></Label>
                <Input
                  value={dna.website_url ?? ""}
                  onChange={(e) => setDna({ ...dna, website_url: e.target.value })}
                  placeholder="https://yoursite.com"
                />
                <p className="text-[11px] text-muted-foreground mt-1">For reference only — Studio no longer scrapes at generate time.</p>
              </div>
            </div>
            <div>
              <Label className="flex items-center gap-2">Tagline <span className="text-[10px] uppercase tracking-wider text-primary">Recommended</span></Label>
              <Input
                value={dna.tagline ?? ""}
                onChange={(e) => setDna({ ...dna, tagline: e.target.value })}
                placeholder="One line that captures the promise"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Used as a default headline when nothing better fits.</p>
            </div>
            <div>
              <Label className="flex items-center gap-2">Mission <span className="text-[10px] text-muted-foreground">Optional</span></Label>
              <Textarea
                rows={2}
                value={dna.mission ?? ""}
                onChange={(e) => setDna({ ...dna, mission: e.target.value })}
                placeholder="Why you exist, in 1-2 sentences."
              />
            </div>
            <div>
              <Label className="flex items-center gap-2">Value propositions <span className="text-[10px] text-muted-foreground">one per line · 3-5 ideal</span></Label>
              <Textarea
                rows={3}
                value={valueProps}
                onChange={(e) => setValueProps(e.target.value)}
                placeholder="Faster than alternatives&#10;ZAR-priced&#10;Made in South Africa"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Become bullet points in brochures and ads.</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center gap-2">Voice / tone <span className="text-[10px] uppercase tracking-wider text-primary">Recommended</span></Label>
                <Input
                  value={dna.voice_tone ?? ""}
                  onChange={(e) => setDna({ ...dna, voice_tone: e.target.value })}
                  placeholder="Calm, confident, conscious"
                />
                <p className="text-[11px] text-muted-foreground mt-1">3-5 adjectives. Shapes copywriting tone.</p>
              </div>
              <div>
                <Label className="flex items-center gap-2">Audience <span className="text-[10px] uppercase tracking-wider text-primary">Recommended</span></Label>
                <Input
                  value={dna.audience ?? ""}
                  onChange={(e) => setDna({ ...dna, audience: e.target.value })}
                  placeholder="e.g. SA wellness-conscious women 28-45"
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center gap-2">Words to use <span className="text-[10px] text-muted-foreground">one per line · optional</span></Label>
                <Textarea
                  rows={3}
                  value={wordsUse}
                  onChange={(e) => setWordsUse(e.target.value)}
                  placeholder="conscious&#10;crafted&#10;rooted"
                />
              </div>
              <div>
                <Label className="flex items-center gap-2">Words to avoid <span className="text-[10px] text-muted-foreground">one per line · optional</span></Label>
                <Textarea
                  rows={3}
                  value={wordsAvoid}
                  onChange={(e) => setWordsAvoid(e.target.value)}
                  placeholder="amazing&#10;revolutionary&#10;game-changing"
                />
              </div>
            </div>

            <div>
              <Label>Competitors</Label>
              <Textarea
                rows={2}
                value={dna.competitors ?? ""}
                onChange={(e) => setDna({ ...dna, competitors: e.target.value })}
                placeholder="Who you compete with and how you're different"
              />
            </div>
            <div>
              <Label>Extra brand guidelines</Label>
              <Textarea
                rows={3}
                value={dna.extra_guidelines ?? ""}
                onChange={(e) => setDna({ ...dna, extra_guidelines: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={save} disabled={saving} className="studio-gradient-bg">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save DNA
              </Button>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Tip: add Products and Moodboards next to give Studio more to work with.
            </p>
          </Card>
          </>
        )}
      </main>
      <TemplateEditorDialog
        open={editorOpen}
        template={editorTemplate}
        onClose={() => setEditorOpen(false)}
        onApply={(data) => {
          applyTemplateData(data, editorTemplate?.label);
          setEditorOpen(false);
        }}
        onSaveAs={handleSaveAs}
        onUpdateSaved={
          editorTemplate && !editorTemplate.builtIn && editorTemplate.id !== "__blank__"
            ? (id, name, data) => handleUpdateSaved(id, name, data)
            : undefined
        }
        onRestored={async () => {
          try {
            const refreshed = await listSavedTemplates();
            setSavedTemplates(refreshed);
          } catch (e) {
            console.error("Failed to refresh templates after restore", e);
          }
        }}
      />
    </div>
  );
};

export default StudioDna;
