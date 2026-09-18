/**
 * EmptyStatePanel — Shown when no scenes exist yet.
 * Prompts the user to generate their first scene.
 */

import { Film, Lock, Unlock, Sparkles, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface EmptyStatePanelProps {
  generating: boolean;
  verification: unknown;
  lockSetting: boolean;
  setLockSetting: (b: boolean) => void;
  lockSettingLocation: string;
  setLockSettingLocation: (s: string) => void;
  onGenerate: () => void;
  onReanalyze?: () => void;
  reanalyzing?: boolean;
  /** External block (e.g. invalid Track Details) — disables the
   *  Generate button and surfaces `disableGenerateReason` inline. */
  disableGenerate?: boolean;
  disableGenerateReason?: string;
}

export default function EmptyStatePanel({
  generating,
  verification,
  lockSetting,
  setLockSetting,
  lockSettingLocation,
  setLockSettingLocation,
  onGenerate,
  onReanalyze,
  reanalyzing,
  disableGenerate,
  disableGenerateReason,
}: EmptyStatePanelProps) {
  if (generating) {
    return (
      <div className="glass-card p-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p>Generating your scene...</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-12 flex flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Film className="h-8 w-8" />
      </div>
      <h3 className="text-lg font-semibold">No scene yet</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        Click below to generate your performance scene from the song analysis and character.
      </p>

      {/* Lock Setting Toggle */}
      <div className="flex flex-col items-center gap-2 w-full max-w-md">
        <button
          onClick={() => setLockSetting(!lockSetting)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all w-full justify-center text-sm ${
            lockSetting
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40"
          }`}
        >
          {lockSetting ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          {lockSetting ? "Same Setting for All Scenes" : "Different Setting per Scene"}
        </button>
        {lockSetting && (
          <Input
            placeholder="Location (optional, e.g. 'neon-lit rooftop')"
            value={lockSettingLocation}
            onChange={(e) => setLockSettingLocation(e.target.value)}
            className="text-sm"
          />
        )}
        <p className="text-[11px] text-muted-foreground">
          {lockSetting
            ? "Character stays in one location — only singing, movement & expression change per scene"
            : "Each scene gets a unique location while keeping the same character"}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={onGenerate}
          disabled={generating || !verification || !!disableGenerate}
          title={disableGenerateReason}
          aria-disabled={generating || !verification || !!disableGenerate}
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Sparkles className="h-4 w-4" /> Generate Scene
        </Button>

        {!verification && onReanalyze && (
          <Button
            variant="outline"
            onClick={onReanalyze}
            disabled={reanalyzing}
            className="gap-2 border-border text-foreground hover:bg-secondary"
          >
            {reanalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Re-analyze
          </Button>
        )}
      </div>

      {disableGenerate && disableGenerateReason && (
        <p className="text-xs text-destructive" role="alert">{disableGenerateReason}</p>
      )}

      {!verification && (
        <p className="text-xs text-amber-400">
          Analysis data not loaded. Click "Re-analyze" to restore verification from your saved transcription.
        </p>
      )}
    </div>
  );
}
