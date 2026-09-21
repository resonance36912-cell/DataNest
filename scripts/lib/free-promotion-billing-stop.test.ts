// Governs the no-new-billing and no-recurring-billing promotion invariants.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const request = JSON.parse(
  readFileSync("ops/release-requests/free-promotion-billing-stop.json", "utf8"),
);
const worker = readFileSync("ops/ealiophin/billing/stop-payfast-recurring.mjs", "utf8");
const workflow = readFileSync(".github/workflows/stop-free-promotion-billing.yml", "utf8");
const checkout = readFileSync("src/lib/checkout.functions.ts", "utf8");
const itn = readFileSync("src/routes/api/public/payfast/itn.ts", "utf8");

test("free promotion disables new and recurring billing", () => {
  expect(request.schema).toBe("ronsas-free-promotion-billing-stop/v1");
  expect(request.confirmation).toBe("STOP RONSAS RECURRING BILLING");
  expect(request.authority.backend).toBe("sovereign");
  expect(request.authority.gateway).toBe("http://127.0.0.1:58600");
  expect(request.authority.billingAdminProcedure).toBe("read_billing_admin");
  expect(request.policy.freePromotion).toBe(true);
  expect(request.policy.newCheckoutLaunches).toBe(false);
  expect(request.policy.existingRecurringCharges).toBe(false);
  expect(request.policy.cancelProviderTokens).toBe(true);
  expect(request.policy.refundPriorPayments).toBe(false);
  expect(checkout).toContain("if (FREE_PROMOTION_ACTIVE)");
  expect(checkout).toContain("throw new Error(FREE_PROMOTION_MESSAGE)");
});

test("production recurring-billing stop is sovereign-authoritative and fail closed", () => {
  expect(workflow).toContain("ealiophin, production-host");
  expect(workflow).toContain("read_billing_admin");
  expect(workflow).toContain("gateway-procedure-key");
  expect(workflow).toContain("non_cancelled_subscription_rows");
  expect(workflow).toContain("No authoritative recurring-billing candidates exist");
  expect(workflow).toContain("Refusing the legacy Supabase cancellation worker");
  expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  expect(workflow).not.toContain("--execute");
});

test("legacy PayFast worker remains redacted and explicit if a reviewed migration needs it", () => {
  expect(worker).toContain('/subscriptions/" + encodeURIComponent(token) + "/cancel"');
  expect(worker).toContain('method: "PUT"');
  expect(worker).toContain("fingerprint");
  expect(worker).not.toContain("console.log(token)");
});

test("late paid notifications cannot reactivate paid entitlement during promotion", () => {
  expect(itn).toContain('import { FREE_PROMOTION_ACTIVE } from "@/lib/commercial-policy"');
  expect(itn).toContain("const providerNextStatus");
  expect(itn).toContain('FREE_PROMOTION_ACTIVE && providerNextStatus === "active"');
  expect(itn).toContain('? "cancelled"');
  expect(itn).toContain('paymentStatus === "COMPLETE" || isRefund');
});
