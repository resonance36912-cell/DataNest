/**
 * RegenerateScenesPicker — Dialog to choose which scenes to regenerate from transcript.
 */
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import type { Scene } from "@/contexts/ProjectContext";

interface RegenerateScenePickerProps {
  scenes: Scene[];
  generating: boolean;
  onRegenerate: (indices: Set<number>) => void;
}

export default function RegenerateScenesPicker({ scenes, generating, onRegenerate }: RegenerateScenePickerProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      // Pre-select all scenes
      setSelected(new Set(scenes.map((_, i) => i)));
    }
    setOpen(isOpen);
  };

  const toggle = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(scenes.map((_, i) => i)));
  const deselectAll = () => setSelected(new Set());

  const handleConfirm = () => {
    setOpen(false);
    onRegenerate(selected);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline" size="sm"
          className="gap-1.5 border-border text-foreground hover:bg-secondary"
          disabled={generating || scenes.length === 0}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Regenerate Scenes…
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Choose scenes to regenerate</DialogTitle>
          <DialogDescription>
            Selected scenes will be re-generated from the transcript. Existing images and videos for those scenes will be replaced.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={selectAll}>Select All</Button>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={deselectAll}>Deselect All</Button>
          <span className="text-xs text-muted-foreground ml-auto">{selected.size}/{scenes.length} selected</span>
        </div>

        <div className="overflow-y-auto flex-1 space-y-1 pr-1">
          {scenes.map((scene, idx) => (
            <label
              key={idx}
              className="flex items-center gap-3 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-secondary/50 transition-colors"
            >
              <Checkbox
                checked={selected.has(idx)}
                onCheckedChange={() => toggle(idx)}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Scene {idx + 1}</span>
                  <span className="text-[10px] text-muted-foreground">{scene.time_start}–{scene.time_end}</span>
                  {scene.imageUrl && <span className="text-[10px]">🖼️</span>}
                  {scene.videoUrl && <span className="text-[10px]">🎬</span>}
                </div>
                {scene.lyric_segment && (
                  <p className="text-xs text-muted-foreground truncate">{scene.lyric_segment}</p>
                )}
              </div>
            </label>
          ))}
        </div>

        <DialogFooter className="mt-3">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={handleConfirm} disabled={selected.size === 0} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate {selected.size} Scene{selected.size !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
