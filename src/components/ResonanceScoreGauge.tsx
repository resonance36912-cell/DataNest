import { m as motion } from "@/lib/lazy-motion";
import { getScoreColor, getScoreLabel, type ResonanceResult } from "@/utils/youtubeAnalytics";

interface ResonanceScoreGaugeProps {
  result: ResonanceResult;
}

const ResonanceScoreGauge = ({ result }: ResonanceScoreGaugeProps) => {
  const { score, mode, breakdown } = result;
  const color = getScoreColor(score);
  const label = getScoreLabel(score);

  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center gap-6"
    >
      {/* Circular Gauge */}
      <div className="relative w-40 h-40">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          {/* Background track */}
          <circle
            cx="60" cy="60" r="54"
            stroke="hsl(260, 16%, 14%)"
            strokeWidth="8"
            fill="none"
          />
          {/* Score arc */}
          <motion.circle
            cx="60" cy="60" r="54"
            stroke={color}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
            style={{ filter: `drop-shadow(0 0 8px ${color})` }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="font-display font-bold text-4xl"
            style={{ color }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {score}
          </motion.span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
            / 100
          </span>
        </div>
      </div>

      {/* Label */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="text-center space-y-1"
      >
        <p className="font-display font-bold text-lg" style={{ color }}>{label}</p>
        <p className="text-xs text-muted-foreground">
          {mode === "creator" ? "True Resonance Score" : "Estimated Resonance Score"}
        </p>
      </motion.div>

      {/* Breakdown bars */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="w-full max-w-xs space-y-3"
      >
        <BreakdownBar label="Engagement" value={breakdown.engagement} color="hsl(var(--accent))" />
        {breakdown.retention != null && (
          <BreakdownBar label="Retention" value={breakdown.retention} color="hsl(var(--primary))" />
        )}
        {breakdown.shares != null && (
          <BreakdownBar label="Shares" value={breakdown.shares} color="hsl(var(--resonance-gold))" />
        )}
      </motion.div>
    </motion.div>
  );
};

const BreakdownBar = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-display font-semibold" style={{ color }}>{value}</span>
    </div>
    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 1 }}
      />
    </div>
  </div>
);

export default ResonanceScoreGauge;
