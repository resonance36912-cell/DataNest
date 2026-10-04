import { useNavigate } from "@/lib/router-compat";
import { ExternalLink } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { HUB_URL, HUB_UPDATES_URL, HUB_DOCS_URL, HUB_SUPPORT_URL } from "@/lib/entitlement";

const ECOSYSTEM = [
  { label: "🧠 Hub · reson8.life", href: HUB_URL },
  { label: "📚 ePublisher", href: "https://epublisher.reson8.life/" },
  { label: "🎨 Creative Studio", href: "https://creative.reson8.life/" },
  { label: "🎙️ Podcast", href: "https://www.resonance-podcast.com/" },
  { label: "▶ @resonance36912", href: "https://www.youtube.com/@resonance36912" },
];

const HUB_LINKS = [
  { label: "Free access promotion", href: "/pricing" },
  { label: "Hub docs & guides", href: HUB_DOCS_URL },
  { label: "View updates", href: HUB_UPDATES_URL },
  { label: "Hub support", href: HUB_SUPPORT_URL },
  { label: "Back to hub", href: HUB_URL },
];

const LEGAL = [
  { label: "Privacy", path: "/privacy" },
  { label: "Terms", path: "/terms" },
  { label: "Support", path: "/contact" },
];

/**
 * Shared footer. This app is part of The Resonance Hub. During the free-access
 * promotion, checkout is paused while usage and provider costs are measured.
 */
const SiteFooter = () => {
  const navigate = useNavigate();

  return (
    <footer className="border-t border-border/20 py-10 mt-16 print:hidden">
      <div className="container mx-auto px-4 sm:px-6 space-y-8">
        <div className="rounded-2xl border border-border/40 bg-card/30 backdrop-blur p-5 sm:p-6">
          <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.25em] text-muted-foreground/70 mb-2">
            ✦ Part of The Resonance Hub
          </p>
          <p className="text-sm text-foreground/85 leading-relaxed max-w-3xl">
            The free-access promotion is active. Shared updates, support, and ecosystem navigation are managed by{" "}
            <a
              href={HUB_URL}
              target="_blank"
              rel="noopener"
              className="text-primary hover:underline underline-offset-4"
            >
              The Resonance Hub
            </a>
            .
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {HUB_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener"
                className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground/80 hover:text-foreground border border-border/40 hover:border-primary/40 rounded-full px-3 py-1.5 transition-colors inline-flex items-center gap-1"
              >
                {l.label} <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.25em] text-muted-foreground/60 mb-3">
            ✦ Explore the wider Resonance network
          </p>
          <div className="flex flex-wrap gap-2">
            {ECOSYSTEM.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener"
                className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground/70 hover:text-foreground border border-border/40 hover:border-primary/40 rounded-full px-3 py-1.5 transition-colors"
              >
                {l.label} ↗
              </a>
            ))}
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pt-6 border-t border-border/20 text-center md:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <BrandLogo size="sm" />
            <a
              href={HUB_URL}
              target="_blank"
              rel="noopener"
              className="text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground/70 hover:text-foreground transition-colors"
            >
              Part of The Resonance Hub →
            </a>
          </div>
          <p className="text-[11px] text-muted-foreground/50 order-last md:order-none">
            © 2026 The Resonance · POPIA-conscious · Free access promotion
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            {LEGAL.map((link) => (
              <button
                key={link.label}
                onClick={() => navigate(link.path)}
                className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
