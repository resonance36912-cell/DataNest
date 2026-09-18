import * as React from "react";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ReactNode } from "react";

/** Full-page centered spinner with optional message */
const PageSpinner = React.forwardRef<HTMLDivElement, { message?: string }>(
  ({ message = "Loading…" }, ref) => {
    return (
      <div ref={ref} className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    );
  }
);
PageSpinner.displayName = "PageSpinner";

/** Inline error state with optional retry */
export function InlineError({
  message = "Something went wrong.",
  onRetry,
  retryLabel = "Try Again",
}: {
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="glass-card flex flex-col items-center gap-4 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <p className="text-sm text-muted-foreground max-w-md">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> {retryLabel}
        </Button>
      )}
    </div>
  );
}

/** Empty state with icon, message, and optional action */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="text-muted-foreground/40">{icon}</div>
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Card grid skeleton loader — pass count for number of skeleton cards */
const CardGridSkeleton = React.forwardRef<HTMLDivElement, { count?: number }>(
  ({ count = 6 }, ref) => {
    return (
      <div ref={ref} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="glass-card p-6 space-y-4">
            <div className="flex items-start justify-between">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-1 mt-4">
              {Array.from({ length: 6 }).map((_, j) => (
                <Skeleton key={j} className="h-1.5 flex-1 rounded-full" />
              ))}
            </div>
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    );
  }
);
CardGridSkeleton.displayName = "CardGridSkeleton";

/** Video card grid skeleton */
const VideoGridSkeleton = React.forwardRef<HTMLDivElement, { count?: number }>(
  ({ count = 6 }, ref) => {
    return (
      <div ref={ref} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="glass-card overflow-hidden">
            <Skeleton className="aspect-video w-full" />
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-10 rounded-full" />
              </div>
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-8 flex-1 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
);
VideoGridSkeleton.displayName = "VideoGridSkeleton";

export { PageSpinner, CardGridSkeleton, VideoGridSkeleton };
