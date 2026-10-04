import * as React from "react";
import { ResonanceLogo } from "./ResonanceLogo";
import { HUB_URL, HUB_PRICING_URL, HUB_UPDATES_URL } from "@/lib/entitlement";

/**
 * <ResonanceFooter currentApp="Creative Studio" />
 * Shared cross-app footer used by every Resonance spoke. Anchors the
 * "Part of The Resonance Hub" line and routes pricing/updates/checkout
 * back to the Hub as the source of truth.
 */
const APPS = [
  { name: "Hub", href: HUB_URL },
  { name: "ePublisher", href: "https://www.resonanceonline.life" },
  { name: "Creative Studio", href: "https://www.creativestudio.life" },
  { name: "Sync Vision", href: "https://www.syncvision.life" },
  { name: "YouTube Optimizer", href: "https://optimizer.resonance.life" },
  { name: "Podcast", href: "https://resonance-podcast.com" },
];

export function ResonanceFooter({
  currentApp,
  contact = "hello@resonance-podcast.com",
}: {
  currentApp?: string;
  contact?: string;
}) {
  return (
    <footer className="mt-24 border-t border-white/10 bg-[hsl(222_47%_5%)] text-muted-foreground">
      <div className="mx-auto max-w-7xl px-6 py-12 grid gap-10 md:grid-cols-[1fr_2fr_1fr] items-start">
        <div>
          <ResonanceLogo height={26} />
          <p className="mt-3 text-xs leading-relaxed max-w-xs">
            One AI ecosystem for South African creators, publishers, and businesses.
          </p>
          <a
            href={HUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-xs text-foreground/80 hover:text-foreground underline-offset-4 hover:underline"
          >
            Part of The Resonance Hub ↗
          </a>
        </div>
        <nav aria-label="Resonance apps" className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          {APPS.map((a) => (
            <a
              key={a.name}
              href={a.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`hover:text-foreground transition-colors ${
                currentApp === a.name ? "text-foreground font-semibold" : ""
              }`}
            >
              {a.name}
            </a>
          ))}
        </nav>
        <div className="text-xs space-y-2">
          <a href={HUB_PRICING_URL} target="_blank" rel="noopener noreferrer" className="block hover:text-foreground">
            Free promotion ↗
          </a>
          <a href={HUB_UPDATES_URL} target="_blank" rel="noopener noreferrer" className="block hover:text-foreground">
            Hub updates ↗
          </a>
          <a href={HUB_URL} target="_blank" rel="noopener noreferrer" className="block hover:text-foreground">
            Back to hub ↗
          </a>
          <a href={`mailto:${contact}`} className="block hover:text-foreground">
            {contact}
          </a>
        </div>
      </div>

      <div className="border-t border-white/5 px-6 py-6 text-center max-w-4xl mx-auto">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Free-access promotion details, updates, support, and future pricing information are managed by{" "}
          <a href={HUB_URL} target="_blank" rel="noopener noreferrer" className="text-foreground/90 underline-offset-4 hover:underline">
            The Resonance Hub
          </a>.
        </p>
        <p className="mt-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70">
          © {new Date().getFullYear()} The Resonance · Free promotion · POPIA
        </p>
      </div>
    </footer>
  );
}
