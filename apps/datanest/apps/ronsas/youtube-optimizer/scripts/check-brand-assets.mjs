// Build-time brand pack check (no shebang — file is also imported by vite.config.ts).
/**
 * Build-time brand pack check.
 *
 * Fails the build if any source file references a logo/brand image that is
 * not present in the brand pack manifest (src/assets/brand-pack.json) or
 * not present on disk.
 *
 * Scope of what's considered a "brand" reference:
 *   - Any import from `@/assets/*` resolving to an image file
 *   - Any string literal in source/HTML matching brand keywords
 *     (logo, lockup, brand, og-image, favicon) ending in an image extension
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const SRC = join(ROOT, "src");
const PUBLIC_DIR = join(ROOT, "public");
const MANIFEST_PATH = join(SRC, "assets/brand-pack.json");

const IMG_EXT = /\.(png|jpe?g|svg|webp|avif|gif)$/i;
const BRAND_KEYWORD = /(logo|lockup|brand|og-image|favicon)/i;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`Brand pack manifest missing: ${relative(ROOT, MANIFEST_PATH)}`);
  }
  const m = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  return {
    src: new Set(m.srcAssets ?? []),
    pub: new Set(m.publicAssets ?? []),
  };
}

function collectReferences() {
  const refs = []; // { file, ref, kind: 'src'|'public' }
  const files = walk(SRC).filter((f) =>
    /\.(ts|tsx|js|jsx|html|css)$/.test(f) && !f.endsWith("brand-pack.json")
  );
  files.push(...walk(PUBLIC_DIR).filter((f) => /\.html$/.test(f)));
  const htmlIndex = join(ROOT, "index.html");
  if (existsSync(htmlIndex)) files.push(htmlIndex);

  // Import from @/assets/<file>
  const importRe = /from\s+["']@\/assets\/([^"']+)["']/g;
  // String literal /<name>.<ext> referencing public/
  const publicRe = /["'`]\/([\w./-]+\.(?:png|jpe?g|svg|webp|avif|gif|ico))["'`]/gi;

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    let m;
    while ((m = importRe.exec(text))) {
      const ref = m[1];
      if (IMG_EXT.test(ref)) refs.push({ file, ref, kind: "src" });
    }
    while ((m = publicRe.exec(text))) {
      const ref = m[1];
      if (BRAND_KEYWORD.test(ref)) refs.push({ file, ref, kind: "public" });
    }
  }
  return refs;
}

export function runBrandCheck() {
  const manifest = loadManifest();
  const refs = collectReferences();
  const errors = [];

  for (const { file, ref, kind } of refs) {
    const rel = relative(ROOT, file);
    if (kind === "src") {
      const onDisk = join(SRC, "assets", ref);
      if (!existsSync(onDisk)) {
        errors.push(`${rel}: imports @/assets/${ref} but file does not exist`);
        continue;
      }
      // Only enforce manifest membership for brand-keyword assets
      if (BRAND_KEYWORD.test(ref) && !manifest.src.has(ref)) {
        errors.push(
          `${rel}: references brand asset "${ref}" not listed in src/assets/brand-pack.json (srcAssets)`
        );
      }
    } else {
      const onDisk = join(PUBLIC_DIR, ref);
      if (!existsSync(onDisk)) {
        errors.push(`${rel}: references /${ref} but file is missing from public/`);
        continue;
      }
      if (!manifest.pub.has(ref)) {
        errors.push(
          `${rel}: references brand asset "/${ref}" not listed in src/assets/brand-pack.json (publicAssets)`
        );
      }
    }
  }

  return errors;
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = runBrandCheck();
  if (errors.length) {
    console.error("\n✗ Brand pack check failed:\n");
    for (const e of errors) console.error("  - " + e);
    console.error(
      "\nFix: add the asset to src/assets/ (or public/) and register it in src/assets/brand-pack.json, or remove the stale reference.\n"
    );
    process.exit(1);
  }
  console.log("✓ Brand pack check passed (" + " all referenced assets present and registered).");
}
