import { createFileRoute } from "@tanstack/react-router";
import { proxyAuth } from "@/lib/rons-local-proxy.server";
function action(request:Request){ return new URL(request.url).pathname.split("/").filter(Boolean).at(-1) ?? ""; }
export const Route = createFileRoute("/api/rons/auth/$action")({
  server:{ handlers:{
    GET: async ({request}) => proxyAuth(request,action(request)),
    POST: async ({request}) => proxyAuth(request,action(request)),
  }},
});