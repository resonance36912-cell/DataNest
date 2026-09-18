/**
 * JobParamsPopover — surfaces a render job's request parameters
 * (provider/model settings, prompt + scene seed, input media metadata)
 * with per-field copy-to-clipboard so admins can quickly reproduce a job
 * without digging into the raw row.
 */
import { useMemo } from "react";
import { ClipboardCopy, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { copyWithFallback } from "@/lib/utils";

type AnyRecord = Record<string, unknown>;

export interface JobParamsPopoverProps {
  jobId: string;
  provider: string;
  quality?: string | null;
  assemblyProfile?: string | null;
  input: AnyRecord | null | undefined;
}

const MEDIA_KEYS = [
  "image_url", "imageUrl", "first_frame_url", "reference_image_url",
  "video_url", "audio_url", "source_video_url", "source_audio_url",
  "scene_image_url", "character_image_url",
];
const PROMPT_KEYS = ["prompt", "visual_prompt", "negative_prompt", "lyric_segment", "action_description"];
const SETTING_KEYS = [
  "model", "provider_model", "provider_name", "duration_sec", "duration",
  "aspect_ratio", "fps", "resolution", "seed", "guidance_scale", "steps",
  "motion_bucket_id", "cfg_scale", "loop", "watermark", "audio_strength",
];

function copy(value: string, label: string) {
  const ok = copyWithFallback(value);
  if (ok) {
    toast.success(`${label} copied`);
  } else {
    toast.error("Copy blocked — clipboard access denied.\nThis usually happens when the page isn't served over HTTPS. Try switching to https:// or manually select and copy the text.", {
      duration: 6000,
    });
  }
}

function pickKnown(input: AnyRecord, keys: string[]): Array<[string, unknown]> {
  return keys
    .filter((k) => input[k] !== undefined && input[k] !== null && input[k] !== "")
    .map((k) => [k, input[k]] as [string, unknown]);
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

function CopyRow({ label, value }: { label: string; value: unknown }) {
  const text = stringify(value);
  const isLong = text.length > 60;
  return (
    <div className="grid grid-cols-[110px_1fr_auto] items-start gap-2 py-1 border-b border-border/30 last:border-0">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground pt-0.5">{label}</span>
      <code
        className={`text-[11px] font-mono break-all ${isLong ? "line-clamp-3" : ""}`}
        title={text}
      >
        {text}
      </code>
      <button
        type="button"
        onClick={() => copy(text, label)}
        className="opacity-60 hover:opacity-100 hover:text-primary mt-0.5"
        title={`Copy ${label}`}
      >
        <ClipboardCopy className="h-3 w-3" />
      </button>
    </div>
  );
}

export function JobParamsPopover(props: JobParamsPopoverProps) {
  const { jobId, provider, quality, assemblyProfile, input } = props;
  const inp: AnyRecord = (input && typeof input === "object") ? (input as AnyRecord) : {};

  const settings = useMemo(() => pickKnown(inp, SETTING_KEYS), [inp]);
  const prompts = useMemo(() => pickKnown(inp, PROMPT_KEYS), [inp]);
  const media = useMemo(() => pickKnown(inp, MEDIA_KEYS), [inp]);

  const knownKeys = new Set([...SETTING_KEYS, ...PROMPT_KEYS, ...MEDIA_KEYS]);
  const other = useMemo(
    () => Object.entries(inp).filter(([k, v]) => !knownKeys.has(k) && v !== null && v !== undefined && v !== ""),
    [inp, knownKeys],
  );

  const hasAny = settings.length + prompts.length + media.length + other.length > 0;
  const fullJson = useMemo(() => JSON.stringify({ provider, quality, assembly_profile_used: assemblyProfile, input: inp }, null, 2), [provider, quality, assemblyProfile, inp]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          title="View request parameters"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] max-h-[60vh] overflow-auto p-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xs font-semibold">Request parameters</div>
            <div className="text-[10px] text-muted-foreground font-mono">{jobId.slice(0, 8)}…</div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px] gap-1"
            onClick={() => copy(fullJson, "Full payload")}
          >
            <ClipboardCopy className="h-3 w-3" /> Copy JSON
          </Button>
        </div>

        <div className="space-y-3">
          <section>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Provider</div>
            <CopyRow label="provider" value={provider} />
            {quality && <CopyRow label="quality" value={quality} />}
            {assemblyProfile && <CopyRow label="profile" value={assemblyProfile} />}
            {settings.map(([k, v]) => <CopyRow key={k} label={k} value={v} />)}
          </section>

          {prompts.length > 0 && (
            <section>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Prompt / scene</div>
              {prompts.map(([k, v]) => <CopyRow key={k} label={k} value={v} />)}
            </section>
          )}

          {media.length > 0 && (
            <section>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Input media</div>
              {media.map(([k, v]) => <CopyRow key={k} label={k} value={v} />)}
            </section>
          )}

          {other.length > 0 && (
            <section>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Other</div>
              {other.map(([k, v]) => <CopyRow key={k} label={k} value={v} />)}
            </section>
          )}

          {!hasAny && (
            <div className="text-[11px] text-muted-foreground italic">
              No input parameters recorded for this job.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default JobParamsPopover;
