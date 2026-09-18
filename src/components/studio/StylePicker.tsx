import { motion } from "framer-motion";
import {
  Briefcase, Clapperboard, Palette, FlaskConical,
  Sparkles, Camera, Square as SquareIcon, Radio,
} from "lucide-react";

const styles = [
  { id: "professional", label: "Professional", icon: Briefcase },
  { id: "cinematic", label: "Cinematic", icon: Clapperboard },
  { id: "playful", label: "Playful", icon: Palette },
  { id: "scientific", label: "Scientific", icon: FlaskConical },
  { id: "animated", label: "Animated", icon: Sparkles },
  { id: "realistic", label: "Realistic", icon: Camera },
  { id: "minimalist", label: "Minimalist", icon: SquareIcon },
  { id: "retro", label: "Retro", icon: Radio },
];

interface StylePickerProps {
  selected: string;
  onSelect: (style: string) => void;
}

const StylePicker = ({ selected, onSelect }: StylePickerProps) => {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {styles.map((style) => {
        const isActive = selected === style.id;
        const Icon = style.icon;
        return (
          <motion.button
            key={style.id}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect(style.id)}
            className={`group relative overflow-hidden rounded-xl p-2 text-left transition-all cursor-pointer ${
              isActive
                ? "bg-gradient-to-br from-accent/15 via-primary/10 to-primary-glow/15 shadow-[0_0_24px_-8px_hsl(var(--primary)/0.55)]"
                : "bg-white/[0.025] ring-1 ring-white/[0.06] hover:ring-white/15 hover:bg-white/[0.05]"
            }`}
          >
            {/* Subtle gradient border for selected state */}
            {isActive && (
              <>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-xl p-px bg-gradient-to-br from-accent via-primary to-primary-glow opacity-90"
                  style={{
                    WebkitMask:
                      "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                    WebkitMaskComposite: "xor",
                    maskComposite: "exclude",
                  }}
                />
                <span className="pointer-events-none absolute -inset-px rounded-xl bg-gradient-to-br from-accent/30 via-primary/20 to-primary-glow/30 opacity-50 blur-md -z-10" />
              </>
            )}
            <div className="flex items-center gap-1.5 relative min-w-0">
              <div
                className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                  isActive
                    ? "bg-gradient-to-br from-accent to-primary text-primary-foreground"
                    : "bg-white/[0.05] text-muted-foreground group-hover:text-foreground"
                }`}
              >
                <Icon className="w-3 h-3" />
              </div>
              <span
                className={`text-[10.5px] font-medium leading-tight min-w-0 flex-1 truncate ${
                  isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                }`}
                title={style.label}
              >
                {style.label}
              </span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
};

export default StylePicker;
