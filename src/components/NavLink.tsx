import { forwardRef, type ComponentProps } from "react";
import { Link, useLocation } from "@/lib/router-compat";
import { cn } from "@/lib/utils";

interface NavLinkCompatProps extends Omit<ComponentProps<typeof Link>, "className"> {
  className?: string;
  activeClassName?: string;
  /** Kept for call-site compatibility; TanStack has no pending link state. */
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName: _pendingClassName, to, ...props }, ref) => {
    const { pathname } = useLocation();
    const target = typeof to === "string" ? (to.split(/[?#]/)[0] ?? to) : to;
    const isActive =
      typeof target === "string" &&
      (pathname === target || (target !== "/" && pathname.startsWith(`${target}/`)));
    return (
      <Link ref={ref} to={to} className={cn(className, isActive && activeClassName)} {...props} />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
