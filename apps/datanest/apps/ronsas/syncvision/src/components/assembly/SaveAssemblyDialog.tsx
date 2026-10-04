import { useState, useEffect, useCallback } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface SaveAssemblyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sceneCount: number;
  projectId: string | null;
  saving: boolean;
  onSave: (name?: string, target?: "current" | "new" | string, newProjName?: string) => void;
}

export default function SaveAssemblyDialog({
  open,
  onOpenChange,
  sceneCount,
  projectId,
  saving,
  onSave,
}: SaveAssemblyDialogProps) {
  const { user } = useAuth();
  const [saveNameInput, setSaveNameInput] = useState("");
  const [saveTargetProject, setSaveTargetProject] = useState<"current" | "new" | string>("current");
  const [newProjectName, setNewProjectName] = useState("");
  const [userProjects, setUserProjects] = useState<{ id: string; name: string }[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const fetchUserProjects = useCallback(async () => {
    if (!user) return;
    setLoadingProjects(true);
    try {
      const { data } = await supabase
        .from("projects")
        .select("id, name")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(50);
      setUserProjects(data || []);
    } catch {
      // ignore
    } finally {
      setLoadingProjects(false);
    }
  }, [user]);

  useEffect(() => {
    if (open) {
      fetchUserProjects();
      setSaveTargetProject("current");
      setNewProjectName(`Assembly — ${new Date().toLocaleDateString()}`);
    }
  }, [open, fetchUserProjects]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5 text-primary" />
            Save Assembly
          </DialogTitle>
          <DialogDescription>
            Save the current timeline with {sceneCount} scene{sceneCount !== 1 ? "s" : ""}, transitions, and effects.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label htmlFor="assembly-save-name" className="text-sm font-medium">Assembly Name</label>
            <input
              id="assembly-save-name"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={saveNameInput}
              onChange={(e) => setSaveNameInput(e.target.value)}
              placeholder={`Assembly ${new Date().toLocaleDateString()}`}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Save to Project</label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-md border border-border p-2">
              <label className={`flex items-center gap-2.5 p-2 rounded-md cursor-pointer transition-colors ${saveTargetProject === "current" ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50"}`}>
                <input type="radio" name="save-target" checked={saveTargetProject === "current"} onChange={() => setSaveTargetProject("current")} className="accent-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {userProjects.find(p => p.id === projectId)?.name || "Current Project"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Save to the current project</p>
                </div>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 shrink-0">Current</Badge>
              </label>

              {userProjects.filter(p => p.id !== projectId).map((proj) => (
                <label key={proj.id} className={`flex items-center gap-2.5 p-2 rounded-md cursor-pointer transition-colors ${saveTargetProject === proj.id ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50"}`}>
                  <input type="radio" name="save-target" checked={saveTargetProject === proj.id} onChange={() => setSaveTargetProject(proj.id)} className="accent-primary" />
                  <p className="text-sm truncate flex-1">{proj.name}</p>
                </label>
              ))}

              {loadingProjects && (
                <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading projects…
                </div>
              )}

              <label className={`flex items-center gap-2.5 p-2 rounded-md cursor-pointer transition-colors ${saveTargetProject === "new" ? "bg-accent/10 ring-1 ring-accent/30" : "hover:bg-muted/50"}`}>
                <input type="radio" name="save-target" checked={saveTargetProject === "new"} onChange={() => setSaveTargetProject("new")} className="accent-accent" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-accent">+ Create New Project</p>
                </div>
              </label>
            </div>
          </div>

          {saveTargetProject === "new" && (
            <div className="space-y-1.5 pl-6">
              <label htmlFor="new-project-name" className="text-sm font-medium">New Project Name</label>
              <input
                id="new-project-name"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="My New Project"
              />
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              onSave(saveNameInput.trim() || undefined, saveTargetProject, newProjectName);
              onOpenChange(false);
              setSaveNameInput("");
            }}
            disabled={saving || (saveTargetProject === "new" && !newProjectName.trim())}
            className="gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : saveTargetProject === "new" ? "Create & Save" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
