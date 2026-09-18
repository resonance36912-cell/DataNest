import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, Trash2, Upload, Globe, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import StudioNav from "@/components/studio/StudioNav";
import StudioSubNav from "@/components/studio/StudioSubNav";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  listMyProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
  importProductFromUrl,
  type Product,
} from "@/lib/brandDna";

const StudioProducts = () => {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        navigate("/login?next=/studio/products");
        return;
      }
      setAuthed(true);
      try {
        setItems(await listMyProducts());
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [navigate]);

  const refresh = async () => setItems(await listMyProducts());

  const startNew = () => setEditing({
    id: "",
    user_id: "",
    name: "",
    description: "",
    price_display: "",
    category: "",
    key_features: [],
    hero_image_url: null,
    extra_images: [],
    source_url: null,
    last_imported_at: null,
    created_at: "",
    updated_at: "",
  });

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { toast.error("Name is required"); return; }
    setBusy(true);
    try {
      if (editing.id) {
        await updateProduct(editing.id, {
          name: editing.name,
          description: editing.description,
          price_display: editing.price_display,
          category: editing.category,
          key_features: editing.key_features,
          hero_image_url: editing.hero_image_url,
          source_url: editing.source_url,
        });
      } else {
        await createProduct({
          name: editing.name,
          description: editing.description,
          price_display: editing.price_display,
          category: editing.category,
          key_features: editing.key_features,
          hero_image_url: editing.hero_image_url,
          source_url: editing.source_url,
        });
      }
      toast.success("Product saved");
      setEditing(null);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    await deleteProduct(id);
    await refresh();
  };

  const onPickFile = async (f: File | null) => {
    if (!f || !editing) return;
    const ALLOWED = ["image/png", "image/jpeg", "image/webp"];
    if (!ALLOWED.includes(f.type)) {
      toast.error("Use a PNG, JPG or WebP image.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error(`Image is ${(f.size / 1024 / 1024).toFixed(1)} MB â€” keep it under 5 MB.`);
      return;
    }
    // Soft dimension check â€” warn but don't block.
    try {
      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => reject(new Error("decode"));
        img.src = URL.createObjectURL(f);
      });
      const longSide = Math.max(dims.w, dims.h);
      if (longSide < 800) {
        toast.warning(`Image is only ${dims.w}Ã—${dims.h}px â€” 1024-2048px works best.`);
      } else if (longSide > 4096) {
        toast.warning(`Image is ${dims.w}Ã—${dims.h}px â€” Studio will downscale. 1024-2048px is ideal.`);
      }
    } catch { /* ignore decode failures */ }
    setBusy(true);
    try {
      const url = await uploadProductImage(f);
      setEditing({ ...editing, hero_image_url: url });
      toast.success("Image uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };


  const onImport = async () => {
    if (!importUrl.trim()) return;
    setBusy(true);
    try {
      const p = await importProductFromUrl(importUrl.trim());
      toast.success(`Imported: ${p.name}`);
      setImportUrl("");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO title="Products â€” Resonance Creative Studio" description="Curated product catalog used at generate time." path="/studio/products" />
      <StudioNav isAnalyzing={false} isAuthenticated={authed} />
      <StudioSubNav />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-2xl studio-gradient-text">Products</h1>
            <p className="text-sm text-muted-foreground">Reusable SKUs with curated hero images. Pick one at generate time.</p>
          </div>
          <Button onClick={startNew} className="studio-gradient-bg">
            <Plus className="w-4 h-4 mr-1" /> New product
          </Button>
        </header>

        <Card className="p-4 space-y-2">
          <Label className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Quick import from URL</Label>
          <div className="flex gap-2">
            <Input value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="https://your-site.com/products/â€¦" />
            <Button onClick={onImport} disabled={busy || !importUrl.trim()} variant="secondary">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Import"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Scrape happens in the background. Your Generate flow never waits on it.</p>
        </Card>

        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <Card className="p-8 bg-gradient-to-br from-primary/10 via-accent/5 to-transparent ring-1 ring-primary/20">
            <div className="max-w-xl mx-auto text-center space-y-4">
              <div className="mx-auto w-14 h-14 rounded-full studio-gradient-bg flex items-center justify-center">
                <ImageIcon className="w-7 h-7 text-white" />
              </div>
              <div className="space-y-1.5">
                <h2 className="font-display text-xl">Add your first product</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  A product is just a name plus a hero image. Studio uses that image as the
                  central visual in every poster, ad and video â€” so it always shows your real
                  packaging, never invented art.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3 text-left pt-2">
                <button
                  type="button"
                  onClick={startNew}
                  className="group rounded-xl p-4 bg-background/60 ring-1 ring-white/[0.08] hover:ring-primary/40 transition-all text-left"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Plus className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">Create manually</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">
                    Type the name, upload a hero photo. Fastest path â€” under 30 seconds.
                  </p>
                </button>
                <div className="rounded-xl p-4 bg-background/60 ring-1 ring-white/[0.08]">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Globe className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">Import from a URL</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">
                    Paste a product page URL above. Scrape runs in the background â€” no waiting.
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-background/60 ring-1 ring-white/[0.08] p-3 text-left">
                <p className="text-[11px] uppercase tracking-[0.16em] text-primary mb-1.5 font-medium">Hero image â€” what works best</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>â€¢ <span className="text-foreground">Real product photo</span> (not a mockup or illustration)</li>
                  <li>â€¢ <span className="text-foreground">PNG or JPG</span>, under 5 MB</li>
                  <li>â€¢ <span className="text-foreground">1024-2048 px</span> on the long side, square or 4:5 portrait</li>
                  <li>â€¢ <span className="text-foreground">Plain, uncluttered background</span> (white, soft gradient, or transparent PNG)</li>
                  <li>â€¢ Product centred and fully in-frame â€” Studio will place this as the hero in every generation</li>
                </ul>
              </div>
              <ol className="text-[11px] text-muted-foreground space-y-0.5 pt-1 inline-block text-left">
                <li>1. Add a product (here)</li>
                <li>2. Upload a clean hero image</li>
                <li>3. Pick it on /studio and Generate instantly</li>
              </ol>
            </div>
          </Card>



        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((p) => (
              <Card key={p.id} className="overflow-hidden">
                <div className="aspect-video bg-secondary/40 flex items-center justify-center">
                  {p.hero_image_url ? (
                    <img src={p.hero_image_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <div className="p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      {p.price_display && <div className="text-xs text-muted-foreground">{p.price_display}</div>}
                    </div>
                    <button onClick={() => remove(p.id)} className="text-muted-foreground hover:text-destructive" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <Button size="sm" variant="outline" className="w-full mt-1" onClick={() => setEditing(p)}>Edit</Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {editing && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditing(null)}>
            <Card className="w-full max-w-xl p-5 space-y-4 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <h2 className="font-display text-lg">{editing.id ? "Edit product" : "New product"}</h2>
              <div>
                <Label className="flex items-center gap-2">Name <span className="text-[10px] uppercase tracking-wider text-primary">Required</span></Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Aurum Naturals Serum" />
                <p className="text-[11px] text-muted-foreground mt-1">How Studio refers to this product in copy.</p>
              </div>
              <div>
                <Label className="flex items-center gap-2">Description <span className="text-[10px] text-muted-foreground">Recommended</span></Label>
                <Textarea rows={3} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="1-2 sentences. Becomes the supporting line in posters and ads." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="flex items-center gap-2">Price <span className="text-[10px] text-muted-foreground">Optional</span></Label>
                  <Input value={editing.price_display ?? ""} onChange={(e) => setEditing({ ...editing, price_display: e.target.value })} placeholder="R549" />
                </div>
                <div>
                  <Label className="flex items-center gap-2">Category <span className="text-[10px] text-muted-foreground">Optional</span></Label>
                  <Input value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder="e.g. Skincare" />
                </div>
              </div>
              <div>
                <Label className="flex items-center gap-2">Key features <span className="text-[10px] text-muted-foreground">one per line Â· 3-5 ideal</span></Label>
                <Textarea
                  rows={3}
                  value={editing.key_features.join("\n")}
                  onChange={(e) => setEditing({ ...editing, key_features: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })}
                  placeholder="Cold-pressed&#10;Vegan&#10;Made in Cape Town"
                />
              </div>
              <div>
                <Label className="flex items-center gap-2">Hero image <span className="text-[10px] uppercase tracking-wider text-primary">Required for Generate</span></Label>
                <div className="flex items-center gap-3 mt-1">
                  {editing.hero_image_url ? (
                    <img src={editing.hero_image_url} alt="" className="w-20 h-20 object-cover rounded-md ring-1 ring-white/10" />
                  ) : (
                    <div className="w-20 h-20 rounded-md ring-1 ring-dashed ring-white/15 flex items-center justify-center bg-background/40">
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onPickFile(e.target.files?.[0] ?? null)} />
                  <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
                    <Upload className="w-4 h-4 mr-1" /> {editing.hero_image_url ? "Replace" : "Upload"}
                  </Button>
                </div>
                <div className="mt-2 rounded-md bg-background/60 ring-1 ring-white/[0.06] p-2.5">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1 font-medium">Image specs</p>
                  <ul className="text-[11px] text-muted-foreground space-y-0.5">
                    <li>â€¢ PNG, JPG or WebP Â· under 5 MB</li>
                    <li>â€¢ 1024-2048 px long side Â· square or 4:5 portrait</li>
                    <li>â€¢ Plain or transparent background, product centred</li>
                    <li>â€¢ Real photo (not a rendered mockup or illustration)</li>
                  </ul>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={save} disabled={busy} className="studio-gradient-bg">
                  {busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Save
                </Button>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default StudioProducts;
