import { invokeLocalFunction, readLocalRows, writeLocalRows } from "@/integrations/supabase/client";

const originalFetch = globalThis.fetch.bind(globalThis);
const LOCAL_API = "http://127.0.0.1:3301/__resonance_sovereign__";
const LOCAL_HUB = "http://127.0.0.1:3301/__resonance_hub__";
export const LOCAL_MUSETALK_BRIDGE = "http://127.0.0.1:7863";
export const LOCAL_STT_BRIDGE = "http://127.0.0.1:7864";
export const LOCAL_MUSETALK_MODEL = "musetalk-local";
export const LOCAL_MUSETALK_REVISION = "0a89dec45a0192b824e3cf4daf96c239440c5ed8";
const LOCAL_USER_ID = "resonance-sovereign-local-user";

type FunctionResult = { status: number; data: any };

type BridgeJob = {
  job_id: string;
  status: string;
  progress?: number;
  created_at?: string | null;
  updated_at?: string | null;
  error?: string | null;
  output_ready?: boolean;
  output_url?: string | null;
  engine_revision?: string;
  network_runtime?: string;
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function parseBody(init?: RequestInit): any {
  try { return typeof init?.body === "string" ? JSON.parse(init.body) : {}; }
  catch { return {}; }
}

function durationSegments(total: number, count: number) {
  const n = Math.max(1, Math.min(60, count || Math.ceil((total || 60) / 10)));
  const dur = Math.max(1, total || n * 10);
  const step = dur / n;
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    start_sec: +(i * step).toFixed(3),
    end_sec: +((i + 1) * step).toFixed(3),
    duration_sec: +step.toFixed(3),
  }));
}

function verified(text: string) {
  return {
    verified_lyrics: text,
    bpm: 0,
    music_key: "",
    tempo_feel: "local",
    mood: "cinematic",
    energy: "balanced",
    instruments: [],
    confidence_lyrics: text ? 1 : 0,
    confidence_bpm: 0,
    confidence_instruments: 0,
    flagged_issues: [],
    corrections_made: [],
    pass_1: "local",
    pass_2: "local",
    pass_3: "local",
    fallback: false,
    cached: false,
    local: true,
  };
}

function localScenes(body: any) {
  const segs = Array.isArray(body?.segments) ? body.segments : [];
  const source = segs.length ? segs : durationSegments(60, 6);
  return source.map((s: any, i: number) => ({
    scene_number: i + 1,
    section_type: i === 0 ? "intro" : (i === source.length - 1 ? "outro" : "verse"),
    section_index: i + 1,
    lyric_segment: String(s.lyrics || s.text || s.transcription?.text || ""),
    time_start: String(s.start_sec ?? 0),
    time_end: String(s.end_sec ?? ((i + 1) * 10)),
    mood: String(body?.mood || "cinematic"),
    location: String(body?.location || "Sovereign local stage"),
    camera_style: "Cinematic medium shot",
    action_description: `Performance scene ${i + 1} generated locally from project structure.`,
    visual_prompt: `Cinematic music-video scene ${i + 1}. ${String(s.lyrics || s.text || "").slice(0, 180)}. Local storyboard placeholder; preserve character continuity.`,
    original_segment_index: s.index ?? i,
  }));
}

function upsertLocalRow(table: string, row: any) {
  const rows = readLocalRows(table);
  const index = rows.findIndex((item: any) => item?.id === row?.id);
  if (index >= 0) rows[index] = { ...rows[index], ...row, updated_at: new Date().toISOString() };
  else rows.push(row);
  writeLocalRows(table, rows);
}

function updateLocalJob(jobId: string, patch: any) {
  const rows = readLocalRows("render_jobs");
  const index = rows.findIndex((item: any) => item?.id === jobId);
  if (index >= 0) {
    rows[index] = { ...rows[index], ...patch, updated_at: new Date().toISOString() };
    writeLocalRows("render_jobs", rows);
  }
}

function findLocalJob(jobId: string) {
  return readLocalRows("render_jobs").find((item: any) => item?.id === jobId || item?.provider_task_id === jobId);
}

function bridgeJobId(body: any): string {
  const direct = body?.jobId || body?.job_id || body?.request_id;
  if (direct) return String(direct);
  const fromUrl = String(body?.status_url || body?.response_url || "").match(/\/api\/jobs\/([0-9a-f]{32})/i);
  return fromUrl?.[1] || "";
}

function isBridgeJobRequest(body: any) {
  const id = bridgeJobId(body);
  if (!id) return false;
  const row = findLocalJob(id);
  return row?.provider === LOCAL_MUSETALK_MODEL || String(body?.status_url || "").startsWith(LOCAL_MUSETALK_BRIDGE);
}

