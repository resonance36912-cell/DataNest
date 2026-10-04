import { useState, useCallback, useEffect, useMemo } from "react";
import { Video, Plus, Loader2, Search, Film, Filter, Volume2, Trash2, Play, X as XIcon, Check, RefreshCw, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SavedScene } from "./SceneTimeline";

interface RecallVideo {
  id: string;
  source: "scene" | "generation" | "lipsync" | "render";
  project_id: string | null;
  project_name: string;
  scene_number: number;
  video_url: string;
  visual_prompt: string | null;
  scene_image_url: string | null;
  provider: string;
  updated_at: string;
  created_at: string;
  hasAudio: boolean;
  durationSec?: number;
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

interface RecallVideoDialogProps {
  existingVideoUrls: Set<string>;
  onAddScene: (scene: SavedScene) => void;
  nextSceneIndex: number;
}

export default function RecallVideoDialog({ existingVideoUrls, onAddScene, nextSceneIndex }: RecallVideoDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [videos, setVideos] = useState<RecallVideo[]>([]);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [previewVideo, setPreviewVideo] = useState<RecallVideo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecallVideo | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const loadVideos = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const allVideos: RecallVideo[] = [];

      const fromISO = dateFrom ? new Date(dateFrom.setHours(0, 0, 0, 0)).toISOString() : undefined;
      const toISO = dateTo ? new Date(new Date(dateTo).setHours(23, 59, 59, 999)).toISOString() : undefined;

      let scenesQ = supabase.from("scenes").select("id, project_id, scene_number, video_url, visual_prompt, scene_image_url, segment_audio_url, updated_at, created_at")
        .eq("user_id", user.id).not("video_url", "is", null).order("created_at", { ascending: true });
      let genQ = supabase.from("generation_jobs").select("id, project_id, scene_number, output_asset_url, provider_name, provider_operation, updated_at, created_at")
        .eq("user_id", user.id).not("output_asset_url", "is", null).eq("status", "succeeded").order("created_at", { ascending: true });
      let lsQ = supabase.from("lipsync_jobs").select("id, project_id, scene_number, output_url, provider, updated_at, created_at")
        .eq("user_id", user.id).not("output_url", "is", null).eq("status", "succeeded").order("created_at", { ascending: true });
      let renderQ = supabase.from("render_jobs").select("id, project_id, scene_number, provider, final_output_url, output, updated_at, created_at")
        .eq("user_id", user.id).eq("status", "succeeded").order("created_at", { ascending: true });

      if (fromISO) {
        scenesQ = scenesQ.gte("created_at", fromISO);
        genQ = genQ.gte("created_at", fromISO);
        lsQ = lsQ.gte("created_at", fromISO);
        renderQ = renderQ.gte("created_at", fromISO);
      }
      if (toISO) {
        scenesQ = scenesQ.lte("created_at", toISO);
        genQ = genQ.lte("created_at", toISO);
        lsQ = lsQ.lte("created_at", toISO);
        renderQ = renderQ.lte("created_at", toISO);
      }

      const [scenesRes, genRes, lsRes, renderRes] = await Promise.all([scenesQ, genQ, lsQ, renderQ]);

      (scenesRes.data || []).forEach(s => {
        allVideos.push({
          id: s.id, source: "scene", project_id: s.project_id, project_name: "",
          scene_number: s.scene_number, video_url: s.video_url!,
          visual_prompt: s.visual_prompt, scene_image_url: s.scene_image_url,
          provider: "scene", updated_at: s.updated_at, created_at: s.created_at,
          hasAudio: !!s.segment_audio_url,
        });
      });

      (genRes.data || []).forEach(j => {
        if (!allVideos.some(v => v.video_url === j.output_asset_url)) {
          allVideos.push({
            id: j.id, source: "generation", project_id: j.project_id, project_name: "",
            scene_number: j.scene_number, video_url: j.output_asset_url!,
            visual_prompt: `${j.provider_name} · ${j.provider_operation}`,
            scene_image_url: null, provider: j.provider_name, updated_at: j.updated_at, created_at: j.created_at, hasAudio: false,
          });
        }
      });

      (lsRes.data || []).forEach(j => {
        if (!allVideos.some(v => v.video_url === j.output_url)) {
          allVideos.push({
            id: j.id, source: "lipsync", project_id: j.project_id, project_name: "",
            scene_number: j.scene_number, video_url: j.output_url!,
            visual_prompt: `Synced · ${j.provider}`, scene_image_url: null,
            provider: j.provider, updated_at: j.updated_at, created_at: j.created_at, hasAudio: true,
          });
        }
      });

      (renderRes.data || []).forEach(j => {
        const videoUrl = j.final_output_url || (j.output as any)?.video_url;
        if (videoUrl && !allVideos.some(v => v.video_url === videoUrl)) {
          allVideos.push({
            id: j.id, source: "render", project_id: j.project_id, project_name: "",
            scene_number: j.scene_number, video_url: videoUrl,
            visual_prompt: j.provider, scene_image_url: null,
            provider: j.provider, updated_at: j.updated_at, created_at: j.created_at, hasAudio: true,
          });
        }
      });

      // Resolve project names
      const projectIds = [...new Set(allVideos.map(v => v.project_id).filter(Boolean))] as string[];
      if (projectIds.length > 0) {
        const { data: projects } = await supabase.from("projects").select("id, name").in("id", projectIds);
        const projMap = new Map<string, string>((projects || []).map((p: any) => [String(p.id), String(p.name || "Unknown")] as [string, string]));
        allVideos.forEach(v => {
          v.project_name = v.project_id ? (projMap.get(v.project_id) || "Unknown") : "Unlinked";
        });
      }

      // Probe durations and keep only ~10s videos (8-12s tolerance)
      const withDurations = await Promise.all(
        allVideos.map(async (v) => {
          const dur = await probeVideoDuration(v.video_url);
          return { ...v, durationSec: dur ?? undefined };
        })
      );
      const tenSecOnly = withDurations.filter(v => v.durationSec != null && v.durationSec >= 8 && v.durationSec <= 12);

      // Sort by scene number ascending, newest first within same scene
      tenSecOnly.sort((a, b) => a.scene_number - b.scene_number || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setVideos(tenSecOnly);
    } catch (err) {
      console.error("Recall load failed:", err);
      toast.error("Failed to load recalled videos");
    } finally {
      setLoading(false);
    }
  }, [user, dateFrom, dateTo]);

  const [loaded, setLoaded] = useState(false);

  const handleLoadVideos = useCallback(async () => {
    await loadVideos();
    setLoaded(true);
  }, [loadVideos]);

  useEffect(() => {
    if (!open) { setLoaded(false); setVideos([]); }
    else { handleLoadVideos(); }
  }, [open]);

  // Unique project list for filter dropdown
  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    videos.forEach(v => {
      if (v.project_id) map.set(v.project_id, v.project_name);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [videos]);

  const filtered = useMemo(() => {
    let result = videos;
    if (projectFilter !== "all") {
      result = result.filter(v => v.project_id === projectFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(v =>
        v.project_name.toLowerCase().includes(q) ||
        v.visual_prompt?.toLowerCase().includes(q) ||
        v.provider.toLowerCase().includes(q)
      );
    }
    return result;
  }, [videos, projectFilter, search]);

  // Group videos by project + scene number, preserving chronological order within each group
  const groupedByScene = useMemo(() => {
    const map = new Map<string, { projectName: string; sceneNumber: number; videos: RecallVideo[] }>();
    filtered.forEach(v => {
      const key = `${v.project_id || "none"}_s${v.scene_number}`;
      if (!map.has(key)) {
        map.set(key, { projectName: v.project_name, sceneNumber: v.scene_number, videos: [] });
      }
      map.get(key)!.videos.push(v);
    });
    // Sort groups by scene number (timeline order) then project name
    return [...map.values()].sort((a, b) =>
      a.sceneNumber - b.sceneNumber || a.projectName.localeCompare(b.projectName)
    );
  }, [filtered]);

  const deleteFalAssets = async (urls: string[]) => {
    const falUrls = urls.filter(u => u.includes("fal.media/") || u.includes("googleapis.com/fal"));
    if (falUrls.length === 0) return;
    try {
      await supabase.functions.invoke("delete-fal-asset", { body: { urls: falUrls } });
    } catch (e) {
      console.warn("FAL storage cleanup failed:", e);
    }
  };

  const nullifyVideoInDb = async (video: RecallVideo) => {
    if (video.source === "scene") {
      await supabase.from("scenes").update({ video_url: null, video_quality: null }).eq("id", video.id);
    } else if (video.source === "generation") {
      await supabase.from("generation_jobs").update({ output_asset_url: null } as any).eq("id", video.id);
    } else if (video.source === "lipsync") {
      await supabase.from("lipsync_jobs").update({ output_url: null } as any).eq("id", video.id);
    } else if (video.source === "render") {
      await supabase.from("render_jobs").update({ final_output_url: null } as any).eq("id", video.id);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await nullifyVideoInDb(deleteTarget);
      await deleteFalAssets([deleteTarget.video_url]);
      if (previewVideo?.id === deleteTarget.id) setPreviewVideo(null);
      setVideos(prev => prev.filter(v => v.id !== deleteTarget.id));
      toast.success("Video deleted");
    } catch {
      toast.error("Failed to delete video");
    } finally {
      setDeleteTarget(null);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAddSelected = () => {
    const toAdd = videos.filter(v => selectedIds.has(v.id) && !existingVideoUrls.has(v.video_url));
    toAdd.forEach((video, i) => {
      const newScene: SavedScene = {
        sceneIndex: nextSceneIndex + i,
        sceneNumber: video.scene_number,
        videoUrl: video.video_url,
        imageUrl: video.scene_image_url || undefined,
        lyricSegment: video.visual_prompt || `Recalled · S${video.scene_number}`,
        timeStart: "0:00",
        timeEnd: "0:05",
        durationSec: 5,
      };
      onAddScene(newScene);
    });
    if (toAdd.length > 0) {
      toast.success(`Added ${toAdd.length} video${toAdd.length !== 1 ? "s" : ""} to timeline`);
      setSelectedIds(new Set());
    } else {
      toast.info("No new videos selected to add");
    }
  };

  const handleDeleteSelected = async () => {
    const toDelete = videos.filter(v => selectedIds.has(v.id));
    let deleted = 0;
    for (const video of toDelete) {
      try {
        await nullifyVideoInDb(video);
        deleted++;
      } catch { /* skip */ }
    }
    await deleteFalAssets(toDelete.map(v => v.video_url));
    if (previewVideo && selectedIds.has(previewVideo.id)) setPreviewVideo(null);
    setVideos(prev => prev.filter(v => !selectedIds.has(v.id)));
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
    toast.success(`Deleted ${deleted} video${deleted !== 1 ? "s" : ""}`);
  };

  const handleAdd = (video: RecallVideo) => {
    const newScene: SavedScene = {
      sceneIndex: nextSceneIndex + videos.indexOf(video),
      sceneNumber: video.scene_number,
      videoUrl: video.video_url,
      imageUrl: video.scene_image_url || undefined,
      lyricSegment: video.visual_prompt || `Recalled · S${video.scene_number}`,
      timeStart: "0:00",
      timeEnd: "0:05",
      durationSec: 5,
    };
    onAddScene(newScene);
    toast.success(`Added recalled video to timeline`);
  };

  const alreadyAdded = (url: string) => existingVideoUrls.has(url);

  const sourceLabel = (s: string) => {
    switch (s) {
      case "scene": return "Scene";
      case "generation": return "Generated";
      case "lipsync": return "Synced";
      case "render": return "Render";
      default: return s;
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 border-primary/30 text-primary hover:bg-primary/10">
          <Video className="h-4 w-4" />
          Recall Videos
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Recall Previously Generated Videos</DialogTitle>
          <DialogDescription>
            Videos are grouped per scene, ordered from first generated (left) to most recent (right).
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-[150px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by prompt or provider..."
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadVideos}
            disabled={loading}
            className="gap-1.5 ml-auto"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {loaded ? "Refresh Recall" : "Load Videos"}
          </Button>
        </div>

        {previewVideo && (
          <div className="rounded-lg border border-border bg-black relative">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPreviewVideo(null)}
              className="absolute top-2 right-2 z-10 h-7 w-7 p-0 bg-black/60 hover:bg-black/80 text-white"
            >
              <XIcon className="h-4 w-4" />
            </Button>
            <video
              src={previewVideo.video_url}
              className="w-full max-h-[300px] rounded-lg"
              controls
              autoPlay
              playsInline
              preload="auto"
            />
            <div className="absolute bottom-2 left-2 flex gap-1">
              <Badge variant="secondary" className="text-xs">{sourceLabel(previewVideo.source)}</Badge>
              <Badge variant="outline" className="text-xs bg-black/50 text-white border-0">S{previewVideo.scene_number} · {previewVideo.project_name}</Badge>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (selectedIds.size === filtered.length && filtered.length > 0) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(filtered.map(v => v.id)));
              }
            }}
            className="gap-1.5 text-xs"
          >
            <Check className="h-3.5 w-3.5" />
            {selectedIds.size === filtered.length && filtered.length > 0 ? "Deselect All" : "Select All"}
          </Button>
          {selectedIds.size > 0 && (
            <>
              <Button size="sm" onClick={handleAddSelected} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Add {selectedIds.size} Selected
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)} className="gap-1.5">
                <Trash2 className="h-3.5 w-3.5" />
                Delete {selectedIds.size} Selected
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground">
                Clear
              </Button>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !loaded ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <Film className="h-8 w-8 opacity-40" />
              <p className="text-sm">Set date range and click "Load Videos" to recall your videos</p>
            </div>
          ) : groupedByScene.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Film className="h-8 w-8 opacity-40" />
              <p className="text-sm">{search ? "No matching videos" : "No recalled videos found"}</p>
            </div>
          ) : (
            groupedByScene.map((group) => (
              <div key={`${group.projectName}_s${group.sceneNumber}`} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs font-semibold">Scene {group.sceneNumber}</Badge>
                  <span className="text-xs text-muted-foreground truncate">{group.projectName}</span>
                  <span className="text-xs text-muted-foreground">{group.videos.length} version{group.videos.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                  {group.videos.map((video, idx) => {
                    const added = alreadyAdded(video.video_url);
                    const isSelected = selectedIds.has(video.id);
                    return (
                      <div
                        key={video.id}
                        onClick={() => { if (!added) toggleSelected(video.id); }}
                        className={`relative flex-shrink-0 w-40 rounded-lg overflow-hidden border-2 transition-all group cursor-pointer ${
                          isSelected ? "border-primary ring-1 ring-primary/50" : added ? "border-primary/30 opacity-60 cursor-default" : "border-border/40 hover:border-primary/50"
                        }`}
                      >
                        {/* Selection checkbox - bottom left of video thumbnail */}
                        {!added && (
                          <div className={`absolute bottom-1.5 left-1.5 z-10 h-4 w-4 rounded border flex items-center justify-center transition-all duration-150 group-hover:scale-150 ${
                            isSelected ? "bg-primary border-primary scale-125" : "bg-black/40 border-muted-foreground/50"
                          }`}>
                            {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                          </div>
                        )}
                        <div className="aspect-video relative bg-black">
                          <video
                            src={video.video_url}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                          <div className="absolute top-1 left-1 flex items-center gap-0.5">
                            <Badge className="bg-black/60 text-white text-[9px] px-1 py-0 border-0">
                              #{idx + 1}
                            </Badge>
                            <Badge variant="secondary" className="text-[9px] px-1 py-0">
                              {sourceLabel(video.source)}
                            </Badge>
                          </div>
                          {video.hasAudio && (
                            <div className="absolute top-1 right-1">
                              <div className="h-5 w-5 rounded bg-emerald-500/80 flex items-center justify-center" title="Has audio">
                                <Volume2 className="h-3 w-3 text-white" />
                              </div>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={(e) => { e.stopPropagation(); setPreviewVideo(video); }}
                              className="h-7 w-7 p-0"
                              title="Preview video"
                            >
                              <Play className="h-3 w-3" />
                            </Button>
                            {!added && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleAdd(video)}
                                className="gap-1 h-7 text-xs"
                              >
                                <Plus className="h-3 w-3" />
                                Add
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget(video); }}
                              className="h-7 w-7 p-0"
                              title="Delete video from storage"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="px-2 py-1.5 bg-card">
                          <p className="text-[10px] text-muted-foreground truncate">{video.project_name}</p>
                          <p className="text-[9px] text-muted-foreground/60">
                            {new Date(video.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" })} · {new Date(video.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · {video.provider}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Video</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove this video from your library. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {selectedIds.size} Video{selectedIds.size !== 1 ? "s" : ""}</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove {selectedIds.size} selected video{selectedIds.size !== 1 ? "s" : ""} from your library. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteSelected}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete All Selected
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}