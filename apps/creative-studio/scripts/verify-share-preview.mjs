#!/usr/bin/env node
/**
 * Share / link-preview verifier — post-deploy check.
 * ---------------------------------------------------------------------------
 * Re-runs link-preview debugger validation against the LIVE deployment so we
 * know social cards actually update after each deploy.
 *
 * Checks, per target URL:
 *   1. The page responds 200 and ships a parseable <head>.
 *   2. og:url / twitter:url / canonical all point at the Resonance Hub.
 *   3. og:title, og:description, og:site_name, og:type, og:locale,
 *      twitter:card are present and non-default.
 *   4. Every og:image candidate in the fallback chain is reachable and is
 *      actually an image (HEAD, then ranged GET fallback). The FIRST candidate
 *      must resolve — later ones are warnings only.
 *   5. hreflang alternates (en-za / en / x-default) point at the hub.
 *   6. Remote debugger equivalents:
 *        - Microlink (public, no key): confirms a third-party crawler
 *          resolves title/description/image from the live HTML.
 *        - Facebook Sharing Debugger (only when FACEBOOK_APP_TOKEN is set):
 *          scrape=true forces a cache refresh so the card updates.
 *
 * Usage:
 *   node scripts/verify-share-preview.mjs
 *   node scripts/verify-share-preview.mjs --url=https://resonancestudio.lovable.app
 *   node scripts/verify-share-preview.mjs --json
 *   node scripts/verify-share-preview.mjs --no-remote     # skip Microlink/FB
 *   node scripts/verify-share-preview.mjs --warn-only     # never exit 1
 *
 * Env:
 *   DEPLOY_URLS            comma-separated targets (overrides defaults)
 *   FACEBOOK_APP_TOKEN     "<app_id>|<app_secret>" -> forces FB re-scrape
 */

const args = process.argv.slice(2);
const flag = (name) => args.some((a) => a === `--${name}`);
const opt = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

const HUB = "https://www.reson8.life";
const DEFAULT_TARGETS = [
  "https://creativestudio.life/",
  "https://resonancestudio.lovable.app/",
];

const targets = (
  opt("url")?.split(",") ??
  process.env.DEPLOY_URLS?.split(",") ??
  DEFAULT_TARGETS
)
  .map((u) => u.trim())
  .filter(Boolean);

const JSON_OUT = flag("json");
const REMOTE = !flag("no-remote");
const WARN_ONLY = flag("warn-only");
const TIMEOUT_MS = Number(opt("timeout") ?? 20000);

const results = [];
let failures = 0;
let warnings = 0;

const push = (target, level, check, detail) => {
  results.push({ target, level, check, detail });
  if (level === "fail") failures++;
  if (level === "warn") warnings++;
  if (!JSON_OUT) {
    const icon = level === "pass" ? "✓" : level === "warn" ? "!" : "✗";
    console.log(`  ${icon} ${check}${detail ? ` — ${detail}` : ""}`);
  }
};

