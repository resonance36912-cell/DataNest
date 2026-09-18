import * as React from "react";

/**
 * <BrandButton />
 * The one button every Resonance app uses for primary CTAs. Variants:
 *  - "brand"   → gradient + glow (hero / pay / upgrade)
 *  - "outline" → bordered, transparent (secondary)
 *  - "ghost"   → text-only with hover underline
 */
type Variant = "brand" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-bold uppercase tracking-[0.15em] transition-all duration-200 disabled:opacity-60 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  brand:
    "bg-[linear-gradient(135deg,hsl(265_85%_65%),hsl(295_90%_60%),hsl(325_90%_65%))] text-white shadow-[0_0_40px_-5px_hsl(295_90%_60%/0.7)] hover:scale-[1.02]",
  outline:
    "border border-white/20 text-white hover:border-white/50 hover:bg-white/5",
  ghost: "text-white/70 hover:text-white underline-offset-4 hover:underline",
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
    return React.cloneElement(children as React.ReactElement<{ className?: string }>, {
      className: `${cls} ${(children as React.ReactElement<{ className?: string }>).props.className ?? ""}`.trim(),
    });
  }
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
