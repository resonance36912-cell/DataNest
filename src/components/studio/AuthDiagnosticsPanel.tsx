// On-screen auth diagnostics. Watches studio logs for auth/scrape failures,
// probes the current Supabase session, and explains bad_jwt / stale-session
// situations with actionable sign out/in steps.
//
// Deep-links the user directly to the Studio action that unblocks the *current*
// failing step (Retry scrape / Retry analyze / Retry generate, Sign in when
// there is no session, Refresh session for stale tokens, Sign out & re-auth
// as the nuclear option).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  LogOut,
  LogIn,
  PlayCircle,
  RotateCw,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStudioLogs, studioLog } from "@/lib/studioLog";
import { useNavigate } from "react-router-dom";

type ProbeState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok"; email?: string; expiresInSec?: number }
  | { status: "no_session" }
  | { status: "bad_jwt"; detail: string }
  | { status: "network"; detail: string };

export type BlockedStep = "scrape" | "analyze" | "generate" | null;

const AUTH_ERROR_PATTERNS = [
  /bad[_ ]jwt/i,
  /missing sub claim/i,
  /invalid claim/i,
  /jwt expired/i,
  /not authenticated/i,
  /401/,
  /403/,
  /unauthorized/i,
  /sign[- ]?in (timed out|expired)/i,
  /auth (check|session) (timed out|failed)/i,
];

function detectAuthBlock(messages: string[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (AUTH_ERROR_PATTERNS.some((re) => re.test(m))) return m;
  }
  return null;
}

const STEP_LABEL: Record<NonNullable<BlockedStep>, string> = {
  scrape: "Retry scrape",
  analyze: "Retry analysis",
  generate: "Retry generate",
};

