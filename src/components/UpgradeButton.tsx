import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { APP_START_URL } from "@/lib/entitlement";

interface UpgradeButtonProps {
  plan?: "free" | "credits" | "project" | "studio" | "bundle";
  browse?: boolean;
  label?: string;
  className?: string;
  size?: "sm" | "default" | "lg";
}

const UpgradeButton = ({ className, size = "default" }: UpgradeButtonProps) => (
  <Button asChild size={size} className={className}>
    <a href={APP_START_URL}>
      <Sparkles className="h-4 w-4 mr-1.5" />
      Use free during promotion
    </a>
  </Button>
);

export default UpgradeButton;
