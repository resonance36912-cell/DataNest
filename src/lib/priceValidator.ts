// Browser mirror of supabase/functions/_shared/priceValidator.ts â€” keep in sync.
const CURRENCY = /(R|ZAR|USD|US\$|\$|â‚¬|EUR|Â£|GBP)\s?/i;
const AMOUNT = /\d{1,3}(?:[\s,]\d{3})*(?:[.,]\d{1,2})?|\d{1,8}(?:[.,]\d{1,2})?/;
const SUFFIX = /(?:\s*\/\s*(?:mo|month|yr|year|user))?/i;
const PRICE_RE = new RegExp(
  `^(?:from\\s+)?${CURRENCY.source}${AMOUNT.source}` +
  `(?:\\s*(?:[-â€“â€”]|to)\\s*${CURRENCY.source}?${AMOUNT.source})?` +
  `${SUFFIX.source}$`,
  "i",
);
const BLOCKED = /(tba|tbd|coming soon|contact|call|enquire|quote|free quote|price on request|por|n\/?a)/i;

export interface PriceValidation {
  ok: boolean;
  normalized: string;
  reason?: string;
}

export function validatePrice(raw: unknown): PriceValidation {
  const s = (typeof raw === "string" ? raw : "").trim();
  if (!s) return { ok: false, normalized: "", reason: "empty" };
  if (s.length > 60) return { ok: false, normalized: "", reason: "too_long" };
  if (/[<>{}]/.test(s)) return { ok: false, normalized: "", reason: "unsafe_chars" };
  if (BLOCKED.test(s)) return { ok: false, normalized: "", reason: "non_numeric_marker" };
  const symbols = (s.match(/R|ZAR|USD|US\$|\$|â‚¬|EUR|Â£|GBP/gi) ?? []).map((x) =>
    x.toUpperCase().replace("US$", "USD").replace("$", "USD"),
  );
  if (new Set(symbols).size > 1) {
    return { ok: false, normalized: "", reason: "mixed_currencies" };
  }
  const cleaned = s.replace(/\s+/g, " ").trim();
  if (!PRICE_RE.test(cleaned)) {
    return { ok: false, normalized: "", reason: "unrecognised_format" };
  }
  return { ok: true, normalized: cleaned };
}

export function priceWarning(v: PriceValidation, raw: string): string | null {
  if (v.ok) return null;
  const sample = (raw ?? "").trim().slice(0, 40);
  switch (v.reason) {
    case "empty": return null;
    case "non_numeric_marker":
      return `Pricing "${sample}" isn't a confirmed amount â€” add a real price (e.g. "R 549") or it will be left off the design.`;
    case "mixed_currencies":
      return `Pricing "${sample}" mixes currencies â€” pick one (ZAR/USD/EUR/GBP).`;
    case "unsafe_chars":
      return `Pricing contained disallowed characters and was dropped.`;
    case "too_long":
      return `Pricing string was too long and was dropped â€” keep it under 60 chars.`;
    default:
      return `We couldn't verify the price "${sample}" â€” confirm it (e.g. "R 549", "$19.99") before generating, or leave it blank.`;
  }
}
