import { motion } from "framer-motion";
import { Sparkles, Wand2 } from "lucide-react";
import { buildAutoHintPrompt, getPresetsForType, type AutoHintSource, type PromptPreset } from "@/lib/promptPresets";

interface PromptPresetsProps {
  contentType: string;
  style?: string;
  currentInstructions: string;
  sourceBrief?: AutoHintSource | null;
  onApply: (next: string) => void;
}

const PromptPresets = ({ contentType, style = "professional", currentInstructions, sourceBrief, onApply }: PromptPresetsProps) => {
  const presets = getPresetsForType(contentType);
  const showAutoHint = sourceBrief && !currentInstructions.trim();

  const applyPrompt = (prompt: string) => {
    const trimmed = currentInstructions.trim();
    // If empty, just insert. Otherwise append on a new line so users can stack.
    const next = trimmed ? `${trimmed}\n\n${prompt}` : prompt;
    onApply(next);
  };

  const handleClick = (preset: PromptPreset) => applyPrompt(preset.prompt);

  if (!presets.length) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Wand2 className="w-3 h-3 text-primary/80" />
        <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-foreground/60">
          Prompt presets
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {showAutoHint && (
          <motion.button
            key="auto-hint"
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => applyPrompt(buildAutoHintPrompt(sourceBrief, contentType, style))}
            title="Build a starter brief from the source details we could read"
            className="text-[11px] px-2.5 py-1 rounded-full bg-primary/15 ring-1 ring-primary/35 text-primary hover:text-primary-foreground hover:bg-primary/80 transition-colors cursor-pointer inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3 h-3" />
            Auto hint
          </motion.button>
        )}
        {presets.map((p) => (
          <motion.button
            key={p.id}
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => handleClick(p)}
            title={p.hint ? `${p.hint} — click to insert` : "Click to insert"}
            className="text-[11px] px-2.5 py-1 rounded-full bg-white/[0.04] ring-1 ring-white/10 text-foreground/80 hover:text-foreground hover:bg-white/[0.08] hover:ring-primary/40 transition-colors cursor-pointer"
          >
            {p.label}
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default PromptPresets;