export default function AuthDiagnosticsPanel({
  visible,
  onClose,
  blockedStep = null,
  onRetryStep,
  isAuthenticated = true,
}: {
  visible: boolean;
  onClose: () => void;
  blockedStep?: BlockedStep;
  onRetryStep?: (step: NonNullable<BlockedStep>) => void;
  isAuthenticated?: boolean;
}) {
  const logs = useStudioLogs();
  const navigate = useNavigate();
  const [probe, setProbe] = useState<ProbeState>({ status: "idle" });
  const [expanded, setExpanded] = useState(true);

  // Look for an auth-related failure in recent scrape/system errors.
  const blockingLog = useMemo(() => {
    const recent = logs.slice(-40).filter(
      (l) => l.level === "error" || l.level === "warn",
    );
    return detectAuthBlock(recent.map((l) => `${l.message} ${l.details ?? ""}`));
  }, [logs]);

  const runProbe = useCallback(async () => {
    setProbe({ status: "checking" });
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6_000);
      const [{ data: sessionData }, { data: userData, error: userErr }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser(),
      ]);
      clearTimeout(timer);

      if (userErr) {
        const msg = userErr.message || String(userErr);
        if (/jwt|claim|sub|401|403|unauthorized/i.test(msg)) {
          setProbe({ status: "bad_jwt", detail: msg });
          studioLog.error("system", "Auth probe: server rejected token", msg);
          return;
        }
        setProbe({ status: "network", detail: msg });
        studioLog.warn("system", "Auth probe network/error", msg);
        return;
      }

      const session = sessionData.session;
      if (!session || !userData.user) {
        setProbe({ status: "no_session" });
        studioLog.warn("system", "Auth probe: no active session");
        return;
      }

      const expiresInSec = session.expires_at
        ? Math.max(0, session.expires_at - Math.floor(Date.now() / 1000))
        : undefined;
      setProbe({ status: "ok", email: userData.user.email ?? undefined, expiresInSec });
      studioLog.success("system", `Auth probe OK${expiresInSec ? ` (expires in ${expiresInSec}s)` : ""}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setProbe({ status: "network", detail: msg });
      studioLog.warn("system", "Auth probe failed", msg);
    }
  }, []);

  // Auto-probe when the panel opens or a blocking auth log appears.
  useEffect(() => {
    if (!visible) return;
    runProbe();
  }, [visible, runProbe]);

  useEffect(() => {
    if (!blockingLog) return;
    runProbe();
  }, [blockingLog, runProbe]);

  const handleRefreshSession = useCallback(async () => {
    studioLog.info("system", "Refreshing session…");
    try {
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        studioLog.error("system", "Session refresh failed", error.message);
      } else {
        studioLog.success("system", "Session refreshed");
      }
    } catch (e) {
      studioLog.error("system", "Session refresh threw", e instanceof Error ? e.message : String(e));
    }
    runProbe();
  }, [runProbe]);

  const handleSignOut = useCallback(async () => {
    studioLog.info("system", "Signing out for clean re-auth");
    try {
      await supabase.auth.signOut();
    } catch {
      // best-effort
    }
    try {
      // Nuke any lingering sb-* tokens for this origin so the next sign-in is pristine.
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("sb-") && key.endsWith("-auth-token")) localStorage.removeItem(key);
      }
    } catch {
      // ignore storage errors
    }
    navigate("/login?returnTo=/studio");
  }, [navigate]);

  const handleSignIn = useCallback(() => {
    studioLog.info("system", "Routing to sign-in (no active session)");
    navigate("/login?returnTo=/studio");
  }, [navigate]);

  const handleRefreshThenRetry = useCallback(async () => {
    await handleRefreshSession();
    if (blockedStep && onRetryStep) {
      studioLog.info("system", `Deep-link: re-running ${blockedStep} after session refresh`);
      onRetryStep(blockedStep);
    }
  }, [handleRefreshSession, blockedStep, onRetryStep]);

  const handleRetryStep = useCallback(() => {
    if (!blockedStep || !onRetryStep) return;
    studioLog.info("system", `Deep-link: retry ${blockedStep}`);
    onRetryStep(blockedStep);
  }, [blockedStep, onRetryStep]);

  // Countdown-driven action runner. Shows a short visible countdown + progress
  // bar before triggering retry/reload so the user knows something is happening
  // and can cancel if needed.
  const COUNTDOWN_SECONDS = 3;
  const [pending, setPending] = useState<
    | { kind: "reload" | "retry" | "refresh-retry"; remaining: number; total: number }
    | null
  >(null);

  useEffect(() => {
    if (!pending) return;
    if (pending.remaining <= 0) return;
    const t = setTimeout(() => {
      setPending((p) => (p ? { ...p, remaining: p.remaining - 1 } : p));
    }, 1000);
    return () => clearTimeout(t);
  }, [pending]);

  const performHardReload = useCallback(() => {
    try {
      studioLog.info(
        "system",
        `Deep-link: hard-reloading Studio${blockedStep ? ` (was blocked on ${blockedStep})` : ""}`,
      );
    } catch {
      // ignore log errors
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("_reload", Date.now().toString(36));
      if (blockedStep) url.searchParams.set("resume", blockedStep);
      window.location.replace(url.toString());
    } catch {
      window.location.reload();
    }
  }, [blockedStep]);

  // When countdown hits 0, fire the queued action.
  useEffect(() => {
    if (!pending || pending.remaining > 0) return;
    const kind = pending.kind;
    setPending(null);
    if (kind === "reload") {
      performHardReload();
    } else if (kind === "retry") {
      if (blockedStep && onRetryStep) onRetryStep(blockedStep);
    } else if (kind === "refresh-retry") {
      (async () => {
        await handleRefreshSession();
        if (blockedStep && onRetryStep) onRetryStep(blockedStep);
      })();
    }
  }, [pending, performHardReload, blockedStep, onRetryStep, handleRefreshSession]);

  const startCountdown = useCallback(
    (kind: "reload" | "retry" | "refresh-retry") => {
      studioLog.info("system", `Countdown started for ${kind} (${COUNTDOWN_SECONDS}s)`);
      setPending({ kind, remaining: COUNTDOWN_SECONDS, total: COUNTDOWN_SECONDS });
    },
    [],
  );

  const cancelCountdown = useCallback(() => {
    studioLog.info("system", "Countdown cancelled by user");
    setPending(null);
  }, []);

  const handleHardReload = useCallback(() => startCountdown("reload"), [startCountdown]);

  if (!visible) return null;

  const noSession = probe.status === "no_session" || !isAuthenticated;
  const severity =
    probe.status === "bad_jwt" || noSession || !!blockingLog
      ? "critical"
      : probe.status === "network"
      ? "warn"
      : "ok";

  const headline =
    severity === "critical"
      ? noSession
        ? "You're signed out"
        : "Sign-in is blocking the pipeline"
      : severity === "warn"
      ? "Couldn't verify your session"
      : "Auth looks healthy";

  const stepLabel = blockedStep ? STEP_LABEL[blockedStep] : null;

  return (
    <div className="pointer-events-auto w-[min(420px,calc(100vw-2rem))] rounded-xl bg-background/95 backdrop-blur ring-1 ring-white/[0.08] shadow-2xl text-foreground">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          {severity === "ok" ? (
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          ) : (
            <ShieldAlert className={severity === "critical" ? "h-4 w-4 text-rose-400" : "h-4 w-4 text-amber-400"} />
          )}
          <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Auth diagnostics</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="p-1 rounded hover:bg-white/[0.06] text-muted-foreground"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/[0.06] text-muted-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-3 space-y-3 text-sm">
          <div>
            <p className="font-medium text-foreground">{headline}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {probe.status === "checking" && "Checking your session with the auth server…"}
              {probe.status === "ok" &&
                `Signed in as ${probe.email ?? "—"}${
                  probe.expiresInSec !== undefined ? ` · token expires in ${Math.floor(probe.expiresInSec / 60)}m` : ""
                }.`}
              {probe.status === "no_session" && "No active session was found in this tab."}
              {probe.status === "bad_jwt" && "The auth server rejected your token (bad_jwt / missing sub claim)."}
              {probe.status === "network" && "Auth check failed before reaching the server."}
              {probe.status === "idle" && "Idle."}
            </p>
            {blockedStep && (
              <p className="text-[11px] text-amber-200/90 mt-1">
                Blocked step: <span className="font-semibold uppercase tracking-wider">{blockedStep}</span>
              </p>
            )}
          </div>

          {(blockingLog || probe.status === "bad_jwt" || noSession) && (
            <div className="rounded-lg bg-rose-500/[0.06] ring-1 ring-rose-500/[0.18] p-3 space-y-2">
              <p className="text-xs font-medium text-rose-200">Why {blockedStep ?? "the pipeline"} is blocked</p>
              <p className="text-xs text-rose-100/80 leading-relaxed">
                {probe.status === "bad_jwt"
                  ? `Your session token is stale — the server returned 403 bad_jwt. The ${blockedStep ?? "edge"} function needs a valid bearer token, so requests are being rejected before they reach the backend.`
                  : noSession
                  ? `There's no Supabase session in this tab. The ${blockedStep ?? "edge"} function requires authentication — sign in to continue.`
                  : `An auth-related error was detected in the live log. The ${blockedStep ?? "scrape"} request can't authenticate against the edge function until this clears.`}
              </p>
              {blockingLog && (
                <pre className="text-[10px] leading-snug bg-black/40 rounded p-2 max-h-24 overflow-auto whitespace-pre-wrap break-words text-rose-100/70">
                  {blockingLog}
                </pre>
              )}
              <div>
                <p className="text-xs font-medium text-rose-200 mt-1">Suggested steps</p>
                <ol className="text-xs text-rose-100/80 list-decimal pl-4 mt-1 space-y-0.5">
                  {noSession ? (
                    <>
                      <li>Click <span className="font-semibold">Sign in</span> below — you'll return to Studio after auth.</li>
                      <li>{stepLabel ? <>Then click <span className="font-semibold">{stepLabel}</span> to resume.</> : "Then re-run your scrape."}</li>
                    </>
                  ) : (
                    <>
                      <li>
                        Try <span className="font-semibold">Refresh{stepLabel ? " & " + stepLabel.toLowerCase() : " session"}</span> below — fixes ~80% of stale-token cases in one click.
                      </li>
                      <li>If that fails, click <span className="font-semibold">Sign out &amp; re-auth</span> and sign back in.</li>
                      <li>Watch the live log for a fresh "Auth probe OK" line.</li>
                    </>
                  )}
                </ol>
              </div>
            </div>
          )}

          {pending && (
            <div className="rounded-lg bg-amber-500/[0.06] ring-1 ring-amber-500/[0.18] p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-200 font-medium">
                  {pending.kind === "reload"
                    ? `Hard-reloading Studio${blockedStep ? ` (${blockedStep})` : ""}…`
                    : pending.kind === "refresh-retry"
                    ? `Refreshing session, then retrying ${blockedStep ?? "step"}…`
                    : `Retrying ${blockedStep ?? "step"}…`}
                </span>
                <span className="text-amber-100/80 tabular-nums">{pending.remaining}s</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-amber-500/[0.12] overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all duration-1000 ease-linear"
                  style={{
                    width: `${((pending.total - pending.remaining) / pending.total) * 100}%`,
                  }}
                />
              </div>
              <button
                type="button"
                onClick={cancelCountdown}
                className="text-[11px] text-amber-100/80 hover:text-amber-50 underline underline-offset-2"
              >
                Cancel
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={runProbe}
              disabled={probe.status === "checking"}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-white/[0.04] ring-1 ring-white/[0.08] hover:ring-white/[0.16] disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${probe.status === "checking" ? "animate-spin" : ""}`} />
              Re-check
            </button>

            {noSession ? (
              <button
                type="button"
                onClick={handleSignIn}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-primary/15 ring-1 ring-primary/30 text-primary hover:bg-primary/20"
              >
                <LogIn className="h-3.5 w-3.5" />
                Sign in
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={
                    blockedStep && onRetryStep
                      ? () => startCountdown("refresh-retry")
                      : handleRefreshSession
                  }
                  disabled={!!pending}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-primary/15 ring-1 ring-primary/30 text-primary hover:bg-primary/20 disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {blockedStep && onRetryStep ? `Refresh & ${stepLabel?.toLowerCase()}` : "Refresh session"}
                </button>
                {blockedStep && onRetryStep && (
                  <button
                    type="button"
                    onClick={() => startCountdown("retry")}
                    disabled={!!pending}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-emerald-500/15 ring-1 ring-emerald-500/30 text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    <PlayCircle className="h-3.5 w-3.5" />
                    {stepLabel}
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={handleHardReload}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-amber-500/15 ring-1 ring-amber-500/30 text-amber-200 hover:bg-amber-500/20"
              title={blockedStep ? `Hard-reload Studio (was blocked on ${blockedStep})` : "Hard-reload Studio"}
            >
              <RotateCw className="h-3.5 w-3.5" />
              {blockedStep ? `Reload Studio (${blockedStep})` : "Reload Studio"}
            </button>

            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-rose-500/15 ring-1 ring-rose-500/30 text-rose-200 hover:bg-rose-500/20"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out &amp; re-auth
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AuthDiagnosticsToggleButton({
  open,
  onClick,
  alert,
}: {
  open: boolean;
  onClick: () => void;
  alert?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={open}
      className={`pointer-events-auto inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] px-2.5 py-1 rounded-md bg-background/80 backdrop-blur ring-1 transition-colors ${
        alert
          ? "ring-rose-500/40 text-rose-200 hover:ring-rose-500/60"
          : "ring-white/[0.08] text-muted-foreground hover:text-foreground hover:ring-white/[0.16]"
      }`}
    >
      {alert ? <ShieldAlert className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
      {open ? "Hide" : "Show"} auth check
    </button>
  );
}
