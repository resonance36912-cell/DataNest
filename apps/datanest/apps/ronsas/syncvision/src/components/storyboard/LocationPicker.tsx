/**
 * LocationPicker — Location selector chips with custom input for storyboard scenes.
 */

import { Input } from "@/components/ui/input";

const LOCATION_OPTIONS = [
  { value: "auto", label: "🎵 Auto" },
  { value: "beach", label: "🏖️ Beach" },
  { value: "city-streets", label: "🌆 City Streets" },
  { value: "rooftop", label: "🏙️ Rooftop" },
  { value: "studio", label: "🎬 Studio" },
  { value: "office", label: "🏢 Office" },
  { value: "mountain", label: "⛰️ Mountain" },
  { value: "forest", label: "🌲 Forest" },
  { value: "desert", label: "🏜️ Desert" },
  { value: "club", label: "🪩 Club" },
  { value: "mansion", label: "🏰 Mansion" },
  { value: "underwater", label: "🌊 Underwater" },
  { value: "space", label: "🌌 Space" },
  { value: "church", label: "⛪ Church" },
  { value: "train", label: "🚂 Train" },
];

interface LocationPickerProps {
  sceneLocation: string;
  setSceneLocation: (s: string) => void;
  customLocation: string;
  setCustomLocation: (s: string) => void;
}

export default function LocationPicker({ sceneLocation, setSceneLocation, customLocation, setCustomLocation }: LocationPickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground shrink-0">Location:</span>
      {LOCATION_OPTIONS.map((l) => (
        <button
          key={l.value}
          onClick={() => { setSceneLocation(l.value); setCustomLocation(""); }}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
            sceneLocation === l.value && !customLocation
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
          }`}
        >
          {l.label}
        </button>
      ))}
      <Input
        placeholder="Custom location…"
        value={customLocation}
        onChange={(e) => {
          setCustomLocation(e.target.value);
          if (e.target.value.trim()) setSceneLocation(e.target.value.trim());
          else setSceneLocation("auto");
        }}
        className="h-7 w-44 text-xs rounded-full px-3 bg-secondary border-border placeholder:text-muted-foreground"
      />
    </div>
  );
}
