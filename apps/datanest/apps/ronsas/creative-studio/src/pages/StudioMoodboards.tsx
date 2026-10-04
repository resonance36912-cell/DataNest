import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, Trash2, Upload, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import StudioNav from "@/components/studio/StudioNav";
import StudioSubNav from "@/components/studio/StudioSubNav";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  listMyMoodboards, createMoodboard, deleteMoodboard,
  listMoodboardImages, addMoodboardImage, deleteMoodboardImage,
  analyzeMoodboard,
  type Moodboard, type MoodboardImage,
} from "@/lib/brandDna";

const StudioMoodboards = () => {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState<Moodboard[]>([]);
  const [open, setOpen] = useState<Moodboard | null>(null);
  const [images, setImages] = useState<MoodboardImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { navigate("/login?next=/studio/moodboards"); return; }
      setAuthed(true);
      try { setBoards(await listMyMoodboards()); } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [navigate]);

  const openBoard = async (b: Moodboard) => {
    setOpen(b);
    setImages(await listMoodboardImages(b.id));
  };

  const createNew = async () => {
    if (!newName.trim()) return;
    const b = await createMoodboard(newName.trim());
    setNewName("");
    setBoards([b, ...boards]);
    openBoard(b);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this moodboard?")) return;
    await deleteMoodboard(id);
    setBoards(boards.filter((b) => b.id !== id));
    if (open?.id === id) setOpen(null);
  };

  const onPickFile = async (f: File | null) => {
    if (!f || !open) return;
    setBusy(true);
    try {
      const img = await addMoodboardImage(open.id, f);
      setImages([...images, img]);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const removeImg = async (id: string) => {
    await deleteMoodboardImage(id);
    setImages(images.filter((i) => i.id !== id));
  };

  const analyze = async () => {
    if (!open) return;
    setBusy(true);
    try {
      const updated = await analyzeMoodboard(open.id);
      setOpen(updated);
      setBoards(boards.map((b) => (b.id === updated.id ? updated : b)));
      toast.success("Moodboard analyzed");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO title="Moodboards — Resonance Creative Studio" description="Reusable visual reference boards for on-brand generation." path="/studio/moodboards" />
      <StudioNav isAnalyzing={false} isAuthenticated={authed} />
      <StudioSubNav />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header>
          <h1 className="font-display text-2xl studio-gradient-text">Moodboards</h1>
          <p className="text-sm text-muted-foreground">Drop reference images. Analyze once, reuse across generations.</p>
        </header>

        <Card className="p-4 flex gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New moodboard name" />
          <Button onClick={createNew} className="studio-gradient-bg"><Plus className="w-4 h-4 mr-1" /> Create</Button>
        </Card>

        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : boards.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">No moodboards yet.</Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map((b) => (
              <Card key={b.id} className="p-4 space-y-2 cursor-pointer hover:ring-1 hover:ring-primary/40" onClick={() => openBoard(b)}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{b.name}</div>
                    <div className="text-xs text-muted-foreground">{b.analyzed_at ? "Analyzed" : "Not analyzed"}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); remove(b.id); }} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {open && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpen(null)}>
            <Card className="w-full max-w-2xl p-5 space-y-4 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg">{open.name}</h2>
                <button onClick={() => setOpen(null)}><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {images.map((img) => (
                  <div key={img.id} className="relative aspect-square rounded-md overflow-hidden ring-1 ring-white/10">
                    <img src={img.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    <button onClick={() => removeImg(img.id)} className="absolute top-1 right-1 bg-black/60 rounded p-1 hover:bg-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="aspect-square rounded-md border border-dashed border-white/15 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40"
                >
                  <Upload className="w-5 h-5" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickFile(e.target.files?.[0] ?? null)} />
              </div>
              <div className="flex items-center justify-between gap-2 pt-2">
                <div className="text-xs text-muted-foreground">
                  {images.length} image{images.length === 1 ? "" : "s"}
                </div>
                <Button onClick={analyze} disabled={busy || images.length === 0} className="studio-gradient-bg">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Analyze
                </Button>
              </div>
              {open.analyzed_at && (
                <pre className="text-xs bg-secondary/40 p-3 rounded-md overflow-auto max-h-48">
                  {JSON.stringify(open.analysis, null, 2)}
                </pre>
              )}
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default StudioMoodboards;
