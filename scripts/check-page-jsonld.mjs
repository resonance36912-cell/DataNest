import { read, assert, ok } from "./_check-utils.mjs";
const html = read("index.html");
const blocks = [...html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
assert(blocks.length > 0, "no JSON-LD blocks found");
for (const [i, match] of blocks.entries()) {
  try { JSON.parse(match[1]); } catch (err) {
    console.error("FAIL: JSON-LD block", i+1, "is invalid:", err.message);
    process.exit(1);
  }
}
ok(blocks.length+" JSON-LD block(s) parse successfully");
