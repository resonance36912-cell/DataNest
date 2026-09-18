import { HUB_URL } from "@/lib/entitlement";

/**
 * <HubAttributionLine />
 * Slim shared attribution line rendered at the bottom of every studio,
 * admin, and marketing page. Anchors this spoke to The Resonance Hub as
 * the source of truth for pricing, updates, and checkout.
 */
export function HubAttributionLine({ className = "" }: { className?: string }) {
  return (
    <div
      className={`w-full border-t border-white/[0.06] bg-transparent px-6 py-3 text-center text-[11px] leading-relaxed text-muted-foreground ${className}`}
    >
      <a
        href={HUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-foreground/70 hover:text-foreground underline-offset-4 hover:underline"
      >
        Part of The Resonance Hub ↗
      </a>
      <span className="mx-2 opacity-40">·</span>
      <span>Official pricing, updates, checkout, and support are managed by The Resonance Hub.</span>
    </div>
  );
}

export default HubAttributionLine;
