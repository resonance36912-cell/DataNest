import { Outlet } from "react-router-dom";
import { BackToHubHeader } from "@/components/BackToHubHeader";
import { HubAttributionLine } from "@/components/brand/HubAttributionLine";
import HubRedirectGate from "@/components/HubRedirectGate";

/**
 * <HubLayout />
 * Shared layout wrapper. Every route rendered under this layout gets:
 *   - <BackToHubHeader /> at the top (canonical "Back to Hub" link,
 *     required across the Resonance ecosystem per the hub's
 *     docs/spoke-back-to-hub-snippet.md contract)
 *   - <HubRedirectGate /> which sends hub-duplicated marketing paths to
 *     https://www.reson8.life so indexing consolidates on the hub
 *   - <HubAttributionLine /> at the bottom (existing "Part of The
 *     Resonance Hub" attribution)
 */
export default function HubLayout() {
  return (
    <>
      <BackToHubHeader />
      <HubRedirectGate>
        <Outlet />
      </HubRedirectGate>
      <HubAttributionLine />
    </>
  );
}
