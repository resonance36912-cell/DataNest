import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isAdminUser } from "@/lib/adminEmails";

/**
 * Route guard that suspends rendering of admin pages until the server-side
 * `user_roles` check resolves. Non-admins are redirected to the admin login.
 * Authoritative enforcement is still RLS + edge-function role checks; this
 * guard exists for UX (prevents flashing admin chrome to non-admins).
 */
export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const ok = await isAdminUser(data.user?.id);
      if (cancelled) return;
      setState(ok ? "allowed" : "denied");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "checking") {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (state === "denied") return <Navigate to="/admin" replace />;
  return <>{children}</>;
}
