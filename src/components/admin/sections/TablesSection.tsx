import { useEffect, useState } from "react";
import { Database, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AdminSection } from "../AdminSection";

interface TableRow {
  name: string;
  count: number | null;
}

const TABLES = [
  "projects", "scenes", "characters", "render_jobs", "lipsync_jobs",
  "generation_jobs", "transcript_versions", "assembly_configs",
  "user_credits", "credit_topups", "system_alerts", "audit_events",
] as const;

export function TablesSection() {
  const [rows, setRows] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    setLoading(true);
    const results = await Promise.all(
      TABLES.map(async (name) => {
        const { count } = await supabase
          .from(name as any)
          .select("*", { count: "exact", head: true });
        return { name, count: count ?? null } satisfies TableRow;
      })
    );
    setRows(results);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  return (
    <AdminSection
      icon={Database}
      title="Table Snapshot"
      description="Row counts across the core tables (admin-only RLS view)"
      action={
        <Button variant="ghost" size="sm" onClick={fetch} className="gap-1.5 text-muted-foreground hover:text-foreground">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <div
              key={r.name}
              className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
            >
              <span className="font-mono text-xs text-muted-foreground">{r.name}</span>
              <span className="text-sm font-semibold tabular-nums">
                {r.count === null ? "—" : r.count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </AdminSection>
  );
}
