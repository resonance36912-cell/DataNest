import { useState } from "react";
import { Download, Save, Settings2, HardDrive, Loader2, FileVideo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";
import { MASTER_QUALITY_PROFILE } from "@/lib/master-quality";

interface ExportSettingsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onExportLyrics: () => void;
  onExportCharacter: () => void;
  onExportStoryboard: () => void;
  onExportSrtVtt: () => void;
  onExportBundle: () => void;
  finalVideoUrl?: string | null;
}

export default function ExportSettingsDialog({
  open,
  onOpenChange,
  onExportLyrics,
  onExportCharacter,
  onExportStoryboard,
  onExportSrtVtt,
  onExportBundle,
  finalVideoUrl,
}: ExportSettingsDialogProps) {
  const { verification, characterConcepts, scenes, projectId, activeTranscriptVersionId } = useProject();
  const { user } = useAuth();

  const [includeFinalVideo, setIncludeFinalVideo] = useState(true);
  const [includeSubtitles, setIncludeSubtitles] = useState(true);
  const [includeProjectBundle, setIncludeProjectBundle] = useState(true);
  const [includeStoryboard, setIncludeStoryboard] = useState(true);
  const [includeCharacterSheets, setIncludeCharacterSheets] = useState(true);
  const [includeAnalysisData, setIncludeAnalysisData] = useState(true);
  const [savingProject, setSavingProject] = useState(false);

  const handleSave = async () => {
    if (!projectId || !user) { toast.error("No project to save."); return; }
    setSavingProject(true);
    try {
      await supabase.from("projects").update({ current_step: 5, updated_at: new Date().toISOString() }).eq("id", projectId).eq("user_id", user.id);
      for (const scene of scenes) {
        await supabase.from("scenes").upsert({
          project_id: projectId, user_id: user.id, scene_number: scene.scene_number,
          visual_prompt: scene.visual_prompt || null, scene_image_url: scene.imageUrl || null,
          video_url: scene.videoUrl || null, video_quality: scene.videoQuality || null,
          lyric_segment: scene.lyric_segment || null, mood: scene.mood || null,
          location: scene.location || null, camera_style: scene.camera_style || null,
          action_description: scene.action_description || null,
          time_start: scene.time_start || null, time_end: scene.time_end || null,
        }, { onConflict: "project_id,scene_number" });
      }
      toast.success("Project saved successfully!");
    } catch (error) {
      toast.error(`Save failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSavingProject(false);
    }
  };

  const downloadFinalVideo = () => {
    if (!finalVideoUrl) return;
    const anchor = document.createElement("a");
    anchor.href = finalVideoUrl;
    anchor.download = "syncvision-final-master.mp4";
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const handleExportAll = () => {
    const actions: Array<() => void> = [];
    if (includeFinalVideo && finalVideoUrl) actions.push(downloadFinalVideo);
    if (includeAnalysisData && verification) actions.push(onExportLyrics);
    if (includeCharacterSheets && characterConcepts.length) actions.push(onExportCharacter);
    if (includeStoryboard && scenes.length) actions.push(onExportStoryboard);
    if (includeSubtitles && activeTranscriptVersionId) actions.push(onExportSrtVtt);
    if (includeProjectBundle) actions.push(onExportBundle);
    if (!actions.length) { toast.info("No available export items selected."); return; }
    actions.forEach((action) => action());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Settings2 className="h-5 w-5 text-primary" /> Save & Export Project
          </DialogTitle>
          <DialogDescription>
            Download only assets the system actually produced—without format selectors that imply a conversion has happened.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <FileVideo className="h-4 w-4 text-primary" /> Delivery master
          </h4>
          <p className="text-xs text-muted-foreground">
            Final video is MP4/H.264 with 48 kHz AAC audio normalized to {MASTER_QUALITY_PROFILE.assembly.targetLufs} LUFS.
            Resolution and frame rate are the values selected during Final Merge; the quality-first default is 1080p/30.
          </p>
          <p className={`text-xs font-medium ${finalVideoUrl ? "text-emerald-400" : "text-amber-400"}`}>
            {finalVideoUrl ? "Final master is ready to download." : "Complete Final Merge to create the master video."}
          </p>
        </div>

        <div className="space-y-3">
          <ToggleRow label="Final master video" desc="The completed MP4 from Final Merge" checked={includeFinalVideo} onChange={setIncludeFinalVideo} disabled={!finalVideoUrl} />
          <Separator />
          <ToggleRow label="Lyrics & analysis" desc="Verified lyrics, BPM, key, mood, and confidence" checked={includeAnalysisData} onChange={setIncludeAnalysisData} disabled={!verification} />
          <Separator />
          <ToggleRow label="Character specifications" desc="Character reference manifest" checked={includeCharacterSheets} onChange={setIncludeCharacterSheets} disabled={!characterConcepts.length} />
          <Separator />
          <ToggleRow label="Storyboard manifest" desc="Scene prompts, timing, URLs, and motion audit" checked={includeStoryboard} onChange={setIncludeStoryboard} disabled={!scenes.length} />
          <Separator />
          <ToggleRow label="SRT, VTT & karaoke" desc="Accepted transcript with word timing" checked={includeSubtitles} onChange={setIncludeSubtitles} disabled={!activeTranscriptVersionId} />
          <Separator />
          <ToggleRow label="Full project bundle" desc="Portable JSON project manifest" checked={includeProjectBundle} onChange={setIncludeProjectBundle} />
        </div>

        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-primary shrink-0" />
          {scenes.filter((scene) => scene.videoUrl).length}/{scenes.length} scene videos available.
        </div>

        <div className="flex gap-3 justify-end mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" className="gap-2 border-primary/30 text-primary hover:bg-primary/10" onClick={handleSave} disabled={savingProject || !projectId}>
            {savingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Project
          </Button>
          <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleExportAll}>
            <Download className="h-4 w-4" /> Export Selected
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 ${disabled ? "opacity-50" : ""}`}>
      <div><Label className="text-sm">{label}</Label>{desc && <p className="text-xs text-muted-foreground">{desc}</p>}</div>
      <Switch checked={checked && !disabled} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
