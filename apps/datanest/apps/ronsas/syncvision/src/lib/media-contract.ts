/**
 * Canonical Media Contract
 *
 * Enforces a single representation for all media assets:
 * - DB stores: storage object path (never signed URLs or base64)
 * - Signed URLs generated only at read time
 * - Provides repair utilities for legacy base64 data
 */

import { supabase } from "@/integrations/supabase/client";

const BUCKET = "media-uploads";
const SIGNED_URL_TTL = 7200; // 2 hours

// ─── Types ───

export type MediaStatus = "valid" | "expired" | "missing" | "legacy_base64" | "unknown";

export interface MediaAsset {
  /** Storage object path (e.g. "userId/scene-images/scene-1-123.png") */
  objectPath: string | null;
  /** MIME type */
  mimeType: string;
  /** Current signed URL (generated at read time, never persisted) */
  signedUrl?: string;
  /** Asset status */
  status: MediaStatus;
}

export interface SceneMediaIntegrity {
  sceneNumber: number;
  image: MediaStatus;
  video: MediaStatus;
  audio: MediaStatus;
  issues: string[];
}

export interface ProjectIntegrity {
  audioSigned: boolean;
  scenesTotal: number;
  scenesHydrated: number;
  storageBackedImages: number;
  legacyBase64Count: number;
  allScenesValid: boolean;
  exportReady: boolean;
  scenes: SceneMediaIntegrity[];
  lastChecked: string;
}

// ─── Detection ───

/** Check if a URL is a base64 data URI */
export function isBase64DataUri(url: string | null | undefined): boolean {
  return !!url && url.startsWith("data:");
}

/** Check if a URL is a Supabase storage signed URL */
export function isStorageSignedUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.pathname.includes("/storage/") && u.searchParams.has("token");
  } catch {
    return false;
  }
}

/** Extract storage object path from a signed URL */
export function extractObjectPath(url: string): string | null {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/storage\/v1\/object\/sign\/[^/]+\/(.+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/** Classify a media URL's status */
export function classifyMediaUrl(url: string | null | undefined): MediaStatus {
  if (!url) return "missing";
  if (isBase64DataUri(url)) return "legacy_base64";
  if (isStorageSignedUrl(url)) return "valid"; // Will be re-signed at read time
  if (url.startsWith("http")) return "valid"; // External URL
  return "unknown";
}

// ─── Signing ───

/** Generate a fresh signed URL from a storage object path */
export async function signObjectPath(objectPath: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(objectPath, SIGNED_URL_TTL);
  return data?.signedUrl || null;
}

/** Batch sign multiple object paths */
export async function signObjectPaths(paths: string[]): Promise<(string | null)[]> {
  if (paths.length === 0) return [];
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL);
  if (!data) return paths.map(() => null);
  return data.map(d => d.signedUrl || null);
}

// ─── Integrity Checking ───

/** Run a full media integrity check on all scenes */
export function checkProjectIntegrity(
  audioUrl: string | null,
  scenes: Array<{ scene_number: number; imageUrl?: string; videoUrl?: string; segmentAudioUrl?: string }>
): ProjectIntegrity {
  const sceneChecks: SceneMediaIntegrity[] = scenes.map(s => {
    const imageStatus = classifyMediaUrl(s.imageUrl);
    const videoStatus = s.videoUrl ? classifyMediaUrl(s.videoUrl) : "missing";
    const audioStatus = s.segmentAudioUrl ? classifyMediaUrl(s.segmentAudioUrl) : "missing";
    const issues: string[] = [];
    if (imageStatus === "legacy_base64") issues.push("Image uses legacy base64");
    if (imageStatus === "missing") issues.push("No image");
    if (videoStatus === "legacy_base64") issues.push("Video uses legacy base64");
    return { sceneNumber: s.scene_number, image: imageStatus, video: videoStatus, audio: audioStatus, issues };
  });

  const storageBackedImages = sceneChecks.filter(s => s.image === "valid").length;
  const legacyBase64Count = sceneChecks.filter(s =>
    s.image === "legacy_base64" || s.video === "legacy_base64"
  ).length;
  const allScenesValid = sceneChecks.every(s => s.image === "valid" && s.issues.length === 0);

  return {
    audioSigned: !!audioUrl && !isBase64DataUri(audioUrl),
    scenesTotal: scenes.length,
    scenesHydrated: scenes.filter(s => s.imageUrl || s.videoUrl).length,
    storageBackedImages,
    legacyBase64Count,
    allScenesValid,
    exportReady: !!audioUrl && scenes.length > 0 && allScenesValid && legacyBase64Count === 0,
    scenes: sceneChecks,
    lastChecked: new Date().toISOString(),
  };
}

// ─── Error Buckets ───

export type ErrorStage =
  | "upload"
  | "storage"
  | "signing"
  | "hydration"
  | "storyboard"
  | "rendering"
  | "export"
  | "edge_function"
  | "db_read"
  | "db_write";

export interface StagedError {
  stage: ErrorStage;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

const STAGED_ERRORS: StagedError[] = [];
const MAX_STAGED = 200;

export function logStagedError(stage: ErrorStage, message: string, metadata?: Record<string, unknown>) {
  const entry: StagedError = { stage, message, metadata, timestamp: new Date().toISOString() };
  STAGED_ERRORS.push(entry);
  if (STAGED_ERRORS.length > MAX_STAGED) STAGED_ERRORS.shift();
  console.error(`[${stage}]`, message, metadata ?? "");
}

export function getStagedErrors(stage?: ErrorStage): StagedError[] {
  if (stage) return STAGED_ERRORS.filter(e => e.stage === stage);
  return [...STAGED_ERRORS];
}

export function getStagedErrorSummary(): Record<ErrorStage, number> {
  const summary: Record<string, number> = {};
  for (const e of STAGED_ERRORS) {
    summary[e.stage] = (summary[e.stage] || 0) + 1;
  }
  return summary as Record<ErrorStage, number>;
}

export function clearStagedErrors() {
  STAGED_ERRORS.length = 0;
}
