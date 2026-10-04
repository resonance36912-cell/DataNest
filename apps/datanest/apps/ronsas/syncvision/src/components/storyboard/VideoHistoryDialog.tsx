import { Loader2, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VideoHistoryItem } from "@/types/storyboard";

interface VideoHistoryDialogProps {
  sceneIndex: number | null;
  items: VideoHistoryItem[];
  loading: boolean;
  onClose: () => void;
  onRestore: (sceneIndex: number, url: string, quality: string) => void;
}

export default function VideoHistoryDialog({ sceneIndex, items, loading, onClose, onRestore }: VideoHistoryDialogProps) {
  return (
    <Dialog open={sceneIndex !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Video History — Scene {sceneIndex !== null ? sceneIndex + 1 : ""}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading history…</span>
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No previously generated videos found for this scene.</p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{item.provider}</Badge>
                    <Badge variant="outline" className="text-[10px]">{item.quality}</Badge>
                    {item.trackingId && (
                      <Badge variant="outline" className="text-[10px] font-mono border-muted-foreground/30 text-muted-foreground">
                        {item.trackingId}
                      </Badge>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
                <video
                  src={item.url}
                  className="w-full rounded-md aspect-video bg-secondary"
                  controls
                  preload="metadata"
                />
                <Button
                  size="sm"
                  className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => sceneIndex !== null && onRestore(sceneIndex, item.url, item.quality)}
                >
                  <Check className="h-3.5 w-3.5" /> Use This Video
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
