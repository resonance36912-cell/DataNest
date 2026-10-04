import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readSource = (relativePath) => {
  const absolutePath = path.join(repoRoot, relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
};

const identitySource = readSource("src/lib/brandIdentity.ts");
const themeSource = readSource("src/lib/themePreference.ts");
const reson8Source = readSource("src/lib/reson8.ts");
const designSystemSource = readSource("src/app/resonance-design-system.css");
const themeControlSource = readSource("src/components/platform/ThemeControl.tsx");
const themeBootstrapSource = readSource("src/components/platform/ThemeBootstrapScript.tsx");
const layoutSource = readSource("src/app/layout.tsx");

test("canonical Resonance business identity is centralized without expanding RSGP", () => {
  assert.notEqual(identitySource, "", "brandIdentity.ts must exist");
  assert.match(identitySource, /legalOperator:\s*"Resonance Sole Proprietorship"/);
  assert.match(identitySource, /businessBrand:\s*"Resonance App Development"/);
  assert.match(identitySource, /platform:\s*"Resonance DataNest"/);
  assert.match(identitySource, /export const DATANEST_DISPLAY_NAME\s*=\s*"Resonance DataNest"/);
  assert.match(identitySource, /export const RSGP_GOVERNANCE_LABEL\s*=\s*"RSGP Governed"/);
  assert.match(identitySource, /return `\$\{name\} — a governed Resonance DataNest application by Resonance App Development\.`/);
  assert.doesNotMatch(identitySource, /RSGP\s+(?:means|stands for|is short for)/i);
  assert.doesNotMatch(identitySource, /Resonance[^\n"']{0,40}(?:Governance|Protocol)[^\n"']{0,40}RSGP/i);
});

test("DataNest keeps machine and display names separate", () => {
  assert.match(reson8Source, /DATANEST_CANONICAL_NAME\s*=\s*"DataNest"/);
  assert.match(reson8Source, /DATANEST_DISPLAY_NAME/);
});

test("theme preference contract exposes only dark light and system", () => {
  assert.notEqual(themeSource, "", "themePreference.ts must exist");
  assert.match(themeSource, /THEME_PREFERENCES\s*=\s*\["dark",\s*"light",\s*"system"\]\s*as const/);
  assert.match(themeSource, /export type ThemePreference\s*=\s*typeof THEME_PREFERENCES\[number\]/);
  assert.match(themeSource, /export type ResolvedTheme\s*=\s*"dark"\s*\|\s*"light"/);
  assert.match(themeSource, /export const THEME_STORAGE_KEY\s*=\s*"datanest-theme"/);
  assert.match(themeSource, /export function normalizeThemePreference\(value:unknown\):ThemePreference/);
  assert.match(themeSource, /return THEME_PREFERENCES\.includes\(value as ThemePreference\)\?value as ThemePreference:"system"/);
  assert.match(themeSource, /export function resolveTheme\(preference:ThemePreference,prefersDark:boolean\):ResolvedTheme/);
  assert.match(themeSource, /return preference==="system"\?\(prefersDark\?"dark":"light"\):preference/);
});


test("root theme system is tokenized, self-hosted, and bootstrapped before runtime scripts", () => {
  assert.notEqual(designSystemSource, "", "resonance-design-system.css must exist");
  assert.notEqual(themeControlSource, "", "ThemeControl.tsx must exist");
  assert.notEqual(themeBootstrapSource, "", "ThemeBootstrapScript.tsx must exist");
  assert.match(designSystemSource, /--surface-canvas:/);
  assert.match(designSystemSource, /--font-heading:/);
  assert.match(designSystemSource, /--font-body:/);
  assert.match(designSystemSource, /--font-editorial:/);
  assert.match(designSystemSource, /--font-mono:/);
  assert.match(designSystemSource, /html\[data-theme="light"\]/);
  assert.match(designSystemSource, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(designSystemSource, /prefers-contrast:\s*more|forced-colors:\s*active/);
  assert.match(themeControlSource, /aria-label="Theme preference"/);
  assert.match(themeControlSource, /THEME_STORAGE_KEY/);
  assert.match(themeControlSource, /normalizeThemePreference/);
  assert.match(themeControlSource, /resolveTheme/);
  assert.match(themeBootstrapSource, /datanest-theme/);
  assert.match(themeBootstrapSource, /prefers-color-scheme:\s*dark/);
  assert.match(layoutSource, /Inter_Tight/);
  assert.match(layoutSource, /Instrument_Serif/);
  assert.match(layoutSource, /JetBrains_Mono/);
  assert.ok(
    layoutSource.indexOf("./resonance-design-system.css") >= 0
      && layoutSource.indexOf("./resonance-design-system.css") < layoutSource.indexOf("./globals.css"),
    "canonical design system CSS must load before legacy/global styles"
  );
  assert.ok(
    layoutSource.indexOf("<ThemeBootstrapScript") >= 0
      && layoutSource.indexOf("<ThemeBootstrapScript") < layoutSource.indexOf("<script src={runtimeConfigSource}"),
    "theme bootstrap must be rendered before runtime configuration"
  );
});


test("canonical design system owns palette and brand-fit compatibility", () => {
  const layoutSource = readSource("src/app/layout.tsx");
  const globalsSource = readSource("src/app/globals.css");
  const designSystemSource = readSource("src/app/resonance-design-system.css");
  const specialistSources = [
    "src/app/entry.css",
    "src/app/external-auditor.css",
    "src/app/datanest-ai-command-center.css",
    "src/app/datanest-ai-optimized.css",
    "src/app/datanest-ai-zoom.css"
  ].map(readSource).join("\n");

  assert.doesNotMatch(layoutSource, /datanest-brand-fit\.css/);
  assert.doesNotMatch(globalsSource, /--rs-bg-0\s*:/);
  assert.doesNotMatch(globalsSource, /--rs-text\s*:/);
  assert.match(designSystemSource, /--rs-bg-0\s*:\s*var\(--surface-canvas\)/);
  assert.match(designSystemSource, /--rs-text\s*:\s*var\(--text-primary\)/);
  assert.doesNotMatch(specialistSources, /--font-(?:heading|body|editorial|mono)\s*:/);
  assert.doesNotMatch(specialistSources, /--(?:surface-canvas|brand-magenta|brand-cyan|text-primary)\s*:/);
});
