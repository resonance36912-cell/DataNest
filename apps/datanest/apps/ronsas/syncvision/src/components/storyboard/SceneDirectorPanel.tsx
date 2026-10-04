import { useEffect, useMemo, useState } from "react";
import { Clapperboard, User2, Camera, Sparkles, ShieldCheck, AlertTriangle, RotateCcw, Wand2, Loader2, Zap, Save, Trash2, BookmarkPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  extractDirectorPatch,
  listUserPresets,
  saveUserPreset,
  deleteUserPreset,
  subscribeUserPresets,
  type UserDirectorPreset,
} from "@/lib/director-presets-store";
import { toast } from "sonner";
import {
  SAFE_MOVEMENTS,
  SAFE_SHOT_SIZES,
  SAFE_CAMERA_HEIGHTS,
  SAFE_HEAD_MOTIONS,
} from "@/lib/lip-sync-readiness";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Scene } from "@/contexts/ProjectContext";
import { FIX_OVERLAID_CAPTIONS_PATCH } from "@/lib/director-preset-patches";

/* ---------- enums ---------- */
const SHOT_ROLES = [
  "A_ROLL_LIP_SYNC",
  "B_ROLL_STORY",
  "B_ROLL_SYMBOLIC",
  "PERFORMANCE_CLOSEUP",
  "WIDE_LOCATION_ESTABLISHER",
  "INSERT_DETAIL",
  "CAMERA_TRANSITION",
  "VFX_ACCENT",
] as const;

const EMOTIONS = ["focused", "defiant", "calm", "intense", "joyful", "reflective", "spiritual", "aggressive"] as const;
const EYE_LINES = ["direct_to_camera", "slightly_off_camera", "looking_down_then_up", "toward_light", "toward_crowd"] as const;
const POSTURES = ["still_confident", "leaning_forward", "walking_slowly", "standing_grounded", "seated_reflective"] as const;
const GESTURES = ["minimal", "rap_hand_gestures", "open_palms", "chest_tap", "pointing_to_camera", "no_gestures"] as const;
const HEAD_MOTIONS = ["minimal", "subtle_nods", "controlled_turns"] as const;
const SHOT_SIZES = ["extreme_closeup", "closeup", "medium_closeup", "medium", "wide", "tracking_wide"] as const;
const LENSES = ["24mm", "35mm", "50mm", "85mm", "anamorphic"] as const;
const HEIGHTS = ["eye_level", "low_angle", "slightly_high_angle"] as const;
const MOVEMENTS = ["locked_off", "slow_push_in", "slow_pull_back", "side_tracking", "handheld_subtle", "orbit_slow"] as const;
const DOFS = ["shallow", "medium", "deep"] as const;
const LIGHTING = ["natural_daylight", "golden_hour", "neon_practical", "soft_key", "high_contrast", "candle_lit", "blue_projection", "stage_spotlight"] as const;
const VFX_LEVELS = ["none", "subtle", "moderate", "heavy"] as const;

const labelize = (s: string) => s.replace(/_/g, " ");

/* ---------- one-click Director presets ----------
 * Each preset applies a lip-sync-safe bundle of overrides in a single
 * update call. All presets pass evaluateLipSyncReadiness for A-Roll. */
type DirectorPreset = {
  id: string;
  label: string;
  description: string;
  patch: Record<string, any>;
};

const DIRECTOR_PRESETS: DirectorPreset[] = [
  {
    id: "rap-intense",
    label: "Rap · Intense",
    description: "Direct-to-camera, leaning-in, subtle nods, slow push-in, high-contrast",
    patch: {
      shot_role: "A_ROLL_LIP_SYNC",
      performance_direction: {
        emotion: "intense",
        eyeLine: "direct_to_camera",
        posture: "leaning_forward",
        gestureStyle: "rap_hand_gestures",
        headMotion: "subtle_nods",
        intensity: 4,
      },
      camera_direction: {
        shotSize: "medium_closeup",
        lens: "85mm",
        cameraHeight: "eye_level",
        movement: "slow_push_in",
        depthOfField: "shallow",
      },
      lighting_direction: "high_contrast",
      vfx_level: "subtle",
    },
  },
  {
    id: "singing-emotive",
    label: "Singing · Emotive",
    description: "Reflective closeup, soft key light, locked-off, shallow DOF",
    patch: {
      shot_role: "PERFORMANCE_CLOSEUP",
      performance_direction: {
        emotion: "reflective",
        eyeLine: "slightly_off_camera",
        posture: "still_confident",
        gestureStyle: "minimal",
        headMotion: "minimal",
        intensity: 3,
      },
      camera_direction: {
        shotSize: "closeup",
        lens: "85mm",
        cameraHeight: "eye_level",
        movement: "locked_off",
        depthOfField: "shallow",
      },
      lighting_direction: "soft_key",
      vfx_level: "none",
    },
  },
  {
    id: "broll-cinematic",
    label: "B-Roll · Cinematic",
    description: "Wide establisher, side-tracking, golden hour, moderate VFX",
    patch: {
      is_broll: true,
      shot_role: "B_ROLL_STORY",
      performance_direction: {},
      camera_direction: {
        shotSize: "wide",
        lens: "35mm",
        cameraHeight: "eye_level",
        movement: "side_tracking",
        depthOfField: "medium",
      },
      lighting_direction: "golden_hour",
      vfx_level: "moderate",
    },
  },
  {
    id: "fix-overlaid-captions",
    label: "Fix Overlaid Captions",
    description: "Strips burned-in lyric text and tightens to a lip-sync-safe closeup with subtle nods",
    patch: FIX_OVERLAID_CAPTIONS_PATCH as any,
  },

];


