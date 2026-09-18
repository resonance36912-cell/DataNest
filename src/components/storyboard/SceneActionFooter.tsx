import { Download, Loader2, PenTool, RefreshCw, Trash2, User, X, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import StarRating from "@/components/StarRating";
import RecallGalleryDialog from "@/components/assembly/RecallGalleryDialog";
import GalleryPullDialog from "@/components/storyboard/GalleryPullDialog";
import { Scene } from "@/contexts/ProjectContext";

interface SceneActionFooterProps {
  scene: Scene;
  sceneIndex: number;
  projectId?: string;
  aiPenOpen: number | null;
  onSetAiPenOpen: (val: number | null) => void;
  onSetAiPenPrompt: (val: string) => void;
  onDownloadVideo: (idx: number) => void;
  isDownloading?: boolean;
  onRegenerateScene: (idx: number) => void;
  onDeleteScene: (idx: number) => void;
  onRegenerateWithCharacter: (idx: number, imageUrl: string) => void;
  onPullFromGallery?: (idx: number, videoUrl: string) => void;
  regeneratingScene: number | null;
  onCancelRegenerate: () => void;
  rating: number;
  comment: string;
  autoOptimizing: boolean;
  onRatingChange: (idx: number, val: number) => void;
  onCommentChange: (idx: number, val: string) => void;
}

export default function SceneActionFooter({
  scene, sceneIndex: i, projectId, aiPenOpen,
  onSetAiPenOpen, onSetAiPenPrompt, onDownloadVideo, isDownloading,
  onRegenerateScene, onDeleteScene, onRegenerateWithCharacter,
  onPullFromGallery,
  regeneratingScene, onCancelRegenerate,
  rating, comment, autoOptimizing, onRatingChange, onCommentChange,
}: SceneActionFooterProps) {
  return (
    <div className="flex items-center justify-between border-t border-border/50 px-6 py-3 flex-wrap gap-2">
      <div className="flex gap-1.5 flex-wrap">
        <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground" onClick={() => { onSetAiPenOpen(aiPenOpen === i ? null : i); onSetAiPenPrompt(""); }}>
          <PenTool className="h-3.5 w-3.5" /> AI Pen
        </Button>
        {scene.videoUrl && (
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground" onClick={() => onDownloadVideo(i)} disabled={isDownloading}>
            {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} {isDownloading ? "Downloading…" : "Download"}
          </Button>
        )}
        {regeneratingScene === i ? (
          <Button variant="ghost" size="sm" className="gap-1 text-destructive hover:text-destructive" onClick={onCancelRegenerate}>
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground" onClick={() => onRegenerateScene(i)} disabled={regeneratingScene !== null}>
            <RefreshCw className="h-3.5 w-3.5" /> Regen
          </Button>
        )}
        <Button variant="ghost" size="sm" className="gap-1 text-destructive hover:text-destructive" onClick={() => onDeleteScene(i)}><Trash2 className="h-3.5 w-3.5" /> Clear Media</Button>
        <RecallGalleryDialog
          filterType="character"
          onSelect={(img) => onRegenerateWithCharacter(i, img.image_url)}
          trigger={
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
              <User className="h-3.5 w-3.5" /> Swap Character
            </Button>
          }
        />
        {projectId && onPullFromGallery && (
          <GalleryPullDialog
            sceneNumber={scene.scene_number ?? i + 1}
            projectId={projectId}
            onSelect={(videoUrl) => onPullFromGallery(i, videoUrl)}
            trigger={
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
                <Film className="h-3.5 w-3.5" /> Pull from Gallery
              </Button>
            }
          />
        )}
      </div>
      <StarRating
        label={autoOptimizing ? "⚡ Optimizing…" : "Rate:"}
        value={rating}
        onChange={(v) => onRatingChange(i, v)}
        comment={comment}
        onCommentChange={(c) => onCommentChange(i, c)}
        commentPlaceholder="What should AI improve? e.g. 'more dramatic lighting', 'different angle'… (1-3 stars auto-optimizes)"
      />
    </div>
  );
}
