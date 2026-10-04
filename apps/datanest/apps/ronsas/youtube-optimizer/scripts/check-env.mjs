// Validates required Resonance Hub Supabase env vars at build time.
// - VITE_SUPABASE_URL: must be an https://<ref>.supabase.co URL
// - VITE_SUPABASE_PUBLISHABLE_KEY: JWT-shaped (three dot-separated base64url segments)
//   or the newer `sb_publishable_...` publishable-key format.

const URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const SB_PUB_RE = /^sb_publishable_[A-Za-z0-9_-]{20,}$/;

export function runEnvCheck(env = process.env) {
  const errors = [];
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url) {
    errors.push("VITE_SUPABASE_URL is missing (expected in project .env from the Lovable Cloud connection).");
  } else if (!URL_RE.test(url)) {
    errors.push(`VITE_SUPABASE_URL is malformed: "${url}" — expected https://<project-ref>.supabase.co`);
  }

  if (!key) {
    errors.push("VITE_SUPABASE_PUBLISHABLE_KEY is missing (expected in project .env from the Lovable Cloud connection).");
  } else if (!JWT_RE.test(key) && !SB_PUB_RE.test(key)) {
    errors.push(
      "VITE_SUPABASE_PUBLISHABLE_KEY is malformed: expected a JWT (three dot-separated segments) " +
        "or an `sb_publishable_...` key. Do NOT paste a service_role key here — that key must never ship to the client."
    );
  } else if (key.startsWith("eyJ")) {
    // Best-effort JWT payload check: role should be `anon`, never `service_role`.
    try {
      const payload = JSON.parse(
        Buffer.from(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
      );
      if (payload.role === "service_role") {
        errors.push(
          "VITE_SUPABASE_PUBLISHABLE_KEY contains a service_role JWT. This key would leak admin access to the browser. " +
            "Replace it with the project's anon/publishable key."
        );
      } else if (payload.role && payload.role !== "anon") {
        errors.push(`VITE_SUPABASE_PUBLISHABLE_KEY has unexpected role "${payload.role}" (expected "anon").`);
      }
    } catch {
      errors.push("VITE_SUPABASE_PUBLISHABLE_KEY looks like a JWT but its payload could not be decoded.");
    }
  }

  return errors;
}

// CLI entry: `node scripts/check-env.mjs`
if (import.meta.url === `file://${process.argv[1]}`) {
  // Load .env if present so the CLI works outside Vite too.
  try {
    const { config } = await import("dotenv");
    config();
  } catch {
    // dotenv is optional; Vite injects env vars during build.
  }
  const errors = runEnvCheck();
  if (errors.length) {
    console.error("\nEnv check failed:\n" + errors.map((e) => "  - " + e).join("\n") + "\n");
    process.exit(1);
  }
  console.log("Env check passed: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY look valid.");
}
