import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { FREE_PROMOTION } from "@/lib/promotion";

export function PlanStatusBanner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="plan-status-banner"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm",
        className,
      )}
    >
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div>
        <div className="font-medium text-foreground">Full promotional access</div>
        <p className="mt-1 text-xs text-muted-foreground">
          {FREE_PROMOTION.description} Provider jobs still follow normal approval and safety controls.
        </p>
      </div>
    </div>
  );
}
