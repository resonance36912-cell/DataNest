import { useState, useEffect } from "react";
import { Film, Loader2, Calendar, Layers } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface GalleryVideo {
  id: string;
  url: string;
  quality: string;
  provider: string;
  createdAt: string;
  trackingId?: string;
  source: string;
}

interface GalleryPullDialogProps {
  sceneNumber: number;
  projectId: string;
  trigger: React.ReactNode;
  onSelect: (videoUrl: string) => void;
}

export default function GalleryPullDialog({ sceneNumber, projectId, trigger, onSelect }: GalleryPullDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [videos, setVideos] = useState<GalleryVideo[]>([]);

  useEffect(() => {
    if (!open || !user) return;
    loadVideos();
  }, [open, user]);

  const loadVideos = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Only fetch scenes that currently have a video_url (source of truth)
      const scenesRes = await supabase.from("scenes")
        .select("id, video_url, provider_name, video_quality, updated_at, tracking_id, project_id")
        .eq("user_id", user.id)
        .eq("scene_number", sceneNumber)
        .not("video_url", "is", null)
        .order("updated_at", { ascending: false })
        .limit(50);

      const items: GalleryVideo[] = [];
      const seenUrls = new Set<string>();

      (scenesRes.data || []).forEach((s: any) => {
        if (s.video_url && !seenUrls.has(s.video_url)) {
          seenUrls.add(s.video_url);
          items.push({
            id: s.id,
            url: s.video_url,
            quality: s.video_quality || "hd",
            provider: s.provider_name || "wan",
            createdAt: s.updated_at,
            trackingId: s.tracking_id,
            source: s.project_id === projectId ? "This project" : "Other project",
          });
        }
      });

      setVideos(items);
    } catch (err) {
      console.error("Failed to load gallery videos:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (video: GalleryVideo) => {
    onSelect(video.url);
    setOpen(false);
    toast.success(`Video applied to Scene ${sceneNumber}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="h-4 w-4 text-primary" />
            Pull Video for Scene {sceneNumber}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No videos found for Scene {sceneNumber} in your gallery.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {videos.map((video) => (
              <button
                key={video.id}
                onClick={() => handleSelect(video)}
                className="group rounded-lg border border-border/50 overflow-hidden hover:border-primary/50 transition-all text-left"
              >
                <div className="aspect-video bg-secondary">
                  <video
                    src={video.url}
                    className="w-full h-full object-cover"
                    preload="metadata"
                    muted
                  />
                </div>
                <div className="p-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">{video.quality}</Badge>
                    <Badge variant="outline" className="text-[10px]">{video.source}</Badge>
                    {video.trackingId && (
                      <Badge variant="outline" className="text-[10px] font-mono border-muted-foreground/30 text-muted-foreground">
                        {video.trackingId}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(video.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="text-[10px] text-muted-foreground flex items-center gap-1 pt-2">
          <Layers className="h-3 w-3" /> {videos.length} video{videos.length !== 1 ? "s" : ""} available
        </div>
      </DialogContent>
    </Dialog>
  );
}
