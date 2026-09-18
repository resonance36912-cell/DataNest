import { useCallback, useRef, useState } from "react";
import { Clock, Coins, Cpu } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ProviderEstimate = {
  costGbp: number;
  avgTimeSec: number;
  label: string;
  execution?: "local" | "upstream";
};

/** Conservative estimates used for informed consent, not billing. */
export const PROVIDER_ESTIMATES: Record<string, ProviderEstimate> = {
  "musetalk-local": { costGbp: 0, avgTimeSec: 240, label: "MuseTalk 1.5 Local", execution: "local" },
  "wan-25": { costGbp: 0.25, avgTimeSec: 120, label: "WAN 2.5", execution: "upstream" },
  "sync-3": { costGbp: 0.1, avgTimeSec: 90, label: "Sync Lipsync 1.9", execution: "upstream" },
  "sync-v2": { costGbp: 0.12, avgTimeSec: 120, label: "Sync Lipsync 2.0", execution: "upstream" },
  "sync-so": { costGbp: 0.05, avgTimeSec: 90, label: "SadTalker", execution: "upstream" },
};

const formatProviderCost = (value: number) => `US$${value.toFixed(2)}`;

const formatTime = (seconds: number): string => {
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  return `~${Math.round(seconds / 60)}m`;
};

interface JobEstimateBadgeProps {
  provider: string;
  jobCount?: number;
  className?: string;
}

/** Always-visible estimate so execution location, cost and time are known before a job starts. */
export default function JobEstimateBadge({ provider, jobCount = 1, className = "" }: JobEstimateBadgeProps) {
  const estimate = PROVIDER_ESTIMATES[provider];
  if (!estimate) return null;

  const isLocal = estimate.execution === "local";
  const totalCost = estimate.costGbp * jobCount;
  const totalTime = estimate.avgTimeSec * (jobCount > 1 ? Math.ceil(jobCount * 0.7) : 1);
  const ExecutionIcon = isLocal ? Cpu : Coins;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1.5 text-[10px] text-muted-foreground ${className}`}>
          <ExecutionIcon className="h-3 w-3" />
          <span>{isLocal ? "Local GPU · no provider charge" : `~${formatProviderCost(totalCost)} provider use`}</span>
          <span className="text-border">·</span>
          <Clock className="h-3 w-3" />
          <span>{formatTime(totalTime)}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p className="font-medium">{estimate.label} estimate</p>
        {isLocal ? (
          <>
            <p>Runs on this PC through the R5B localhost bridge.</p>
            <p>No paid AI provider or media upload is used.</p>
          </>
        ) : (
          <p>{formatProviderCost(estimate.costGbp)}/job × {jobCount} = {formatProviderCost(totalCost)} upstream usage</p>
        )}
        <p>Typical completion: {formatTime(estimate.avgTimeSec)}/job</p>
        <p className="max-w-56 text-muted-foreground">
          {isLocal ? "Time varies with clip length, face detection and available GPU memory." : "Informational only. Final provider usage can vary by duration and current rates."}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

interface ConfirmJobResult {
  confirmJob: (provider: string, jobCount?: number) => Promise<boolean>;
  confirmDialog: React.ReactNode;
}

type PendingConfirmation = {
  provider: string;
  jobCount: number;
  resolve: (approved: boolean) => void;
};

/** Requires explicit approval before any local compute or paid provider batch starts. */
export function useJobConfirmation(): ConfirmJobResult {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const pendingRef = useRef<PendingConfirmation | null>(null);

  const settle = useCallback((approved: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(approved);
  }, []);

  const confirmJob = useCallback((provider: string, jobCount = 1) => {
    return new Promise<boolean>((resolve) => {
      pendingRef.current?.resolve(false);
      const request = { provider, jobCount: Math.max(1, jobCount), resolve };
      pendingRef.current = request;
      setPending(request);
    });
  }, []);

  const estimate = pending ? PROVIDER_ESTIMATES[pending.provider] : undefined;
  const isLocal = estimate?.execution === "local";
  const totalCost = estimate && pending ? estimate.costGbp * pending.jobCount : null;
  const totalTime = estimate && pending
    ? estimate.avgTimeSec * (pending.jobCount > 1 ? Math.ceil(pending.jobCount * 0.7) : 1)
    : null;
  const count = pending?.jobCount ?? 1;
  const label = estimate?.label ?? pending?.provider ?? "provider";

  const confirmDialog = (
    <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open) settle(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isLocal ? "Review local GPU job" : "Review provider usage"}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                Start {count} {label} job{count === 1 ? "" : "s"}? {isLocal
                  ? "Media stays on this PC and is processed by the verified local MuseTalk engine."
                  : "This action sends media to the selected provider."}
              </p>
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 bg-secondary/30 p-3 text-foreground">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{isLocal ? "Execution" : "Upstream estimate"}</div>
                  <div className="mt-1 font-mono font-semibold">{isLocal ? "Local GPU · US$0.00" : (totalCost === null ? "Rate varies" : `~${formatProviderCost(totalCost)}`)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Typical completion</div>
                  <div className="mt-1 font-mono font-semibold">{totalTime === null ? "Provider dependent" : formatTime(totalTime)}</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {isLocal
                  ? "R5B admits only the pinned MuseTalk 1.5 revision on 127.0.0.1. Jobs run one at a time to protect GPU memory."
                  : "Estimates are informational and may vary with duration, retries, and provider pricing. Failed jobs will not retry automatically."}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>Keep reviewing</AlertDialogCancel>
          <AlertDialogAction onClick={() => settle(true)}>
            Start {count === 1 ? "job" : `${count} jobs`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirmJob, confirmDialog };
}
