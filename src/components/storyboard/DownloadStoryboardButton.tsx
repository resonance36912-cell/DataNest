/**
 * DownloadStoryboardButton — One-click export of generated scene videos.
 *
 * Behavior:
 *  - Disabled when no scene has a video yet.
 *  - Single video → downloads that .mp4 directly (no zip overhead).
 *  - Multiple videos → bundles every available scene video into a single zip
 *    along with a `manifest.json` describing scene order, prompts, durations,
 *    and provider/quality. When *every* scene has a finished video, the label
 *    flips to "Download storyboard package" to signal a complete export.
 *  - Streams blobs via fetch and zips client-side (JSZip) so we never pay a
 *    server round-trip just to package files.
 */
import { useState } from "react";
import { Download, Loader2, Package } from "lucide-react";
import JSZip from "jszip";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Scene } from "@/contexts/ProjectContext";

interface Props {
  scenes: Scene[];
  /** Optional project label — used in the zip filename. */
  projectName?: string | null;
}

/** Slugify for safe filenames; falls back to "storyboard". */
function slug(s: string | null | undefined): string {
  if (!s) return "storyboard";
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "storyboard";
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so Safari finishes reading the blob before it's GC'd.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DownloadStoryboardButton({ scenes, projectName }: Props) {
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const withVideo = scenes
    .map((s, i) => ({ scene: s, index: i }))
    .filter((entry) => !!entry.scene.videoUrl);
  const total = scenes.length;
  const ready = withVideo.length;
  const allDone = total > 0 && ready === total;

  const disabled = ready === 0 || working;

  const label = working
    ? progress
      ? `Packaging ${progress.done}/${progress.total}…`
      : "Preparing…"
    : ready === 0
      ? "No videos yet"
      : ready === 1
        ? "Download scene video"
        : allDone
          ? `Download storyboard package (${ready})`
          : `Download videos so far (${ready}/${total})`;

  const Icon = working ? Loader2 : ready > 1 ? Package : Download;

  const handle = async () => {
    if (disabled) return;
    setWorking(true);
    setProgress(null);
    try {
      // Single video → straight download, skip the zip wrapper.
      if (ready === 1) {
        const { scene, index } = withVideo[0];
        const resp = await fetch(scene.videoUrl!);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        triggerBlobDownload(blob, `scene-${String(index + 1).padStart(2, "0")}-video.mp4`);
        toast.success("Scene video downloaded.");
        return;
      }

      // Multi-video → zip with a manifest.
      const zip = new JSZip();
      const manifestEntries: Array<Record<string, unknown>> = [];
      let done = 0;
      setProgress({ done: 0, total: ready });

      for (const { scene, index } of withVideo) {
        try {
          const resp = await fetch(scene.videoUrl!);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const blob = await resp.blob();
          const filename = `scene-${String(index + 1).padStart(2, "0")}.mp4`;
          zip.file(filename, blob);
          manifestEntries.push({
            scene_number: scene.scene_number ?? index + 1,
            file: filename,
            tracking_id: (scene as { tracking_id?: string }).tracking_id ?? null,
            visual_prompt: scene.visual_prompt ?? null,
            lyric_segment: scene.lyric_segment ?? null,
            video_quality: scene.videoQuality ?? null,
            duration_sec: (scene as { duration_sec?: number }).duration_sec ?? null,
            video_url: scene.videoUrl ?? null,
          });
        } catch (err) {
          // Record the failure in the manifest but keep going so the user
          // still gets every scene that downloaded successfully.
          manifestEntries.push({
            scene_number: scene.scene_number ?? index + 1,
            file: null,
            error: err instanceof Error ? err.message : "download failed",
            video_url: scene.videoUrl ?? null,
          });
        } finally {
          done += 1;
          setProgress({ done, total: ready });
        }
      }

      const manifest = {
        project: projectName ?? null,
        exported_at: new Date().toISOString(),
        scenes_total: total,
        scenes_included: manifestEntries.filter((m) => m.file).length,
        complete: allDone,
        scenes: manifestEntries,
      };
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));

      const out = await zip.generateAsync({ type: "blob" });
      const stamp = new Date().toISOString().slice(0, 10);
      triggerBlobDownload(out, `${slug(projectName)}-storyboard-${stamp}.zip`);
      toast.success(allDone
        ? `Storyboard package downloaded (${manifest.scenes_included} scenes).`
        : `Downloaded ${manifest.scenes_included} scene${manifest.scenes_included === 1 ? "" : "s"}.`);
    } catch (err) {
      console.error("[DownloadStoryboardButton]", err);
      toast.error("Failed to package storyboard videos.");
    } finally {
      setWorking(false);
      setProgress(null);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handle}
      disabled={disabled}
      className="h-7 gap-1.5 text-[11px]"
      title={
        ready === 0
          ? "Generate at least one scene video to enable export"
          : allDone
            ? "Download every finished scene as a single zip"
            : `Download ${ready} ready scene${ready === 1 ? "" : "s"}`
      }
    >
      <Icon className={`h-3 w-3 ${working ? "animate-spin" : ""}`} />
      {label}
    </Button>
  );
}
