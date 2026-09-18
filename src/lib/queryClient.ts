import { QueryClient } from "@tanstack/react-query";

/**
 * Shared TanStack Query client. Exported so non-React modules
 * (e.g. gated edge-function wrappers) can invalidate cached
 * entitlement/queries without needing to be inside a hook.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
