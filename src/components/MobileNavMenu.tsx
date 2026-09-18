import { Link } from "react-router-dom";
import { Menu } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export type MobileNavLink = {
  label: string;
  to?: string;
  href?: string;
  external?: boolean;
};

interface MobileNavMenuProps {
  links: MobileNavLink[];
  className?: string;
}

/**
 * Compact hamburger menu shown below the `md` breakpoint, so primary nav
 * links that we hide on small screens stay reachable on mobile.
 */
const MobileNavMenu = ({ links, className = "" }: MobileNavMenuProps) => (
  <div className={`md:hidden ${className}`}>
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Open menu"
        className="inline-flex items-center justify-center h-10 w-10 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
      >
        <Menu className="w-5 h-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-background/95 backdrop-blur-xl">
        {links.map((link, i) => {
          const key = `${link.label}-${i}`;
          if (link.href) {
            return (
              <DropdownMenuItem key={key} asChild>
                <a
                  href={link.href}
                  {...(link.external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className="w-full cursor-pointer"
                >
                  {link.label}
                  {link.external && <span className="ml-auto opacity-60">↗</span>}
                </a>
              </DropdownMenuItem>
            );
          }
          if (link.to) {
            return (
              <DropdownMenuItem key={key} asChild>
                <Link to={link.to} className="w-full cursor-pointer">
                  {link.label}
                </Link>
              </DropdownMenuItem>
            );
          }
          return <DropdownMenuSeparator key={key} />;
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

export default MobileNavMenu;
