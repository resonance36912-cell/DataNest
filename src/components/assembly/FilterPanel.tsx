import { Slider } from "@/components/ui/slider";
import { Palette } from "lucide-react";

export type FilterType = "none" | "warm" | "cool" | "vintage" | "bw" | "cinematic" | "dramatic" | "pastel";

export interface FilterConfig {
  type: FilterType;
  intensity: number;
  scope: "global" | "per-scene";
}

const FILTER_OPTIONS: { value: FilterType; label: string; preview: string }[] = [
  { value: "none", label: "None", preview: "bg-card" },
  { value: "warm", label: "Warm", preview: "bg-gradient-to-br from-orange-400/30 to-yellow-300/20" },
  { value: "cool", label: "Cool", preview: "bg-gradient-to-br from-blue-400/30 to-cyan-300/20" },
  { value: "vintage", label: "Vintage", preview: "bg-gradient-to-br from-amber-600/30 to-orange-200/20" },
  { value: "bw", label: "B&W", preview: "bg-gradient-to-br from-gray-600/40 to-gray-300/20" },
  { value: "cinematic", label: "Cinematic", preview: "bg-gradient-to-br from-indigo-500/30 to-orange-400/20" },
  { value: "dramatic", label: "Dramatic", preview: "bg-gradient-to-br from-red-600/30 to-gray-900/30" },
  { value: "pastel", label: "Pastel", preview: "bg-gradient-to-br from-pink-300/30 to-purple-200/20" },
];

interface FilterPanelProps {
  filter: FilterConfig;
  onChange: (filter: FilterConfig) => void;
}

export default function FilterPanel({ filter, onChange }: FilterPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Palette className="h-4 w-4" /> Filters & Effects
        </h3>
        <div className="flex gap-1">
          {(["global", "per-scene"] as const).map((scope) => (
            <button
              key={scope}
              onClick={() => onChange({ ...filter, scope })}
              className={`px-2 py-0.5 rounded text-[10px] capitalize transition-all ${
                filter.scope === scope
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              {scope === "per-scene" ? "Per Scene" : "Global"}
            </button>
          ))}
        </div>
      </div>

      {/* Filter grid */}
      <div className="grid grid-cols-4 gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange({ ...filter, type: opt.value })}
            className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-video ${
              filter.type === opt.value
                ? "border-primary shadow-md shadow-primary/20"
                : "border-border/30 hover:border-primary/40"
            }`}
          >
            <div className={`absolute inset-0 ${opt.preview}`} />
            <span className="relative text-[10px] font-medium text-foreground/80">{opt.label}</span>
          </button>
        ))}
      </div>

      {/* Intensity */}
      {filter.type !== "none" && (
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground w-16">Intensity</label>
          <Slider
            value={[filter.intensity]}
            min={10}
            max={100}
            step={5}
            onValueChange={([v]) => onChange({ ...filter, intensity: v })}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground w-8">{filter.intensity}%</span>
        </div>
      )}
    </div>
  );
}
