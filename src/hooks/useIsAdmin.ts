import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight hook that resolves the current user's admin status by
 * querying the `user_roles` table (server-side authoritative via RLS +
 * `has_role`). Returns `null` while loading.
 */
export function useIsAdmin(): boolean | null {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .then(({ data }) => {
        if (!cancelled) setIsAdmin(!!(data && data.length > 0));
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return isAdmin;
}
