import { motion } from "framer-motion";
import { Sparkles, RotateCcw, Loader2, Lock, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface InstructionEditorProps {
  instructions: string;
  onInstructionsChange: (instructions: string) => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  isGenerating: boolean;
  hasGenerated: boolean;
  /** When true, render only the textarea (used when Generate lives in a sticky footer). */
  textareaOnly?: boolean;
  /** Short label for what regenerate will rebuild (e.g. "poster", "video"). */
  regenerateLabel?: string;
  /** When false, the Generate button shows a "Sign in to generate" state. */
  isAuthenticated?: boolean;
  /** When true, keep the Generate button disabled without entering cancel mode. */
  isBlocked?: boolean;
  /** When provided AND isGenerating is true, the Generate button toggles to a
   *  Cancel button (with confirm dialog) that fires onCancel. */
  onCancel?: () => void;
}

const InstructionEditor = ({
  instructions,
  onInstructionsChange,
  onGenerate,
  onRegenerate,
  isGenerating,
  hasGenerated,
  textareaOnly = false,
  regenerateLabel,
  onCancel,
}: InstructionEditorProps) => {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 focus-within:ring-primary/50 p-3 transition-all">
        <textarea
          value={instructions}
          onChange={(e) => onInstructionsChange(e.target.value)}
          placeholder="Describe the creative direction, audience, mood, colours, text, and platform."
          rows={4}
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none resize-none leading-relaxed"
        />
        <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/[0.05]">
          <span className="text-[10.5px] text-muted-foreground">
            Tip: leave blank to auto-generate from your uploads & style.
          </span>
          <span className="text-[10.5px] text-muted-foreground tabular-nums">
            {instructions.length}
          </span>
        </div>
      </div>

      {!textareaOnly && (
        <GenerateActions
          onGenerate={onGenerate}
          onRegenerate={onRegenerate}
          isGenerating={isGenerating}
          hasGenerated={hasGenerated}
          regenerateLabel={regenerateLabel}
          isBlocked={false}
          onCancel={onCancel}
        />
      )}
    </div>
  );
};

export const GenerateActions = ({
  onGenerate,
  onRegenerate,
  isGenerating,
  hasGenerated,
  regenerateLabel,
  isAuthenticated = true,
  isBlocked = false,
  onCancel,
}: Pick<InstructionEditorProps, "onGenerate" | "onRegenerate" | "isGenerating" | "hasGenerated" | "regenerateLabel" | "isAuthenticated" | "isBlocked" | "onCancel">) => {
  const signedOut = !isAuthenticated;
  const blocked = isBlocked && !signedOut;
  // While generating, if a cancel handler is wired, swap the primary action
  // to a Cancel button so the user has a single, obvious stop control right
  // where they pressed Generate.
  const cancelMode = isGenerating && !!onCancel && !signedOut && !blocked;

  const primaryButton = (
    <motion.button
      id="generate-creative-button"
      whileHover={signedOut ? undefined : { y: -1 }}
      whileTap={signedOut ? undefined : { scale: 0.98 }}
      onClick={cancelMode ? undefined : () => onGenerate()}
      // In cancel mode the AlertDialogTrigger owns the click; keep the button
      // enabled so the trigger can fire. Otherwise disable while generating.
      disabled={signedOut ? false : (blocked || (isGenerating && !cancelMode))}
      aria-disabled={signedOut || blocked || (isGenerating && !cancelMode)}
      title={signedOut ? "Sign in to generate creatives" : blocked ? "Add source material before generating" : cancelMode ? "Cancel this generation run" : undefined}
      className={
        signedOut
          ? "group relative flex-1 overflow-hidden rounded-xl bg-white/[0.04] ring-1 ring-white/10 text-muted-foreground font-display font-semibold text-sm py-3.5 px-6 flex items-center justify-center gap-2 cursor-pointer hover:bg-white/[0.07] hover:text-foreground transition-colors"
          : cancelMode
            ? "group relative flex-1 overflow-hidden rounded-xl bg-amber-500/15 ring-1 ring-amber-400/50 text-amber-100 font-display font-semibold text-sm py-3.5 px-6 flex items-center justify-center gap-2 cursor-pointer hover:bg-amber-500/25 hover:text-foreground transition-colors"
            : "group relative flex-1 overflow-hidden rounded-xl studio-gradient-bg text-primary-foreground font-display font-semibold text-sm py-3.5 px-6 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.6)] hover:shadow-[0_14px_38px_-10px_hsl(var(--primary)/0.85)] transition-shadow"
      }
    >
      {!signedOut && !cancelMode && (
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
      )}
      {signedOut ? (
        <Lock className="w-4 h-4 relative" />
      ) : cancelMode ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin relative opacity-70" />
          <X className="w-4 h-4 relative -ml-1" />
        </>
      ) : isGenerating ? (
        <Loader2 className="w-4 h-4 animate-spin relative" />
      ) : (
        <Sparkles className="w-4 h-4 relative" />
      )}
      <span className="relative">
        {signedOut
          ? "Sign in to generate"
          : cancelMode
            ? "Cancel generating"
            : blocked
              ? "Add source material"
            : isGenerating
              ? "Generating…"
              : "Generate Creative"}
      </span>
    </motion.button>
  );

  return (
  <div className="flex gap-2">
    {cancelMode ? (
      <AlertDialog>
        <AlertDialogTrigger asChild>{primaryButton}</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this generation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop every in-flight request immediately. Any progress on
              variants that haven't finished yet will be lost — completed steps
              stay visible. You can always start a new run.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep generating</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onCancel?.()}
              className="bg-amber-500 text-amber-950 hover:bg-amber-400 focus-visible:ring-amber-400"
            >
              Yes, cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ) : (
      primaryButton
    )}

    {hasGenerated && !signedOut && !cancelMode && (
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => onRegenerate()}
        disabled={isGenerating}
        className="rounded-xl bg-white/[0.04] ring-1 ring-white/10 hover:bg-white/[0.08] px-4 py-3.5 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 cursor-pointer"
        title={regenerateLabel ? `Regenerate ${regenerateLabel} only` : "Regenerate"}
      >
        <RotateCcw className="w-4 h-4" />
        {regenerateLabel && (
          <span className="hidden sm:inline text-xs">Redo {regenerateLabel}</span>
        )}
      </motion.button>
    )}
  </div>
  );
};

export default InstructionEditor;
