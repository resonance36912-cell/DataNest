import * as React from "react";

/**
 * <GlassCard />
 * The standard surface: blurred glass over a dark background with a sheen
 * line on hover. Use for app tiles, feature blocks, pricing cards.
 */
export function GlassCard({
  className = "",
  featured,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { featured?: boolean }) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border backdrop-blur-xl p-6 transition-all duration-300",
        featured
          ? "border-[hsl(295_90%_60%/0.45)] bg-gradient-to-b from-[hsl(295_90%_60%/0.08)] to-[hsl(222_47%_9%/0.6)] shadow-[0_0_50px_-15px_hsl(295_90%_60%/0.6)]"
          : "border-white/10 bg-[hsl(222_47%_9%/0.6)] hover:border-white/25 hover:-translate-y-0.5",
        className,
      ]
        .join(" ")
        .trim()}
      {...rest}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0 transition-opacity duration-500 hover:opacity-100"
      />
      {children}
    </div>
  );
}

/** Tiny mono eyebrow used above headings across the brand. */
export function Eyebrow({
  children,
  dotColor = "hsl(295 90% 60%)",
  className = "",
}: {
  children: React.ReactNode;
  dotColor?: string;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-white/60 border border-white/10 rounded-full px-3 py-1.5 ${className}`.trim()}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: dotColor, boxShadow: `0 0 10px ${dotColor}` }}
      />
      {children}
    </div>
  );
}
