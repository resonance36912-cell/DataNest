import { NavLink, useLocation } from "react-router-dom";
import { FolderOpen, Plus, Image, Wallet, Settings } from "lucide-react";

const items = [
  { to: "/dashboard", label: "Projects", icon: FolderOpen, match: (p: string) => p === "/dashboard" || p.startsWith("/project/") && false },
  { to: "/project/new", label: "New Track", icon: Plus, match: (p: string) => p.startsWith("/project/") },
  { to: "/gallery", label: "Gallery", icon: Image, match: (p: string) => p.startsWith("/gallery") },
  { to: "/credits", label: "Credits", icon: Wallet, match: (p: string) => p.startsWith("/credits") },
  { to: "/account", label: "Settings", icon: Settings, match: (p: string) => p.startsWith("/account") },
];

const PRODUCT_PREFIXES = ["/dashboard", "/project", "/gallery", "/credits", "/account"];

export function useIsProductRoute() {
  const { pathname } = useLocation();
  return PRODUCT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname === p);
}

export default function AppNav() {
  const { pathname } = useLocation();
  const active = (to: string, matcher?: (p: string) => boolean) => {
    if (matcher && matcher(pathname)) return true;
    return pathname === to;
  };

  return (
    <nav
      aria-label="Product navigation"
      className="sticky top-16 z-30 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      <div className="container flex items-center gap-1 overflow-x-auto px-3 py-2 sm:px-6">
        {items.map(({ to, label, icon: Icon, match }) => {
          const isActive = active(to, match);
          return (
            <NavLink
              key={label}
              to={to}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