async function fetchWithTimeout(url, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: "follow",
      ...init,
      signal: ctrl.signal,
      headers: {
        // Identify as a social crawler so any UA-conditional HTML is exercised.
        "user-agent":
          "facebookexternalhit/1.1 (+resonance-share-preview-verifier)",
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

// --- tiny head parser (no deps) --------------------------------------------
function parseHead(html) {
  const head = html.slice(0, html.indexOf("</head>") + 7 || html.length);
  const meta = [];
  const linkAlt = [];
  let canonical = null;

  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const itemprop = tag.match(/itemprop=["']([^"']+)["']/i)?.[1];
    const key =
      tag.match(/property=["']([^"']+)["']/i)?.[1] ??
      tag.match(/name=["']([^"']+)["']/i)?.[1] ??
      (itemprop ? `itemprop:${itemprop}` : undefined);
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
    if (key) meta.push({ key: key.toLowerCase(), content: content ?? "" });
  }
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = tag.match(/rel=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const href = tag.match(/href=["']([^"']*)["']/i)?.[1] ?? "";
    const hreflang = tag.match(/hreflang=["']([^"']*)["']/i)?.[1]?.toLowerCase();
    if (rel === "canonical") canonical = href;
    if (rel === "alternate" && hreflang) linkAlt.push({ hreflang, href });
  }

  const all = (k) =>
    meta.filter((m) => m.key === k.toLowerCase()).map((m) => m.content);
  const one = (k) => all(k)[0];
  return { meta, all, one, canonical, alternates: linkAlt };
}

const isHub = (url) =>
  typeof url === "string" && url.replace(/\/$/, "").startsWith(HUB);

async function imageReachable(url) {
  let res = await fetchWithTimeout(url, { method: "HEAD" }).catch(() => null);
  if (!res || res.status === 405 || res.status === 501) {
    res = await fetchWithTimeout(url, {
      method: "GET",
      headers: { range: "bytes=0-1023" },
    }).catch(() => null);
  }
  if (!res) return { ok: false, detail: "request failed" };
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
  if (!type.startsWith("image/"))
    return { ok: false, detail: `content-type ${type || "unknown"}` };
  return { ok: true, detail: `HTTP ${res.status} ${type}` };
}

// --- remote debugger equivalents -------------------------------------------
async function microlink(target) {
  const api = `https://api.microlink.io/?url=${encodeURIComponent(
    target,
  )}&meta=true&force=true`;
  const res = await fetchWithTimeout(api).catch(() => null);
  if (!res || !res.ok)
    return { ok: false, detail: `microlink HTTP ${res?.status ?? "error"}` };
  const body = await res.json().catch(() => null);
  const d = body?.data;
  if (!d) return { ok: false, detail: "microlink returned no data" };
  const missing = ["title", "description"].filter((k) => !d[k]);
  if (!d.image?.url) missing.push("image");
  return missing.length
    ? { ok: false, detail: `crawler saw no ${missing.join(", ")}` }
    : { ok: true, detail: `title="${d.title}" image=${d.image.url}` };
}

async function facebookRescrape(target) {
  const token = process.env.FACEBOOK_APP_TOKEN;
  if (!token) return null;
  const api = `https://graph.facebook.com/v19.0/?scrape=true&id=${encodeURIComponent(
    target,
  )}&access_token=${encodeURIComponent(token)}`;
  const res = await fetchWithTimeout(api, { method: "POST" }).catch(() => null);
  if (!res) return { ok: false, detail: "facebook request failed" };
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error)
    return {
      ok: false,
      detail: body?.error?.message ?? `facebook HTTP ${res.status}`,
    };
  const img = body.image?.[0]?.url ?? "none";
  return { ok: true, detail: `re-scraped; card image=${img}` };
}

