import { Eraser, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Scene } from "@/contexts/ProjectContext";
import type { VideoJobState } from "@/types/storyboard";

interface CacheClearDialogsProps {
  scenes: Scene[];
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>;
  projectId: string | null;
  userId: string | undefined;
  generating: boolean;
  generatingAllImages: boolean;
  gen: {
    pollTimers: React.MutableRefObject<Record<number, unknown>>;
    videoProgressTimers: React.MutableRefObject<Record<number, unknown>>;
    cachedAudioUrl: React.MutableRefObject<string | null>;
    jobIdMap: React.MutableRefObject<Record<number, string>>;
    setVideoJobs: React.Dispatch<React.SetStateAction<Record<number, VideoJobState>>>;
  };
  characterImageStorageUrl: React.MutableRefObject<string | null>;
  setSceneRatings: (r: Record<number, number>) => void;
  setSceneComments: (c: Record<number, string>) => void;
}

export default function CacheClearDialogs({
  scenes, setScenes, projectId, userId, generating, generatingAllImages,
  gen, characterImageStorageUrl, setSceneRatings, setSceneComments,
}: CacheClearDialogsProps) {
  const hasImages = scenes.some(s => s.imageUrl);
  const hasVideos = scenes.some(s => s.videoUrl);

  if (scenes.length === 0 || (!hasImages && !hasVideos)) return null;

  return (
    <>
      {/* Clear Cached Images */}
      {hasImages && (
        <AlertDialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10" disabled={generatingAllImages}>
                  <Eraser className="h-3.5 w-3.5" /> Clear Images
                </Button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent>Clear all cached scene images to force regeneration</TooltipContent>
          </Tooltip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all scene images?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove all {scenes.filter(s => s.imageUrl).length} cached scene images. You'll need to regenerate them. Videos will not be affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  setScenes(prev => prev.map(s => ({ ...s, imageUrl: undefined })));
                  if (projectId && userId) {
                    await supabase.from("scenes").update({ scene_image_url: null } as any).eq("project_id", projectId).eq("user_id", userId);
                  }
                  toast.success("Cached images cleared. Generate new images when ready.");
                }}>
                Clear Images
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Clear Videos */}
      {hasVideos && (
        <AlertDialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10" disabled={generating}>
                  <Eraser className="h-3.5 w-3.5" /> Clear Videos
                </Button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent>Clear all cached videos to force regeneration (keeps images)</TooltipContent>
          </Tooltip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all scene videos?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove all {scenes.filter(s => s.videoUrl).length} cached scene videos. Scene images will not be affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  setScenes(prev => prev.map(s => ({ ...s, videoUrl: undefined, videoQuality: undefined, generatingVideo: false })));
                  if (projectId && userId) {
                    await supabase.from("scenes").update({ video_url: null, video_quality: null } as any).eq("project_id", projectId).eq("user_id", userId);
                  }
                  toast.success("Cached videos cleared. Generate new videos when ready.");
                }}>
                Clear Videos
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Clear All Cache */}
      {(hasImages || hasVideos) && (
        <AlertDialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10" disabled={generatingAllImages || generating}>
                  <Trash2 className="h-3.5 w-3.5" /> Clear All Cache
                </Button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent>Clear all cached images, videos, audio cache, and temporary files</TooltipContent>
          </Tooltip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear entire pipeline cache?</AlertDialogTitle>
              <AlertDialogDescription>
                This will clear all cached assets:
                <ul className="list-disc ml-4 mt-2 space-y-1">
                  <li>{scenes.filter(s => s.imageUrl).length} scene image(s)</li>
                  <li>{scenes.filter(s => s.videoUrl).length} video(s)</li>
                  <li>Cached audio &amp; character image URLs</li>
                  <li>All active job polling timers</li>
                </ul>
                <p className="mt-2">Scene descriptions and character data will be preserved. You can regenerate everything fresh.</p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  Object.values(gen.pollTimers.current).forEach(t => { clearTimeout(t as number); clearInterval(t as number); });
                  Object.values(gen.videoProgressTimers.current).forEach(t => clearInterval(t as number));
                  gen.cachedAudioUrl.current = null;
                  characterImageStorageUrl.current = null;
                  gen.jobIdMap.current = {};
                  setScenes(prev => prev.map(s => ({
                    ...s, imageUrl: undefined, videoUrl: undefined, videoQuality: undefined,
                    generatingVideo: false, generatingImage: false, videoRequestId: undefined, videoJobId: undefined,
                    videoStatusUrl: undefined, videoResponseUrl: undefined,
                  })));
                  gen.setVideoJobs({});
                  setSceneRatings({});
                  setSceneComments({});
                  if (projectId && userId) {
                    await Promise.all([
                      supabase.from("scenes").update({
                        scene_image_url: null, video_url: null, video_quality: null,
                        lipsync_video_url: null, base_video_url: null, enhanced_video_url: null,
                        performance_video_url: null, runway_task_id: null, last_generation_error: null,
                      } as any).eq("project_id", projectId).eq("user_id", userId),
                      supabase.from("render_jobs").update({ status: "cancelled", error: "Cache cleared by user" } as any)
                        .eq("project_id", projectId).eq("user_id", userId).in("status", ["queued", "processing", "submitted"]),
                      supabase.from("lipsync_jobs").update({ status: "cancelled", error_message: "Cache cleared by user" } as any)
                        .eq("project_id", projectId).eq("user_id", userId).in("status", ["queued", "processing", "submitted"]),
                      supabase.from("generation_jobs").update({ status: "cancelled", error_message: "Cache cleared by user" } as any)
                        .eq("project_id", projectId).eq("user_id", userId).in("status", ["queued", "processing", "submitted"]),
                    ]);
                  }
                  toast.success("All cache cleared. Pipeline ready for fresh generation.");
                }}>
                Clear Everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
