import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Mic2, Play, Pause, RotateCcw, Save, ChevronLeft, ChevronRight, Copy, Repeat,
} from "lucide-react";
import type { SavedScene } from "@/components/assembly/SceneTimeline";
import {
  DEFAULT_VOCAL_SYNC_SETTINGS, MAX_TRIM_SEC, OFFSET_RANGE_MS,
  applyVocalSyncToScenes, buildVocalSyncExport, clearSceneVocalSync,
  isDefaultSettings, loadVocalSyncSettings, saveSceneVocalSync,
  type VocalSyncModel, type VocalSyncProjectSettings, type VocalSyncSceneSettings,
} from "@/lib/vocal-sync-settings-store";

interface VocalSyncEditorPanelProps {
  scenes: SavedScene[];
  projectId: string | null;
  /** Master track URL used as the dialogue reference during preview. */
  audioUrl?: string | null;
  /** Name of the main character being synced (display only). */
  characterName?: string | null;
  /** Scene currently selected on the timeline. */
  activeSceneIndex?: number | null;
  onSelectScene?: (index: number) => void;
}

const MODELS: { value: VocalSyncModel; label: string; hint: string }[] = [
  { value: "auto", label: "Auto (recommended)", hint: "Let the pipeline pick the best provider" },
  { value: "sync-3", label: "Sync-3", hint: "Fast, best for short phrases" },
  { value: "sync-v2", label: "Lip-sync 2", hint: "Higher fidelity, slower" },
  { value: "sync-so", label: "Sync.so", hint: "Strong for sustained singing" },
];

