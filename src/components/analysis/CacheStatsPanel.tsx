import { useCallback, useEffect, useState } from "react";
import { Database, Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

// Rough per-verification-call cost & latency. verify-transcription fires 2
// gemini-flash calls in parallel; these estimates are conservative averages
// so the "savings" line is directional, not a billing figure.
const USD_PER_AVOIDED_CALL = 0.003;
const SECONDS_PER_AVOIDED_CALL = 6;

export default function CacheStatsPanel() {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState(0);
  const [hits, setHits] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("verification_cache")
        .select("hit_count");
      if (error) throw error;
      const rows = data ?? [];
      setEntries(rows.length);
      setHits(rows.reduce((sum: number, r: any) => sum + (r.hit_count ?? 0), 0));
    } catch {
      setEntries(0);
      setHits(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totalRequests = entries + hits; // every entry = 1 miss, each hit = 1 reuse
  const hitRate = totalRequests > 0 ? Math.round((hits / totalRequests) * 100) : 0;
  const savedUsd = hits * USD_PER_AVOIDED_CALL;
  const savedSec = hits * SECONDS_PER_AVOIDED_CALL;
  const savedTime = savedSec >= 60 ? `${(savedSec / 60).toFixed(1)} min` : `${savedSec.toFixed(0)} s`;

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Verification cache stats</span>
          <span className="text-xs text-muted-foreground">across your projects</span>
        </div>
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Cache hits" value={hits.toLocaleString()} hint="reused results" tone="success" />
        <Stat label="Misses" value={entries.toLocaleString()} hint="fresh LLM calls" tone="default" />
        <Stat label="Hit rate" value={`${hitRate}%`} hint={`${totalRequests} total`} tone={hitRate >= 50 ? "success" : "default"} />
        <Stat
          label="Est. saved"
          value={`$${savedUsd.toFixed(3)}`}
          hint={`~${savedTime} of LLM time`}
          tone="success"
          icon={<TrendingUp className="h-3 w-3" />}
        />
      </div>
      <p className="text-[10px] text-muted-foreground mt-3">
        Estimate: ~${USD_PER_AVOIDED_CALL.toFixed(3)} and ~{SECONDS_PER_AVOIDED_CALL}s per avoided verification call. Directional only.
      </p>
    </div>
  );
}

function Stat({
  label, value, hint, tone, icon,
}: { label: string; value: string; hint?: string; tone?: "success" | "default"; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 flex items-center gap-1.5 text-lg font-semibold ${tone === "success" ? "text-success" : "text-foreground"}`}>
        {icon} {value}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
