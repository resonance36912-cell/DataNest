import { m as motion } from "@/lib/lazy-motion";
import { Eye, Shield, Sparkles } from "lucide-react";

interface ModeBannerProps {
  mode: "guest" | "creator";
}

const ModeBanner = ({ mode }: ModeBannerProps) => {
  if (mode === "creator") {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2"
      >
        <Shield className="h-4 w-4 text-primary" />
        <span className="text-xs font-display font-semibold text-primary">Creator Mode Active</span>
        <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-full px-4 py-2"
    >
      <Eye className="h-4 w-4 text-accent" />
      <span className="text-xs font-display font-semibold text-accent">Guest Mode</span>
      <span className="text-[10px] text-muted-foreground ml-1">— Sign in for full analytics</span>
    </motion.div>
  );
};

export default ModeBanner;
