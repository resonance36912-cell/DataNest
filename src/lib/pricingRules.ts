// User-configurable price validation rules. These live in localStorage so the
// user can approve currency/price formats the built-in validator doesn't
// recognise (e.g. "KSh 1,250", "₹4,999", "AED 199.00", "₿0.0021", "100 pts").
//
// Rules are merged INTO `validatePrice` — built-in pattern is tried first,
// then each enabled custom rule. A successful match returns the normalized
// trimmed string so it can be rendered verbatim on the design.
//
// Stored under `pricing.customRules.v1`. Schema is intentionally tiny and
// JSON-safe so it can later be sync'd to a server table without migration.

import { validatePrice as builtInValidate, type PriceValidation } from "./priceValidator";

export interface PricingRule {
  id: string;
  label: string;          // human name, e.g. "Kenyan Shilling"
  /** RegExp source, anchored implicitly (we wrap with ^…$). Whitespace
   *  collapsed before testing. Case-insensitive. */
  pattern: string;
  example: string;        // sample value that should match (shown in UI)
  enabled: boolean;
}

const STORAGE_KEY = "pricing.customRules.v1";

export const BUILTIN_PRESETS: Omit<PricingRule, "id" | "enabled">[] = [
  { label: "Indian Rupee (₹)",    pattern: "₹\\s?\\d{1,3}(?:[\\s,]\\d{3})*(?:[.,]\\d{1,2})?", example: "₹4,999" },
  { label: "Kenyan Shilling",     pattern: "(?:KSh|KES)\\s?\\d{1,3}(?:[\\s,]\\d{3})*(?:[.,]\\d{1,2})?", example: "KSh 1,250" },
  { label: "Nigerian Naira (₦)",  pattern: "₦\\s?\\d{1,3}(?:[\\s,]\\d{3})*(?:[.,]\\d{1,2})?", example: "₦12,500" },
  { label: "UAE Dirham",          pattern: "AED\\s?\\d{1,3}(?:[\\s,]\\d{3})*(?:[.,]\\d{1,2})?", example: "AED 199.00" },
  { label: "Japanese Yen (¥)",    pattern: "¥\\s?\\d{1,3}(?:[\\s,]\\d{3})*", example: "¥2,980" },
  { label: "Bitcoin",             pattern: "₿\\s?\\d+(?:\\.\\d{1,8})?", example: "₿0.0021" },
  { label: "Loyalty points",      pattern: "\\d{1,3}(?:[\\s,]\\d{3})*\\s?(?:pts|points)", example: "1,500 pts" },
  { label: "Per-seat (€/seat)",   pattern: "€\\s?\\d+(?:[.,]\\d{1,2})?\\s?/\\s?(?:seat|user|mo|month)", example: "€12/seat" },
];

function safeRead(): PricingRule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r): r is PricingRule =>
      r && typeof r.id === "string" && typeof r.label === "string" &&
      typeof r.pattern === "string" && typeof r.enabled === "boolean",
    );
  } catch { return []; }
}

export function loadRules(): PricingRule[] {
  return safeRead();
}

export function saveRules(rules: PricingRule[]): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules)); } catch { /* quota */ }
}

export function newRuleId(): string {
  return `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Hard safety net — applied to every value regardless of rule source so a
 *  malicious or fat-fingered pattern can't smuggle markup or huge strings
 *  onto a generated asset. */
function passesSafetyGate(s: string): boolean {
  if (!s || s.length > 60) return false;
  if (/[<>{}]/.test(s)) return false;
  return true;
}

function tryCustomRule(rule: PricingRule, s: string): boolean {
  try {
    const re = new RegExp(`^(?:${rule.pattern})$`, "i");
    return re.test(s);
  } catch {
    return false; // invalid regex — silently skip
  }
}

/** Validate a price string, trying the built-in rules first and then any
 *  user-enabled custom rules. */
export function validatePriceWithRules(raw: unknown, rules?: PricingRule[]): PriceValidation {
  const builtin = builtInValidate(raw);
  if (builtin.ok) return builtin;

  const s = (typeof raw === "string" ? raw : "").trim().replace(/\s+/g, " ");
  if (!passesSafetyGate(s)) return builtin;

  const active = (rules ?? loadRules()).filter((r) => r.enabled);
  for (const rule of active) {
    if (tryCustomRule(rule, s)) {
      return { ok: true, normalized: s };
    }
  }
  return builtin;
}
