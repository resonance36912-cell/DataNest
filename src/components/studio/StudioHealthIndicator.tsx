import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, RefreshCw, CheckCircle2, AlertTriangle, XCircle, MinusCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Status = "ok" | "degraded" | "down" | "unconfigured";
type ServiceKey = "lovable_ai" | "elevenlabs" | "fal" | "firecrawl";

interface ServiceResult { status: Status; latencyMs: number | null; detail?: string; }
interface FnHealth {
  name: string;
  label: string;
  group: "source" | "analyze" | "image" | "video" | "audio" | "social";
  deps: ServiceKey[];
  status: Status;
  latencyMs: number | null;
  detail?: string;
}
interface HealthPayload {
  success: boolean;
  overall: Status;
  checkedAt: string;
  services: Record<ServiceKey, ServiceResult>;
  functions: FnHealth[];
  cached?: boolean;
}

const SERVICE_LABEL: Record<ServiceKey, string> = {
  lovable_ai: "Lovable AI",
  elevenlabs: "ElevenLabs",
  fal: "FAL.ai",
  firecrawl: "Firecrawl",
};

const STATUS_META: Record<Status, { color: string; ring: string; text: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  ok:           { color: "bg-emerald-400",   ring: "ring-emerald-400/30",  text: "text-emerald-300",  label: "Operational",   Icon: CheckCircle2 },
  degraded:     { color: "bg-amber-400",     ring: "ring-amber-400/30",    text: "text-amber-300",    label: "Degraded",      Icon: AlertTriangle },
  down:         { color: "bg-rose-500",      ring: "ring-rose-500/30",     text: "text-rose-300",     label: "Down",          Icon: XCircle },
  unconfigured: { color: "bg-zinc-500",      ring: "ring-zinc-500/30",     text: "text-zinc-300",     label: "Unconfigured",  Icon: MinusCircle },
};

const GROUP_LABEL: Record<FnHealth["group"], string> = {
  source: "Source",
  analyze: "Analysis",
  image: "Image",
  video: "Video",
  audio: "Audio",
  social: "Social",
};

const POLL_MS = 60_000;

export default function StudioHealthIndicator() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: payload, error: err } = await supabase.functions.invoke<HealthPayload>("health-check", { body: {} });
      if (err) throw err;
      if (!payload?.success) throw new Error("Health check returned no data");
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => { if (!cancelled) await fetchHealth(); };
    run();
    const id = window.setInterval(run, POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [fetchHealth]);

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const overall: Status = data?.overall ?? (error ? "down" : "unconfigured");
  const meta = STATUS_META[overall];
  const functions = data?.functions ?? [];
  const okCount = functions.filter((f) => f.status === "ok").length;
  const totalCount = functions.length;

  const grouped = (data?.functions ?? []).reduce<Record<string, FnHealth[]>>((acc, f) => {
    (acc[f.group] ||= []).push(f); return acc;
  }, {});

  return (
    <div className="relative" ref={popRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`Studio health: ${meta.label}`}
        aria-label={`Studio health: ${meta.label}`}
        aria-expanded={open}
        className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground bg-white/[0.03] ring-1 ring-white/[0.06] hover:bg-white/[0.06] transition-colors"
      >
        <span className="relative flex h-2 w-2">
          {overall === "ok" && (
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${meta.color} opacity-50`} />
          )}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${meta.color}`} />
        </span>
        <span className="hidden sm:inline">
          {data ? `${okCount}/${totalCount} healthy` : loading ? "Checking…" : meta.label}
        </span>
        <Activity className="w-3.5 h-3.5 sm:hidden" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            role="dialog"
            aria-label="Studio service health"
            className="absolute right-0 top-full mt-2 w-[320px] max-w-[calc(100vw-2rem)] z-50 rounded-xl ring-1 ring-white/[0.08] bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className={`flex items-center gap-2 text-sm font-semibold ${meta.text}`}>
                  <meta.Icon className="w-4 h-4" />
                  <span>System {meta.label.toLowerCase()}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {data ? `Checked ${new Date(data.checkedAt).toLocaleTimeString()}${data.cached ? " · cached" : ""}` : "Awaiting first check…"}
                </p>
              </div>
              <button
                type="button"
                onClick={fetchHealth}
                disabled={loading}
                className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                aria-label="Refresh health"
                title="Refresh now"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {error && (
              <div className="px-4 py-2 text-[11px] text-rose-300 bg-rose-500/10 border-b border-rose-500/20">
                {error}
              </div>
            )}

            {data && (
              <>
                <div className="px-4 py-2 grid grid-cols-2 gap-x-3 gap-y-1.5 border-b border-white/[0.06]">
                  {(Object.keys(data.services) as ServiceKey[]).map((k) => {
                    const s = data.services[k];
                    const m = STATUS_META[s.status];
                    return (
                      <div key={k} className="flex items-center gap-2 text-[11px]">
                        <span className={`h-1.5 w-1.5 rounded-full ${m.color}`} />
                        <span className="text-foreground/80 truncate">{SERVICE_LABEL[k]}</span>
                        {s.latencyMs != null && (
                          <span className="ml-auto text-muted-foreground tabular-nums">{s.latencyMs}ms</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="max-h-[360px] overflow-y-auto py-1">
                  {Object.entries(grouped).map(([group, fns]) => (
                    <div key={group} className="px-2 py-1.5">
                      <div className="px-2 text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">
                        {GROUP_LABEL[group as FnHealth["group"]]}
                      </div>
                      <ul className="space-y-0.5">
                        {fns.map((f) => {
                          const m = STATUS_META[f.status];
                          return (
                            <li
                              key={f.name}
                              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.03] text-xs"
                              title={f.detail || m.label}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${m.color} shrink-0`} />
                              <span className="flex-1 truncate text-foreground/85">{f.label}</span>
                              <span className={`text-[10px] ${m.text} shrink-0`}>{m.label}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
