import { Button } from "@/components/ui/button";

interface UpgradeButtonProps {
  tier?: "creator" | "pro" | "business";
  label?: string;
  variant?: "gradient" | "ghost";
  size?: "sm" | "default" | "lg";
  className?: string;
}

export default function UpgradeButton({
  variant = "gradient",
  size = "default",
  className = "",
}: UpgradeButtonProps) {
  if (variant === "ghost") {
    return (
      <Button asChild size={size} variant="outline" className={`gap-2 rounded-full border-white/15 ${className}`}>
        <a href="/login">Use free during promotion</a>
      </Button>
    );
  }

  return (
    <Button
      asChild
      size={size}
      className={`gap-2 rounded-full text-white border-0 shadow-[0_0_40px_-5px_hsl(295_90%_60%/0.8)] hover:opacity-95 ${className}`}
      style={{ background: "var(--gradient-brand)" }}
    >
      <a href="/login">Use free during promotion</a>
    </Button>
  );
}
