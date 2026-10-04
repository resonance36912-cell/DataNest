import { useMemo } from "react";
import { Film, Loader2, RefreshCw, Download, Trash2, PenTool, ArrowUpCircle, History, CloudOff, ImageIcon } from "lucide-react";
import { getCachedBlobUrl } from "@/hooks/useVideoPreloader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Scene } from "@/contexts/ProjectContext";
import ProcessProgressBar from "@/components/ProcessProgressBar";

interface SceneMediaPreviewProps {
  scene: Scene;
  sceneIndex: number;
  upscaleJob?: { status: string; progress: number };
  aiPenOpen: number | null;
  onSetAiPenOpen: (val: number | null) => void;
  onSetAiPenPrompt: (val: string) => void;
  onRegenerateImage: (idx: number) => void;
  onGenerateImage: (scenes: Scene[], idx: number) => void;
  onSubmitUpscale: (idx: number) => void;
  onLoadVideoHistory: (idx: number) => void;
  onDownloadVideo: (idx: number) => void;
  isDownloading?: boolean;
  onDeleteVideo: (idx: number) => void;
  onDeleteVideoFal: (idx: number) => void;
}

export default function SceneMediaPreview({
  scene, sceneIndex: i, upscaleJob,
  aiPenOpen, onSetAiPenOpen, onSetAiPenPrompt,
  onRegenerateImage, onGenerateImage, onSubmitUpscale,
  onLoadVideoHistory, onDownloadVideo, onDeleteVideo, onDeleteVideoFal,
  isDownloading,
}: SceneMediaPreviewProps) {
  // Use blob-cached URL when available for instant playback
  const effectiveVideoUrl = useMemo(
    () => getCachedBlobUrl(scene.videoUrl) || scene.videoUrl,
    [scene.videoUrl]
  );

  return (
    <div className="aspect-video rounded-lg bg-secondary/50 flex items-center justify-center overflow-hidden relative group">
      {scene.videoUrl ? (
        <>
          <video
            src={effectiveVideoUrl}
            controls
            preload="auto"
            playsInline
            className="w-full h-full object-cover rounded-lg"
            poster={scene.imageUrl}
          />
          {scene.videoQuality === "upscaled" && (
            <div className="absolute bottom-2 left-2">
              <Badge className="bg-primary/80 text-primary-foreground border-primary/30 text-[9px] backdrop-blur-sm">
                ✨ Upscaled
              </Badge>
            </div>
          )}
          <div className="absolute top-2 right-2 flex gap-1">
            {scene.videoQuality !== "upscaled" && !upscaleJob?.status?.match(/submitting|processing/) && (
              <button onClick={() => onSubmitUpscale(i)} className="bg-primary/80 backdrop-blur-sm rounded-full p-1.5 hover:bg-primary transition-colors text-primary-foreground" title="Upscale video">
                <ArrowUpCircle className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={() => onLoadVideoHistory(i)} className="bg-accent/80 backdrop-blur-sm rounded-full p-1.5 hover:bg-accent transition-colors text-accent-foreground" title="Browse previous versions">
              <History className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onDownloadVideo(i)} disabled={isDownloading} className="bg-background/80 backdrop-blur-sm rounded-full p-1.5 hover:bg-background transition-colors disabled:opacity-50" title="Download video">
              {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => onDeleteVideo(i)} className="bg-destructive/80 backdrop-blur-sm rounded-full p-1.5 hover:bg-destructive transition-colors text-destructive-foreground" title="Delete video">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            {scene.videoUrl && (scene.videoUrl.includes("fal.media") || scene.videoUrl.includes("googleapis.com/fal")) && (
              <button onClick={() => onDeleteVideoFal(i)} className="bg-orange-600/80 backdrop-blur-sm rounded-full p-1.5 hover:bg-orange-600 transition-colors text-white" title="Delete from FAL storage">
                <CloudOff className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {upscaleJob && ["submitting", "processing"].includes(upscaleJob.status) && (
            <div className="absolute bottom-0 left-0 right-0 p-2">
              <ProcessProgressBar progress={upscaleJob.progress} active label="Upscaling…" barHeight="h-1.5" />
            </div>
          )}
        </>
      ) : scene.generatingImage ? (
        <Skeleton className="w-full h-full flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </Skeleton>
      ) : scene.imageUrl ? (
        <>
          <img src={scene.imageUrl} alt={`Scene ${i + 1}`} className="w-full h-full object-cover" />
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onLoadVideoHistory(i)} className="bg-accent/80 backdrop-blur-sm rounded-full p-1.5 hover:bg-accent transition-colors text-accent-foreground" title="Recall a previous video">
              <History className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => { onSetAiPenOpen(aiPenOpen === i ? null : i); onSetAiPenPrompt(""); }} className="bg-background/80 backdrop-blur-sm rounded-full p-1.5 hover:bg-background transition-colors" title="AI Pen — edit image">
              <PenTool className="h-3.5 w-3.5 text-primary" />
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await fetch(scene.imageUrl!);
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `scene-${i + 1}-image.png`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                } catch { /* silent */ }
              }}
              className="bg-background/80 backdrop-blur-sm rounded-full p-1.5 hover:bg-background transition-colors"
              title="Download image"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onRegenerateImage(i)} className="bg-background/80 backdrop-blur-sm rounded-full p-1.5 hover:bg-background transition-colors" title="Regenerate image">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Film className="h-12 w-12 text-muted-foreground/30" />
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => onGenerateImage([], i)}>
              <ImageIcon className="h-3.5 w-3.5" /> Generate Image
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => onLoadVideoHistory(i)}>
              <History className="h-3.5 w-3.5" /> Recall Video
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
