/**
 * Shareable project package builder.
 *
 * Bundles final storyboards, character data and vocal-sync (lip-sync)
 * outputs into a single .zip that can be handed to a collaborator,
 * editor or client. Media files are optional — when excluded the
 * manifest still carries the signed/public URLs.
 */

import JSZip from "jszip";
import { getMotionAudit } from "@/lib/scene-motion-audit-store";
import { buildVocalSyncExport } from "@/lib/vocal-sync-settings-store";

export interface SharePackageOptions {
  includeSceneImages: boolean;
  includeSceneVideos: boolean;
  includeCharacterImages: boolean;
  includeFinalVideo: boolean;
}

export const DEFAULT_SHARE_OPTIONS: SharePackageOptions = {
  includeSceneImages: true,
  includeSceneVideos: false,
  includeCharacterImages: true,
  includeFinalVideo: false,
};

export interface SharePackageInput {
  projectId: string | null;
  projectTitle?: string | null;
  options: SharePackageOptions;
  scenes: any[];
  characters: any[];
  verification?: any;
  transcription?: any;
  finalVideoUrl?: string | null;
  audioUrl?: string | null;
  /** Optional lip-sync job rows pulled from the backend. */
  lipsyncJobs?: any[];
  onProgress?: (p: { done: number; total: number; label: string }) => void;
}

export interface SharePackageResult {
  blob: Blob;
  filename: string;
  fileCount: number;
  skipped: { name: string; reason: string }[];
}

const pad = (n: number) => String(n).padStart(2, "0");

function extFromUrl(url: string, fallback: string): string {
  const clean = url.split("?")[0];
  const m = clean.match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : fallback;
}

export function slugify(s: string): string {
  return (s || "project")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "project";
}

/** Map a scene to the manifest shape shared with collaborators. */
export function sceneManifestEntry(s: any, index: number) {
  return {
    scene_number: s.scene_number ?? index + 1,
    index,
    lyric_segment: s.lyric_segment ?? "",
    time_start: s.time_start ?? null,
    time_end: s.time_end ?? null,
    mood: s.mood ?? null,
    location: s.location ?? null,
    camera_style: s.camera_style ?? null,
    shot_role: s.shot_role ?? null,
    is_broll: s.is_broll ?? false,
    style_preset: s.style_preset ?? null,
    action_description: s.action_description ?? null,
    visual_prompt: s.visual_prompt ?? null,
    tracking_id: s.trackingId ?? null,
    media: {
      image_url: s.imageUrl ?? null,
      video_url: s.videoUrl ?? null,
      video_quality: s.videoQuality ?? null,
      lip_sync_video_url: s.lipSyncVideoUrl ?? null,
      enhanced_video_url: s.enhancedVideoUrl ?? null,
      segment_audio_url: s.segmentAudioUrl ?? null,
    },
    motion_analysis: getMotionAudit(s.videoUrl) ?? null,
  };
}

export function buildManifest(input: SharePackageInput) {
  const { scenes, characters, verification, transcription, finalVideoUrl, projectId, projectTitle } = input;
  const sceneEntries = scenes.map(sceneManifestEntry);
  const lipSyncScenes = sceneEntries.filter((s) => !!s.media.lip_sync_video_url);
  return {
    package_version: 1,
    generator: "Resonance SyncVision",
    exported_at: new Date().toISOString(),
    project: {
      id: projectId ?? null,
      title: projectTitle ?? null,
      audio_url: input.audioUrl ?? null,
      final_video_url: finalVideoUrl ?? null,
    },
    analysis: verification
      ? {
          bpm: verification.bpm ?? null,
          music_key: verification.music_key ?? null,
          mood: verification.mood ?? null,
          energy: verification.energy ?? null,
          tempo_feel: verification.tempo_feel ?? null,
          instruments: verification.instruments ?? null,
          lyrics: verification.verified_lyrics ?? null,
        }
      : null,
    transcription: transcription
      ? { text: transcription.text ?? null, word_count: transcription?.quality?.word_count ?? null }
      : null,
    characters: characters.map((c: any) => ({
      name: c.name ?? null,
      description: c.description ?? null,
      outfit: c.outfit ?? null,
      vibe: c.vibe ?? null,
      visual_prompt: c.visual_prompt ?? null,
      image_url: c.imageUrl ?? null,
    })),
    scenes: sceneEntries,
    vocal_sync: {
      settings: buildVocalSyncExport(projectId),
      scenes_with_output: lipSyncScenes.map((s) => ({
        scene_number: s.scene_number,
        lip_sync_video_url: s.media.lip_sync_video_url,
      })),
      jobs: (input.lipsyncJobs ?? []).map((j: any) => ({
        id: j.id,
        scene_number: j.scene_number,
        status: j.status,
        provider: j.provider ?? null,
        output_url: j.output_url ?? null,
        error: j.error ?? null,
        created_at: j.created_at ?? null,
      })),
    },
    counts: {
      scenes: sceneEntries.length,
      scenes_with_image: sceneEntries.filter((s) => s.media.image_url).length,
      scenes_with_video: sceneEntries.filter((s) => s.media.video_url).length,
      scenes_with_lip_sync: lipSyncScenes.length,
      characters: characters.length,
    },
  };
}

