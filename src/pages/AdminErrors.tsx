import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isAdminUser } from "@/lib/adminEmails";
import { Loader2, ArrowLeft, RefreshCw, Trash2, Filter, AlertTriangle, Compass } from "lucide-react";
import { format } from "date-fns";
import SEO from "@/components/SEO";

interface ClientErrorRow {
  id: string;
  created_at: string;
  user_id: string | null;
  route: string | null;
  message: string;
  stack: string | null;
  source: string | null;
  lineno: number | null;
  colno: number | null;
  severity: string;
  user_agent: string | null;
  context: Record<string, unknown> | null;
}

interface EdgeLogRow {
  id: string;
  created_at: string;
  fn: string;
  level: string;
  message: string;
  user_id: string | null;
  request_id: string | null;
  duration_ms: number | null;
  context: Record<string, unknown> | null;
}

type Tab = "client" | "edge";

const PAGE_SIZE = 100;

export default function AdminErrors() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("client");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clientRows, setClientRows] = useState<ClientErrorRow[]>([]);
  const [edgeRows, setEdgeRows] = useState<EdgeLogRow[]>([]);
  const [routeFilter, setRouteFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [fnFilter, setFnFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user || !(await isAdminUser(data.user.id))) {
        navigate("/admin", { replace: true });
        return;
      }
      await Promise.all([loadClient(), loadEdge()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  async function loadClient() {
    const { data } = await supabase
      .from("client_error_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    setClientRows((data ?? []) as ClientErrorRow[]);
  }

  async function loadEdge() {
    const { data } = await supabase
      .from("edge_function_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    setEdgeRows((data ?? []) as EdgeLogRow[]);
  }

  async function refresh() {
    setRefreshing(true);
    await Promise.all([loadClient(), loadEdge()]);
    setRefreshing(false);
  }

  async function clearClient() {
    if (!confirm("Delete all visible client error logs?")) return;
    const ids = clientRows.map((r) => r.id);
    if (!ids.length) return;
    await supabase.from("client_error_logs").delete().in("id", ids);
    await loadClient();
  }

  const filteredClient = useMemo(() => {
    return clientRows.filter((r) => {
      if (routeFilter === "__not_found__") {
        const kind = (r.context as any)?.kind;
        if (kind !== "route-not-found") return false;
      } else if (routeFilter && !(r.route ?? "").toLowerCase().includes(routeFilter.toLowerCase())) {
        return false;
      }
      if (severityFilter !== "all" && r.severity !== severityFilter) return false;
      return true;
    });
  }, [clientRows, routeFilter, severityFilter]);

  // Aggregate route-not-found hits so admins can confirm legacy paths are
  // being recorded and see the top offenders at a glance.
  const notFoundSummary = useMemo(() => {
    const rows = clientRows.filter(
      (r) => (r.context as any)?.kind === "route-not-found",
    );
    const counts = new Map<string, { path: string; count: number; latest: string }>();
    for (const r of rows) {
      const ctx = (r.context ?? {}) as Record<string, unknown>;
      const path =
        (typeof ctx.attemptedPath === "string" && ctx.attemptedPath) ||
        (typeof ctx.route === "string" && ctx.route) ||
        r.route ||
        "(unknown)";
      const existing = counts.get(path);
      if (existing) {
        existing.count += 1;
        if (r.created_at > existing.latest) existing.latest = r.created_at;
      } else {
        counts.set(path, { path, count: 1, latest: r.created_at });
      }
    }
    return {
      total: rows.length,
      unique: counts.size,
      top: Array.from(counts.values())
        .sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest))
        .slice(0, 8),
    };
  }, [clientRows]);

  const filteredEdge = useMemo(() => {
    return edgeRows.filter((r) => {
      if (fnFilter && !r.fn.toLowerCase().includes(fnFilter.toLowerCase())) return false;
      if (levelFilter !== "all" && r.level !== levelFilter) return false;
      return true;
    });
  }, [edgeRows, fnFilter, levelFilter]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Error Logs — Admin" description="Runtime error logs from the client and edge functions." path="/admin/errors" noindex />
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin/dashboard" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="font-display text-base font-bold">Error Logs</span>
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="text-sm inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-muted/50 disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center gap-2 mb-4 border-b border-border">
          <button
            onClick={() => setTab("client")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === "client" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Client errors <span className="ml-1 text-xs text-muted-foreground">({clientRows.length})</span>
          </button>
          <button
            onClick={() => setTab("edge")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === "edge" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Edge function logs <span className="ml-1 text-xs text-muted-foreground">({edgeRows.length})</span>
          </button>
        </div>

        {tab === "client" ? (
          <>
            {/* Route-not-found summary — confirms legacy paths are being
                recorded and highlights the top offenders. */}
            <div className="mb-4 rounded-lg border border-border bg-card/50 p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <Compass className="w-4 h-4 text-primary" />
                  <span className="font-semibold">Route-not-found log</span>
                  <span className="text-muted-foreground">
                    {notFoundSummary.total} hit{notFoundSummary.total === 1 ? "" : "s"} · {notFoundSummary.unique} unique path{notFoundSummary.unique === 1 ? "" : "s"}
                  </span>
                </div>
                <button
                  onClick={() => setRouteFilter(routeFilter === "__not_found__" ? "" : "__not_found__")}
                  className={`text-xs px-2.5 py-1 rounded-md border transition ${
                    routeFilter === "__not_found__"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  {routeFilter === "__not_found__" ? "Show all client errors" : "Filter to 404s only"}
                </button>
              </div>
              {notFoundSummary.total === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  No <code className="font-mono">route-not-found</code> events recorded yet. Visit a
                  legacy or unknown path (e.g. <code className="font-mono">/legacy/old</code>) to verify
                  logging.
                </p>
              ) : (
                <ul className="mt-3 space-y-1 text-xs">
                  {notFoundSummary.top.map((row) => (
                    <li key={row.path} className="flex items-center gap-3">
                      <span className="inline-flex min-w-[2.5rem] justify-center rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                        {row.count}×
                      </span>
                      <code className="font-mono text-foreground truncate" title={row.path}>{row.path}</code>
                      <span className="ml-auto text-muted-foreground whitespace-nowrap">
                        {format(new Date(row.latest), "MMM d HH:mm")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex items-center gap-1.5 text-sm">
                <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={routeFilter === "__not_found__" ? "" : routeFilter}
                  onChange={(e) => setRouteFilter(e.target.value)}
                  placeholder={routeFilter === "__not_found__" ? "(showing 404s only)" : "Filter by route…"}
                  disabled={routeFilter === "__not_found__"}
                  className="bg-card border border-border rounded-md px-2.5 py-1.5 text-sm w-56 disabled:opacity-60"
                />
              </div>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="bg-card border border-border rounded-md px-2.5 py-1.5 text-sm"
              >
                <option value="all">All severities</option>
                <option value="error">error</option>
                <option value="warn">warn</option>
                <option value="info">info</option>
              </select>
              <button
                onClick={clearClient}
                className="ml-auto text-sm inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear visible
              </button>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">When</th>
                    <th className="text-left px-3 py-2">Sev</th>
                    <th className="text-left px-3 py-2">Route</th>
                    <th className="text-left px-3 py-2">Message</th>
                    <th className="text-left px-3 py-2">User</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClient.length === 0 && (
                    <tr><td colSpan={5} className="text-center text-muted-foreground py-8">No errors logged.</td></tr>
                  )}
                  {filteredClient.map((r) => (
                    <Fragment key={r.id}>
                      <tr
                        key={r.id}
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                        className="border-t border-border hover:bg-muted/20 cursor-pointer"
                      >
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{format(new Date(r.created_at), "MMM d HH:mm:ss")}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            r.severity === "error" ? "bg-destructive/15 text-destructive" :
                            r.severity === "warn" ? "bg-yellow-500/15 text-yellow-500" :
                            "bg-muted text-muted-foreground"
                          }`}>{r.severity}</span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground font-mono text-xs max-w-[180px] truncate">{r.route ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs max-w-[420px] truncate">{r.message}</td>
                        <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{r.user_id?.slice(0, 8) ?? "anon"}</td>
                      </tr>
                      {expanded === r.id && (
                        <tr key={r.id + "-d"} className="bg-muted/10 border-t border-border">
                          <td colSpan={5} className="px-3 py-3 text-xs space-y-2">
                            {r.stack && (
                              <pre className="whitespace-pre-wrap bg-background/60 border border-border rounded p-2 max-h-72 overflow-auto">{r.stack}</pre>
                            )}
                            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                              {r.source && <div>source: <span className="text-foreground font-mono">{r.source}:{r.lineno}:{r.colno}</span></div>}
                              {r.user_agent && <div className="truncate">UA: <span className="text-foreground">{r.user_agent}</span></div>}
                            </div>
                            {r.context && Object.keys(r.context).length > 0 && (
                              <pre className="whitespace-pre-wrap bg-background/60 border border-border rounded p-2">{JSON.stringify(r.context, null, 2)}</pre>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex items-center gap-1.5 text-sm">
                <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={fnFilter}
                  onChange={(e) => setFnFilter(e.target.value)}
                  placeholder="Filter by function…"
                  className="bg-card border border-border rounded-md px-2.5 py-1.5 text-sm w-56"
                />
              </div>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                className="bg-card border border-border rounded-md px-2.5 py-1.5 text-sm"
              >
                <option value="all">All levels</option>
                <option value="error">error</option>
                <option value="warn">warn</option>
                <option value="info">info</option>
                <option value="debug">debug</option>
              </select>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">When</th>
                    <th className="text-left px-3 py-2">Level</th>
                    <th className="text-left px-3 py-2">Function</th>
                    <th className="text-left px-3 py-2">Message</th>
                    <th className="text-left px-3 py-2">Dur</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEdge.length === 0 && (
                    <tr><td colSpan={5} className="text-center text-muted-foreground py-8">No edge logs yet.</td></tr>
                  )}
                  {filteredEdge.map((r) => (
                    <Fragment key={r.id}>
                      <tr
                        key={r.id}
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                        className="border-t border-border hover:bg-muted/20 cursor-pointer"
                      >
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{format(new Date(r.created_at), "MMM d HH:mm:ss")}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            r.level === "error" ? "bg-destructive/15 text-destructive" :
                            r.level === "warn" ? "bg-yellow-500/15 text-yellow-500" :
                            r.level === "debug" ? "bg-muted text-muted-foreground" :
                            "bg-primary/15 text-primary"
                          }`}>{r.level}</span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{r.fn}</td>
                        <td className="px-3 py-2 font-mono text-xs max-w-[420px] truncate">{r.message}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{r.duration_ms != null ? `${r.duration_ms}ms` : "—"}</td>
                      </tr>
                      {expanded === r.id && r.context && Object.keys(r.context).length > 0 && (
                        <tr key={r.id + "-d"} className="bg-muted/10 border-t border-border">
                          <td colSpan={5} className="px-3 py-3 text-xs">
                            <pre className="whitespace-pre-wrap bg-background/60 border border-border rounded p-2 max-h-72 overflow-auto">{JSON.stringify(r.context, null, 2)}</pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
