import * as React from "react";

/**
 * BackToHubHeader — spoke variant per resonance-hub
 * docs/spoke-back-to-hub-snippet.md.
 *
 * Contract (enforced by the hub's verify-back-to-hub script and mirrored
 * here for consistency across the Resonance ecosystem):
 *   - href MUST be the canonical hub URL "https://reson8.life"
 *   - label MUST contain the verbatim substring "Back to Hub"
 *   - opens in the SAME tab (no target="_blank") — this is a nav back,
 *     not an outbound link
 *
 * Rendered once at the top of every route via <HubLayout />.
 */
export function BackToHubHeader({ extra }: { extra?: React.ReactNode }) {
  return (
    <div className="w-full flex items-center justify-between gap-3 px-4 py-2 border-b border-white/5 bg-background/60 backdrop-blur-sm">
      <a
        href="https://reson8.life"
        className="inline-flex items-center text-[11px] font-bold tracking-[0.15em] uppercase px-4 py-2 rounded-full border border-white/15 hover:border-white/40 transition-colors text-foreground/80 hover:text-foreground"
      >
        ← Back to Hub
      </a>
      {extra ? (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {extra}
        </div>
      ) : null}
    </div>
  );
}

export default BackToHubHeader;
