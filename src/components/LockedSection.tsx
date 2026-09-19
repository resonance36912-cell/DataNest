import { m as motion } from "@/lib/lazy-motion";
import { Lock, Image, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "@/lib/router-compat";

interface LockedSectionProps {
  title: string;
  description: string;
  showThumbnailHint?: boolean;
}

const LockedSection = ({ title, description, showThumbnailHint = false }: LockedSectionProps) => {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl border border-border/40 bg-card/30 backdrop-blur-xl"
    >
      <div className="p-8 filter blur-[6px] pointer-events-none select-none opacity-50 space-y-3">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <div className="grid gap-3 sm:grid-cols-3 pt-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/70 backdrop-blur-xs p-6 text-center">
        <div className="w-14 h-14 rounded-2xl border border-primary/25 bg-primary/10 flex items-center justify-center mb-4">
          <Lock className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <h3 className="font-display font-bold text-xl mb-2">{title}</h3>
        <p className="text-muted-foreground text-sm max-w-md mb-4">{description}</p>

        {showThumbnailHint && (
          <div className="flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-full px-4 py-2 mb-4">
            <Image className="h-4 w-4 text-accent" aria-hidden="true" />
            <span className="text-xs text-accent font-medium">AI Thumbnail Optimization included</span>
            <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          </div>
        )}

        <Button variant="pill" size="pillLg" className="gap-2" onClick={() => navigate("/login")}>
          Sign in for free access <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </motion.div>
  );
};

export default LockedSection;
