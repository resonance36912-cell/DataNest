import { m as motion } from "@/lib/lazy-motion";
import { Info, Eye, Shield, AlertTriangle } from "lucide-react";
import type { ResonanceResult } from "@/utils/youtubeAnalytics";

interface DataTransparencyCardProps {
  result: ResonanceResult;
}

const DataTransparencyCard = ({ result }: DataTransparencyCardProps) => {
  const { mode, fallback, fallbackReason } = result;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1 }}
      className="rounded-2xl border border-border/40 bg-card/40 backdrop-blur-xl p-5 space-y-4"
    >
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-primary" />
        <h4 className="font-display font-semibold text-sm">Data Transparency</h4>
      </div>

      {fallback && fallbackReason && (
        <div className="flex items-start gap-2 bg-warning/10 border border-warning/20 rounded-xl px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-warning">{fallbackReason}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className={`rounded-xl p-4 border ${mode === "guest" ? "border-accent/30 bg-accent/5" : "border-border/30 bg-secondary/20"}`}>
          <div className="flex items-center gap-2 mb-2">
            <Eye className="h-4 w-4 text-accent" />
            <span className="font-display font-semibold text-xs">Guest Mode</span>
            {mode === "guest" && (
              <span className="text-[9px] font-bold bg-accent/20 text-accent rounded-full px-2 py-0.5 uppercase tracking-wider">Active</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Estimated Score using public engagement data only (views, likes, comments). Good for quick evaluation.
          </p>
        </div>

        <div className={`rounded-xl p-4 border ${mode === "creator" ? "border-primary/30 bg-primary/5" : "border-border/30 bg-secondary/20"}`}>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="font-display font-semibold text-xs">Creator Mode</span>
            {mode === "creator" && (
              <span className="text-[9px] font-bold bg-primary/20 text-primary rounded-full px-2 py-0.5 uppercase tracking-wider">Active</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            True Resonance using retention, shares, and engagement. Requires Google sign-in with YouTube Analytics access.
          </p>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        {mode === "creator"
          ? "Your score reflects real audience behavior data — 45% retention, 30% engagement, 25% shares."
          : "Sign in with Google to unlock Creator Mode and get your True Resonance Score."}
      </p>
    </motion.div>
  );
};

export default DataTransparencyCard;
