import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Film, Loader2, Check, X, Play, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface RecallItem {
  id: string;
  sceneNumber: number;
  videoUrl: string | null;
  imageUrl: string | null;
  quality: string;
  mood: string | null;
  location: string | null;
  projectName: string;
  projectId: string;
  timeStart: string | null;
  timeEnd: string | null;
  lipsyncUrl: string | null;
  enhancedUrl: string | null;
  createdAt: string;
  durationSec?: number;
  assetType: "video" | "image";
}

function probeVideoDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => { resolve(video.duration); video.src = ""; };
    video.onerror = () => resolve(null);
    setTimeout(() => resolve(null), 8000);
    video.src = url;
  });
}

interface RecallGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecall: (items: Array<{ sceneNumber: number; url: string; quality: string; lipsync?: string; enhanced?: string; imageUrl?: string; assetType: "video" | "image" }>) => void;
  currentSceneNumbers: number[];
  currentProjectId?: string;
}

// ─── Thumbnail cache (persists across open/close) ────────────────────────────
const thumbnailCache = new Map<string, string>(); // videoUrl → dataURL

function VideoThumbnail({ src, className }: { src: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [captured, setCaptured] = useState(false);
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(false);

  // Lazy visibility via IntersectionObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // If already cached, show immediately
    if (thumbnailCache.has(src)) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" } // Start loading 200px before entering viewport
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [src]);

  // Load thumbnail when visible
  useEffect(() => {
    if (!visible || !src) return;

    // Check cache first
    const cached = thumbnailCache.get(src);
    if (cached) {
      const canvas = canvasRef.current;
      if (canvas) {
        const img = new Image();
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            setCaptured(true);
          }
        };
        img.src = cached;
      }
      return;
    }

    setCaptured(false);
    setError(false);

    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = src;

    let cancelled = false;

    const handleSeeked = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas || !video.videoWidth) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        setCaptured(true);
        // Cache the thumbnail as a small JPEG data URL
        try {
          const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
          thumbnailCache.set(src, dataUrl);
        } catch {
          // CORS may prevent toDataURL — that's fine, just don't cache
        }
      }
      video.removeAttribute("src");
      video.load();
    };

    const handleLoaded = () => {
      if (cancelled) return;
      video.currentTime = Math.min(1, video.duration * 0.1 || 1);
    };

    const handleError = () => {
      if (!cancelled) setError(true);
    };

    video.addEventListener("loadeddata", handleLoaded);
    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("error", handleError);

    return () => {
      cancelled = true;
      video.removeEventListener("loadeddata", handleLoaded);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
      video.removeAttribute("src");
      video.load();
    };
  }, [src, visible]);

  if (error) {
    return (
      <div ref={containerRef} className={`flex items-center justify-center bg-muted/50 ${className}`}>
        <Film className="h-8 w-8 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ display: captured ? "block" : "none" }}
      />
      {!captured && !error && (
        <div className="flex items-center justify-center w-full h-full bg-muted/30">
          {visible ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <Film className="h-5 w-5 text-muted-foreground/20" />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Pre-format dates to avoid repeated Date construction in render ──────────
function formatItemDate(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" })} · ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

export default function RecallGallery({ open, onOpenChange, onRecall, currentSceneNumbers, currentProjectId }: RecallGalleryProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<RecallItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadGallery = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch scenes with videos OR images
      const { data: scenesData, error: scenesErr } = await supabase
        .from("scenes")
        .select("id, scene_number, scene_image_url, video_url, video_quality, mood, location, time_start, time_end, lipsync_video_url, enhanced_video_url, project_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (scenesErr) throw scenesErr;

      // Filter to scenes that have at least a video or image
      const validScenes = (scenesData || []).filter(s => s.video_url || s.scene_image_url);

      // Get project names
      const projectIds = [...new Set(validScenes.map(s => s.project_id))];
      const projectNameMap = new Map<string, string>();

      if (projectIds.length > 0) {
        const { data: projects } = await supabase
          .from("projects")
          .select("id, name")
          .in("id", projectIds);
        (projects || []).forEach(p => projectNameMap.set(p.id, p.name));
      }

      // Build gallery items — videos get duration probing, images are added directly
      const videoItems: RecallItem[] = [];
      const imageOnlyItems: RecallItem[] = [];

      for (const s of validScenes) {
        const base = {
          id: s.id,
          sceneNumber: s.scene_number,
          mood: s.mood,
          location: s.location,
          projectName: projectNameMap.get(s.project_id) || "Untitled Project",
          projectId: s.project_id,
          timeStart: s.time_start,
          timeEnd: s.time_end,
          lipsyncUrl: s.lipsync_video_url,
          enhancedUrl: s.enhanced_video_url,
          createdAt: s.created_at,
        };

        if (s.video_url) {
          videoItems.push({ ...base, videoUrl: s.video_url, imageUrl: s.scene_image_url, quality: s.video_quality || "hd", assetType: "video" });
        } else if (s.scene_image_url) {
          imageOnlyItems.push({ ...base, videoUrl: null, imageUrl: s.scene_image_url, quality: "image", assetType: "image", lipsyncUrl: null, enhancedUrl: null });
        }
      }

      // Probe durations for videos and keep only ~10s (8-12s tolerance)
      const withDurations = await Promise.all(
        videoItems.map(async (item) => {
          const dur = await probeVideoDuration(item.videoUrl!);
          return { ...item, durationSec: dur ?? undefined };
        })
      );
      const validVideos = withDurations.filter(v => v.durationSec != null && v.durationSec >= 8 && v.durationSec <= 12);

      setItems([...validVideos, ...imageOnlyItems]);
    } catch (err) {
      console.error("Failed to load recall gallery:", err);
      toast.error("Failed to load video gallery.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open) {
      loadGallery();
      setSelected(new Set());
    }
  }, [open, loadGallery]);

  // Auto-select the most recent video per scene
  useEffect(() => {
    if (items.length === 0) return;
    const newestPerScene = new Map<number, RecallItem>();
    for (const item of items) {
      const existing = newestPerScene.get(item.sceneNumber);
      if (!existing || new Date(item.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        newestPerScene.set(item.sceneNumber, item);
      }
    }
    setSelected(new Set([...newestPerScene.values()].map(i => i.id)));
  }, [items]);

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const matching = items.filter(item =>
      currentProjectId ? item.projectId === currentProjectId : currentSceneNumbers.includes(item.sceneNumber)
    );
    setSelected(new Set(matching.map(i => i.id)));
  }, [items, currentProjectId, currentSceneNumbers]);

  const handleRecall = useCallback(() => {
    const selectedItems = items.filter(i => selected.has(i.id));
    onRecall(selectedItems.map(i => ({
      sceneNumber: i.sceneNumber,
      url: i.videoUrl || i.imageUrl || "",
      quality: i.quality,
      lipsync: i.lipsyncUrl || undefined,
      enhanced: i.enhancedUrl || undefined,
      imageUrl: i.imageUrl || undefined,
      assetType: i.assetType,
    })));
    onOpenChange(false);
    const videoCount = selectedItems.filter(i => i.assetType === "video").length;
    const imageCount = selectedItems.filter(i => i.assetType === "image").length;
    const parts = [videoCount > 0 ? `${videoCount} video${videoCount !== 1 ? "s" : ""}` : "", imageCount > 0 ? `${imageCount} image${imageCount !== 1 ? "s" : ""}` : ""].filter(Boolean).join(" & ");
    toast.success(`Recalled ${parts}`);
  }, [items, selected, onRecall, onOpenChange]);

  // ─── Group by scene, most recent (left) to oldest (right) ───────────────
  const sortedGroups = useMemo(() => {
    const grouped: Record<number, RecallItem[]> = {};
    for (const item of items) {
      if (!grouped[item.sceneNumber]) grouped[item.sceneNumber] = [];
      grouped[item.sceneNumber].push(item);
    }

    return Object.entries(grouped)
      .map(([sceneNum, sceneItems]) => ({
        name: `Scene ${sceneNum}`,
        sceneNumber: Number(sceneNum),
        items: sceneItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      }))
      .sort((a, b) => a.sceneNumber - b.sceneNumber);
  }, [items]);

  // Track the most recent item id per scene for greying out
  const mostRecentPerScene = useMemo(() => {
    const map = new Set<string>();
    const byScene = new Map<number, RecallItem>();
    for (const item of items) {
      const existing = byScene.get(item.sceneNumber);
      if (!existing || new Date(item.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        byScene.set(item.sceneNumber, item);
      }
    }
    byScene.forEach(item => map.add(item.id));
    return map;
  }, [items]);

  // ─── Pre-compute formatted dates ─────────────────────────────────────────
  const dateMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      if (!map.has(item.id)) {
        map.set(item.id, formatItemDate(item.createdAt));
      }
    }
    return map;
  }, [items]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Asset Gallery — Recall from Storage
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading stored assets…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Film className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No stored assets found. Generate some scenes first!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Action bar */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {items.length} asset{items.length !== 1 ? "s" : ""} in storage
                {selected.size > 0 && <span className="text-primary font-medium ml-2">· {selected.size} selected</span>}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs">
                  Select Current Project
                </Button>
                {selected.size > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} className="text-xs">
                    <X className="h-3 w-3 mr-1" /> Clear
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleRecall}
                  disabled={selected.size === 0}
                  className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Download className="h-3.5 w-3.5" />
                  Recall {selected.size > 0 ? `(${selected.size})` : ""}
                </Button>
              </div>
            </div>

            {/* Gallery grid grouped by project */}
            {sortedGroups.map(({ name: projectName, items: projectItems }) => (
              <div key={projectName} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{projectName}</h3>
                  <Badge variant="secondary" className="text-[10px]">
                    {projectItems.length} clip{projectItems.length !== 1 ? "s" : ""}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {projectItems.map(item => {
                    const isSelected = selected.has(item.id);
                    const isCurrentProject = currentProjectId === item.projectId;
                    const isMostRecent = mostRecentPerScene.has(item.id);

                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleSelect(item.id)}
                        className={`group relative rounded-lg overflow-hidden border-2 transition-all text-left ${
                          isSelected
                            ? "border-primary ring-2 ring-primary/20"
                            : "border-border/50 hover:border-primary/40"
                        } ${!isMostRecent && !isSelected ? "opacity-50 grayscale" : ""}`}
                      >
                        {/* Thumbnail */}
                        <div className="aspect-video bg-muted/30 relative">
                          {item.assetType === "video" && item.videoUrl ? (
                            <VideoThumbnail src={item.videoUrl} className="w-full h-full" />
                          ) : item.imageUrl ? (
                            <img src={item.imageUrl} alt={`Scene ${item.sceneNumber}`} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="flex items-center justify-center w-full h-full"><Film className="h-8 w-8 text-muted-foreground/30" /></div>
                          )}

                          {/* Play overlay on hover (video only) */}
                          {item.assetType === "video" && (
                            <div className="absolute inset-0 flex items-center justify-center bg-background/30 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Play className="h-8 w-8 text-foreground/80" />
                            </div>
                          )}
                          {item.assetType === "image" && (
                            <div className="absolute top-2 left-2">
                              <Badge className="text-[9px] bg-background/70 text-foreground border-border/30 backdrop-blur-sm gap-0.5">
                                <ImageIcon className="h-2.5 w-2.5" /> Image
                              </Badge>
                            </div>
                          )}

                          {/* Selection indicator */}
                          {isSelected && (
                            <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                              <Check className="h-3.5 w-3.5 text-primary-foreground" />
                            </div>
                          )}

                          {/* Quality badge */}
                          <Badge className="absolute bottom-2 right-2 text-[9px] bg-background/70 text-foreground border-border/30 backdrop-blur-sm">
                            {item.quality}
                          </Badge>

                          {/* Audio-synced indicator */}
                          {item.lipsyncUrl && (
                            <Badge className="absolute bottom-2 left-2 text-[9px] bg-accent/70 text-accent-foreground border-accent/30 backdrop-blur-sm">
                              Synced
                            </Badge>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-2 space-y-0.5">
                          <p className="text-xs font-medium text-foreground truncate">
                            Scene {item.sceneNumber}
                            {item.mood && <span className="text-muted-foreground"> · {item.mood}</span>}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {dateMap.get(item.id) || ""}
                            {item.location && ` · ${item.location}`}
                          </p>
                          {isCurrentProject && (
                            <Badge variant="outline" className="text-[9px] border-primary/30 text-primary">
                              Current project
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
