/**
 * Governed commercial-mode switch for RONSAS.
 *
 * During the costing-validation promotion all authenticated users receive
 * full product access and new payment launches are disabled. Historical SKU
 * and pack catalogs stay intact so pricing can be reintroduced deliberately
 * after measured costing is approved.
 */
export const FREE_PROMOTION_ACTIVE = true as const;

export const FREE_PROMOTION_STARTED_ON = "2026-09-20";

export const FREE_PROMOTION_LABEL = "Free promotion";

export const FREE_PROMOTION_MESSAGE =
  "All Resonance apps are free during the current promotion while usage and delivery costs are being measured. No payment is required.";

export const FREE_PROMOTION_CTA = "Use free during promotion";
