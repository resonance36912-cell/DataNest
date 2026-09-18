import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { resolveHubRedirect } from "@/lib/hub-redirects";

/**
 * Catch-all route.
 *
 * Legacy spoke paths (checkout, pricing aliases, docs, updates, support, …)
 * get a real server-side HTTP 301 to their reson8.life hub equivalent —
 * replacing the old prerendered meta-refresh pages. Everything else renders
 * the root notFoundComponent (404).
 */
export const Route = createFileRoute("/$")({
  // Unmatched paths render the 404 shell — never index it.
  head: () => ({
    meta: [
      { title: "Page not found – Resonance YouTube Optimizer" },
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  beforeLoad: ({ location }) => {
    const target = resolveHubRedirect(
      location.pathname,
      location.searchStr,
      location.hash ? `#${location.hash}` : "",
    );
    if (target) {
      throw redirect({ href: target, statusCode: 301 });
    }
    throw notFound();
  },
  component: () => null,
});
