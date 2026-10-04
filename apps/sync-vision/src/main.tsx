import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { installGlobalErrorListeners } from "./lib/error-logger";
import { installCrashLogger } from "./lib/crashLogger";
import App from "./App.tsx";
import { installSovereignNetworkGuard } from "./lib/sovereign-local";
import "./index.css";

installSovereignNetworkGuard();
installCrashLogger();
installGlobalErrorListeners();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
