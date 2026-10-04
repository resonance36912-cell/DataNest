import { useState, useEffect } from "react";
import { User, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface CharacterOption {
  id: string;
  name: string;
  vibe: string | null;
  outfit: string | null;
  imageUrl: string | null;
  description: string | null;
  projectId: string;
  projectName: string;
}

interface CharacterPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (character: CharacterOption) => void;
}

export default function CharacterPickerDialog({ open, onOpenChange, onSelect }: CharacterPickerDialogProps) {
  const { user } = useAuth();
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    (async () => {
      try {
        const { data: chars } = await supabase
          .from("characters")
          .select("id, name, vibe, outfit, reference_image_url, extra_details, project_id")
          .eq("user_id", user.id)
          .eq("confirmed", true)
          .order("created_at", { ascending: false });

        if (!chars || chars.length === 0) {
          setCharacters([]);
          setLoading(false);
          return;
        }

        // Resolve project names
        const projectIds = [...new Set(chars.map(c => c.project_id))];
        const { data: projects } = await supabase
          .from("projects")
          .select("id, name")
          .in("id", projectIds);
        const projMap = new Map((projects || []).map(p => [p.id, p.name]));

        setCharacters(chars.map(c => ({
          id: c.id,
          name: c.name || "Unnamed Character",
          vibe: c.vibe,
          outfit: c.outfit,
          imageUrl: c.reference_image_url,
          description: c.extra_details,
          projectId: c.project_id,
          projectName: projMap.get(c.project_id) || "Unknown",
        })));
      } catch {
        toast.error("Failed to load characters");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, user]);

  const handleConfirm = () => {
    const char = characters.find(c => c.id === selectedId);
    if (char) {
      onSelect(char);
      onOpenChange(false);
      setSelectedId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Choose a Character</DialogTitle>
          <DialogDescription>
            Select a character to regenerate the selected scene(s) with a new look.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : characters.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
            <User className="h-8 w-8 opacity-40" />
            <p className="text-sm font-medium">No Confirmed Characters</p>
            <p className="text-xs">Create and confirm a character in the Character step first.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2">
            {characters.map((char) => (
              <button
                key={char.id}
                onClick={() => setSelectedId(char.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                  selectedId === char.id
                    ? "border-primary bg-primary/5"
                    : "border-border/40 hover:border-primary/30"
                }`}
              >
                {char.imageUrl ? (
                  <img
                    src={char.imageUrl}
                    alt={char.name}
                    className="h-14 w-14 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <User className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{char.name}</span>
                    {selectedId === char.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {char.vibe && <Badge variant="secondary" className="text-[10px]">{char.vibe}</Badge>}
                    <span className="text-[10px] text-muted-foreground truncate">{char.projectName}</span>
                  </div>
                  {char.outfit && (
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{char.outfit}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleConfirm} disabled={!selectedId} className="gap-1.5">
            <User className="h-3.5 w-3.5" /> Use Character
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