async function bridgeJson(path: string, init?: RequestInit): Promise<{ response: Response; data: any }> {
  const response = await originalFetch(`${LOCAL_MUSETALK_BRIDGE}${path}`, {
    cache: "no-store",
    ...init,
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function verifyBridgeHealth() {
  const { response, data } = await bridgeJson("/health");
  if (!response.ok || data?.service !== "resonance-musetalk-bridge") {
    throw new Error(data?.error || "The R5B MuseTalk bridge is not healthy on 127.0.0.1:7863.");
  }
  if (data?.engine_revision !== LOCAL_MUSETALK_REVISION || data?.network_runtime !== "offline") {
    throw new Error("The local MuseTalk bridge did not pass the pinned-revision/offline policy check.");
  }
  return data;
}

export function isSovereignMediaUrl(raw: string, base?: string): boolean {
  try {
    const url = new URL(raw, base || globalThis.location?.href || "http://127.0.0.1:3301/");
    if (url.protocol === "blob:" || url.protocol === "data:") return true;
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
  } catch {
    return false;
  }
}

async function fetchMediaBlob(url: unknown, label: string): Promise<Blob> {
  if (typeof url !== "string" || !url) throw new Error(`${label} URL is missing.`);
  if (!isSovereignMediaUrl(url)) {
    throw new Error(`${label} is not a local media URL. Import it into this PC before using MuseTalk Local.`);
  }
  const response = await originalFetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${label} could not be read (${response.status}).`);
  const blob = await response.blob();
  if (blob.size < (label === "Video" ? 1024 : 128)) throw new Error(`${label} is unexpectedly small.`);
  return blob;
}

function extensionFor(blob: Blob, fallback: string) {
  const type = String(blob.type || "").toLowerCase();
  if (type.includes("webm")) return "webm";
  if (type.includes("quicktime")) return "mov";
  if (type.includes("mpeg")) return fallback === "wav" ? "mp3" : "mp4";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  if (type.includes("png")) return "png";
  if (type.includes("jpeg")) return "jpg";
  if (type.includes("webp")) return "webp";
  return fallback;
}

async function submitMuseTalkJob(body: any): Promise<FunctionResult> {
  const lipSync = body?.lip_sync !== false;
  const sourceUrl = body?.video_url || body?.image_url;
  const sourceKind = body?.video_url ? "video" : "image";
  if (!sourceUrl || (lipSync && !body?.audio_url)) {
    return { status: 400, data: { error: "Local rendering needs a scene image or video, plus a scene audio segment when lip sync is enabled.", code: "LOCAL_INPUT_REQUIRED", local: true } };
  }
  if (![sourceUrl, body?.audio_url].filter(Boolean).every((url) => typeof url === "string" && isSovereignMediaUrl(url))) {
    return { status: 400, data: { error: "Import the scene media onto this PC before rendering locally.", code: "LOCAL_INPUT_REQUIRED", local: true } };
  }
  try {
    const health = await verifyBridgeHealth();
    if ((sourceKind === "image" || !lipSync) && !health?.capabilities?.image_to_video) {
      throw new Error("Restart the updated local render bridge to enable image-to-video rendering.");
    }
    const [media, audio] = await Promise.all([
      fetchMediaBlob(sourceUrl, sourceKind === "video" ? "Video" : "Image"),
      body?.audio_url ? fetchMediaBlob(body.audio_url, "Audio") : Promise.resolve(null),
    ]);
    const form = new FormData();
    form.append(sourceKind, media, `scene.${extensionFor(media, sourceKind === "video" ? "mp4" : "png")}`);
    if (audio) form.append("audio", audio, `scene.${extensionFor(audio, "wav")}`);
    form.append("metadata", JSON.stringify({
      project_id: body?.project_id ?? null,
      scene_number: body?.scene_number ?? null,
      tracking_id: body?.tracking_id ?? null,
      quality: body?.quality || "hd",
      audio_time_start: body?.audio_time_start ?? null,
      audio_time_end: body?.audio_time_end ?? null,
      requested_model: LOCAL_MUSETALK_MODEL,
      source: "sync-vision-sovereign-local",
      lip_sync: lipSync,
      duration: body?.duration ?? body?.duration_sec ?? null,
      aspect_ratio: body?.aspect_ratio || "16:9",
      motion: body?.motion || "subtle_zoom",
    }));
    const { response, data } = await bridgeJson("/api/jobs", { method: "POST", body: form });
    if (!response.ok || !data?.job_id) {
      return { status: response.status || 502, data: { error: data?.error || "MuseTalk Local submission failed.", code: "LOCAL_BRIDGE_SUBMIT_FAILED", local: true } };
    }
    const jobId = String(data.job_id);
    const now = new Date().toISOString();
    const statusUrl = `${LOCAL_MUSETALK_BRIDGE}/api/jobs/${jobId}`;
    const row = {
      id: jobId,
      user_id: LOCAL_USER_ID,
      project_id: body?.project_id ?? null,
      scene_number: body?.scene_number ?? null,
      tracking_id: body?.tracking_id ?? null,
      provider: LOCAL_MUSETALK_MODEL,
      provider_task_id: jobId,
      status: "queued",
      progress: 0,
      status_url: statusUrl,
      response_url: statusUrl,
      quality: body?.quality || "hd",
      output: null,
      error: null,
      created_at: now,
      updated_at: now,
      local: true,
      pipeline: sourceKind === "image" ? (lipSync ? "ffmpeg-musetalk" : "ffmpeg-motion") : (lipSync ? "musetalk" : "ffmpeg-video"),
    };
    upsertLocalRow("render_jobs", row);
    return {
      status: 202,
      data: {
        request_id: jobId,
        job_id: jobId,
        status_url: statusUrl,
        response_url: statusUrl,
        provider: LOCAL_MUSETALK_MODEL,
        model: LOCAL_MUSETALK_MODEL,
        local: true,
      },
    };
  } catch (error) {
    return { status: 503, data: { error: error instanceof Error ? error.message : "MuseTalk Local bridge unavailable.", code: "LOCAL_BRIDGE_UNAVAILABLE", local: true } };
  }
}

function normalizedStatus(status: string): "queued" | "processing" | "succeeded" | "failed" {
  if (status === "queued") return "queued";
  if (status === "processing") return "processing";
  if (status === "succeeded") return "succeeded";
  if (status === "canceled") return "processing";
  return "failed";
}

async function readMuseTalkJob(body: any, endpoint: "job-status" | "check-job-status"): Promise<FunctionResult> {
  const jobId = bridgeJobId(body);
  if (!jobId) return { status: 400, data: { error: "Local MuseTalk job id is missing.", local: true } };
  try {
    const { response, data } = await bridgeJson(`/api/jobs/${encodeURIComponent(jobId)}`);
    if (response.status === 404) return { status: 404, data: { error: "Local MuseTalk job not found.", local: true } };
    if (!response.ok) return { status: response.status, data: { error: data?.error || "Local MuseTalk status check failed.", local: true } };
    const job = data as BridgeJob;
    const outputUrl = job.status === "succeeded" ? `${LOCAL_MUSETALK_BRIDGE}/api/jobs/${jobId}/output` : undefined;
    const localStatus = job.status === "canceled" ? "cancelled" : job.status;
    updateLocalJob(jobId, {
      status: localStatus,
      progress: Number(job.progress || 0),
      error: job.error || null,
      output: outputUrl ? { video_url: outputUrl, video: { url: outputUrl } } : null,
      completed_at: ["succeeded", "failed", "canceled"].includes(job.status) ? (job.updated_at || new Date().toISOString()) : null,
    });
    if (endpoint === "check-job-status") {
      const statusMap: Record<string, string> = {
        queued: "IN_QUEUE",
        processing: "IN_PROGRESS",
        succeeded: "COMPLETED",
        failed: "FAILED",
        canceled: "CANCELLED",
      };
      return {
        status: 200,
        data: {
          status: statusMap[job.status] || "IN_PROGRESS",
          request_id: jobId,
          job_id: jobId,
          progress: Number(job.progress || 0),
          videoUrl: outputUrl,
          error: job.error || undefined,
          retryable: job.status === "failed",
          local: true,
        },
      };
    }
    return {
      status: 200,
      data: {
        jobId,
        kind: "render",
        status: normalizedStatus(job.status),
        progress: Number(job.progress || 0),
        error: job.error || undefined,
        createdAt: job.created_at || null,
        updatedAt: job.updated_at || null,
        output: outputUrl ? { videoUrl: outputUrl, metadata: { provider: LOCAL_MUSETALK_MODEL, local: true } } : undefined,
        raw: { ...job, status: localStatus, videoUrl: outputUrl },
      },
    };
  } catch (error) {
    return { status: 503, data: { error: error instanceof Error ? error.message : "Local MuseTalk status unavailable.", local: true } };
  }
}

async function cancelMuseTalkJob(body: any): Promise<FunctionResult> {
  const jobId = bridgeJobId(body);
  if (!jobId) return { status: 400, data: { error: "Local MuseTalk job id is missing.", local: true } };
  try {
    const { response, data } = await bridgeJson(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
    if (!response.ok) return { status: response.status, data: { error: data?.error || "Local MuseTalk cancel failed.", local: true } };
    updateLocalJob(jobId, { status: "cancelled", error: "Canceled by user" });
    return { status: 200, data: { success: true, status: "CANCELLED", job_id: jobId, local: true } };
  } catch (error) {
    return { status: 503, data: { error: error instanceof Error ? error.message : "Local MuseTalk cancel unavailable.", local: true } };
  }
}

async function handleFunction(name: string, body: any): Promise<FunctionResult> {
  if (name === "submit-video-job" && body?.model === LOCAL_MUSETALK_MODEL) return submitMuseTalkJob(body);
  if ((name === "job-status" || name === "check-job-status") && isBridgeJobRequest(body)) {
    return readMuseTalkJob(body, name);
  }
  if (name === "cancel-video-job" && isBridgeJobRequest(body)) return cancelMuseTalkJob(body);
  if (name === "transcribe-audio") {
    const p = readLocalRows("projects").find((r: any) => r.id === body?.project_id);
    const text = String(p?.lyrics || p?.track_details?.pasted_lyrics || "").trim();
    if (!text) return { status: 501, data: { error: "Sovereign-local transcription engine is not wired in v0.1. Paste lyrics in Track Details before Analyze to continue fully offline.", code: "LOCAL_TRANSCRIPTION_NOT_WIRED" } };
    let t = 0;
    const ws = text.split(/\s+/).filter(Boolean).map((w: string) => {
      const start = t;
      t += Math.max(.22, Math.min(.7, w.length * .055));
      return { word: w, text: w, start, end: t, confidence: 1 };
    });
    return { status: 200, data: { text, words: ws, audio_events: [], quality: { has_content: true, has_timestamps: true, word_count: ws.length, char_count: text.length, source: "pasted_lyrics_local" }, cached: false, local: true } };
  }
  if (name === "verify-transcription") {
    const text = String(body?.transcription?.text || body?.text || "").trim();
    return { status: 200, data: verified(text) };
  }
  if (name === "classify-vocals") return { status: 200, data: { classifications: (body?.lines || []).map((x: any) => ({ index: x.index, type: "lead", confidence: 1 })), local: true } };
  if (name === "segment-audio") return { status: 200, data: { segments: durationSegments(Number(body?.total_duration_sec || 0), Number(body?.segment_count || 0)), warnings: ["Local deterministic segmentation; no cloud model used."], local: true } };
  if (name === "generate-storylines" || name === "generate-scenes") return { status: 200, data: { scenes: localScenes(body), local: true } };
  if (name === "generate-broll-prompts") return { status: 200, data: { prompts: [], local: true } };
  if (name === "clear-verification-cache") return { status: 200, data: { success: true, local: true } };
  if (name === "export-bundle") return { status: 501, data: { error: "Server-side export is disabled in sovereign-local v0.1. Browser-local project data remains available.", local: true } };
  const data = await invokeLocalFunction(name, body);
  return { status: data?.success === false && /not wired|not yet implemented|disabled/i.test(String(data?.error || "")) ? 501 : 200, data };
}

export function installSovereignNetworkGuard() {
  if ((globalThis as any).__RESONANCE_SOVEREIGN_FETCH__) return;
  (globalThis as any).__RESONANCE_SOVEREIGN_FETCH__ = true;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(raw, globalThis.location?.href || "http://localhost:3301/");
    if (url.href.startsWith(LOCAL_API + "/functions/v1/")) {
      const name = url.pathname.split("/").pop() || "";
      const result = await handleFunction(name, parseBody(init));
      return json(result.data, result.status);
    }
    if (url.href.startsWith(LOCAL_HUB + "/api/public/entitlement")) {
      return json({ ok: true, app: "sync_vision", userId: LOCAL_USER_ID, tier: "all_access", status: "active", source: "all_access", expiresAt: null, features: {}, checkedAt: new Date().toISOString(), hasAccess: true, currentPeriodEnd: null });
    }
    if (url.origin === LOCAL_MUSETALK_BRIDGE || url.origin === LOCAL_STT_BRIDGE) return originalFetch(input as any, init);
    if (url.protocol === "blob:" || url.protocol === "data:" || url.origin === globalThis.location?.origin) return originalFetch(input as any, init);
    const allow = globalThis.localStorage?.getItem("resonance:syncvision:allow-external") === "1";
    if (allow) return originalFetch(input as any, init);
    throw new Error(`External network denied by sovereign-local policy: ${url.hostname}`);
  };
  console.info("[Resonance] Sync Vision sovereign-local network guard active; only approved RONS loopback bridges are admitted.");
}
