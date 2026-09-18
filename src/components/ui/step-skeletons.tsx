import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton for the Upload step layout */
export function UploadStepSkeleton() {
  return (
    <div className="glass-card p-4 sm:p-8 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {/* Drop zone skeleton */}
      <div className="rounded-xl border-2 border-dashed border-border p-8 sm:p-16 flex flex-col items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2 flex flex-col items-center">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-10 w-32 rounded-md" />
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>
    </div>
  );
}

/** Skeleton for the Analysis step layout */
export function AnalysisStepSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="glass-card p-6 space-y-4">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-64" />
        <div className="flex gap-3">
          <Skeleton className="h-7 w-36 rounded-full" />
          <Skeleton className="h-7 w-36 rounded-full" />
          <Skeleton className="h-7 w-36 rounded-full" />
        </div>
      </div>
      {/* Two-column panels */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card p-6 space-y-3">
          <div className="flex justify-between">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
        <div className="glass-card p-6 space-y-4">
          <Skeleton className="h-5 w-32" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-8 w-full rounded-md" />
              </div>
            ))}
          </div>
          <Skeleton className="h-5 w-28" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-16 rounded-full" />
            ))}
          </div>
        </div>
      </div>
      {/* Rating bar */}
      <div className="glass-card p-4 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-64" />
      </div>
      {/* Footer */}
      <div className="flex justify-between">
        <Skeleton className="h-10 w-24 rounded-md" />
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>
    </div>
  );
}

/** Skeleton for the Character step layout */
export function CharacterStepSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-48 rounded-lg" />
        </div>
      </div>
      {/* Quick generate + Reference */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="glass-card p-6 space-y-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
        <div className="glass-card p-6 space-y-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-24 w-full rounded-lg border-2 border-dashed border-border" />
        </div>
      </div>
      {/* Form skeleton */}
      <div className="glass-card p-6 space-y-4">
        <Skeleton className="h-5 w-36" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ))}
        </div>
      </div>
      {/* Footer */}
      <div className="flex justify-between">
        <Skeleton className="h-10 w-24 rounded-md" />
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>
    </div>
  );
}

/** Skeleton for the Storyboard step layout */
export function StoryboardStepSkeleton() {
  return (
    <div className="space-y-6">
      {/* Toolbar skeleton */}
      <div className="glass-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-40 rounded-md" />
            <Skeleton className="h-9 w-32 rounded-md" />
            <Skeleton className="h-9 w-36 rounded-md" />
          </div>
          <Skeleton className="h-9 w-44 rounded-md" />
        </div>
        {/* Theme/Location pills */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Skeleton className="h-3 w-12" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-20 rounded-full" />
            ))}
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-3 w-16" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-20 rounded-full" />
            ))}
          </div>
        </div>
      </div>
      {/* Progress bar */}
      <div className="glass-card px-4 py-3 space-y-2">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-2 flex-1 rounded-full" />
          ))}
        </div>
      </div>
      {/* Scene card */}
      <div className="glass-card p-4 space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-40 w-56 rounded-lg shrink-0" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-2 mt-4">
              <Skeleton className="h-8 w-28 rounded-md" />
              <Skeleton className="h-8 w-28 rounded-md" />
            </div>
          </div>
        </div>
      </div>
      {/* Footer */}
      <div className="flex justify-between">
        <Skeleton className="h-10 w-24 rounded-md" />
        <Skeleton className="h-10 w-44 rounded-md" />
      </div>
    </div>
  );
}

/** Skeleton for the Assembly step layout */
export function AssemblyStepSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Toolbar */}
      <div className="glass-card p-4 flex items-center justify-between">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>
      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <div className="lg:col-span-2 space-y-3">
          {/* Video preview */}
          <div className="glass-card overflow-hidden">
            <Skeleton className="aspect-video w-full" />
          </div>
          {/* Playback controls */}
          <div className="glass-card p-3 flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-2 flex-1 rounded-full" />
            <Skeleton className="h-4 w-16" />
          </div>
          {/* Timeline */}
          <div className="glass-card p-4 space-y-2">
            <Skeleton className="h-4 w-24" />
            <div className="flex gap-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 flex-1 rounded-md" />
              ))}
            </div>
          </div>
        </div>
        {/* Side panel */}
        <div className="glass-card p-4 space-y-3">
          <Skeleton className="h-8 w-full rounded-md" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        </div>
      </div>
      {/* Footer */}
      <div className="flex justify-between">
        <Skeleton className="h-10 w-24 rounded-md" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32 rounded-md" />
          <Skeleton className="h-10 w-28 rounded-md" />
        </div>
      </div>
    </div>
  );
}

/** Skeleton for the Export step layout */
export function ExportStepSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card p-6 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="text-right space-y-1">
          <Skeleton className="h-7 w-12 ml-auto" />
          <Skeleton className="h-3 w-16 ml-auto" />
        </div>
      </div>
      {/* Export cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="glass-card p-6 space-y-3">
            <Skeleton className="h-11 w-11 rounded-lg" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <div className="flex justify-between items-center pt-2">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div className="flex justify-between">
        <Skeleton className="h-10 w-24 rounded-md" />
        <Skeleton className="h-12 w-48 rounded-md" />
      </div>
    </div>
  );
}

/** Array of step skeletons indexed by step number */
export const stepSkeletons = [
  UploadStepSkeleton,
  AnalysisStepSkeleton,
  CharacterStepSkeleton,
  StoryboardStepSkeleton,
  AssemblyStepSkeleton,
  ExportStepSkeleton,
];
