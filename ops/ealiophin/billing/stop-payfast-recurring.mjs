import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";

const requestPath = process.argv[process.argv.indexOf("--request") + 1];
const execute = process.argv.includes("--execute");
if (!requestPath) throw new Error("--request is required");
const request = JSON.parse(readFileSync(requestPath, "utf8"));

if (request.schema !== "ronsas-free-promotion-billing-stop/v1")
  throw new Error("Bad request schema");
if (request.confirmation !== "STOP RONSAS RECURRING BILLING")
  throw new Error("Missing confirmation");
if (request.policy?.freePromotion !== true) throw new Error("Free promotion must be active");
if (request.policy?.newCheckoutLaunches !== false)
  throw new Error("Checkout launches must be disabled");
if (request.policy?.existingRecurringCharges !== false)
  throw new Error("Recurring charges must be disabled");
if (request.policy?.cancelProviderTokens !== true)
  throw new Error("Provider cancellation is required");
if (request.policy?.refundPriorPayments !== false)
  throw new Error("Refunds are outside this operation");

const need = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing env: " + name);
  return value;
};
const supabaseUrl = need("SUPABASE_URL").replace(/\/$/, "");
const serviceKey = need("SUPABASE_SERVICE_ROLE_KEY");
const merchantId = need("PAYFAST_MERCHANT_ID");
const passphrase = need("PAYFAST_PASSPHRASE");
const sandbox = merchantId === "10000100";

const receiptRoot =
  process.env.RONSAS_RECEIPT_ROOT?.trim() ||
  join(need("USERPROFILE"), "Resonance", "OpenNova", "runtime", "release-receipts");
const runId = process.env.GITHUB_RUN_ID || String(Date.now());
const receiptPath = join(receiptRoot, "free-promotion-billing-stop-" + runId + ".json");
mkdirSync(dirname(receiptPath), { recursive: true });

const summary = {
  schema: "ronsas-free-promotion-billing-stop-receipt/v1",
  mode: execute ? "execute" : "dry-run",
  effectiveOn: request.effectiveOn,
  startedAt: new Date().toISOString(),
  completedAt: null,
  candidateRows: 0,
  uniqueTokens: 0,
  providerCancelled: 0,
  rowsCancelled: 0,
  failures: [],
};

const headers = {
  apikey: serviceKey,
  Authorization: "Bearer " + serviceKey,
  "Content-Type": "application/json",
};

const encode = (v) => encodeURIComponent(String(v).trim()).replace(/%20/g, "+");
const fingerprint = (token) => createHash("sha256").update(token).digest("hex").slice(0, 16);

function signature(timestamp) {
  const parts = {
    "merchant-id": merchantId,
    passphrase,
    timestamp,
    version: "v1",
  };
  const canonical = Object.entries(parts)
    .filter(([, value]) => value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + "=" + encode(value))
    .join("&");
  return createHash("md5").update(canonical).digest("hex");
}

async function fetchJson(url, options, label) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {}
  if (!response.ok || payload?.status === "failed") {
    throw new Error(label + " failed with HTTP " + response.status);
  }
  return payload;
}

async function listSubscriptions() {
  const url =
    supabaseUrl +
    "/rest/v1/subscriptions?select=id,status,payfast_token&payfast_token=not.is.null&status=neq.cancelled&order=id.asc";
  const payload = await fetchJson(url, { headers }, "Supabase query");
  if (!Array.isArray(payload)) throw new Error("Unexpected Supabase payload");
  return payload.filter((row) => typeof row.payfast_token === "string" && row.payfast_token.trim());
}

async function cancelProviderToken(token) {
  const timestamp = new Date().toISOString().replace("Z", "+00:00");
  const suffix = sandbox ? "?testing=true" : "";
  const url =
    "https://api.payfast.co.za/subscriptions/" + encodeURIComponent(token) + "/cancel" + suffix;
  const payload = await fetchJson(
    url,
    {
      method: "PUT",
      headers: {
        "merchant-id": merchantId,
        version: "v1",
        timestamp,
        signature: signature(timestamp),
      },
    },
    "PayFast cancel",
  );
  if (payload?.data?.response !== true) throw new Error("PayFast did not confirm cancellation");
}

async function markCancelled(id) {
  const response = await fetch(
    supabaseUrl + "/rest/v1/subscriptions?id=eq." + encodeURIComponent(id),
    {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      }),
    },
  );
  if (!response.ok) throw new Error("Supabase update failed with HTTP " + response.status);
}

const rows = await listSubscriptions();
summary.candidateRows = rows.length;
const grouped = new Map();
for (const row of rows) {
  const token = row.payfast_token.trim();
  if (!grouped.has(token)) grouped.set(token, []);
  grouped.get(token).push(row);
}
summary.uniqueTokens = grouped.size;

console.log(
  "RONSAS billing stop: rows=" +
    summary.candidateRows +
    " unique_tokens=" +
    summary.uniqueTokens +
    " mode=" +
    summary.mode,
);

if (execute) {
  for (const [token, tokenRows] of grouped.entries()) {
    const tokenHash = fingerprint(token);
    try {
      await cancelProviderToken(token);
      summary.providerCancelled += 1;
      for (const row of tokenRows) {
        await markCancelled(row.id);
        summary.rowsCancelled += 1;
      }
      console.log("Cancelled PayFast recurring token hash=" + tokenHash);
    } catch (error) {
      summary.failures.push({
        tokenHash,
        rows: tokenRows.length,
        error: error instanceof Error ? error.message : "unknown failure",
      });
      console.error("Cancellation failed for token hash=" + tokenHash);
    }
  }
}

summary.completedAt = new Date().toISOString();
writeFileSync(receiptPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, "receipt_path=" + receiptPath + "\n", "utf8");
}
if (summary.failures.length) {
  throw new Error("Billing stop completed with " + summary.failures.length + " failure(s)");
}
if (execute && summary.rowsCancelled !== summary.candidateRows) {
  throw new Error("Not all candidate rows were reconciled");
}
console.log("RONSAS billing stop complete. Receipt: " + receiptPath);