function buildReadme(manifest: ReturnType<typeof buildManifest>, options: SharePackageOptions): string {
  return [
    `# ${manifest.project.title || "Resonance SyncVision project"}`,
    "",
    `Exported ${new Date(manifest.exported_at).toLocaleString()} from Resonance SyncVision.`,
    "",
    "## Contents",
    "- `manifest.json` — full project manifest (analysis, characters, scenes, vocal sync)",
    "- `storyboard.json` — scene list with prompts, timings and shot data",
    "- `characters.json` — character concepts and reference prompts",
    "- `vocal-sync.json` — per-scene vocal sync offsets, trims and job outputs",
    "- `storyboard.csv` — spreadsheet-friendly scene sheet",
    options.includeSceneImages ? "- `media/scenes/` — scene stills" : null,
    options.includeSceneVideos ? "- `media/scenes/` — scene clips (and lip-sync renders)" : null,
    options.includeCharacterImages ? "- `media/characters/` — character reference images" : null,
    options.includeFinalVideo ? "- `media/final-video.mp4` — merged final cut" : null,
    "",
    "## Summary",
    `- Scenes: ${manifest.counts.scenes}`,
    `- Scenes with video: ${manifest.counts.scenes_with_video}`,
    `- Scenes with vocal sync output: ${manifest.counts.scenes_with_lip_sync}`,
    `- Characters: ${manifest.counts.characters}`,
    "",
    "Media not embedded in this package is still linked by URL inside `manifest.json`.",
    "Signed URLs can expire — re-export from the app if a link stops working.",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCsv(manifest: ReturnType<typeof buildManifest>): string {
  const cols = ["scene_number", "time_start", "time_end", "shot_role", "mood", "location", "lyric_segment", "image_url", "video_url", "lip_sync_video_url"];
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = manifest.scenes.map((s: any) =>
    [s.scene_number, s.time_start, s.time_end, s.shot_role, s.mood, s.location, s.lyric_segment, s.media.image_url, s.media.video_url, s.media.lip_sync_video_url]
      .map(esc)
      .join(",")
  );
  return [cols.join(","), ...rows].join("\n");
}

async function addRemoteFile(
  zip: JSZip,
  path: string,
  url: string,
  skipped: { name: string; reason: string }[]
): Promise<boolean> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      skipped.push({ name: path, reason: `HTTP ${resp.status}` });
      return false;
    }
    zip.file(path, await resp.blob());
    return true;
  } catch (e: any) {
    skipped.push({ name: path, reason: e?.message || "fetch failed" });
    return false;
  }
}

export async function buildSharePackage(input: SharePackageInput): Promise<SharePackageResult> {
  const { options, scenes, characters, onProgress } = input;
  const zip = new JSZip();
  const skipped: { name: string; reason: string }[] = [];
  const manifest = buildManifest(input);

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("storyboard.json", JSON.stringify(manifest.scenes, null, 2));
  zip.file("characters.json", JSON.stringify(manifest.characters, null, 2));
  zip.file("vocal-sync.json", JSON.stringify(manifest.vocal_sync, null, 2));
  zip.file("storyboard.csv", buildCsv(manifest));
  zip.file("README.md", buildReadme(manifest, options));

  // Collect media downloads
  const downloads: { path: string; url: string; label: string }[] = [];
  scenes.forEach((s: any, i: number) => {
    const n = pad(s.scene_number ?? i + 1);
    if (options.includeSceneImages && s.imageUrl) {
      downloads.push({ path: `media/scenes/scene-${n}.${extFromUrl(s.imageUrl, "png")}`, url: s.imageUrl, label: `Scene ${n} image` });
    }
    if (options.includeSceneVideos && s.videoUrl) {
      downloads.push({ path: `media/scenes/scene-${n}.${extFromUrl(s.videoUrl, "mp4")}`, url: s.videoUrl, label: `Scene ${n} video` });
    }
    if (options.includeSceneVideos && s.lipSyncVideoUrl) {
      downloads.push({ path: `media/scenes/scene-${n}-vocal-sync.${extFromUrl(s.lipSyncVideoUrl, "mp4")}`, url: s.lipSyncVideoUrl, label: `Scene ${n} vocal sync` });
    }
  });
  if (options.includeCharacterImages) {
    characters.forEach((c: any, i: number) => {
      if (!c.imageUrl) return;
      downloads.push({
        path: `media/characters/${slugify(c.name || `character-${i + 1}`)}.${extFromUrl(c.imageUrl, "png")}`,
        url: c.imageUrl,
        label: `Character ${c.name || i + 1}`,
      });
    });
  }
  if (options.includeFinalVideo && input.finalVideoUrl) {
    downloads.push({ path: `media/final-video.${extFromUrl(input.finalVideoUrl, "mp4")}`, url: input.finalVideoUrl, label: "Final video" });
  }

  let done = 0;
  const total = downloads.length;
  for (const d of downloads) {
    onProgress?.({ done, total, label: d.label });
    await addRemoteFile(zip, d.path, d.url, skipped);
    done += 1;
  }
  onProgress?.({ done, total, label: "Compressing package" });

  if (skipped.length) {
    zip.file("SKIPPED.json", JSON.stringify({ skipped }, null, 2));
  }

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${slugify(input.projectTitle || "syncvision-project")}-package-${stamp}.zip`;

  return { blob, filename, fileCount: 6 + (total - skipped.length), skipped };
}
