import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { visualRunnerPlugin } from "./vite-plugins/visual-runner";


// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Explicit SPA app type — Vite's dev server and `vite preview` both use
  // history-API fallback so any unknown path is served index.html and the
  // React Router catch-all (`NotFound` → marketing recovery screen) handles it.
  appType: "spa",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  // Mirror the dev server for `vite preview` (used by e2e tests and local
  // production smoke checks). SPA fallback is on by default with appType:"spa".
  preview: {
    host: "::",
    port: 4173,
    strictPort: true,
  },
  plugins: [
    react(),
    mode === "development" && visualRunnerPlugin(),
  ].filter(Boolean),

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  build: {
    // Cleaner warning threshold now that vendor chunks are split out.
    chunkSizeWarningLimit: 1200,
    // NOTE: manualChunks removed intentionally. Splitting React-dependent
    // vendors (recharts, radix, react-helmet, etc.) into separate chunks
    // caused a production boot crash — those chunks executed before the
    // `react-vendor` chunk, so `React` / `ReactDOM` were `undefined` at
    // module init, producing `Cannot read properties of undefined
    // (reading 'forwardRef' | 'createRoot')`. Let Rollup determine chunking
    // automatically so React always evaluates before its consumers.
  },
}));
