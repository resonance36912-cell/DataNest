import { ReactNode } from "react";
import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface AdminSectionProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Render inside a glass card (default) or unwrapped */
  unstyled?: boolean;
  delay?: number;
}

/**
 * Reusable wrapper for an admin dashboard section.
 * Provides a consistent header (icon + title + description + action slot) and
 * glass-card frame so future sections can plug into AdminLayout without
 * re-implementing chrome.
 */
export function AdminSection({
  icon: Icon,
  title,
  description,
  action,
  children,
  unstyled,
  delay = 0,
}: AdminSectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      className={unstyled ? "" : "glass-card p-6"}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </div>
          )}
          <div>
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div>{children}</div>
    </motion.section>
  );
}
