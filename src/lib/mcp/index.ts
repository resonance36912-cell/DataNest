import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import listUpdatesTool from "./tools/list-updates";
import { bridgeTools } from "./tools/bridge";

// OAuth issuer MUST be the direct Supabase host — the `.lovable.cloud` proxy
// fails RFC 8414 issuer discovery. VITE_SUPABASE_PROJECT_ID is inlined by Vite
// at build time; the fallback keeps the issuer well-formed during the
// manifest-extract evaluation (no real token verifies against it).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "reson8-hub-mcp",
  title: "Reson8 Hub MCP",
  version: "0.2.0",
  instructions:
    "Tools for the Reson8 hub and the RONSAS shared execution bridge. Bridge tools are fail-closed, caller-scoped, auditable, and queue work for paired connectors rather than exposing raw computer control.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [echoTool, listUpdatesTool, ...bridgeTools],
});