// --- per-target run ---------------------------------------------------------
async function verify(target) {
  if (!JSON_OUT) console.log(`\n▶ ${target}`);

  const res = await fetchWithTimeout(target).catch((e) => ({
    ok: false,
    status: 0,
    _err: String(e),
  }));
  if (!res.ok) {
    push(target, "fail", "page reachable", `HTTP ${res.status} ${res._err ?? ""}`);
    return;
  }
  push(target, "pass", "page reachable", `HTTP ${res.status}`);

  const html = await res.text();
  const head = parseHead(html);

  // 2. hub-pointing identity signals
  for (const key of ["og:url", "twitter:url"]) {
    const val = head.one(key);
    if (!val) push(target, "fail", `${key} present`, "missing");
    else if (!isHub(val)) push(target, "fail", `${key} -> hub`, val);
    else push(target, "pass", `${key} -> hub`, val);
  }
  if (!head.canonical) push(target, "fail", "canonical present", "missing");
  else if (!isHub(head.canonical))
    push(target, "fail", "canonical -> hub", head.canonical);
  else push(target, "pass", "canonical -> hub", head.canonical);

  // 3. required card fields
  const required = {
    "og:title": (v) => v && !/^lovable/i.test(v),
    "og:description": (v) => v && v.length >= 40,
    "og:site_name": (v) => !!v,
    "og:type": (v) => !!v,
    "og:locale": (v) => !!v,
    "twitter:card": (v) => v === "summary_large_image",
    "twitter:title": (v) => !!v,
    "twitter:description": (v) => !!v,
  };
  for (const [key, ok] of Object.entries(required)) {
    const val = head.one(key);
    push(
      target,
      ok(val) ? "pass" : "fail",
      `${key} valid`,
      val ? `"${val.slice(0, 70)}"` : "missing",
    );
  }

  // 4. image fallback chain
  const images = head.all("og:image");
  const twImage = head.one("twitter:image");
  if (!images.length) {
    push(target, "fail", "og:image chain", "no og:image tags");
  } else {
    for (const [i, url] of images.entries()) {
      const { ok, detail } = await imageReachable(url);
      push(
        target,
        ok ? "pass" : i === 0 ? "fail" : "warn",
        `og:image[${i}] reachable`,
        `${url} (${detail})`,
      );
    }
  }
  if (!twImage) push(target, "fail", "twitter:image present", "missing");
  else {
    const { ok, detail } = await imageReachable(twImage);
    push(target, ok ? "pass" : "fail", "twitter:image reachable", `${twImage} (${detail})`);
  }

  // 4b. per-provider tag matrix — every provider must find what it reads.
  const PROVIDERS = [
    ["Facebook", ["og:title", "og:description", "og:image", "og:url", "og:type"]],
    ["LinkedIn", ["og:title", "og:description", "og:image", "og:url"]],
    ["X (Twitter)", ["twitter:card", "twitter:title", "twitter:description", "twitter:image"]],
    ["Slack", ["og:title", "og:description", "og:image", "og:site_name"]],
    ["WhatsApp", ["og:title", "og:description", "og:image", "og:image:type"]],
    ["Telegram", ["og:title", "og:description", "og:image"]],
    ["Discord", ["og:title", "og:description", "og:image", "theme-color"]],
    ["Pinterest", ["og:title", "og:description", "og:image", "pinterest-rich-pin"]],
    ["Google / Gmail", ["itemprop:name", "itemprop:description", "itemprop:image"]],
    ["Microsoft Teams", ["og:title", "og:image", "msapplication-TileImage"]],
    ["Apple iMessage", ["og:title", "og:image", "og:image:type"]],
  ];
  for (const [label, keys] of PROVIDERS) {
    const missing = keys.filter((k) => !head.one(k));
    push(
      target,
      missing.length ? "fail" : "pass",
      `provider card: ${label}`,
      missing.length ? `missing ${missing.join(", ")}` : keys.join(", "),
    );
  }

  // 4c. WhatsApp refuses previews over ~300 KB — check the primary image weight.
  const primary = head.all("og:image")[0];
  if (primary) {
    const r = await fetchWithTimeout(primary, { method: "HEAD" }).catch(() => null);
    const len = Number(r?.headers.get("content-length") ?? 0);
    if (!len) push(target, "warn", "og:image size (WhatsApp ≤300KB)", "content-length unknown");
    else
      push(
        target,
        len <= 300_000 ? "pass" : "fail",
        "og:image size (WhatsApp ≤300KB)",
        `${Math.round(len / 1024)} KB`,
      );
  }

  // 5. hreflang
  for (const lang of ["en-za", "en", "x-default"]) {
    const alt = head.alternates.find((a) => a.hreflang === lang);
    if (!alt) push(target, "fail", `hreflang ${lang}`, "missing");
    else
      push(
        target,
        isHub(alt.href) ? "pass" : "fail",
        `hreflang ${lang} -> hub`,
        alt.href,
      );
  }

  // 6. remote debuggers
  if (REMOTE) {
    const ml = await microlink(target);
    push(target, ml.ok ? "pass" : "warn", "microlink debugger", ml.detail);

    const fb = await facebookRescrape(target);
    if (fb) push(target, fb.ok ? "pass" : "warn", "facebook re-scrape", fb.detail);
    else
      push(
        target,
        "pass",
        "facebook re-scrape",
        "skipped (no FACEBOOK_APP_TOKEN)",
      );
  }
}

for (const t of targets) {
  // eslint-disable-next-line no-await-in-loop
  await verify(t);
}

if (JSON_OUT) {
  console.log(
    JSON.stringify({ hub: HUB, targets, failures, warnings, results }, null, 2),
  );
} else {
  console.log(
    `\n${failures ? "✗" : "✓"} share-preview: ${failures} failure(s), ${warnings} warning(s) across ${targets.length} target(s)`,
  );
}

process.exit(failures && !WARN_ONLY ? 1 : 0);
