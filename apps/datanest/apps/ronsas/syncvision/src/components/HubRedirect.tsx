import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { resolveHubRedirect } from "@/lib/hubRedirect";

/**
 * Sends public spoke-domain routes to their canonical hub URL.
 * App routes (dashboard, project, admin, …) are never redirected.
 */
const HubRedirect = () => {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const target = resolveHubRedirect({
      hostname: window.location.hostname,
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    });
    if (target) window.location.replace(target);
  }, [location.pathname, location.search, location.hash]);

  return null;
};

export default HubRedirect;
