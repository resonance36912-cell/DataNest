import { useState, useCallback, useEffect, useMemo } from "react";
import { ImageIcon, Loader2, Search, Filter, User, MapPin, X as XIcon, CalendarIcon, RefreshCw, Check, Video, Play, Download, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface GalleryImage {
  id: string;
  type: "character" | "scene" | "video";
  project_id: string | null;
  project_name: string;
  image_url: string;
  video_url?: string;
  label: string;
  description: string | null;
  scene_number?: number;
  created_at: string;
  character_id?: string | null;
  character_name?: string | null;
  linked_scene_count?: number;
}

interface RecallGalleryDialogProps {
  trigger?: React.ReactNode;
  onSelect?: (image: GalleryImage) => void;
  /** Called when user wants to import a scene/video asset into a specific scene in the current project */
  onRecallToScene?: (asset: GalleryImage, targetSceneIndex: number) => void;
  /** Total scenes in the current project — used to populate the target scene picker */
  currentSceneCount?: number;
  filterType?: "character" | "scene" | "video" | "all";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function RecallGalleryDialog({ trigger, onSelect, onRecallToScene, currentSceneCount, filterType, open: controlledOpen, onOpenChange: controlledOnOpenChange }: RecallGalleryDialogProps) {
  const { user } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [tab, setTab] = useState<"all" | "character" | "scene" | "video">(filterType === "scene" ? "scene" : filterType === "character" ? "character" : "all");
  const [previewImage, setPreviewImage] = useState<GalleryImage | null>(null);
  const [recallTargetScene, setRecallTargetScene] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GalleryImage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAsset = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // Collect FAL URLs to delete
      const falUrls: string[] = [];
      const isFal = (u: string) => u.includes("fal.media/") || u.includes("googleapis.com/fal");

      if (deleteTarget.image_url && isFal(deleteTarget.image_url)) falUrls.push(deleteTarget.image_url);
      if (deleteTarget.video_url && isFal(deleteTarget.video_url)) falUrls.push(deleteTarget.video_url);

      // Delete FAL storage files
      if (falUrls.length > 0) {
        await supabase.functions.invoke("delete-fal-asset", { body: { urls: falUrls } });
      }

      // Nullify references in the scenes table
      if (deleteTarget.type === "video") {
        // Extract real scene id (we appended "-video" for video entries)
        const sceneId = deleteTarget.id.replace("-video", "");
        await supabase.from("scenes").update({ video_url: null, video_quality: null }).eq("id", sceneId);
      } else if (deleteTarget.type === "scene") {
        await supabase.from("scenes").update({ scene_image_url: null }).eq("id", deleteTarget.id);
      } else if (deleteTarget.type === "character") {
        await supabase.from("characters").update({ reference_image_url: null }).eq("id", deleteTarget.id);
      }

      // Remove from local state
      if (previewImage?.id === deleteTarget.id) setPreviewImage(null);
      setImages(prev => prev.filter(i => i.id !== deleteTarget.id));
      setSelectedIds(prev => { const next = new Set(prev); next.delete(deleteTarget.id); return next; });
      toast.success(`Deleted ${deleteTarget.type} and cleaned up storage`);
    } catch (err) {
      console.error("Delete failed:", err);
      toast.error("Failed to delete asset");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, previewImage]);

  const toggleSelect = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkDownload = useCallback(async () => {
    const items = images.filter(i => selectedIds.has(i.id));
    if (items.length === 0) return;
    setDownloading(true);
    let success = 0;
    for (const item of items) {
      const url = item.type === "video" && item.video_url ? item.video_url : item.image_url;
      if (!url) continue;
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        const ext = item.type === "video" ? "mp4" : "png";
        a.download = `${item.label.replace(/\s+/g, "_")}.${ext}`;
        a.click();
        URL.revokeObjectURL(a.href);
        success++;
        // Small delay between downloads to avoid browser blocking
        if (items.length > 1) await new Promise(r => setTimeout(r, 500));
      } catch {
        console.error("Failed to download:", item.label);
      }
    }
    setDownloading(false);
    if (success > 0) toast.success(`Downloaded ${success} file${success !== 1 ? "s" : ""}`);
    else toast.error("Downloads failed");
  }, [images, selectedIds]);

  const loadImages = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const all: GalleryImage[] = [];
      const fromISO = dateFrom ? new Date(dateFrom.setHours(0, 0, 0, 0)).toISOString() : undefined;
      const toISO = dateTo ? new Date(new Date(dateTo).setHours(23, 59, 59, 999)).toISOString() : undefined;

      let charQ = supabase
        .from("characters")
        .select("id, project_id, name, reference_image_url, vibe, gender, ethnicity, outfit, created_at")
        .eq("user_id", user.id)
        .not("reference_image_url", "is", null)
        .order("created_at", { ascending: true });

      let sceneQ = supabase
        .from("scenes")
        .select("id, project_id, scene_number, scene_image_url, video_url, video_quality, visual_prompt, mood, location, created_at, character_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (fromISO) {
        charQ = charQ.gte("created_at", fromISO);
        sceneQ = sceneQ.gte("created_at", fromISO);
      }
      if (toISO) {
        charQ = charQ.lte("created_at", toISO);
        sceneQ = sceneQ.lte("created_at", toISO);
      }

      const [charRes, sceneRes] = await Promise.all([charQ, sceneQ]);

      // Count scenes linked to each character
      const charSceneCount = new Map<string, number>();
      (sceneRes.data || []).forEach(s => {
        if (s.character_id) {
          charSceneCount.set(s.character_id, (charSceneCount.get(s.character_id) || 0) + 1);
        }
      });

      // Track character IDs already added from the characters table
      const addedCharIds = new Set<string>();

      (charRes.data || []).forEach(c => {
        addedCharIds.add(c.id);
        all.push({
          id: c.id,
          type: "character",
          project_id: c.project_id,
          project_name: "",
          image_url: c.reference_image_url!,
          label: c.name || "Unnamed Character",
          description: [c.gender, c.ethnicity, c.vibe, c.outfit].filter(Boolean).join(" · "),
          created_at: c.created_at,
          linked_scene_count: charSceneCount.get(c.id) || 0,
        });
      });

      // Collect character_ids from scenes that aren't already loaded
      const sceneCharIds = new Set<string>();
      (sceneRes.data || []).forEach(s => {
        if (s.character_id && !addedCharIds.has(s.character_id)) {
          sceneCharIds.add(s.character_id);
        }
      });

      // Fetch linked characters from scenes
      if (sceneCharIds.size > 0) {
        const { data: linkedChars } = await supabase
          .from("characters")
          .select("id, project_id, name, reference_image_url, vibe, gender, ethnicity, outfit, created_at")
          .in("id", [...sceneCharIds]);

        (linkedChars || []).forEach(c => {
          if (c.reference_image_url && !addedCharIds.has(c.id)) {
            addedCharIds.add(c.id);
            all.push({
              id: c.id,
              type: "character",
              project_id: c.project_id,
              project_name: "",
              image_url: c.reference_image_url,
              label: c.name || "Unnamed Character",
              description: [c.gender, c.ethnicity, c.vibe, c.outfit].filter(Boolean).join(" · "),
              created_at: c.created_at,
              linked_scene_count: charSceneCount.get(c.id) || 0,
            });
          }
        });
      }

      // Build character name map for scene labels
      const charNameMap = new Map<string, string>();
      all.filter(i => i.type === "character").forEach(i => charNameMap.set(i.id, i.label));

      (sceneRes.data || []).forEach(s => {
        const charName = s.character_id ? charNameMap.get(s.character_id) || null : null;

        // Add scene image entry if it has an image
        if (s.scene_image_url) {
          all.push({
            id: s.id,
            type: "scene",
            project_id: s.project_id,
            project_name: "",
            image_url: s.scene_image_url,
            label: charName ? `${charName} · S${s.scene_number}` : `Scene ${s.scene_number}`,
            description: s.visual_prompt || [s.mood, s.location].filter(Boolean).join(" · ") || null,
            scene_number: s.scene_number,
            created_at: s.created_at,
            character_id: s.character_id,
            character_name: charName,
          });
        }

        // Add video entry if it has a video
        if (s.video_url) {
          all.push({
            id: `${s.id}-video`,
            type: "video",
            project_id: s.project_id,
            project_name: "",
            image_url: s.scene_image_url || "",
            video_url: s.video_url,
            label: charName ? `${charName} · S${s.scene_number} Video` : `Scene ${s.scene_number} Video`,
            description: [s.video_quality ? `Quality: ${s.video_quality}` : null, s.visual_prompt].filter(Boolean).join(" · ") || null,
            scene_number: s.scene_number,
            created_at: s.created_at,
            character_id: s.character_id,
            character_name: charName,
          });
        }
      });

      // Resolve project names
      const projectIds = [...new Set(all.map(v => v.project_id).filter(Boolean))] as string[];
      if (projectIds.length > 0) {
        const { data: projects } = await supabase.from("projects").select("id, name").in("id", projectIds);
        const projMap = new Map<string, string>((projects || []).map((p: any) => [String(p.id), String(p.name || "Unknown")] as [string, string]));
        all.forEach(v => {
          v.project_name = v.project_id ? (projMap.get(v.project_id) || "Unknown") : "Unlinked";
        });
      }

      all.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setImages(all);
    } catch (err) {
      console.error("Gallery load failed:", err);
      toast.error("Failed to load gallery");
    } finally {
      setLoading(false);
    }
  }, [user, dateFrom, dateTo]);

  const handleLoad = useCallback(async () => {
    await loadImages();
    setLoaded(true);
  }, [loadImages]);

  useEffect(() => {
    if (!open) { setLoaded(false); setImages([]); setPreviewImage(null); setSelectedIds(new Set()); }
    else { handleLoad(); }
  }, [open]);

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    images.forEach(v => { if (v.project_id) map.set(v.project_id, v.project_name); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [images]);

  const filtered = useMemo(() => {
    let result = images;
    if (tab !== "all") result = result.filter(i => i.type === tab);
    if (projectFilter !== "all") result = result.filter(i => i.project_id === projectFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        i.label.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q) ||
        i.project_name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [images, tab, projectFilter, search]);

  // Group by project
  const grouped = useMemo(() => {
    const map = new Map<string, { projectName: string; images: GalleryImage[] }>();
    filtered.forEach(img => {
      const key = img.project_id || "none";
      if (!map.has(key)) map.set(key, { projectName: img.project_name || "Unlinked", images: [] });
      map.get(key)!.images.push(img);
    });
    return [...map.values()].sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [filtered]);

  const charCount = images.filter(i => i.type === "character").length;
  const sceneCount = images.filter(i => i.type === "scene").length;
  const videoCount = images.filter(i => i.type === "video").length;

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      {controlledOpen === undefined && (
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="outline" size="sm" className="gap-2 border-primary/30 text-primary hover:bg-primary/10">
              <ImageIcon className="h-4 w-4" />
              Recall Gallery
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Recall Gallery</DialogTitle>
          <DialogDescription>
            Browse previously generated character portraits, scene images, and videos.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <TabsList className={cn("grid w-full", videoCount > 0 ? "grid-cols-4" : "grid-cols-3")}>
            <TabsTrigger value="all">All ({images.length})</TabsTrigger>
            <TabsTrigger value="character" className="gap-1.5">
              <User className="h-3.5 w-3.5" /> Characters ({charCount})
            </TabsTrigger>
            <TabsTrigger value="scene" className="gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" /> Scenes ({sceneCount})
            </TabsTrigger>
            {videoCount > 0 && (
              <TabsTrigger value="video" className="gap-1.5">
                <Video className="h-3.5 w-3.5" /> Videos ({videoCount})
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>

        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-[150px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, prompt, or project..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-44 shrink-0">
              <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projectOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("gap-1.5 text-xs", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="h-3.5 w-3.5" />
                {dateFrom ? format(dateFrom, "dd MMM yyyy") : "From date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("gap-1.5 text-xs", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="h-3.5 w-3.5" />
                {dateTo ? format(dateTo, "dd MMM yyyy") : "To date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
              Clear dates
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleLoad} disabled={loading} className="gap-1.5 ml-auto">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {loaded ? "Refresh" : "Load Gallery"}
          </Button>
        </div>

        {/* Preview panel */}
        {previewImage && (
          <div className="rounded-lg border border-border bg-card relative">
            <div className="absolute top-2 right-2 z-10 flex gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const url = previewImage.type === "video" && previewImage.video_url ? previewImage.video_url : previewImage.image_url;
                  if (!url) return;
                  try {
                    const res = await fetch(url);
                    const blob = await res.blob();
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    const ext = previewImage.type === "video" ? "mp4" : "png";
                    a.download = `${previewImage.label.replace(/\s+/g, "_")}.${ext}`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                    toast.success("Download started");
                  } catch {
                    toast.error("Download failed");
                  }
                }}
                className="h-7 gap-1 text-xs bg-black/60 hover:bg-black/80 text-white"
              >
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteTarget(previewImage)}
                className="h-7 gap-1 text-xs bg-destructive/70 hover:bg-destructive/90 text-destructive-foreground"
                title="Delete asset and clean up FAL storage"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPreviewImage(null)}
                className="h-7 w-7 p-0 bg-black/60 hover:bg-black/80 text-white"
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
            {previewImage.type === "video" && previewImage.video_url ? (
              <video
                src={previewImage.video_url}
                controls
                preload="auto"
                playsInline
                poster={previewImage.image_url || undefined}
                className="w-full max-h-[350px] object-contain rounded-lg bg-black"
              />
            ) : (
              <img
                src={previewImage.image_url}
                alt={previewImage.label}
                className="w-full max-h-[350px] object-contain rounded-lg bg-black"
              />
            )}
            <div className="p-3 space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={previewImage.type === "character" ? "default" : previewImage.type === "video" ? "outline" : "secondary"} className="text-xs">
                  {previewImage.type === "character" ? "Character" : previewImage.type === "video" ? "Video" : "Scene"}
                </Badge>
                <span className="text-sm font-medium">{previewImage.label}</span>
                <span className="text-xs text-muted-foreground ml-auto">{previewImage.project_name}</span>
              </div>
              {previewImage.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{previewImage.description}</p>
              )}
              {previewImage.type === "character" && (previewImage.linked_scene_count ?? 0) > 0 && (
                <div className="flex items-center gap-2 pt-1">
                  <Badge variant="outline" className="text-[10px] border-primary/30 text-primary gap-1">
                    <MapPin className="h-2.5 w-2.5" />
                    {previewImage.linked_scene_count} linked scene{previewImage.linked_scene_count !== 1 ? "s" : ""}
                  </Badge>
                  <button
                    onClick={() => {
                      setTab("scene");
                      setSearch(previewImage.label);
                      setPreviewImage(null);
                    }}
                    className="text-[10px] text-primary hover:underline"
                  >
                    View scenes →
                  </button>
                </div>
               )}
              {/* Use in Scene action */}
              {onRecallToScene && (currentSceneCount ?? 0) > 0 && previewImage.type !== "character" && (
                <div className="flex items-center gap-2 pt-2 border-t border-border mt-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Use in:</span>
                  <Select
                    value={recallTargetScene != null ? String(recallTargetScene) : ""}
                    onValueChange={(v) => setRecallTargetScene(Number(v))}
                  >
                    <SelectTrigger className="h-7 text-xs w-[140px]">
                      <SelectValue placeholder="Pick scene…" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: currentSceneCount! }, (_, i) => (
                        <SelectItem key={i} value={String(i)} className="text-xs">
                          Scene {i + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={recallTargetScene == null}
                    onClick={() => {
                      if (recallTargetScene != null && previewImage) {
                        onRecallToScene(previewImage, recallTargetScene);
                        setOpen(false);
                        toast.success(`Recalled ${previewImage.type === "video" ? "video" : "image"} to Scene ${recallTargetScene + 1}`);
                      }
                    }}
                    className="h-7 text-xs gap-1"
                  >
                    <Download className="h-3 w-3" /> Apply
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bulk download bar */}
        {loaded && filtered.length > 0 && (
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-1.5">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (selectedIds.size === filtered.length) setSelectedIds(new Set());
                  else setSelectedIds(new Set(filtered.map(i => i.id)));
                }}
                className="text-xs text-primary hover:underline"
              >
                {selectedIds.size === filtered.length ? "Deselect all" : "Select all"}
              </button>
              {selectedIds.size > 0 && (
                <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={selectedIds.size === 0 || downloading}
              onClick={handleBulkDownload}
              className="gap-1.5 text-xs h-7"
            >
              {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Download{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </Button>
          </div>
        )}

        {/* Gallery grid */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !loaded ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <ImageIcon className="h-8 w-8 opacity-40" />
              <p className="text-sm">Set date range and click "Load Gallery" to browse your assets</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <ImageIcon className="h-8 w-8 opacity-40" />
              <p className="text-sm">{search ? "No matching items" : "No items found"}</p>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.projectName} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-semibold">{group.projectName}</Badge>
                  <span className="text-xs text-muted-foreground">{group.images.length} item{group.images.length !== 1 ? "s" : ""}</span>
                  <button
                    onClick={() => {
                      const groupIds = group.images.map(i => i.id);
                      const allSelected = groupIds.every(id => selectedIds.has(id));
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        groupIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
                        return next;
                      });
                    }}
                    className="text-[10px] text-primary hover:underline ml-auto"
                  >
                    {group.images.every(i => selectedIds.has(i.id)) ? "Deselect group" : "Select all"}
                  </button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                    {group.images.map((img) => (
                    <div
                      key={img.id}
                      onClick={() => {
                        if (onSelect && img.type === "character") {
                          onSelect(img);
                          setOpen(false);
                        } else {
                          setPreviewImage(img);
                        }
                      }}
                      className={`relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all group ${
                        previewImage?.id === img.id ? "border-primary ring-1 ring-primary/50" : "border-border/40 hover:border-primary/50"
                      }`}
                    >
                      <div className={`relative ${img.type === "character" ? "aspect-square" : "aspect-video"}`}>
                        {img.type === "video" && img.video_url ? (
                          <>
                            {img.image_url ? (
                              <img
                                src={img.image_url}
                                alt={img.label}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full bg-secondary flex items-center justify-center">
                                <Video className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                              <div className="bg-black/60 rounded-full p-1.5 backdrop-blur-sm">
                                <Play className="h-3 w-3 text-white fill-white" />
                              </div>
                            </div>
                          </>
                        ) : (
                          <img
                            src={img.image_url}
                            alt={img.label}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        )}
                        {/* Selection checkbox for download only */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(img.id, e);
                          }}
                          title={selectedIds.has(img.id) ? "Deselect" : "Select for download"}
                          className={`absolute top-1 right-1 h-5 w-5 rounded border-2 flex items-center justify-center transition-all z-10 ${
                            selectedIds.has(img.id)
                              ? "bg-primary border-primary"
                              : "bg-black/40 border-white/60 opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          {selectedIds.has(img.id) && <Check className="h-3 w-3 text-primary-foreground" />}
                        </button>
                        <Badge
                          className={`absolute top-1 left-1 text-[9px] px-1 py-0 border-0 ${
                            img.type === "character" ? "bg-primary/80 text-primary-foreground" : img.type === "video" ? "bg-accent/80 text-accent-foreground" : "bg-secondary/80 text-secondary-foreground"
                          }`}
                        >
                          {img.type === "character" ? <User className="h-2.5 w-2.5 mr-0.5" /> : img.type === "video" ? <Video className="h-2.5 w-2.5 mr-0.5" /> : <MapPin className="h-2.5 w-2.5 mr-0.5" />}
                          {img.type === "character" ? "Char" : img.type === "video" ? `V${img.scene_number}` : `S${img.scene_number}`}
                        </Badge>
                      </div>
                      <div className="px-1.5 py-1 bg-card">
                        <p className="text-[10px] text-muted-foreground truncate">{img.label}</p>
                        <p className="text-[9px] text-muted-foreground/50 truncate">
                          {new Date(img.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" })} · {new Date(img.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        {img.type === "character" && (img.linked_scene_count ?? 0) > 0 && (
                          <p className="text-[9px] text-primary truncate flex items-center gap-0.5">
                            <MapPin className="h-2.5 w-2.5 shrink-0" />{img.linked_scene_count} scene{img.linked_scene_count !== 1 ? "s" : ""}
                          </p>
                        )}
                        {img.character_name && img.type !== "character" && (
                          <p className="text-[9px] text-primary truncate flex items-center gap-0.5">
                            <User className="h-2.5 w-2.5 shrink-0" />{img.character_name}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {deleteTarget?.type === "video" ? "video" : deleteTarget?.type === "character" ? "character" : "scene image"}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove the asset from storage (including FAL) and clear the database reference. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteAsset}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
            Delete permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
