import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FREE_PROMOTION } from "@/lib/promotion";

export default function EntitlementLocksPanel() {
  return (
    <div className="glass-card px-4 py-3">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xs font-semibold text-foreground">Generation access</h4>
            <Badge variant="outline" className="h-5 border-emerald-500/40 px-1.5 text-[10px] text-emerald-300">
              all unlocked
            </Badge>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            {FREE_PROMOTION.description} Storyboard video and HD rendering are included; normal provider approval and safety controls still apply.
          </p>
        </div>
      </div>
    </div>
  );
}
