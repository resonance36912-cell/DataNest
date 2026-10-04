import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/inter";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/jetbrains-mono";
import App from "./App.tsx";
import "./index.css";
import "./resonance-datanest-adapter.css";
import { installGlobalErrorListeners } from "./lib/error-logger";
import { installCrashLogger } from "./lib/crashLogger";
import { installSovereignNetworkGuard } from "./lib/sovereign-local";

installSovereignNetworkGuard();
installCrashLogger();
installGlobalErrorListeners();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
