import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const getSessionId = () => {
  let sid = sessionStorage.getItem("resonance_sid");
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem("resonance_sid", sid);
  }
  return sid;
};

export const trackPageView = async (page: string) => {
  try {
    await supabase.from("page_views").insert({
      page,
      user_agent: navigator.userAgent,
      referrer: document.referrer || null,
      session_id: getSessionId(),
    });
  } catch (e) {
    // silently fail
  }
};

// Audit logging is now handled server-side in the audit-channel edge function
export const trackAudit = async (_channelUrl: string, _channelName?: string, _result?: any) => {
  // No-op: audit logs are written by the edge function with service role
};

export const trackFeature = async (feature: string, metadata?: Record<string, any>) => {
  try {
    await supabase.from("feature_usage").insert({
      feature,
      metadata: metadata || {},
    });
  } catch (e) {
    // silently fail
  }
};

export const usePageTracking = (page: string) => {
  const tracked = useRef(false);
  useEffect(() => {
    if (!tracked.current) {
      tracked.current = true;
      trackPageView(page);
    }
  }, [page]);
};
