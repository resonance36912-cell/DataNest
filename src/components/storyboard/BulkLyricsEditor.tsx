import { useState, useEffect } from "react";
import { Check, X, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Scene } from "@/contexts/ProjectContext";

interface BulkLyricsEditorProps {
  scenes: Scene[];
  onSave: (updates: { sceneIndex: number; lyric_segment: string }[]) => void;
}

export default function BulkLyricsEditor({ scenes, onSave }: BulkLyricsEditorProps) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setDrafts(scenes.map((s) => s.lyric_segment || ""));
    }
  }, [open, scenes]);

  const handleSave = () => {
    const updates: { sceneIndex: number; lyric_segment: string }[] = [];
    drafts.forEach((draft, idx) => {
      if (draft !== (scenes[idx]?.lyric_segment || "")) {
        updates.push({ sceneIndex: idx, lyric_segment: draft.trim() });
      }
    });
    if (updates.length > 0) onSave(updates);
    setOpen(false);
  };

  const changedCount = drafts.filter((d, i) => d !== (scenes[i]?.lyric_segment || "")).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 border-border text-foreground hover:bg-secondary">
              <Type className="h-3.5 w-3.5" />
              Edit All Lyrics
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-[200px] text-xs">Edit lyrics for all scenes in one view</p>
        </TooltipContent>
      </Tooltip>

      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Type className="h-5 w-5" />
            Bulk Lyrics Editor
          </DialogTitle>
          <DialogDescription>
            Edit lyrics for all {scenes.length} scenes. Changes are applied when you click Save.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 pr-4 -mr-4">
          <div className="space-y-4 py-2">
            {scenes.map((scene, idx) => {
              const changed = drafts[idx] !== undefined && drafts[idx] !== (scene.lyric_segment || "");
              return (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      Scene {scene.scene_number}
                    </Badge>
                    <span className="text-xs text-muted-foreground truncate flex-1">
                      {scene.time_start} – {scene.time_end}
                    </span>
                    {changed && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-primary/20 text-primary border-primary/30">
                        Modified
                      </Badge>
                    )}
                  </div>
                  <Textarea
                    value={drafts[idx] ?? ""}
                    onChange={(e) => {
                      const next = [...drafts];
                      next[idx] = e.target.value;
                      setDrafts(next);
                    }}
                    placeholder="Enter lyrics for this scene…"
                    className="text-xs min-h-[56px] bg-secondary/30 border-border/50 resize-none"
                    rows={2}
                  />
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <span className="text-xs text-muted-foreground mr-auto">
            {changedCount > 0 ? `${changedCount} scene${changedCount > 1 ? "s" : ""} modified` : "No changes"}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="gap-1">
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={changedCount === 0} className="gap-1">
            <Check className="h-3.5 w-3.5" /> Save {changedCount > 0 ? `(${changedCount})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
