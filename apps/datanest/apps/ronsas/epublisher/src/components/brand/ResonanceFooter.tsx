import * as React from "react";
import { appConfig } from "@/lib/app-config";
import { ResonanceLogo } from "./ResonanceLogo";

const APPS = [
  { name: "Hub", href: "https://reson8.life" },
  { name: "ePublisher", href: "https://www.resonanceonline.life" },
  { name: "Creative Studio", href: "https://www.creativestudio.life" },
  { name: "Sync Vision", href: "https://www.syncvision.life" },
  { name: "YouTube Optimizer", href: "https://optimizer.resonance.life" },
  { name: "Podcast", href: "https://resonance-podcast.com" },
];

const DATANEST_LEGAL = "/DataNest/legal";
const DATANEST_GOVERNANCE = "/DataNest/governance";
const DATANEST_PRIVACY = "/DataNest/privacy";
const DATANEST_TERMS = "/DataNest/terms";

export function ResonanceFooter({
  currentApp = appConfig.name,
  contact = appConfig.contactEmail,
}: {
  currentApp?: string;
  contact?: string;
}) {
  return (
    <footer className="mt-24 border-t border-white/10 bg-[hsl(222_47%_5%)] text-white/60">
      <div className="mx-auto max-w-7xl px-6 py-12 grid gap-10 md:grid-cols-[1fr_2fr_1fr] items-start">
        <div>
          <ResonanceLogo height={26} />
          <p className="mt-3 text-xs leading-relaxed max-w-xs">
            ePublisher — a governed Resonance DataNest application by Resonance App Development.
            Operated by Resonance Sole Proprietorship.
          </p>
          <p className="mt-2 text-xs font-semibold text-white/90">RSGP Governed</p>
        </div>
        <nav aria-label="Resonance apps" className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          {APPS.map((a) => (
            <a
              key={a.name}
              href={a.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`hover:text-white transition-colors ${currentApp === a.name ? "text-white font-semibold" : ""}`}
            >
              {a.name}
            </a>
          ))}
        </nav>
        <nav aria-label="DataNest governance and legal" className="text-xs space-y-2">
          <a href={DATANEST_LEGAL} className="block hover:text-white">Legal Centre</a>
          <a href={DATANEST_GOVERNANCE} className="block hover:text-white">Governance</a>
          <a href={DATANEST_PRIVACY} className="block hover:text-white">Privacy</a>
          <a href={DATANEST_TERMS} className="block hover:text-white">Terms</a>
          <a href="https://reson8.life/updates" target="_blank" rel="noopener noreferrer" className="block hover:text-white">Ecosystem updates ↗</a>
          <a href={`mailto:${contact}`} className="block hover:text-white">{contact}</a>
        </nav>
      </div>
      <div className="border-t border-white/5 px-6 py-6 text-center max-w-4xl mx-auto">
        <p className="text-xs leading-relaxed text-white/60">
          Free promotion is active. Paid transactions are disabled in ePublisher. Future commercial terms require governed approval.
        </p>
      </div>
    </footer>
  );
}
