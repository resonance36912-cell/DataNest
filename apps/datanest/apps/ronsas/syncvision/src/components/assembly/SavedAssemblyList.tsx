import { useState } from "react";
import { Film, Loader2, Trash2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface SavedAssemblyItem {
  id: string;
  name: string;
  sceneCount: number;
  updatedAt: string;
}

interface SavedAssemblyListProps {
  assemblies: SavedAssemblyItem[];
  loading: boolean;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  loadingId?: string | null;
}

export default function SavedAssemblyList({
  assemblies,
  loading,
  onLoad,
  onDelete,
  loadingId,
}: SavedAssemblyListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase
        .from("assembly_configs")
        .delete()
        .eq("id", id);
      if (error) throw error;
      onDelete(id);
      toast.success("Assembly deleted");
    } catch (e: any) {
      toast.error("Delete failed: " + (e.message || "Unknown error"));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading saved assemblies…
      </div>
    );
  }

  if (assemblies.length === 0) return null;

  return (
    <div className="space-y-2 w-full max-w-lg mx-auto">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saved Assemblies</p>
      {assemblies.map((a) => (
        <button
          key={a.id}
          onClick={() => onLoad(a.id)}
          disabled={!!loadingId || !!deletingId}
          className="w-full flex items-center gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors text-left group"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
            {loadingId === a.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Film className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{a.name}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/20">
                {a.sceneCount} scenes
              </Badge>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(a.updatedAt).toLocaleDateString()} · {new Date(a.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(a.id);
            }}
            disabled={!!deletingId}
            className="h-7 w-7 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10"
            title="Delete this saved assembly"
          >
            {deletingId === a.id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </button>
        </button>
      ))}
    </div>
  );
}
