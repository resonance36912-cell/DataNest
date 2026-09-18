import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Music, Volume2 } from "lucide-react";

export type EqPreset = "flat" | "bass-boost" | "vocal-clarity" | "treble-boost" | "warm" | "lo-fi" | "concert" | "podcast";

export interface AudioEnhancementConfig {
  normalization: boolean;
  targetLufs: number;
  eqPreset: EqPreset;
  masterVolume: number;
}

const EQ_PRESETS: { value: EqPreset; label: string; desc: string; icon: string }[] = [
  { value: "flat", label: "Flat", desc: "No EQ changes", icon: "➖" },
  { value: "bass-boost", label: "Bass Boost", desc: "Enhanced low-end punch", icon: "🔊" },
  { value: "vocal-clarity", label: "Vocal Clarity", desc: "Boost mids for clearer vocals", icon: "🎤" },
  { value: "treble-boost", label: "Treble Boost", desc: "Crisp highs and sparkle", icon: "✨" },
  { value: "warm", label: "Warm", desc: "Soft, warm analog feel", icon: "🔥" },
  { value: "lo-fi", label: "Lo-Fi", desc: "Muffled, vintage character", icon: "📻" },
  { value: "concert", label: "Concert", desc: "Wide, immersive stage sound", icon: "🎶" },
  { value: "podcast", label: "Podcast", desc: "Speech-optimized with de-ess", icon: "🎙️" },
];

// Simple visual EQ bars per preset (5-band: sub, bass, mid, treble, air)
const EQ_CURVES: Record<EqPreset, number[]> = {
  "flat":          [50, 50, 50, 50, 50],
  "bass-boost":   [85, 75, 45, 40, 35],
  "vocal-clarity": [35, 40, 75, 65, 50],
  "treble-boost": [35, 40, 50, 75, 85],
  "warm":         [70, 65, 55, 40, 35],
  "lo-fi":        [60, 55, 40, 30, 20],
  "concert":      [65, 55, 50, 60, 70],
  "podcast":      [30, 40, 70, 60, 45],
};

const BAND_LABELS = ["Sub", "Bass", "Mid", "Treble", "Air"];

interface AudioEnhancementPanelProps {
  config: AudioEnhancementConfig;
  onChange: (config: AudioEnhancementConfig) => void;
}

export default function AudioEnhancementPanel({ config, onChange }: AudioEnhancementPanelProps) {
  const currentCurve = EQ_CURVES[config.eqPreset];

  return (
    <div className="space-y-4">
      {/* Normalization */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Volume2 className="h-4 w-4" /> Audio Normalization
          </h3>
          <Switch
            checked={config.normalization}
            onCheckedChange={(v) => onChange({ ...config, normalization: v })}
          />
        </div>
        {config.normalization && (
          <div className="flex items-center gap-3 pl-1">
            <label className="text-xs text-muted-foreground w-20">Target LUFS</label>
            <Slider
              value={[config.targetLufs]}
              min={-24}
              max={-6}
              step={1}
              onValueChange={([v]) => onChange({ ...config, targetLufs: v })}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground w-12 text-right">{config.targetLufs} dB</span>
          </div>
        )}
      </div>

      {/* Master Volume */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-muted-foreground w-20">Master Vol</label>
        <Slider
          value={[config.masterVolume]}
          min={0}
          max={150}
          step={5}
          onValueChange={([v]) => onChange({ ...config, masterVolume: v })}
          className="flex-1"
        />
        <span className="text-xs text-muted-foreground w-10 text-right">{config.masterVolume}%</span>
      </div>

      {/* EQ Presets */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Music className="h-4 w-4" /> Equalizer Preset
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          {EQ_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => onChange({ ...config, eqPreset: preset.value })}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all border ${
                config.eqPreset === preset.value
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border/30 bg-card hover:border-primary/40 hover:bg-card/80"
              }`}
            >
              <span className="text-base">{preset.icon}</span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{preset.label}</p>
                <p className="text-[9px] text-muted-foreground truncate">{preset.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Visual EQ curve */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">EQ Curve</span>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
            {EQ_PRESETS.find((p) => p.value === config.eqPreset)?.label}
          </Badge>
        </div>
        <div className="flex items-end gap-1.5 h-16 px-2">
          {currentCurve.map((level, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full bg-secondary rounded-t-sm overflow-hidden relative" style={{ height: "48px" }}>
                <div
                  className="absolute bottom-0 w-full rounded-t-sm bg-primary/60 transition-all duration-300"
                  style={{ height: `${level}%` }}
                />
              </div>
              <span className="text-[8px] text-muted-foreground">{BAND_LABELS[idx]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
