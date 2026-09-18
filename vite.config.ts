import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const LOCAL_API = "http://127.0.0.1:3301/__resonance_sovereign__";
const LOCAL_HUB = "http://127.0.0.1:3301/__resonance_hub__";

export default defineConfig({
  server: {
    host: "localhost",
    port: 3301,
    strictPort: true,
    hmr: { overlay: false },
  },
  plugins: [react()],
  build: { outDir: "dist/client" },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  define: {
    "process.env.HUB_URL": JSON.stringify(LOCAL_HUB),
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(LOCAL_API),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("sovereign-local"),
    "import.meta.env.VITE_SOVEREIGN_LOCAL": JSON.stringify("1"),
    __BUILD_COMMIT__: JSON.stringify("sovereign-local-v0.1"),
    __BUILD_COMMIT_SHORT__: JSON.stringify("local01"),
    __BUILD_BRANCH__: JSON.stringify("open-nova-sovereign"),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_MODE__: JSON.stringify("sovereign-local"),
  },
});
