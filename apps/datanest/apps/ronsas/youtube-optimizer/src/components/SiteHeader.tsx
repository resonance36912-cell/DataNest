import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { AnimatePresence, m as motion } from "@/lib/lazy-motion";
import { ArrowLeft, ExternalLink, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import { HUB_URL, HUB_UPDATES_URL, HUB_DOCS_URL } from "@/lib/entitlement";

type NavLink =
  | { key: "Features"; kind: "internal"; path: string }
  | { key: "About"; kind: "internal"; path: string }
  | { key: "Contact"; kind: "internal"; path: string }
  | { key: "Free Access"; kind: "internal"; path: string }
  | { key: "Docs"; kind: "external"; href: string }
  | { key: "Updates"; kind: "external"; href: string };

const NAV_LINKS: readonly NavLink[] = [
  { key: "Features", kind: "internal", path: "/features" },
  { key: "Free Access", kind: "internal", path: "/pricing" },
  { key: "Docs", kind: "external", href: HUB_DOCS_URL },
  { key: "Updates", kind: "external", href: HUB_UPDATES_URL },
  { key: "About", kind: "internal", path: "/about" },
  { key: "Contact", kind: "internal", path: "/contact" },
] as const;

interface SiteHeaderProps {
  active?: NavLink["key"];
  showBack?: boolean;
}

/**
 * Shared top navigation. This app is a spoke of The Resonance Hub:
 * Promotion details stay local to the spoke; shared docs, updates, support,
 * and ecosystem navigation remain owned by reson8.life.
 */
const SiteHeader = ({ active, showBack = true }: SiteHeaderProps) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  const goInternal = (path: string) => {
    setOpen(false);
    navigate(path);
  };
  const closeMenu = () => setOpen(false);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let inView = true;
    const apply = () => {
      const paused = !inView || document.hidden;
      header.dataset["motionPaused"] = paused ? "true" : "false";
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry?.isIntersecting ?? true;
        apply();
      },
      { threshold: 0 },
    );
    io.observe(header);
    document.addEventListener("visibilitychange", apply);
    apply();
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", apply);
    };
  }, []);

  const navBtnClass = (isActive: boolean) =>
    `text-[11px] font-mono font-semibold uppercase tracking-[0.22em] transition-colors py-2 rounded-sm outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background inline-flex items-center gap-1 ${
      isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <header
      ref={headerRef}
      className="relative border-b border-border/30 bg-background/60 backdrop-blur-2xl sticky top-0 z-50"
    >
      <div className="container mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-shrink flex items-center overflow-hidden">
          <BrandLogo size="sm" breathe />
        </div>

        <nav className="hidden md:flex items-center gap-5 lg:gap-6" aria-label="Primary">
          {NAV_LINKS.map((link) => {
            const isActive = active === link.key;
            if (link.kind === "internal") {
              return (
                <button
                  key={link.key}
                  onClick={() => navigate(link.path)}
                  aria-current={isActive ? "page" : undefined}
                  className={navBtnClass(isActive)}
                >
                  {link.key}
                </button>
              );
            }
            return (
              <a
                key={link.key}
                href={link.href}
                target="_blank"
                rel="noopener"
                className={navBtnClass(isActive)}
              >
                {link.key}
                <ExternalLink className="h-3 w-3 opacity-70" aria-hidden="true" />
              </a>
            );
          })}
          <a
            href={HUB_URL}
            target="_blank"
            rel="noopener"
            className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground/70 hover:text-foreground border border-border/40 hover:border-primary/40 rounded-full px-3 py-1.5 transition-colors inline-flex items-center gap-1"
          >
            Part of The Resonance Hub <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {showBack && (
            <Button
              variant="pillOutline"
              size="pill"
              className="hidden sm:inline-flex"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
          )}
          <Button asChild variant="pill" size="pill" className="hidden sm:inline-flex">
            <a href="/">Start free</a>
          </Button>
          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center h-11 w-11 rounded-full border border-border/40 bg-background/40 text-foreground hover:bg-accent/40 active:scale-95 transition outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={open ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={open}
            aria-controls="site-header-mobile-nav"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id="site-header-mobile-nav"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-border/30 bg-background/95 backdrop-blur-xl overflow-hidden"
          >
            <nav aria-label="Mobile" className="container mx-auto px-3 sm:px-6 py-3 space-y-1">
              {NAV_LINKS.map((link) => {
                const isActive = active === link.key;
                const baseClass = `block w-full text-left text-sm font-mono uppercase tracking-[0.18em] min-h-11 py-3 px-2 rounded-md transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  isActive
                    ? "text-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                }`;
                if (link.kind === "internal") {
                  return (
                    <button
                      key={link.key}
                      onClick={() => goInternal(link.path)}
                      aria-current={isActive ? "page" : undefined}
                      className={baseClass}
                    >
                      {link.key}
                    </button>
                  );
                }
                return (
                  <a
                    key={link.key}
                    href={link.href}
                    target="_blank"
                    rel="noopener"
                    onClick={closeMenu}
                    className={`${baseClass} inline-flex items-center justify-between`}
                  >
                    <span>{link.key}</span>
                    <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
                  </a>
                );
              })}
              <a
                href={HUB_URL}
                target="_blank"
                rel="noopener"
                onClick={closeMenu}
                className="block w-full text-left text-[11px] font-mono uppercase tracking-[0.18em] min-h-11 py-3 px-2 rounded-md text-muted-foreground/80 hover:text-foreground inline-flex items-center justify-between"
              >
                <span>Part of The Resonance Hub</span>
                <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
              </a>
              <div className="border-t border-border/30 pt-3 flex flex-col gap-2">
                {showBack && (
                  <Button variant="pillOutline" size="pillLg" className="w-full" onClick={() => goInternal("/")}>
                    <ArrowLeft className="h-4 w-4" /> Back to home
                  </Button>
                )}
                <Button asChild variant="pill" size="pillLg" className="w-full">
                  <a href="/" onClick={closeMenu}>Start free</a>
                </Button>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
      <span
        aria-hidden="true"
        className="resonance-underline pointer-events-none absolute left-0 right-0 bottom-0 h-px opacity-70"
      />
    </header>
  );
};

export default SiteHeader;
