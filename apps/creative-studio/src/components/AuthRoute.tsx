import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Route guard that requires an authenticated session. Unauthenticated
 * visitors are redirected to /login with a `?returnTo=` param so the
 * Login page can bounce them back after sign-in.
 */
export default function AuthRoute({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "allowed" | "denied">("checking");
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setState(data.user ? "allowed" : "denied");
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setState(session?.user ? "allowed" : "denied");
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (state === "checking") {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (state === "denied") {
    const returnTo = encodeURIComponent(location.pathname + location.search + location.hash);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }
  return <>{children}</>;
}
