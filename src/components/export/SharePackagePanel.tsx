/**
 * SharePackagePanel — bundles final storyboards, character data and
 * vocal-sync outputs into a single downloadable .zip for sharing.
 */

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Package, Download, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  buildSharePackage,
  DEFAULT_SHARE_OPTIONS,
  type SharePackageOptions,
} from "@/lib/share-package";

interface SharePackagePanelProps {
  projectId: string | null;
  projectTitle?: string | null;
  userId?: string;
  scenes: any[];
  characters: any[];
  verification?: any;
  transcription?: any;
  audioUrl?: string | null;
  finalVideoUrl?: string | null;
}

export default function SharePackagePanel({
  projectId,
  projectTitle,
  userId,
  scenes,
  characters,
  verification,
  transcription,
  audioUrl,
  finalVideoUrl,
}: SharePackagePanelProps) {
  const [options, setOptions] = useState<SharePackageOptions>(DEFAULT_SHARE_OPTIONS);
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [lastSkipped, setLastSkipped] = useState<{ name: string; reason: string }[]>([]);

  const counts = useMemo(() => {
    const withImage = scenes.filter((s) => s.imageUrl).length;
    const withVideo = scenes.filter((s) => s.videoUrl).length;
    const withSync = scenes.filter((s) => s.lipSyncVideoUrl).length;
    return { withImage, withVideo, withSync };
  }, [scenes]);

  const toggle = (key: keyof SharePackageOptions) => (v: boolean | string) =>
    setOptions((prev) => ({ ...prev, [key]: !!v }));

  const build = useCallback(async () => {
    if (!scenes.length && !characters.length) {
      toast.error("Nothing to package yet — generate a storyboard first.");
      return;
    }
    setBuilding(true);
    setLastSkipped([]);
    setProgress({ done: 0, total: 0, label: "Preparing" });
    try {
      let lipsyncJobs: any[] = [];
      if (projectId && userId) {
        const { data } = await supabase
          .from("lipsync_jobs")
          .select("id, scene_number, status, provider, output_url, error_message, created_at")
          .eq("project_id", projectId)
          .eq("user_id", userId)
          .order("created_at", { ascending: true });
        lipsyncJobs = (data ?? []).map((j: any) => ({ ...j, error: j.error_message ?? null }));
      }

      const result = await buildSharePackage({
        projectId,
        projectTitle,
        options,
        scenes,
        characters,
        verification,
        transcription,
        audioUrl,
        finalVideoUrl,
        lipsyncJobs,
        onProgress: setProgress,
      });

      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setLastSkipped(result.skipped);
      toast.success("Share package ready", {
        description: `${result.filename} · ${result.fileCount} files${result.skipped.length ? ` · ${result.skipped.length} media file(s) skipped` : ""}`,
      });
    } catch (e: any) {
      console.error("[SharePackage]", e);
      toast.error(e?.message || "Failed to build share package.");
    } finally {
      setBuilding(false);
      setProgress(null);
    }
  }, [projectId, projectTitle, userId, options, scenes, characters, verification, transcription, audioUrl, finalVideoUrl]);

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : building ? 5 : 0;

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Shareable Package
          </h3>
          <p className="text-sm text-muted-foreground">
            One .zip with the final storyboard, character sheets, vocal sync data and optional media.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[10px]">{scenes.length} scenes</Badge>
          <Badge variant="outline" className="text-[10px]">{counts.withImage} stills</Badge>
          <Badge variant="outline" className="text-[10px]">{counts.withVideo} clips</Badge>
          <Badge variant="outline" className="text-[10px]">{counts.withSync} vocal sync</Badge>
          <Badge variant="outline" className="text-[10px]">{characters.length} characters</Badge>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { key: "includeSceneImages" as const, label: `Scene stills (${counts.withImage})` },
          { key: "includeSceneVideos" as const, label: `Scene + vocal sync clips (${counts.withVideo + counts.withSync})`, hint: "Large — may take a while" },
          { key: "includeCharacterImages" as const, label: `Character references (${characters.filter((c) => c.imageUrl).length})` },
          { key: "includeFinalVideo" as const, label: "Final merged video", disabled: !finalVideoUrl },
        ].map((row) => (
          <label
            key={row.key}
            className={`flex items-start gap-2 rounded-md border border-border/60 bg-secondary/30 p-3 text-sm ${
              (row as any).disabled ? "opacity-50" : "cursor-pointer"
            }`}
          >
            <Checkbox
              checked={options[row.key]}
              onCheckedChange={toggle(row.key)}
              disabled={building || (row as any).disabled}
              className="mt-0.5"
            />
            <span>
              <Label className="cursor-pointer">{row.label}</Label>
              {(row as any).hint && (
                <span className="block text-[11px] text-muted-foreground">{(row as any).hint}</span>
              )}
            </span>
          </label>
        ))}
      </div>

      {building && (
        <div className="space-y-1.5">
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {progress?.label ?? "Building"}
            {progress && progress.total > 0 ? ` — ${progress.done}/${progress.total}` : ""}
          </p>
        </div>
      )}

      {lastSkipped.length > 0 && !building && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-medium text-amber-500">
            <AlertTriangle className="h-3.5 w-3.5" />
            {lastSkipped.length} file(s) could not be embedded
          </div>
          <ul className="text-muted-foreground space-y-0.5 max-h-24 overflow-auto">
            {lastSkipped.slice(0, 8).map((s) => (
              <li key={s.name}>
                {s.name} — {s.reason}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">Their URLs are still listed in manifest.json.</p>
        </div>
      )}

      <Button onClick={build} disabled={building || (!scenes.length && !characters.length)} className="w-full sm:w-auto">
        {building ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
        {building ? "Building package…" : "Download share package (.zip)"}
      </Button>
    </div>
  );
}
