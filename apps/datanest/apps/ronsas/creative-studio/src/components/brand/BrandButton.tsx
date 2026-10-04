import * as React from "react";

/**
 * <BrandButton />
 * Resonance primary CTA. Variants: "brand" (gradient + glow), "outline", "ghost".
 */
type Variant = "brand" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-bold uppercase tracking-[0.15em] transition-all duration-200 disabled:opacity-60 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  brand:
    "studio-gradient-bg text-primary-foreground shadow-[0_0_40px_-5px_hsl(var(--primary)/0.7)] hover:scale-[1.02]",
  outline: "border border-white/20 text-foreground hover:border-white/50 hover:bg-white/5",
  ghost: "text-muted-foreground hover:text-foreground underline-offset-4 hover:underline",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[10px]",
  md: "h-11 px-6 text-xs",
  lg: "h-14 px-8 text-sm",
};

export function BrandButton({
  variant = "brand",
  size = "md",
  className = "",
  asChild,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}) {
  const cls = `${base} ${variants[variant]} ${sizes[size]} ${className}`.trim();
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ className?: string }>;
    return React.cloneElement(child, {
      className: `${cls} ${child.props.className ?? ""}`.trim(),
    });
  }
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