/* ---------- Cinematic camera presets ----------
 * Groups shot size + lens + movement + DOF + height in one click.
 * Only the top 3 (Intimate/Locked/Push-in) are lip-sync safe for A-Roll;
 * the rest carry a lip-sync warning that the UI already surfaces. */
type CameraPreset = {
  id: string;
  label: string;
  description: string;
  lipSyncSafe: boolean;
  patch: Record<string, any>;
};

const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: "intimate-portrait",
    label: "Intimate Portrait",
    description: "85mm closeup, eye level, locked-off, shallow DOF",
    lipSyncSafe: true,
    patch: { shotSize: "closeup", lens: "85mm", cameraHeight: "eye_level", movement: "locked_off", depthOfField: "shallow" },
  },
  {
    id: "slow-push-in",
    label: "Slow Push-In",
    description: "50mm medium closeup, eye level, slow push-in, shallow DOF",
    lipSyncSafe: true,
    patch: { shotSize: "medium_closeup", lens: "50mm", cameraHeight: "eye_level", movement: "slow_push_in", depthOfField: "shallow" },
  },
  {
    id: "hero-pullback",
    label: "Hero Pull-Back",
    description: "35mm medium, eye level, slow pull-back, medium DOF",
    lipSyncSafe: true,
    patch: { shotSize: "medium", lens: "35mm", cameraHeight: "eye_level", movement: "slow_pull_back", depthOfField: "medium" },
  },
  {
    id: "anamorphic-wide",
    label: "Anamorphic Wide",
    description: "Anamorphic wide, low angle, side-tracking, deep DOF",
    lipSyncSafe: false,
    patch: { shotSize: "wide", lens: "anamorphic", cameraHeight: "low_angle", movement: "side_tracking", depthOfField: "deep" },
  },
  {
    id: "handheld-verite",
    label: "Handheld Vérité",
    description: "35mm medium, eye level, handheld subtle, medium DOF",
    lipSyncSafe: false,
    patch: { shotSize: "medium", lens: "35mm", cameraHeight: "eye_level", movement: "handheld_subtle", depthOfField: "medium" },
  },
  {
    id: "orbit-showcase",
    label: "Orbit Showcase",
    description: "50mm medium, eye level, slow orbit, shallow DOF",
    lipSyncSafe: false,
    patch: { shotSize: "medium", lens: "50mm", cameraHeight: "eye_level", movement: "orbit_slow", depthOfField: "shallow" },
  },
];

/* ---------- Location + Lighting presets ----------
 * Patches lighting_direction + vfx_level + scene_location together so
 * cinematography is coherent (light source matches the environment). */
type LightingPreset = {
  id: string;
  label: string;
  description: string;
  patch: { lighting_direction: string; vfx_level: string; scene_location: string };
};

const LIGHTING_PRESETS: LightingPreset[] = [
  {
    id: "night-neon",
    label: "Neon Night Street",
    description: "Neon practicals, subtle grain, wet asphalt reflections",
    patch: { lighting_direction: "neon_practical", vfx_level: "subtle", scene_location: "wet neon-lit city street at night, reflective asphalt, low fog" },
  },
  {
    id: "underground-studio",
    label: "Underground Studio",
    description: "High-contrast key, single rim light, concrete walls",
    patch: { lighting_direction: "high_contrast", vfx_level: "subtle", scene_location: "dark underground concrete studio, single rim light from behind, deep shadows" },
  },
  {
    id: "golden-rooftop",
    label: "Golden Hour Rooftop",
    description: "Golden hour, no VFX, city skyline backdrop",
    patch: { lighting_direction: "golden_hour", vfx_level: "none", scene_location: "urban rooftop at golden hour, warm sun grazing subject, city skyline behind" },
  },
  {
    id: "stage-spotlight",
    label: "Stage Spotlight",
    description: "Hard stage spotlight, moderate haze, black surround",
    patch: { lighting_direction: "stage_spotlight", vfx_level: "moderate", scene_location: "black stage with a single hard overhead spotlight, atmospheric haze" },
  },
  {
    id: "candle-intimate",
    label: "Candle-lit Intimate",
    description: "Warm candle light, no VFX, small dim interior",
    patch: { lighting_direction: "candle_lit", vfx_level: "none", scene_location: "small dim interior lit only by candles, warm flickering light on the subject" },
  },
  {
    id: "blue-projection",
    label: "Blue Projection",
    description: "Cool blue projected light, subtle grain, dark room",
    patch: { lighting_direction: "blue_projection", vfx_level: "subtle", scene_location: "dark room with cool blue projection light washing across the subject" },
  },
  {
    id: "soft-daylight",
    label: "Soft Daylight Loft",
    description: "Soft key from window, no VFX, bright loft interior",
    patch: { lighting_direction: "soft_key", vfx_level: "none", scene_location: "bright loft interior, large window casting soft directional daylight" },
  },
];

