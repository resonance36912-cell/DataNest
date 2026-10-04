import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Subscribes to optimization_suggestions for the current admin and keeps a
 * live pending-review count. Also surfaces a toast whenever a new suggestion
 * is inserted while the admin portal is open.
 *
 * RLS already restricts both the initial load and the realtime stream to
 * admin users, so this hook is a no-op (returns 0) for non-admins.
 */
export function usePendingOptimizationCount() {
  const [count, setCount] = useState(0);
  const initial = useRef(true);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const { count: c, error } = await supabase
        .from("optimization_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (!cancelled && !error) setCount(c ?? 0);
    }

    void refresh().finally(() => {
      initial.current = false;
    });

    const channel = supabase
      .channel("admin_optimization_notify")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "optimization_suggestions" },
        (payload) => {
          const row = payload.new as { title?: string; category?: string };
          // Skip the burst from the very first load
          if (!initial.current) {
            toast.message("New optimization suggestion", {
              description: row.title ?? row.category ?? "Pending admin review",
              action: {
                label: "Review",
                onClick: () => {
                  window.location.assign("/admin?section=optimization");
                },
              },
            });
          }
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "optimization_suggestions" },
        () => void refresh()
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "optimization_suggestions" },
        () => void refresh()
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  return count;
}
