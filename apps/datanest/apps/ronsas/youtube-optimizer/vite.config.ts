// RONS direct Vite/TanStack/Nitro configuration; no Lovable build wrapper.
import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error -- .mjs script without types
import { runBrandCheck } from "./scripts/check-brand-assets.mjs";
// @ts-expect-error -- .mjs script without types
import { runPricingCheck } from "./scripts/check-pricing.mjs";
// @ts-expect-error -- .mjs script without types
import { runEnvCheck } from "./scripts/check-env.mjs";
// @ts-expect-error -- .mjs script without types
import { runCanonicalCheck } from "./scripts/check-canonical.mjs";

// Vite plugin: fails the build if any component references a logo/brand
// image not registered in src/assets/brand-pack.json or missing from disk.
function brandPackCheck(): Plugin {
  return {
    name: "brand-pack-check",
    apply: "build",
    buildStart() {
      const errors: string[] = runBrandCheck();
      if (errors.length) {
        this.error(
          "Brand pack check failed:\n" +
            errors.map((e) => "  - " + e).join("\n") +
            "\nUpdate src/assets/brand-pack.json or fix the reference.",
        );
      }
    },
  };
}

// Vite plugin: fails the build if Pricing.tsx tier names/prices drift from
// the expected reson8.life YouTube Optimizer values.
function pricingCheck(): Plugin {
  return {
    name: "pricing-check",
    apply: "build",
    buildStart() {
      const errors: string[] = runPricingCheck();
      if (errors.length) {
        this.error(
          "Pricing check failed:\n" +
            errors.map((e) => "  - " + e).join("\n") +
            "\nAlign src/pages/Pricing.tsx with reson8.life/pricing.",
        );
      }
    },
  };
}

// Vite plugin: fails the build if any page template stops emitting a correct
// self-referencing canonical / og:url, or drops hub (reson8.life) attribution.
function canonicalCheck(): Plugin {
  return {
    name: "canonical-check",
    apply: "build",
    buildStart() {
      const errors: string[] = runCanonicalCheck();
      if (errors.length) {
        this.error(
          "Canonical check failed:\n" +
            errors.map((e) => "  - " + e).join("\n") +
            '\nEvery page must render <SEO path="/its-own-route"> and keep hub attribution to https://reson8.life.',
        );
      }
    },
  };
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { "@": `${process.cwd()}/src` },
    dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/query-core"],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({ server: { entry: "server" } }),
    nitro({ preset: "node-server" }),
    react(),
    brandPackCheck(),
    pricingCheck(),
  ],
});