interface SceneDirectorPanelProps {
  scene: Scene;
  sceneIndex: number;
  /** Total number of scenes in the storyboard — enables the multi-scene target picker. */
  totalScenes?: number;
  onUpdateScene: (idx: number, updates: Partial<Scene>) => void;
  /** Optional callback to re-run only this scene after overrides are applied. */
  onRerunScene?: (idx: number) => void;
  /** True while this scene is being regenerated. */
  isRegenerating?: boolean;
}

export default function SceneDirectorPanel({
  scene,
  sceneIndex: i,
  totalScenes,
  onUpdateScene,
  onRerunScene,
  isRegenerating,
}: SceneDirectorPanelProps) {
  const s = scene as any;
  const isBroll = scene.is_broll === true;

  const shotRole: string = s.shot_role || (isBroll ? "B_ROLL_STORY" : "A_ROLL_LIP_SYNC");
  const perf = s.performance_direction || {};
  const cam = s.camera_direction || {};
  const safety = s.lip_sync_safety || {};

  const set = (patch: Record<string, any>) => onUpdateScene(i, patch as Partial<Scene>);
  const setPerf = (patch: Record<string, any>) => set({ performance_direction: { ...perf, ...patch } });
  const setCam = (patch: Record<string, any>) => set({ camera_direction: { ...cam, ...patch } });
  const setSafety = (patch: Record<string, any>) => set({ lip_sync_safety: { ...safety, ...patch } });

  const intensity: number = typeof perf.intensity === "number" ? perf.intensity : 3;

  /* User-defined presets (localStorage, cross-project same browser) */
  const [userPresets, setUserPresets] = useState<UserDirectorPreset[]>(() => listUserPresets());
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<{
    label: string;
    description?: string;
    patch: Record<string, any>;
    source: "builtin" | "custom";
  } | null>(null);
  const [autoRerun, setAutoRerun] = useState(false);
  /* Multi-scene target picker — which scene indices the next preset applies to.
   * Defaults to just the current scene; the header renders a chip row when totalScenes > 1. */
  const sceneCount = typeof totalScenes === "number" && totalScenes > 0 ? totalScenes : 1;
  const [targetIndices, setTargetIndices] = useState<number[]>([i]);
  // Keep current scene index selected if user navigates between scenes.
  useEffect(() => {
    setTargetIndices((prev) => (prev.includes(i) ? prev : [...prev, i].sort((a, b) => a - b)));
  }, [i]);
  const toggleTarget = (idx: number) =>
    setTargetIndices((prev) =>
      prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx].sort((a, b) => a - b)
    );
  useEffect(() => subscribeUserPresets(() => setUserPresets(listUserPresets())), []);

  const currentPatch = useMemo(() => extractDirectorPatch(scene), [scene]);
  const canSave = Object.keys(currentPatch).length > 0;

  const applyPreset = (preset: { label: string; description?: string; patch: Record<string, any> }, source: "builtin" | "custom") => {
    const targets = targetIndices.length > 0 ? targetIndices : [i];
    const multiTarget = targets.length > 1;
    // Auto-rerun fast-path only applies when the user targets a single scene (the current one).
    if (autoRerun && onRerunScene && !multiTarget && targets[0] === i) {
      const nextShotRole = preset.patch.shot_role ?? shotRole;
      const isARoll = nextShotRole === "A_ROLL_LIP_SYNC" || nextShotRole === "PERFORMANCE_CLOSEUP";
      let blocked = false;
      if (isARoll) {
        const nextPerf = preset.patch.performance_direction ? { ...perf, ...preset.patch.performance_direction } : perf;
        const nextCam = preset.patch.camera_direction ? { ...cam, ...preset.patch.camera_direction } : cam;
        const nextSafety = preset.patch.lip_sync_safety ? { ...safety, ...preset.patch.lip_sync_safety } : safety;
        const warnings: string[] = [];
        if (nextSafety.mouth_clear === false) warnings.push("Mouth not marked clear");
        if (nextSafety.face_clear === false) warnings.push("Face not marked clear");
        if (nextPerf.headMotion && nextPerf.headMotion !== "minimal" && nextPerf.headMotion !== "subtle_nods") {
          warnings.push(`Head motion "${nextPerf.headMotion}" may break lip-sync`);
        }
        if (nextSafety.no_obstruction === false) warnings.push("Obstructions over face");
        if (nextCam.movement && nextCam.movement !== "locked_off" && nextCam.movement !== "slow_push_in" && nextCam.movement !== "slow_pull_back") {
          warnings.push(`Camera movement "${nextCam.movement}" may cause mouth drift`);
        }
        if (nextCam.cameraHeight && nextCam.cameraHeight !== "eye_level") {
          warnings.push(`Extreme angle "${nextCam.cameraHeight}" reduces lip-sync accuracy`);
        }
        if (warnings.length > 0) {
          blocked = true;
          toast.warning(`Applied ${preset.label}, but auto-re-run blocked`, {
            description: warnings.join(" • "),
          });
        }
      }
      set(preset.patch);
      if (!blocked) {
        toast.success(`Applied ${preset.label} & re-running scene`);
        onRerunScene(i);
      }
    } else {
      setPendingPreset({ label: preset.label, description: preset.description, patch: preset.patch, source });
    }
  };

  /* Lip-sync safety auto-evaluation */
  const safetyChecks = useMemo(() => {
    const isARoll = shotRole === "A_ROLL_LIP_SYNC" || shotRole === "PERFORMANCE_CLOSEUP";
    const mouthClear = safety.mouth_clear !== false;
    const faceClear = safety.face_clear !== false;
    const minimalHead = perf.headMotion === "minimal" || perf.headMotion === "subtle_nods" || !perf.headMotion;
    const noObstruction = safety.no_obstruction !== false;
    const safeMovement = !cam.movement || ["locked_off", "slow_push_in", "slow_pull_back"].includes(cam.movement);
    const safeAngle = !cam.cameraHeight || cam.cameraHeight === "eye_level";

    const warnings: string[] = [];
    if (isARoll) {
      if (!mouthClear) warnings.push("Mouth not marked clear");
      if (!faceClear) warnings.push("Face not marked clear");
      if (!minimalHead) warnings.push(`Head motion "${perf.headMotion}" may break lip-sync`);
      if (!noObstruction) warnings.push("Obstructions over face");
      if (!safeMovement) warnings.push(`Camera movement "${cam.movement}" may cause mouth drift`);
      if (!safeAngle) warnings.push(`Extreme angle "${cam.cameraHeight}" reduces lip-sync accuracy`);
    }
    return { isARoll, mouthClear, faceClear, minimalHead, noObstruction, safeMovement, safeAngle, warnings };
  }, [shotRole, safety, perf, cam]);

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-primary">Scene Director</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary">
            {labelize(shotRole)}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`director-broll-${i}`} className="text-[11px] text-muted-foreground cursor-pointer">
            {isBroll ? "🎬 B-Roll" : "🎤 A-Roll"}
          </Label>
          <Switch
            id={`director-broll-${i}`}
            checked={isBroll}
            onCheckedChange={(checked) =>
              set({
                is_broll: !!checked,
                shot_role: checked ? "B_ROLL_STORY" : "A_ROLL_LIP_SYNC",
              })
            }
          />
        </div>
      </div>

      {/* One-click Presets */}
      <div className="space-y-1.5 border-t border-border/40 pt-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground/90">Quick Presets</span>
          <span className="text-[10px] text-muted-foreground">Applies a bundle of overrides</span>
          {onRerunScene && (
            <div className="flex items-center gap-1.5 ml-2">
              <Switch
                id={`director-auto-rerun-${i}`}
                checked={autoRerun}
                onCheckedChange={setAutoRerun}
              />
              <Label htmlFor={`director-auto-rerun-${i}`} className="text-[10px] text-muted-foreground cursor-pointer">
                Auto-rerun
              </Label>
            </div>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1 text-primary hover:bg-primary/10"
              onClick={() => { setSaveLabel(""); setSaveDesc(""); setSaveOpen(true); }}
              disabled={!canSave}
              title={canSave ? "Save current Director settings as a reusable preset" : "Adjust a Director field first"}
            >
              <BookmarkPlus className="h-3 w-3" /> Save current
            </Button>
            {userPresets.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                onClick={() => setManageOpen(true)}
              >
                Manage
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DIRECTOR_PRESETS.map((p) => (
            <Button
              key={p.id}
              variant="outline"
              size="sm"
              className="h-7 text-[11px] px-2 gap-1 border-primary/30 hover:border-primary/60 hover:bg-primary/10"
              title={p.description}
              onClick={() => applyPreset(p, "builtin")}
            >
              <Sparkles className="h-3 w-3" />
              {p.label}
            </Button>
          ))}
          {userPresets.map((p) => (
            <Button
              key={p.id}
              variant="outline"
              size="sm"
              className="h-7 text-[11px] px-2 gap-1 border-amber-500/40 hover:border-amber-500/70 hover:bg-amber-500/10"
              title={p.description || "Custom preset"}
              onClick={() => applyPreset(p, "custom")}
            >
              <Save className="h-3 w-3" />
              {p.label}
            </Button>
          ))}
        </div>

        {/* Multi-scene target picker — apply next preset to more than the current scene */}
        {sceneCount > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10px] text-muted-foreground">Apply to:</span>
            {Array.from({ length: sceneCount }, (_, idx) => {
              const active = targetIndices.includes(idx);
              const isCurrent = idx === i;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleTarget(idx)}
                  className={
                    "h-5 min-w-[22px] px-1.5 rounded text-[10px] border transition-colors " +
                    (active
                      ? "border-primary/60 bg-primary/15 text-primary font-medium"
                      : "border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground") +
                    (isCurrent ? " ring-1 ring-primary/40" : "")
                  }
                  title={isCurrent ? `Scene ${idx + 1} (current)` : `Scene ${idx + 1}`}
                >
                  {idx + 1}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setTargetIndices(Array.from({ length: sceneCount }, (_, k) => k))}
              className="h-5 px-1.5 rounded text-[10px] border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40"
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setTargetIndices([i])}
              className="h-5 px-1.5 rounded text-[10px] border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40"
            >
              Only current
            </button>
            {targetIndices.length > 1 && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 border-primary/40 text-primary">
                {targetIndices.length} scenes
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Save current as preset dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save Director preset</DialogTitle>
            <DialogDescription>
              Saves the current Director fields ({Object.keys(currentPatch).length}) as a reusable preset,
              available across all your projects on this browser.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input
                autoFocus
                value={saveLabel}
                onChange={(e) => setSaveLabel(e.target.value)}
                placeholder="e.g. My Cinematic Rap Look"
                maxLength={60}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description (optional)</Label>
              <Input
                value={saveDesc}
                onChange={(e) => setSaveDesc(e.target.value)}
                placeholder="Short reminder of the vibe"
                maxLength={140}
              />
            </div>
            <div className="rounded border border-border/40 bg-muted/30 p-2 text-[10px] text-muted-foreground max-h-32 overflow-auto">
              <div className="font-medium text-foreground/70 mb-1">Fields being saved:</div>
              {Object.keys(currentPatch).map((k) => (
                <div key={k}>• {k.replace(/_/g, " ")}</div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!saveLabel.trim()}
              onClick={() => {
                const p = saveUserPreset({ label: saveLabel, description: saveDesc, patch: currentPatch });
                toast.success(`Preset saved: ${p.label}`);
                setSaveOpen(false);
              }}
            >
              Save preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage custom presets dialog */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Your Director presets</DialogTitle>
            <DialogDescription>
              Custom presets saved on this browser. Delete any you no longer need.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 max-h-80 overflow-auto">
            {userPresets.length === 0 && (
              <p className="text-xs text-muted-foreground">No custom presets yet.</p>
            )}
            {userPresets.map((p) => (
              <div key={p.id} className="flex items-start gap-2 rounded border border-border/40 p-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{p.label}</div>
                  {p.description && <div className="text-[10px] text-muted-foreground truncate">{p.description}</div>}
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {Object.keys(p.patch).length} field{Object.keys(p.patch).length === 1 ? "" : "s"}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    deleteUserPreset(p.id);
                    toast.success(`Deleted preset: ${p.label}`);
                  }}
                  title="Delete preset"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Preset diff preview dialog — shows exactly which fields change before applying */}
      <Dialog open={!!pendingPreset} onOpenChange={(o) => !o && setPendingPreset(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Apply preset: {pendingPreset?.label}
            </DialogTitle>
            <DialogDescription>
              {pendingPreset?.description ? (
                pendingPreset.description
              ) : targetIndices.length > 1 ? (
                `Review the fields this preset will change. Applies to ${targetIndices.length} selected scenes.`
              ) : (
                <>Review the fields this preset will change on scene {i + 1}.</>
              )}
            </DialogDescription>
          </DialogHeader>
          {pendingPreset && (() => {
            const rows = buildPresetDiff(scene, pendingPreset.patch);
            const changed = rows.filter((r) => r.kind !== "unchanged");
            return (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary">
                    {changed.length} change{changed.length === 1 ? "" : "s"}
                  </Badge>
                  <span>
                    {rows.filter((r) => r.kind === "added").length} added ·{" "}
                    {rows.filter((r) => r.kind === "changed").length} changed ·{" "}
                    {rows.filter((r) => r.kind === "unchanged").length} unchanged
                  </span>
                  {targetIndices.length > 1 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-500">
                      Applying to scenes {targetIndices.map((n) => n + 1).join(", ")}
                    </Badge>
                  )}
                  <span className="w-full text-[10px] text-muted-foreground/80">
                    Diff shown against the current scene ({i + 1}). Other selected scenes receive the same patch;
                    fields already matching will be no-ops.
                  </span>
                </div>
                <div className="max-h-72 overflow-auto rounded border border-border/40 divide-y divide-border/40">
                  {rows.map((r) => (
                    <div key={r.path} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-2 py-1.5 text-[11px]">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground/90 truncate">{r.path}</div>
                        <Badge
                          variant="outline"
                          className={
                            "text-[9px] px-1 py-0 " +
                            (r.kind === "added"
                              ? "border-emerald-500/40 text-emerald-500"
                              : r.kind === "changed"
                              ? "border-amber-500/40 text-amber-500"
                              : "border-border/50 text-muted-foreground")
                          }
                        >
                          {r.kind}
                        </Badge>
                      </div>
                      <div className="min-w-0 text-muted-foreground truncate line-through decoration-destructive/60" title={r.beforeStr}>
                        {r.beforeStr || "—"}
                      </div>
                      <div className="min-w-0 text-emerald-500 truncate font-medium" title={r.afterStr}>
                        {r.afterStr}
                      </div>
                    </div>
                  ))}
                  {rows.length === 0 && (
                    <div className="px-2 py-3 text-[11px] text-muted-foreground text-center">
                      This preset matches the scene's current values — nothing to change.
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPendingPreset(null)}>Cancel</Button>
            <Button
              size="sm"
              className="gap-1"
              onClick={() => {
                if (!pendingPreset) return;
                const targets = targetIndices.length > 0 ? targetIndices : [i];
                targets.forEach((idx) => onUpdateScene(idx, pendingPreset.patch as Partial<Scene>));
                toast.success(
                  targets.length > 1
                    ? `Applied ${pendingPreset.label} to ${targets.length} scenes`
                    : `Applied preset: ${pendingPreset.label}`,
                  { description: pendingPreset.description }
                );
                setPendingPreset(null);
              }}
            >
              <Wand2 className="h-3 w-3" />
              Apply to {targetIndices.length > 1 ? `${targetIndices.length} scenes` : "scene"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>




      {/* Shot Role */}
      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground">Shot Role</Label>
        <Select value={shotRole} onValueChange={(v) => set({ shot_role: v })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SHOT_ROLES.map((r) => (
              <SelectItem key={r} value={r} className="text-xs">{labelize(r)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Performance */}
      <div className="space-y-2 border-t border-border/40 pt-3">
        <div className="flex items-center gap-1.5">
          <User2 className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground/90">Performance</span>
          {Object.keys(perf).length === 0 ? (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary">
              <Sparkles className="h-3 w-3 mr-0.5" />
              Auto-generated
            </Badge>
          ) : (
            <>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-500">
                {Object.keys(perf).length} override{Object.keys(perf).length === 1 ? "" : "s"}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                onClick={() => set({ performance_direction: {} })}
                title="Clear overrides and restore auto-generated values"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset to auto
              </Button>
            </>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DirectorSelect label="Emotion" value={perf.emotion} options={EMOTIONS} onChange={(v) => setPerf({ emotion: v })} />
          <DirectorSelect label="Eye-line" value={perf.eyeLine} options={EYE_LINES} onChange={(v) => setPerf({ eyeLine: v })} />
          <DirectorSelect label="Posture" value={perf.posture} options={POSTURES} onChange={(v) => setPerf({ posture: v })} />
          <DirectorSelect label="Gesture" value={perf.gestureStyle} options={GESTURES} onChange={(v) => setPerf({ gestureStyle: v })} />
          <div className="space-y-1">
            <DirectorSelect label="Head Motion" value={perf.headMotion} options={HEAD_MOTIONS} onChange={(v) => setPerf({ headMotion: v })} />
            <LipSyncHint kind="headMotion" value={perf.headMotion} isARoll={safetyChecks.isARoll} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Intensity · {intensity}</Label>
            <Slider
              min={1}
              max={5}
              step={1}
              value={[intensity]}
              onValueChange={(v) => setPerf({ intensity: v[0] })}
              className="py-1"
            />
          </div>
        </div>
      </div>

      {/* Camera */}
      <div className="space-y-2 border-t border-border/40 pt-3">
        <div className="flex items-center gap-1.5">
          <Camera className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground/90">Camera</span>
          {Object.keys(cam).length === 0 ? (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary">
              <Sparkles className="h-3 w-3 mr-0.5" />
              Auto-generated
            </Badge>
          ) : (
            <>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-500">
                {Object.keys(cam).length} override{Object.keys(cam).length === 1 ? "" : "s"}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                onClick={() => set({ camera_direction: {} })}
                title="Clear overrides and restore auto-generated values"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset to auto
              </Button>
            </>
          )}
        </div>

        {/* Cinematic camera preset dropdown — patches shot/lens/movement/DOF/height in one shot */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-primary" /> Camera Preset
            </Label>
            <Select
              value=""
              onValueChange={(id) => {
                const p = CAMERA_PRESETS.find((x) => x.id === id);
                if (!p) return;
                setCam(p.patch);
                toast.success(`Camera preset: ${p.label}`, {
                  description: p.lipSyncSafe ? p.description : `${p.description} — not lip-sync safe`,
                });
              }}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Apply a preset…" /></SelectTrigger>
              <SelectContent>
                {CAMERA_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    <div className="flex flex-col">
                      <span className="flex items-center gap-1">
                        {p.label}
                        {!p.lipSyncSafe && (
                          <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
                        )}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{p.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-primary" /> Lighting + Location
            </Label>
            <Select
              value=""
              onValueChange={(id) => {
                const p = LIGHTING_PRESETS.find((x) => x.id === id);
                if (!p) return;
                set(p.patch);
                toast.success(`Lighting preset: ${p.label}`, { description: p.description });
              }}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Apply a preset…" /></SelectTrigger>
              <SelectContent>
                {LIGHTING_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    <div className="flex flex-col">
                      <span>{p.label}</span>
                      <span className="text-[10px] text-muted-foreground">{p.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <DirectorSelect label="Shot Size" value={cam.shotSize} options={SHOT_SIZES} onChange={(v) => setCam({ shotSize: v })} />
            <LipSyncHint kind="shotSize" value={cam.shotSize} isARoll={safetyChecks.isARoll} />
          </div>
          <DirectorSelect label="Lens" value={cam.lens} options={LENSES} onChange={(v) => setCam({ lens: v })} />
          <div className="space-y-1">
            <DirectorSelect label="Height" value={cam.cameraHeight} options={HEIGHTS} onChange={(v) => setCam({ cameraHeight: v })} />
            <LipSyncHint kind="cameraHeight" value={cam.cameraHeight} isARoll={safetyChecks.isARoll} />
          </div>
          <div className="space-y-1">
            <DirectorSelect label="Movement" value={cam.movement} options={MOVEMENTS} onChange={(v) => setCam({ movement: v })} />
            <LipSyncHint kind="movement" value={cam.movement} isARoll={safetyChecks.isARoll} />
          </div>
          <DirectorSelect label="Depth of Field" value={cam.depthOfField} options={DOFS} onChange={(v) => setCam({ depthOfField: v })} />
          <DirectorSelect label="Lighting" value={s.lighting_direction} options={LIGHTING} onChange={(v) => set({ lighting_direction: v })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Location</Label>
            <Input
              value={s.scene_location || ""}
              onChange={(e) => set({ scene_location: e.target.value })}
              placeholder="e.g. dark underground studio at night"
              className="h-8 text-xs"
            />
          </div>
          <DirectorSelect label="VFX Level" value={s.vfx_level} options={VFX_LEVELS} onChange={(v) => set({ vfx_level: v })} />
        </div>
      </div>


      {/* Lip-Sync Safety */}
      <div className="space-y-2 border-t border-border/40 pt-3">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className={`h-3.5 w-3.5 ${safetyChecks.warnings.length ? "text-destructive" : "text-emerald-500"}`} />
          <span className="text-xs font-medium text-foreground/90">Lip-Sync Safety</span>
          {safetyChecks.isARoll ? (
            safetyChecks.warnings.length === 0 ? (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/40 text-emerald-500">Ready</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-destructive/50 text-destructive">
                {safetyChecks.warnings.length} issue{safetyChecks.warnings.length === 1 ? "" : "s"}
              </Badge>
            )
          ) : (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/60 text-muted-foreground">N/A · B-Roll</Badge>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <SafetyCheck id={`mc-${i}`} label="Mouth clear" checked={safetyChecks.mouthClear} onChange={(v) => setSafety({ mouth_clear: v })} />
          <SafetyCheck id={`fc-${i}`} label="Face clear" checked={safetyChecks.faceClear} onChange={(v) => setSafety({ face_clear: v })} />
          <SafetyCheck id={`mh-${i}`} label="Minimal head motion" checked={safetyChecks.minimalHead} disabled />
          <SafetyCheck id={`no-${i}`} label="No obstruction" checked={safetyChecks.noObstruction} onChange={(v) => setSafety({ no_obstruction: v })} />
          <SafetyCheck id={`sm-${i}`} label="Safe camera move" checked={safetyChecks.safeMovement} disabled />
          <SafetyCheck id={`sa-${i}`} label="Safe angle" checked={safetyChecks.safeAngle} disabled />
        </div>
        {safetyChecks.isARoll && safetyChecks.warnings.length > 0 && (
          <ul className="space-y-1 pt-1">
            {safetyChecks.warnings.map((w, idx) => (
              <li key={idx} className="flex items-start gap-1.5 text-[10px] text-destructive">
                <AlertTriangle className="h-3 w-3 mt-px shrink-0" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Per-scene re-run footer — always visible when parent supplied callback */}
      {onRerunScene && (() => {
        const overrideCount = Object.keys(perf).length + Object.keys(cam).length;
        const hasOverrides = overrideCount > 0;
        const blockedByLipSync = safetyChecks.isARoll && safetyChecks.warnings.length > 0;
        return (
        <div className="border-t border-border/40 pt-3 flex items-center justify-between gap-2 sticky bottom-0 bg-primary/5 -mx-3 px-3 pb-1">
          <span className="text-[10px] text-muted-foreground">
            {hasOverrides
              ? `${overrideCount} override${overrideCount === 1 ? "" : "s"} pending — re-run this scene to apply.`
              : "Re-run only this scene with the current settings."}
          </span>
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => onRerunScene(i)}
            disabled={isRegenerating || blockedByLipSync}
            title={blockedByLipSync ? `Resolve ${safetyChecks.warnings.length} lip-sync issue(s) first` : undefined}
          >
            {isRegenerating ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Re-running…
              </>
            ) : (
              <>
                <Wand2 className="h-3 w-3" />
                Apply &amp; re-run scene
              </>
            )}
          </Button>
        </div>
        );
      })()}
    </div>
  );
}


function DirectorSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o} className="text-xs">
              {labelize(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SafetyCheck({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex items-center gap-1.5 text-[11px] ${disabled ? "text-muted-foreground/70" : "text-foreground/80 cursor-pointer"}`}
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onChange?.(v === true)}
        className="h-3.5 w-3.5"
      />
      <span>{label}</span>
    </label>
  );
}

/**
 * Inline hint under safety-relevant Director fields explaining why the
 * current value passes/fails evaluateLipSyncReadiness for A-Roll.
 * Hidden entirely for B-Roll (no lip-sync required).
 */
type LipSyncHintKind = "headMotion" | "shotSize" | "cameraHeight" | "movement";

const LIP_SYNC_HINT_META: Record<
  LipSyncHintKind,
  { safeSet: Set<string>; okText: string; failText: (v: string) => string; fix: string }
> = {
  headMotion: {
    safeSet: SAFE_HEAD_MOTIONS,
    okText: "Stays within lip-sync tolerance.",
    failText: (v) => `"${v.replace(/_/g, " ")}" moves the mouth too much.`,
    fix: "Use minimal or subtle nods.",
  },
  shotSize: {
    safeSet: SAFE_SHOT_SIZES,
    okText: "Face large enough in frame for accurate lip-sync.",
    failText: (v) => `"${v.replace(/_/g, " ")}" may crop the face out of frame.`,
    fix: "Use closeup, medium closeup, or extreme closeup.",
  },
  cameraHeight: {
    safeSet: SAFE_CAMERA_HEIGHTS,
    okText: "Front-facing angle keeps the mouth readable.",
    failText: (v) => `"${v.replace(/_/g, " ")}" reduces lip-sync accuracy.`,
    fix: "Use eye level.",
  },
  movement: {
    safeSet: SAFE_MOVEMENTS,
    okText: "Camera movement keeps the mouth steady.",
    failText: (v) => `"${v.replace(/_/g, " ")}" may cause mouth drift.`,
    fix: "Use locked off, slow push in, or slow pull back.",
  },
};

function LipSyncHint({
  kind,
  value,
  isARoll,
}: {
  kind: LipSyncHintKind;
  value: string | undefined;
  isARoll: boolean;
}) {
  if (!isARoll) return null;
  const meta = LIP_SYNC_HINT_META[kind];
  // Empty = auto-generated, treated as safe by evaluateLipSyncReadiness.
  const safe = !value || meta.safeSet.has(value);
  if (safe) {
    return (
      <p className="flex items-start gap-1 text-[10px] text-emerald-500/90 leading-tight">
        <ShieldCheck className="h-2.5 w-2.5 mt-0.5 shrink-0" />
        <span>Lip-sync safe — {meta.okText}</span>
      </p>
    );
  }
  return (
    <p className="flex items-start gap-1 text-[10px] text-amber-500 leading-tight">
      <AlertTriangle className="h-2.5 w-2.5 mt-0.5 shrink-0" />
      <span>
        {meta.failText(value!)} <span className="text-muted-foreground">Fix: {meta.fix}</span>
      </span>
    </p>
  );
}

/* ---------- Preset diff helper ----------
 * Diffs a preset patch against the current scene at leaf-field granularity.
 * Nested Director objects (performance_direction, camera_direction) are
 * expanded so users see per-key changes, not just "object replaced". */
type DiffRow = {
  path: string;
  kind: "added" | "changed" | "unchanged";
  beforeStr: string;
  afterStr: string;
};

const fmt = (v: unknown): string => {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.replace(/_/g, " ");
  return JSON.stringify(v);
};

function buildPresetDiff(scene: any, patch: Record<string, any>): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const key of Object.keys(patch)) {
    const nextVal = patch[key];
    const prevVal = scene?.[key];
    // Expand nested objects one level (performance_direction, camera_direction, lip_sync_safety)
    if (
      nextVal && typeof nextVal === "object" && !Array.isArray(nextVal) &&
      (prevVal === undefined || (typeof prevVal === "object" && !Array.isArray(prevVal)))
    ) {
      const prevObj = (prevVal as Record<string, any>) || {};
      const nextKeys = Object.keys(nextVal);
      if (nextKeys.length === 0) {
        // Empty object = reset — flag as changed if prev had anything
        const prevKeys = Object.keys(prevObj);
        if (prevKeys.length > 0) {
          rows.push({
            path: `${key} (reset)`,
            kind: "changed",
            beforeStr: `${prevKeys.length} field${prevKeys.length === 1 ? "" : "s"}`,
            afterStr: "cleared",
          });
        }
        continue;
      }
      for (const subKey of nextKeys) {
        const before = prevObj[subKey];
        const after = nextVal[subKey];
        const beforeStr = fmt(before);
        const afterStr = fmt(after);
        const kind: DiffRow["kind"] = before === undefined || before === null || before === ""
          ? "added"
          : JSON.stringify(before) === JSON.stringify(after)
          ? "unchanged"
          : "changed";
        rows.push({ path: `${key}.${subKey}`, kind, beforeStr, afterStr });
      }
      continue;
    }
    const beforeStr = fmt(prevVal);
    const afterStr = fmt(nextVal);
    const kind: DiffRow["kind"] = prevVal === undefined || prevVal === null || prevVal === ""
      ? "added"
      : JSON.stringify(prevVal) === JSON.stringify(nextVal)
      ? "unchanged"
      : "changed";
    rows.push({ path: key, kind, beforeStr, afterStr });
  }
  // Sort: changed first, then added, then unchanged (each alpha)
  const order = { changed: 0, added: 1, unchanged: 2 } as const;
  return rows.sort((a, b) => order[a.kind] - order[b.kind] || a.path.localeCompare(b.path));
}