export default function VocalSyncEditorPanel({
  scenes, projectId, audioUrl, characterName, activeSceneIndex, onSelectScene,
}: VocalSyncEditorPanelProps) {
  const [selected, setSelected] = useState(0);
  const [all, setAll] = useState<VocalSyncProjectSettings>({});
  const [draft, setDraft] = useState<VocalSyncSceneSettings>({ ...DEFAULT_VOCAL_SYNC_SETTINGS });
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const scene = scenes[selected];

  // Absolute start of the selected scene on the master track.
  const sceneStartSec = useMemo(
    () => scenes.slice(0, selected).reduce((sum, s) => sum + (s.durationSec || 0), 0),
    [scenes, selected],
  );

  useEffect(() => { setAll(loadVocalSyncSettings(projectId)); }, [projectId]);

  useEffect(() => {
    if (typeof activeSceneIndex === "number" && activeSceneIndex >= 0 && activeSceneIndex < scenes.length) {
      setSelected(activeSceneIndex);
    }
  }, [activeSceneIndex, scenes.length]);

  useEffect(() => {
    if (!scene) return;
    setDraft(all[scene.sceneNumber] ?? { ...DEFAULT_VOCAL_SYNC_SETTINGS });
  }, [scene?.sceneNumber, all]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => {
    videoRef.current?.pause();
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  // Stop preview when switching scenes.
  useEffect(() => { stop(); }, [selected, stop]);
  useEffect(() => () => { stop(); }, [stop]);

  const syncAudioToVideo = useCallback(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v || !a || !Number.isFinite(a.duration)) return;
    const target = sceneStartSec + draft.leadInSec + v.currentTime + draft.offsetMs / 1000;
    const clamped = Math.min(Math.max(target, 0), Math.max(0, a.duration - 0.05));
    if (Math.abs(a.currentTime - clamped) > 0.12) a.currentTime = clamped;
  }, [sceneStartSec, draft.leadInSec, draft.offsetMs]);

  const handlePlayPause = useCallback(async () => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v) return;
    if (playing) { stop(); return; }
    try {
      v.currentTime = draft.leadInSec;
      v.muted = true;
      syncAudioToVideo();
      await v.play();
      if (a) await a.play().catch(() => undefined);
      setPlaying(true);
    } catch {
      toast.error("Preview could not start. Try again once the media has loaded.");
    }
  }, [playing, stop, draft.leadInSec, syncAudioToVideo]);

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || !scene) return;
    const endAt = Math.max(0.2, (scene.durationSec || v.duration || 0) - draft.tailSec);
    if (v.currentTime >= endAt) {
      if (loop) {
        v.currentTime = draft.leadInSec;
        syncAudioToVideo();
      } else {
        stop();
      }
      return;
    }
    syncAudioToVideo();
  }, [scene, draft.tailSec, draft.leadInSec, loop, syncAudioToVideo, stop]);

  const dirty = useMemo(() => {
    if (!scene) return false;
    const saved = all[scene.sceneNumber];
    if (!saved) return !isDefaultSettings(draft);
    return (
      saved.offsetMs !== draft.offsetMs || saved.leadInSec !== draft.leadInSec ||
      saved.tailSec !== draft.tailSec || saved.intensity !== draft.intensity ||
      saved.model !== draft.model || (saved.note || "") !== (draft.note || "")
    );
  }, [all, scene, draft]);

  const tunedCount = Object.keys(all).length;

  const update = (patch: Partial<VocalSyncSceneSettings>) => setDraft(prev => ({ ...prev, ...patch }));

  const handleSave = () => {
    if (!scene) return;
    setAll(saveSceneVocalSync(projectId, scene.sceneNumber, draft));
    toast.success(`Vocal sync saved for scene ${scene.sceneNumber}`);
  };


  const handleReset = () => {
    if (!scene) return;
    setAll(clearSceneVocalSync(projectId, scene.sceneNumber));
    setDraft({ ...DEFAULT_VOCAL_SYNC_SETTINGS });
    toast.success(`Scene ${scene.sceneNumber} reset to defaults`);
  };

  const handleApplyAll = () => {
    if (!scenes.length) return;
    setAll(applyVocalSyncToScenes(projectId, scenes.map(s => s.sceneNumber), draft));
    toast.success(`Applied to all ${scenes.length} scenes`);
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildVocalSyncExport(projectId), null, 2));
      toast.success("Vocal sync settings copied as JSON");
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  const goto = (delta: number) => {
    const next = Math.min(scenes.length - 1, Math.max(0, selected + delta));
    setSelected(next);
    onSelectScene?.(next);
  };

  if (!scenes.length) {
    return (
      <p className="text-xs text-muted-foreground py-6 text-center">
        Add scenes with generated video to fine-tune vocal sync.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Mic2 className="h-4 w-4" /> Vocal Sync Editor
        </h3>
        <div className="flex items-center gap-2">
          {characterName && <Badge variant="outline" className="text-[10px]">{characterName}</Badge>}
          <Badge variant="secondary" className="text-[10px]">{tunedCount} tuned</Badge>
        </div>
      </div>

      {/* Scene selector */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => goto(-1)} disabled={selected === 0} aria-label="Previous scene">
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Select value={String(selected)} onValueChange={(v) => { setSelected(Number(v)); onSelectScene?.(Number(v)); }}>
          <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {scenes.map((s, i) => (
              <SelectItem key={`${s.sceneNumber}-${i}`} value={String(i)} className="text-xs">
                Scene {s.sceneNumber}{all[s.sceneNumber] ? " • tuned" : ""} — {(s.lyricSegment || "").slice(0, 40) || "no lyric"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => goto(1)} disabled={selected >= scenes.length - 1} aria-label="Next scene">
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Preview */}
      <div className="rounded-lg border border-border/50 bg-card/40 p-3 space-y-3">
        <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black/60">
          {scene?.videoUrl ? (
            <video
              ref={videoRef}
              src={scene.videoUrl}
              poster={scene.imageUrl}
              preload="auto"
              playsInline
              muted
              className="h-full w-full object-contain"
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => (loop ? handlePlayPause() : stop())}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
              No video for this scene yet
            </div>
          )}
        </div>
        {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" className="hidden" />}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={handlePlayPause} disabled={!scene?.videoUrl}>
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {playing ? "Pause" : "Preview sync"}
            </Button>
            <div className="flex items-center gap-1.5">
              <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
              <Switch checked={loop} onCheckedChange={setLoop} aria-label="Loop preview" />
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">
            starts {sceneStartSec.toFixed(2)}s · {scene?.durationSec?.toFixed(2) ?? "0.00"}s
          </span>
        </div>

        {scene?.lyricSegment && (
          <p className="text-[11px] italic text-muted-foreground leading-snug">“{scene.lyricSegment}”</p>
        )}
      </div>

      {/* Offset */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-foreground">Dialogue offset</label>
          <span className="text-[11px] font-mono text-primary">{draft.offsetMs > 0 ? "+" : ""}{draft.offsetMs} ms</span>
        </div>
        <Slider
          value={[draft.offsetMs]}
          min={-OFFSET_RANGE_MS}
          max={OFFSET_RANGE_MS}
          step={5}
          onValueChange={([v]) => update({ offsetMs: v })}
        />
        <div className="flex items-center gap-1.5 flex-wrap">
          {[-50, -10, 10, 50].map(step => (
            <Button
              key={step}
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px] font-mono"
              onClick={() => update({ offsetMs: Math.min(OFFSET_RANGE_MS, Math.max(-OFFSET_RANGE_MS, draft.offsetMs + step)) })}
            >
              {step > 0 ? `+${step}` : step}ms
            </Button>
          ))}
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => update({ offsetMs: 0 })}>
            Center
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Negative pulls the vocal earlier (mouth leads), positive pushes it later.
        </p>
      </div>

      {/* Speaking window */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground">Lead-in trim</label>
            <span className="text-[11px] font-mono text-primary">{draft.leadInSec.toFixed(2)}s</span>
          </div>
          <Slider value={[draft.leadInSec]} min={0} max={MAX_TRIM_SEC} step={0.05} onValueChange={([v]) => update({ leadInSec: Number(v.toFixed(2)) })} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground">Tail trim</label>
            <span className="text-[11px] font-mono text-primary">{draft.tailSec.toFixed(2)}s</span>
          </div>
          <Slider value={[draft.tailSec]} min={0} max={MAX_TRIM_SEC} step={0.05} onValueChange={([v]) => update({ tailSec: Number(v.toFixed(2)) })} />
        </div>
      </div>

      {/* Intensity + model */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-foreground">Mouth motion intensity</label>
          <span className="text-[11px] font-mono text-primary">{draft.intensity}</span>
        </div>
        <Slider value={[draft.intensity]} min={0} max={100} step={1} onValueChange={([v]) => update({ intensity: v })} />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Provider model</label>
        <Select value={draft.model} onValueChange={(v) => update({ model: v as VocalSyncModel })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MODELS.map(m => (
              <SelectItem key={m.value} value={m.value} className="text-xs">
                <span className="font-medium">{m.label}</span>
                <span className="block text-[10px] text-muted-foreground">{m.hint}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Notes</label>
        <Textarea
          value={draft.note || ""}
          onChange={(e) => update({ note: e.target.value.slice(0, 400) })}
          placeholder="e.g. mouth closes too early on the last word"
          className="min-h-[56px] text-xs"
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap pt-1">
        <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={handleSave} disabled={!scene || !dirty}>
          <Save className="h-3.5 w-3.5" /> Save scene
        </Button>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleApplyAll}>
          Apply to all
        </Button>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleReset} disabled={!scene}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleCopyJson} disabled={!tunedCount}>
          <Copy className="h-3.5 w-3.5" /> Copy JSON
        </Button>
      </div>
    </div>
  );
}
