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
    // Production reliability: Rolldown's automatic split graph can evaluate
    // React-dependent chunks before React itself in this app. Keep one
    // deterministic application chunk until the upstream splitter is safe.
    rolldownOptions: {
      output: {
        codeSplitting: false,
      },
    },
    chunkSizeWarningLimit: 2200,
    // Keep this single-bundle policy until production browser coverage proves
    // a future splitter can preserve React evaluation order. Previous manual
    // and automatic split graphs both produced boot-time undefined React APIs.
  },
}));
