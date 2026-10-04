import { useState } from "react";
import { Check, Film, PenLine, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface LyricQuickEditProps {
  lyric: string;
  onSave: (newLyric: string) => void;
}

export default function LyricQuickEdit({ lyric, onSave }: LyricQuickEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lyric);

  const handleSave = () => {
    if (draft.trim() !== lyric) onSave(draft.trim());
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(lyric);
    setEditing(false);
  };

  return (
    <div className="space-y-2">
      <span className="text-muted-foreground text-xs font-medium flex items-center gap-1.5">
        <Film className="h-3 w-3" /> Lyrics
        {!editing && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { setDraft(lyric); setEditing(true); }}
                className="text-primary hover:text-primary/80 transition-colors"
              >
                <PenLine className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Click to edit lyrics</TooltipContent>
          </Tooltip>
        )}
      </span>
      {editing ? (
        <div className="space-y-1.5">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="text-xs min-h-[60px] bg-secondary/30 border-border/50"
            autoFocus
          />
          <div className="flex gap-1 justify-end">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={handleCancel}>
              <X className="h-3 w-3" /> Cancel
            </Button>
            <Button size="sm" className="h-6 px-2 text-xs gap-1" onClick={handleSave}>
              <Check className="h-3 w-3" /> Save
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="rounded-lg bg-secondary/30 border border-border/50 p-3 text-xs whitespace-pre-wrap max-h-40 overflow-y-auto cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => { setDraft(lyric); setEditing(true); }}
          title="Click to edit"
        >
          {lyric || <span className="text-muted-foreground/50 italic">Click to add lyrics…</span>}
        </div>
      )}
    </div>
  );
}
