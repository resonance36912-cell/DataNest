import { cn } from "@/lib/utils";

/**
 * Glass skeleton — matches the site's glass-depth + violet→magenta shimmer
 * used in the header and dashboard tabs. Falls back to a calm pulse when
 * `prefers-reduced-motion: reduce` is set (handled in index.css).
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass-skeleton", className)} {...props} />;
}

export { Skeleton };
