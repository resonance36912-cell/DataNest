#!/usr/bin/env node
/**
 * On-demand link-preview cache refresh across multiple providers.
 * ---------------------------------------------------------------------------
 * Run this right after publishing to force social platforms to re-fetch the
 * share card instead of serving a stale copy.
 *
 * Usage:
 *   node scripts/refresh-link-previews.mjs
 *   node scripts/refresh-link-previews.mjs --url=https://creativestudio.life/,https://creativestudio.life/pricing
 *   node scripts/refresh-link-previews.mjs --providers=facebook,microlink
 *   node scripts/refresh-link-previews.mjs --json
 *
 * Env (all optional — providers without a token fall back to a manual
 * debugger link that is printed at the end):
 *   FACEBOOK_APP_TOKEN   "<app_id>|<app_secret>"  → Facebook/WhatsApp re-scrape
 *   MICROLINK_API_KEY    paid Microlink key       → higher rate limits
 *   DEPLOY_URLS          comma-separated default targets
 */

const args = process.argv.slice(2);
const flag = (n) => args.some((a) => a === `--${n}`);
const opt = (n) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : undefined;
};

const JSON_OUT = flag("json");
const TIMEOUT_MS = Number(opt("timeout") ?? 15000);

const DEFAULT_TARGETS = [
  "https://creativestudio.life/",
  "https://resonancestudio.lovable.app/",
];
const targets = (opt("url")?.split(",") ?? process.env.DEPLOY_URLS?.split(",") ?? DEFAULT_TARGETS)
  .map((u) => u.trim())
  .filter(Boolean);

const enc = encodeURIComponent;

async function fetchT(url, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}

const bust = (u) => {
  const c = new URL(u);
  c.searchParams.set("_pv", Date.now().toString(36));
  return c.toString();
};

const warm = (id, label, ua, debuggerUrl) => async (url) => {
  try {
    const r = await fetchT(bust(url), { headers: { "User-Agent": ua, Accept: "text/html,*/*" } });
    return { provider: id, label, outcome: r.ok ? "warmed" : "failed", detail: `HTTP ${r.status}`, debuggerUrl: debuggerUrl?.(url) };
  } catch (e) {
    return { provider: id, label, outcome: "failed", detail: String(e), debuggerUrl: debuggerUrl?.(url) };
  }
};

async function facebook(url) {
  const debuggerUrl = `https://developers.facebook.com/tools/debug/?q=${enc(url)}`;
  const token = process.env.FACEBOOK_APP_TOKEN;
  if (!token) {
    return { provider: "facebook", label: "Facebook / WhatsApp", outcome: "manual", detail: "FACEBOOK_APP_TOKEN not set", debuggerUrl };
  }
  try {
    const r = await fetchT("https://graph.facebook.com/v20.0/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id: url, scrape: "true", access_token: token }),
    });
    const body = await r.text();
    if (!r.ok) return { provider: "facebook", label: "Facebook / WhatsApp", outcome: "failed", detail: `Graph ${r.status}: ${body.slice(0, 200)}`, debuggerUrl };
    let title = "";
    try { title = JSON.parse(body)?.title ?? ""; } catch {}
    return { provider: "facebook", label: "Facebook / WhatsApp", outcome: "refreshed", detail: `re-scraped${title ? ` — "${title}"` : ""}`, debuggerUrl };
  } catch (e) {
    return { provider: "facebook", label: "Facebook / WhatsApp", outcome: "failed", detail: String(e), debuggerUrl };
  }
}

async function microlink(url) {
  const debuggerUrl = `https://api.microlink.io/?url=${enc(url)}&meta=true`;
  try {
    const key = process.env.MICROLINK_API_KEY;
    const r = await fetchT(`https://api.microlink.io/?url=${enc(url)}&meta=true&force=true`, key ? { headers: { "x-api-key": key } } : {});
    const j = await r.json().catch(() => null);
    if (!r.ok || j?.status !== "success") {
      return { provider: "microlink", label: "Microlink", outcome: "failed", detail: `HTTP ${r.status} ${j?.message ?? ""}`.trim(), debuggerUrl };
    }
    const d = j.data ?? {};
    return { provider: "microlink", label: "Microlink", outcome: "refreshed", detail: `"${d.title ?? "?"}" · image ${d.image?.url ? "ok" : "missing"}`, debuggerUrl };
  } catch (e) {
    return { provider: "microlink", label: "Microlink", outcome: "failed", detail: String(e), debuggerUrl };
  }
}

async function linkedin(url) {
  const debuggerUrl = `https://www.linkedin.com/post-inspector/inspect/${enc(url)}`;
  try {
    const r = await fetchT(debuggerUrl, { headers: { "User-Agent": "LinkedInBot/1.0 (compatible; Mozilla/5.0)" } });
    return { provider: "linkedin", label: "LinkedIn", outcome: r.ok ? "refreshed" : "manual", detail: `Post Inspector HTTP ${r.status}`, debuggerUrl };
  } catch (e) {
    return { provider: "linkedin", label: "LinkedIn", outcome: "manual", detail: String(e), debuggerUrl };
  }
}

const PROVIDERS = {
  facebook,
  microlink,
  linkedin,
  twitter: warm("twitter", "X (Twitter)", "Twitterbot/1.0", (u) => `https://cards-dev.twitter.com/validator?url=${enc(u)}`),
  slack: warm("slack", "Slack", "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)"),
  discord: warm("discord", "Discord", "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)"),
  telegram: warm("telegram", "Telegram", "TelegramBot (like TwitterBot)"),
  whatsapp: warm("whatsapp", "WhatsApp", "WhatsApp/2.23.20 A"),
  google: warm("google", "Google / Gmail", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", (u) => `https://search.google.com/test/rich-results?url=${enc(u)}`),
  pinterest: warm("pinterest", "Pinterest", "Pinterest/0.2 (+https://www.pinterest.com/bot.html)", (u) => `https://developers.pinterest.com/tools/url-debugger/?link=${enc(u)}`),
  apple: warm("apple", "Apple (iMessage)", "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 Twitterbot"),
};

const selected = (opt("providers")?.split(",").map((p) => p.trim()) ?? Object.keys(PROVIDERS)).filter((p) => p in PROVIDERS);
if (selected.length === 0) {
  console.error(`Unknown provider(s). Available: ${Object.keys(PROVIDERS).join(", ")}`);
  process.exit(2);
}

const icon = { refreshed: "✓", warmed: "~", manual: "!", failed: "✗" };

const report = [];
let failed = 0;

for (const url of targets) {
  if (!JSON_OUT) console.log(`\n▸ ${url}`);
  const results = await Promise.all(selected.map((p) => PROVIDERS[p](url)));
  for (const r of results) {
    if (r.outcome === "failed") failed++;
    if (!JSON_OUT) console.log(`  ${icon[r.outcome] ?? "?"} ${r.label.padEnd(24)} ${r.detail}`);
  }
  report.push({ url, results });
}

if (JSON_OUT) {
  console.log(JSON.stringify({ ranAt: new Date().toISOString(), report }, null, 2));
} else {
  const manual = report.flatMap((r) => r.results).filter((r) => r.outcome === "manual" && r.debuggerUrl);
  if (manual.length) {
    console.log("\nFinish manually (no public purge API / token missing):");
    for (const m of manual) console.log(`  • ${m.label}: ${m.debuggerUrl}`);
  }
  console.log(`\n${failed === 0 ? "Done — no failures." : `Done with ${failed} failure(s).`}`);
}

process.exit(failed > 0 ? 1 : 0);
