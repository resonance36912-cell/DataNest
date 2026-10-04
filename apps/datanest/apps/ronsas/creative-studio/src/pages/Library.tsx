import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Trash2, Download, ImageOff, ArrowLeft, FolderPlus, FolderOpen, Pencil } from "lucide-react";
import { toast as sonner } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  deleteLibraryItem,
  downloadUrl,
  listLibrary,
  signLibraryItem,
  type LibraryItem,
} from "@/lib/library";
import SEO from "@/components/SEO";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  listSavedProjects,
  deleteSavedProject,
  saveProjectSnapshot,
  type SavedProject,
} from "@/lib/studioDraft";

const UNDO_WINDOW_MS = 6000;

const Library = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [projects, setProjects] = useState<SavedProject[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        setAuthed(false);
        navigate("/login?return_to=/library");
        return;
      }
      setAuthed(true);
      setUserId(data.user.id);
      setProjects(listSavedProjects(data.user.id));
      listLibrary()
        .then(setItems)
        .catch((e) => toast({ title: "Couldn't load library", description: e.message, variant: "destructive" }))
        .finally(() => setLoading(false));
    });
  }, [navigate, toast]);

  // Pending deletions (id → { timer, item, originalIndex }) — lets us flush on unmount.
  const pendingRef = useRef<Map<string, { timer: ReturnType<typeof setTimeout>; item: LibraryItem; index: number }>>(new Map());

  useEffect(() => {
    const pending = pendingRef.current;
    return () => {
      pending.forEach(({ timer, item }) => {
        clearTimeout(timer);
        deleteLibraryItem(item).catch(() => {});
      });
      pending.clear();
    };
  }, []);

  const commitDelete = async (item: LibraryItem) => {
    pendingRef.current.delete(item.id);
    try {
      await deleteLibraryItem(item);
    } catch (e) {
      setItems((prev) => [item, ...prev].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      toast({ title: "Couldn't delete", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleDelete = (item: LibraryItem) => {
    const index = items.findIndex((i) => i.id === item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));

    const timer = setTimeout(() => { void commitDelete(item); }, UNDO_WINDOW_MS);
    pendingRef.current.set(item.id, { timer, item, index });

    sonner(`Removed "${item.label || item.kind}"`, {
      description: "It will be permanently deleted in a few seconds.",
      duration: UNDO_WINDOW_MS,
      action: {
        label: "Undo",
        onClick: () => {
          const pending = pendingRef.current.get(item.id);
          if (!pending) return;
          clearTimeout(pending.timer);
          pendingRef.current.delete(item.id);
          setItems((prev) => {
            if (prev.some((i) => i.id === item.id)) return prev;
            const next = [...prev];
            next.splice(Math.min(pending.index, next.length), 0, item);
            return next;
          });
        },
      },
    });
  };

  const handleDownload = async (item: LibraryItem) => {
    const ext = item.storage_path.split(".").pop() || "bin";
    const name = `${(item.label || item.kind).replace(/[^a-z0-9-_]+/gi, "-")}-${item.id.slice(0, 6)}.${ext}`;
    try {
      // Always mint a fresh signed URL — never trust item.public_url (private bucket).
      const fresh = await signLibraryItem(item);
      await downloadUrl(fresh, name);
    } catch (e) {
      toast({ title: "Download link copied", description: (e as Error).message });
    }
  };

  const isVideo = (item: LibraryItem) => (item.content_type || "").startsWith("video/");

  // ─── Saved Projects ───
  const handleNewProject = () => {
    navigate("/studio?new=1");
  };

  const handleOpenProject = (p: SavedProject) => {
    navigate(`/studio?project=${encodeURIComponent(p.id)}`);
  };

  const handleDeleteProject = (p: SavedProject) => {
    if (!userId) return;
    deleteSavedProject(userId, p.id);
    setProjects(listSavedProjects(userId));
    toast({ title: "Project removed", description: `"${p.name}" was deleted.` });
  };

  const handleRenameProject = (p: SavedProject) => {
    if (!userId) return;
    const next = window.prompt("Rename project", p.name);
    if (!next || next.trim() === p.name) return;
    saveProjectSnapshot(userId, next.trim(), p.data, p.id);
    setProjects(listSavedProjects(userId));
  };

  if (authed === false) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO title="Your Library — Resonance Creative Studio" description="All your saved posters, videos, and social posts in one place." path="/library" noindex />
      <header className="border-b border-white/[0.06] bg-background/70 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/studio" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Studio
          </Link>
          <h1 className="font-display text-base font-semibold studio-gradient-text">Your Library</h1>
          <div className="w-24" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <Tabs defaultValue="assets" className="w-full">
          <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
            <TabsList>
              <TabsTrigger value="assets">Saved Assets</TabsTrigger>
              <TabsTrigger value="projects">
                Saved Projects {projects.length > 0 && <span className="ml-1.5 text-xs opacity-70">({projects.length})</span>}
              </TabsTrigger>
            </TabsList>
            <button
              onClick={handleNewProject}
              className="inline-flex items-center gap-2 studio-gradient-bg text-primary-foreground text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
            >
              <FolderPlus className="w-4 h-4" />
              New Project
            </button>
          </div>

          <TabsContent value="assets">
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-24 border border-dashed border-white/10 rounded-2xl">
                <ImageOff className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-foreground font-medium">Your Library is empty</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Generate something in the Studio, then tap <span className="text-foreground">Save</span> to keep it here.
                </p>
                <Link
                  to="/studio"
                  className="inline-block mt-5 studio-gradient-bg text-primary-foreground text-sm font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity"
                >
                  Open Studio
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item) => (
                  <div key={item.id} className="studio-card overflow-hidden flex flex-col">
                    <div className="relative aspect-video bg-black/40 flex items-center justify-center">
                      {isVideo(item) ? (
                        <video src={item.public_url} controls className="w-full h-full object-contain" />
                      ) : (
                        <img src={item.public_url} alt={item.label || item.kind} loading="lazy" className="w-full h-full object-contain" />
                      )}
                    </div>
                    <div className="p-3 flex items-center justify-between gap-2 border-t border-white/[0.06]">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.label || item.kind}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.kind} · {new Date(item.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleDownload(item)}
                          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              className="p-1.5 rounded-md hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                              title="Delete from Library"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove from Library?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This permanently deletes the saved file. You can always re-save by generating it again.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(item)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="projects">
            {projects.length === 0 ? (
              <div className="text-center py-24 border border-dashed border-white/10 rounded-2xl">
                <FolderOpen className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-foreground font-medium">No saved projects yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  In the Studio, tap <span className="text-foreground">Save Project</span> to keep your current brief, source and generated assets. You can resume any project from here later.
                </p>
                <button
                  onClick={handleNewProject}
                  className="inline-flex items-center gap-2 mt-5 studio-gradient-bg text-primary-foreground text-sm font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity"
                >
                  <FolderPlus className="w-4 h-4" /> Start a New Project
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((p) => {
                  const thumb = p.data.posters?.[0] || p.data.screenshotUrl || null;
                  const summary = p.data.brief?.headline || p.data.url || "Untitled brief";
                  return (
                    <div key={p.id} className="studio-card overflow-hidden flex flex-col group">
                      <button
                        onClick={() => handleOpenProject(p)}
                        className="relative aspect-video bg-black/40 flex items-center justify-center overflow-hidden"
                        title="Resume project"
                      >
                        {thumb ? (
                          <img src={thumb} alt={p.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
                        ) : (
                          <FolderOpen className="w-10 h-10 text-muted-foreground" />
                        )}
                      </button>
                      <div className="p-3 flex items-center justify-between gap-2 border-t border-white/[0.06]">
                        <button onClick={() => handleOpenProject(p)} className="min-w-0 text-left">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {p.data.contentType} · {new Date(p.savedAt).toLocaleDateString()} · {summary}
                          </p>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleRenameProject(p)}
                            className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                            title="Rename"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                className="p-1.5 rounded-md hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                                title="Delete project"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete project?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  "{p.name}" and its saved working state will be removed. Saved assets in your Library are not affected.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteProject(p)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Library;
