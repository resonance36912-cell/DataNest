import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const target = resolve(process.argv[2] || "public/runtime-config.js");
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

mkdirSync(dirname(target), { recursive: true });
writeFileSync(
  target,
  "window.__DATANEST_CONFIG__ = " + JSON.stringify({
    supabaseUrl: url,
    supabasePublishableKey: key,
    authoritative: true
  }).replace(/</g, "\\u003c") + ";\n",
  "utf8"
);
console.log("Wrote public Supabase runtime configuration to " + target);
