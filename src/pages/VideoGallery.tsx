import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Film, Download, Calendar, Layers, Search, Filter, Plus, Trash2, CalendarIcon, X, SendHorizonal } from "lucide-react";
import { VideoGridSkeleton, EmptyState } from "@/components/ui/page-loader";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import Layout from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface GalleryVideo {
  id: string;
  url: string;
  provider: string;
  quality: string;
  sceneNumber: number;
  projectId: string;
  projectName: string;
  createdAt: string;
  source: "scene" | "render_job" | "generation_job";
  durationSec?: number;
  trackingId?: string;
}

/** Probe a video URL for its duration (seconds). Returns null on failure. */
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

export default function VideoGallery() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [videos, setVideos] = useState<GalleryVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [filterDate, setFilterDate] = useState<Date | undefined>(undefined);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    loadVideos();
  }, [user]);

  const loadVideos = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: projData } = await supabase
        .from("projects")
        .select("id, name")
        .eq("user_id", user.id);
      const projMap = new Map<string, string>((projData || []).map((p: any) => [String(p.id), String(p.name || "Unknown")] as [string, string]));
      setProjects(projData || []);

      const projectIds = Array.from(projMap.keys());
      if (projectIds.length === 0) { setVideos([]); setLoading(false); return; }

      // Only fetch WAN-generated videos (render_jobs + scenes with video_url)
      const [scenesRes, renderSucceededRes, renderCompletedRes, orphanedRenderRes] = await Promise.all([
        supabase.from("scenes").select("id, video_url, scene_number, project_id, provider_name, video_quality, updated_at, tracking_id").eq("user_id", user.id).not("video_url", "is", null).order("updated_at", { ascending: false }).limit(500),
        supabase.from("render_jobs").select("id, output, scene_number, project_id, provider, quality, created_at, tracking_id").eq("user_id", user.id).eq("status", "succeeded").order("created_at", { ascending: false }).limit(500),
        supabase.from("render_jobs").select("id, output, scene_number, project_id, provider, quality, created_at, tracking_id").eq("user_id", user.id).eq("status", "completed").order("created_at", { ascending: false }).limit(500),
        supabase.from("render_jobs").select("id, output, scene_number, project_id, provider, quality, created_at").eq("user_id", user.id).in("status", ["succeeded", "completed"]).is("project_id", null).order("created_at", { ascending: false }).limit(200),
      ]);

      const items: GalleryVideo[] = [];
      const seenUrls = new Set<string>();

      (scenesRes.data || []).forEach((s: any) => {
        if (s.video_url && !seenUrls.has(s.video_url)) {
          seenUrls.add(s.video_url);
          items.push({ id: s.id, url: s.video_url, provider: s.provider_name || "wan-25", quality: s.video_quality || "hd", sceneNumber: s.scene_number, projectId: s.project_id, projectName: projMap.get(s.project_id) || "Unknown", createdAt: s.updated_at, source: "scene", trackingId: (s as any).tracking_id });
        }
      });

      const allRenderJobs = [...(renderSucceededRes.data || []), ...(renderCompletedRes.data || [])];
      allRenderJobs.forEach((j: any) => {
        const videoUrl = j.output?.video_url || j.output?.video?.url;
        if (videoUrl && !seenUrls.has(videoUrl)) {
          seenUrls.add(videoUrl);
          items.push({ id: j.id, url: videoUrl, provider: j.provider || "wan-25", quality: j.quality || "hd", sceneNumber: j.scene_number, projectId: j.project_id || "", projectName: j.project_id ? (projMap.get(j.project_id) || "Unknown") : "Unsaved Project", createdAt: j.created_at, source: "render_job", trackingId: j.tracking_id });
        }
      });

      (orphanedRenderRes.data || []).forEach((j: any) => {
        const videoUrl = j.output?.video_url || j.output?.video?.url;
        if (videoUrl && !seenUrls.has(videoUrl)) {
          seenUrls.add(videoUrl);
          items.push({ id: j.id, url: videoUrl, provider: j.provider || "wan-25", quality: j.quality || "hd", sceneNumber: j.scene_number, projectId: "", projectName: "Unsaved Project", createdAt: j.created_at, source: "render_job" });
        }
      });

      // Probe durations and keep only ~10s videos (8-12s tolerance)
      const withDurations = await Promise.all(
        items.map(async (item) => {
          const dur = await probeVideoDuration(item.url);
          return { ...item, durationSec: dur ?? undefined };
        })
      );
      const tenSecOnly = withDurations.filter(v => v.durationSec != null && v.durationSec >= 8 && v.durationSec <= 12);

      // Sort by scene number ascending, newest first within same scene
      tenSecOnly.sort((a, b) => a.sceneNumber - b.sceneNumber || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setVideos(tenSecOnly);
    } catch (err) {
      console.error("Failed to load video gallery:", err);
    } finally {
      setLoading(false);
    }
  };

  const [storageDeleteVideo, setStorageDeleteVideo] = useState<GalleryVideo | null>(null);
  const [deletingStorage, setDeletingStorage] = useState(false);

  const deleteVideo = async (video: GalleryVideo) => {
    if (!user) return;
    setDeleting(prev => new Set(prev).add(video.id));
    try {
      // Remove the video reference from its source table
      if (video.source === "scene") {
        const baseId = video.id.replace(/-lipsync$/, "").replace(/-enhanced$/, "");
        const isLipsync = video.id.endsWith("-lipsync");
        const isEnhanced = video.id.endsWith("-enhanced");
        if (isLipsync) {
          await supabase.from("scenes").update({ lipsync_video_url: null } as any).eq("id", baseId).eq("user_id", user.id);
        } else if (isEnhanced) {
          await supabase.from("scenes").update({ enhanced_video_url: null } as any).eq("id", baseId).eq("user_id", user.id);
        } else {
          await supabase.from("scenes").update({ video_url: null, video_quality: null } as any).eq("id", video.id).eq("user_id", user.id);
        }
      } else if (video.source === "generation_job") {
        await supabase.from("generation_jobs").update({ output_asset_url: null } as any).eq("id", video.id).eq("user_id", user.id);
      } else if (video.source === "render_job") {
        await supabase.from("render_jobs").update({ output: {} } as any).eq("id", video.id).eq("user_id", user.id);
      }

      setVideos(prev => prev.filter(v => v.id !== video.id));
      toast.success("Video removed from gallery");

      // Prompt to permanently delete from storage
      setStorageDeleteVideo(video);
    } catch (err) {
      console.error("Failed to delete video:", err);
      toast.error("Failed to delete video");
    } finally {
      setDeleting(prev => { const next = new Set(prev); next.delete(video.id); return next; });
    }
  };

  const deleteFromStorage = async (video: GalleryVideo) => {
    setDeletingStorage(true);
    try {
      const { error } = await supabase.functions.invoke("delete-fal-asset", {
        body: { urls: [video.url] },
      });
      if (error) throw error;
      toast.success("File permanently deleted from storage");
    } catch (err) {
      console.error("Storage delete failed:", err);
      toast.error("Failed to delete from storage");
    } finally {
      setDeletingStorage(false);
      setStorageDeleteVideo(null);
    }
  };

  const filtered = useMemo(() => videos.filter(v => {
    if (filterProject !== "all" && v.projectId !== filterProject) return false;
    if (search && !v.projectName.toLowerCase().includes(search.toLowerCase()) && !`scene ${v.sceneNumber}`.includes(search.toLowerCase())) return false;
    if (filterDate) {
      const vDate = new Date(v.createdAt);
      if (vDate.toDateString() !== filterDate.toDateString()) return false;
    }
    return true;
  }), [videos, filterProject, search, filterDate]);

  // Unique dates for quick-reference
  const availableDates = useMemo(() => {
    const dates = new Set(videos.map(v => new Date(v.createdAt).toDateString()));
    return dates;
  }, [videos]);

  return (
    <Layout>
      <div className="container py-10">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Film className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Video Gallery</h1>
              <p className="text-sm text-muted-foreground">All previously generated videos across your projects</p>
            </div>
          </div>
          <Link to="/project/new">
            <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> New Project
            </Button>
          </Link>
        </motion.div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by project or scene..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-full sm:w-52">
              <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date picker filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full sm:w-48 justify-start text-left font-normal gap-2",
                  !filterDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {filterDate ? format(filterDate, "MMM d, yyyy") : "Filter by date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarPicker
                mode="single"
                selected={filterDate}
                onSelect={setFilterDate}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
                modifiers={{ hasVideos: (date) => availableDates.has(date.toDateString()) }}
                modifiersClassNames={{ hasVideos: "font-bold text-primary" }}
              />
            </PopoverContent>
          </Popover>
          {filterDate && (
            <Button variant="ghost" size="sm" onClick={() => setFilterDate(undefined)} className="gap-1 text-xs shrink-0">
              <X className="h-3.5 w-3.5" /> Clear date
            </Button>
          )}

          <div className="text-sm text-muted-foreground flex items-center gap-1.5 shrink-0">
            <Layers className="h-3.5 w-3.5" />
            {filtered.length} video{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>

        {loading ? (
          <VideoGridSkeleton count={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Film className="h-12 w-12" />}
            title="No videos found"
            description="Generate some videos in your projects to see them here!"
            action={
              <Link to="/project/new">
                <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-4 w-4" /> New Project
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((video, i) => (
              <motion.div
                key={video.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="glass-card overflow-hidden group"
              >
                <div className="relative aspect-video bg-secondary">
                  <video
                    src={video.url}
                    className="w-full h-full object-cover"
                    controls
                    preload="metadata"
                  />
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => video.projectId ? navigate(`/project/${video.projectId}`) : null}
                      className="font-medium text-sm hover:text-primary transition-colors truncate"
                    >
                      {video.projectName}
                    </button>
                    <Badge variant="outline" className="text-[10px] shrink-0">Scene {video.sceneNumber}</Badge>
                    {video.trackingId && <Badge variant="outline" className="text-[10px] font-mono shrink-0 border-muted-foreground/30 text-muted-foreground">{video.trackingId}</Badge>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">{video.provider}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{video.quality}</Badge>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 ml-auto">
                      <Calendar className="h-3 w-3" />
                      {new Date(video.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1.5 text-xs"
                      onClick={() => video.projectId ? navigate(`/project/${video.projectId}`) : null}
                      disabled={!video.projectId}
                    >
                      Open Project
                    </Button>
                     <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-xs text-primary hover:text-primary hover:bg-primary/10"
                      title="Send this video to the Assembly timeline"
                      disabled={!video.projectId}
                      onClick={() => {
                        sessionStorage.setItem("gallery_to_timeline", JSON.stringify({
                          videoUrl: video.url,
                          sceneNumber: video.sceneNumber,
                          lyricSegment: `Scene ${video.sceneNumber}`,
                          projectId: video.projectId,
                        }));
                        navigate(`/project/${video.projectId}?step=5`);
                        toast.success("Navigating to timeline…");
                      }}
                    >
                      <SendHorizonal className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-xs"
                      onClick={async () => {
                        // The `download` attribute is ignored for cross-origin
                        // URLs (fal.media, signed Supabase storage URLs), so the
                        // browser just previews the video. Fetch as a blob and
                        // trigger the download from an object URL.
                        const filename = `${video.projectName}-scene${video.sceneNumber}.mp4`;
                        const toastId = toast.loading(`Preparing ${filename}…`);
                        try {
                          const resp = await fetch(video.url, { mode: "cors", credentials: "omit" });
                          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                          const blob = await resp.blob();
                          const objectUrl = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = objectUrl;
                          a.download = filename;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
                          toast.success("Download started", { id: toastId });
                        } catch (err: any) {
                          console.error("Download failed:", err);
                          toast.error(`Download failed: ${err?.message || "network error"}`, { id: toastId });
                          // Fallback: open in a new tab so the user can right-click → Save As.
                          window.open(video.url, "_blank", "noopener,noreferrer");
                        }
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                          disabled={deleting.has(video.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete video?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will remove the video reference from your gallery. The file may still exist in storage but won't appear here.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteVideo(video)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
        {/* Storage delete confirmation dialog */}
        <AlertDialog open={!!storageDeleteVideo} onOpenChange={(open) => { if (!open) setStorageDeleteVideo(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Permanently delete from storage?</AlertDialogTitle>
              <AlertDialogDescription>
                The video has been removed from your gallery. Would you also like to permanently delete the file from storage? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingStorage}>Keep in Storage</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => storageDeleteVideo && deleteFromStorage(storageDeleteVideo)}
                disabled={deletingStorage}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletingStorage ? "Deleting…" : "Delete Permanently"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
