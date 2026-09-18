import { useMemo } from "react";
import { Info } from "lucide-react";
import { getAuthEnvironment } from "@/lib/auth-environment";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Shows which environment (and backend project) the current build authenticates
 * against, so a sign-in failure caused by an environment mismatch is obvious.
 */
export default function AuthEnvironmentBadge({ className = "" }: { className?: string }) {
  const env = useMemo(() => getAuthEnvironment(), []);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid="auth-env-badge"
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-wide ${
              env.isNonProduction
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-primary/30 bg-primary/10 text-primary"
            } ${className}`}
          >
            <Info className="h-3 w-3" aria-hidden="true" />
            <span>{env.label} environment</span>
            <span className="font-mono opacity-70">{env.projectRef.slice(0, 6)}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          <p className="font-medium">Auth backend: {env.projectRef}</p>
          <p className="mt-1 opacity-80">Host: {env.host || "unknown"}</p>
          {env.isNonProduction && (
            <p className="mt-1 opacity-80">
              Accounts here are separate from the live site — sign in on syncvision.life for your live account.
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
