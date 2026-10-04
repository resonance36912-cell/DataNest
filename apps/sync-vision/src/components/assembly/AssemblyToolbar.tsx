import { useState, useRef } from "react";
import { ArrowUpDown, CheckSquare, ChevronDown, Film, Link, Loader2, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import ProcessProgressBar from "@/components/ProcessProgressBar";
import RecallVideoDialog from "@/components/assembly/RecallVideoDialog";
import type { SavedScene } from "@/components/assembly/SceneTimeline";
import type { SavedAssemblyItem } from "@/components/assembly/SavedAssemblyList";

interface AssemblyToolbarProps {
  orderedScenes: SavedScene[];
  totalDuration: number;
  costEstimate: { shortLabel: string } | null;
  savedAssemblies: SavedAssemblyItem[];
  loadingSavedTimeline: boolean;
  existingVideoUrls: Set<string>;
  nextSceneIndex: number;
  uploadingAudio: boolean;
  audioUrl: string | null;
  aiGenerating: boolean;
  aiReasoning: string | null;
  audioInputRef: React.RefObject<HTMLInputElement>;
  onLoadSavedAssembly: (id: string) => void;
  onAddRecalledScene: (scene: SavedScene) => void;
  onAudioUploadClick: () => void;
  onReorder: (scenes: SavedScene[]) => void;
  onClearAll: () => void;
  onAiGenerate: () => void;
  onDismissAiReasoning: () => void;
  handleAudioUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectAll?: () => void;
  /** External import */
  onImportExternal?: (scene: SavedScene) => void;
}

export default function AssemblyToolbar({
  orderedScenes, totalDuration, costEstimate,
  savedAssemblies, loadingSavedTimeline,
  existingVideoUrls, nextSceneIndex,
  uploadingAudio, audioUrl,
  aiGenerating, aiReasoning,
  audioInputRef,
  onLoadSavedAssembly, onAddRecalledScene,
  onAudioUploadClick, onReorder, onClearAll,
  onAiGenerate, onDismissAiReasoning,
  handleAudioUpload,
  onSelectAll,
  onImportExternal,
}: AssemblyToolbarProps) {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importingFile, setImportingFile] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const handleImportUrl = () => {
    if (!importUrl.trim()) return;
    const scene: SavedScene = {
      sceneIndex: nextSceneIndex + 1000 + Date.now(),
      sceneNumber: orderedScenes.length + 1,
      videoUrl: importUrl.trim(),
      lyricSegment: "Imported",
      timeStart: "0:00",
      timeEnd: "0:10",
      durationSec: 10,
    };
    onImportExternal?.(scene);
    setImportUrl("");
    setImportDialogOpen(false);
    toast.success("External video added to timeline");
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) { toast.error("Please select a video file"); return; }
    setImportingFile(true);
    const url = URL.createObjectURL(file);
    const scene: SavedScene = {
      sceneIndex: nextSceneIndex + 2000 + Date.now(),
      sceneNumber: orderedScenes.length + 1,
      videoUrl: url,
      lyricSegment: file.name.replace(/\.[^/.]+$/, ""),
      timeStart: "0:00",
      timeEnd: "0:10",
      durationSec: 10,
    };
    onImportExternal?.(scene);
    setImportingFile(false);
    setImportDialogOpen(false);
    toast.success(`"${file.name}" added to timeline`);
    e.target.value = "";
  };
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-foreground">Assembly</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">Arrange scenes, add transitions, text, and effects.</p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {savedAssemblies.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={loadingSavedTimeline} className="gap-2 border-accent/30 text-accent hover:bg-accent/10">
                  {loadingSavedTimeline ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                  Load Saved Timeline
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuLabel>Saved Assemblies</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {savedAssemblies.map((a) => (
                  <DropdownMenuItem key={a.id} onClick={() => onLoadSavedAssembly(a.id)}>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{a.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {a.sceneCount} scenes · {new Date(a.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <RecallVideoDialog existingVideoUrls={existingVideoUrls} onAddScene={onAddRecalledScene} nextSceneIndex={nextSceneIndex} />
          {/* External Import */}
          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 border-border text-foreground hover:bg-secondary">
                <Link className="h-4 w-4" /> Import
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Import External Video</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">From URL</label>
                  <div className="flex gap-2">
                    <Input placeholder="https://example.com/video.mp4" value={importUrl} onChange={(e) => setImportUrl(e.target.value)} className="text-sm" />
                    <Button size="sm" onClick={handleImportUrl} disabled={!importUrl.trim()}>Add</Button>
                  </div>
                </div>
                <div className="relative flex items-center"><div className="flex-1 border-t border-border" /><span className="px-2 text-xs text-muted-foreground">or</span><div className="flex-1 border-t border-border" /></div>
                <div>
                  <input ref={importFileRef} type="file" accept="video/*" className="hidden" onChange={handleImportFile} />
                  <Button variant="outline" className="w-full gap-2" onClick={() => importFileRef.current?.click()} disabled={importingFile}>
                    <Upload className="h-4 w-4" /> Upload Video File
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="ghost" size="sm">Cancel</Button></DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
          <Button variant="outline" size="sm" onClick={onAudioUploadClick} disabled={uploadingAudio}
            className="gap-2 border-border text-foreground hover:bg-secondary"
            title={audioUrl ? "Replace the audio track" : "Upload an audio track for the timeline"}>
            {uploadingAudio ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploadingAudio ? "Uploading…" : audioUrl ? "Replace Audio" : "Upload Audio"}
          </Button>
          {/* Select All */}
          {onSelectAll && (
            <Button variant="outline" size="sm" onClick={onSelectAll} disabled={orderedScenes.length === 0}
              className="gap-2 border-accent/30 text-accent hover:bg-accent/10">
              <CheckSquare className="h-4 w-4" /> Select All
            </Button>
          )}
          <Button variant="outline" size="sm"
            onClick={() => {
              const sorted = [...orderedScenes].sort((a, b) => a.sceneNumber - b.sceneNumber);
              onReorder(sorted);
              toast.success("Scenes reordered by scene number");
            }}
            disabled={orderedScenes.length < 2}
            className="gap-2 border-border text-foreground hover:bg-secondary">
            <ArrowUpDown className="h-4 w-4" /> Reorder Scenes
          </Button>
          <Button variant="outline" size="sm" onClick={onClearAll} disabled={orderedScenes.length === 0}
            className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10">
            <X className="h-4 w-4" /> Clear All
          </Button>
          <Button variant="outline" size="sm" onClick={onAiGenerate} disabled={aiGenerating || orderedScenes.length === 0}
            className="gap-2 border-accent/30 text-accent hover:bg-accent/10"
            title="AI analyses your scenes to suggest optimal effects (~10–20s)">
            {aiGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiGenerating ? "AI Analyzing…" : "AI Auto-Generate"}
          </Button>
          <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] sm:text-xs">
            {orderedScenes.length} scenes · {totalDuration.toFixed(0)}s
            {costEstimate && <span className="ml-1 text-muted-foreground hidden sm:inline">· {costEstimate.shortLabel}</span>}
          </Badge>
        </div>
      </div>

      {aiGenerating && (
        <ProcessProgressBar progress={0} active={aiGenerating} label="AI analyzing scenes and choosing optimal effects…" barHeight="h-2" />
      )}

      {aiReasoning && (
        <div className="glass-card p-3 border-l-4 border-accent/50">
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-accent mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-accent mb-1">AI Recommendation</p>
              <p className="text-xs text-muted-foreground">{aiReasoning}</p>
            </div>
            <button onClick={onDismissAiReasoning} className="text-muted-foreground hover:text-foreground ml-auto shrink-0">×</button>
          </div>
        </div>
      )}
    </>
  );
}
