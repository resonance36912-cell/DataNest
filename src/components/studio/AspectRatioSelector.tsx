import { motion } from "framer-motion";
import { RectangleHorizontal, Square, RectangleVertical, Monitor, Smartphone, FileText } from "lucide-react";

const ratios = [
  { id: "1:1", label: "1:1", icon: Square, description: "Square" },
  { id: "4:5", label: "4:5", icon: Smartphone, description: "Portrait" },
  { id: "9:16", label: "9:16", icon: RectangleVertical, description: "Story / Reel" },
  { id: "16:9", label: "16:9", icon: RectangleHorizontal, description: "Landscape" },
  { id: "21:9", label: "21:9", icon: Monitor, description: "Cinematic" },
  { id: "a4-portrait", label: "A4 ↑", icon: FileText, description: "A4 Portrait" },
  { id: "a4-landscape", label: "A4 →", icon: FileText, description: "A4 Landscape" },
];

interface AspectRatioSelectorProps {
  selected: string;
  onSelect: (ratio: string) => void;
}

const AspectRatioSelector = ({ selected, onSelect }: AspectRatioSelectorProps) => (
  <div className="grid grid-cols-2 gap-2">
    {ratios.map((r) => {
      const isActive = selected === r.id;
      const Icon = r.icon;
      return (
        <motion.button
          key={r.id}
          whileTap={{ scale: 0.97 }}
          onClick={() => onSelect(r.id)}
          className={`relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all cursor-pointer overflow-hidden ${
            isActive
              ? "bg-gradient-to-br from-accent/15 to-primary/15 shadow-[0_0_20px_-8px_hsl(var(--primary)/0.5)]"
              : "bg-white/[0.025] ring-1 ring-white/[0.06] hover:ring-white/15 hover:bg-white/[0.05]"
          }`}
        >
          {isActive && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-xl p-px bg-gradient-to-br from-accent via-primary to-primary-glow opacity-90"
              style={{
                WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                WebkitMaskComposite: "xor",
                maskComposite: "exclude",
              }}
            />
          )}
          <Icon className={`w-4 h-4 shrink-0 relative ${isActive ? "text-primary" : "text-muted-foreground"}`} />
          <div className="flex flex-col items-start min-w-0 relative">
            <span className={`text-xs font-semibold leading-tight ${isActive ? "text-foreground" : "text-foreground/90"}`}>
              {r.label}
            </span>
            <span className="text-[10px] text-muted-foreground leading-tight truncate">{r.description}</span>
          </div>
        </motion.button>
      );
    })}
  </div>
);

export default AspectRatioSelector;
