"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import styles from "./OwnerDevelopmentAnalytics.module.css";

const GITHUB_REPO = "DataNest-Supository/DataNest";
const GITHUB_INTERVAL_MS = 10 * 60 * 1000;
const DB_INTERVAL_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type TrendPoint = {
  day: string;
  events: number;
  runs: number;
  development_updates: number;
};

type DevelopmentAnalytics = {
  authorized: boolean;
  generated_at: string;
  database: {
    database_version: string;
    public_table_count: number;
    public_view_count: number;
    function_count: number;
    migration_count: number;
    auth_user_count: number;
    active_member_count: number;
  };
  project: {
    total_jobs: number;
    active_jobs: number;
    running_jobs: number;
    blocked_jobs: number;
    completed_jobs: number;
    run_count: number;
    audit_event_count: number;
    development_update_count: number;
    optimizer_run_count: number;
    optimizer_suggestion_count: number;
    control_event_count: number;
    control_run_count: number;
  };
  trend: TrendPoint[];
};

type GithubPull = {
  number: number;
  title: string;
  html_url: string;
  draft: boolean | null;
  updated_at: string;
  created_at: string;
  merged_at: string | null;
  user?: { login?: string | null } | null;
  head?: { ref?: string | null } | null;
  base?: { ref?: string | null } | null;
};

type GithubIssueSearch = {
  total_count: number;
  items: Array<{ number: number; title: string; html_url: string }>;
};

type GithubCommitSearch = {
  total_count: number;
};

type GithubCommit = {
  sha: string;
  html_url: string;
  commit: {
    author?: { name?: string | null; date?: string | null } | null;
    committer?: { name?: string | null; date?: string | null } | null;
    message?: string;
  };
};

type GithubWorkflowRun = {
  id: number;
  name?: string | null;
  status?: string | null;
  conclusion?: string | null;
  created_at?: string | null;
  html_url?: string | null;
};

type GithubRepository = {
  stargazers_count?: number;
  forks_count?: number;
  default_branch?: string;
  pushed_at?: string | null;
  updated_at?: string | null;
};

type GithubSnapshot = {
  repository: GithubRepository;
  openPulls: GithubPull[];
  openPullCount: number;
  supabaseOpenCount: number;
  supabaseOpenItems: GithubIssueSearch["items"];
  mergedPullCount30d: number;
  commitCount30d: number;
  closedPulls: GithubPull[];
  commits: GithubCommit[];
  workflowRuns: GithubWorkflowRun[];
  fetchedAt: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

async function githubJson<T>(path: string): Promise<T> {
  const response = await fetch("https://api.github.com" + path, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if (!response.ok) {
    throw new Error("GitHub request failed with HTTP " + response.status + ".");
  }
  return response.json() as Promise<T>;
}

function weekKey(date: Date) {
  const copy = new Date(date);
  const day = copy.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + delta);
  copy.setUTCHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

function dateKey(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function aggregateGithubWeeks(commits: GithubCommit[], pulls: GithubPull[]) {
  const now = new Date();
  const current = weekKey(now);
  const currentDate = new Date(current + "T00:00:00Z");
  const starts = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(currentDate.getTime() - (5 - index) * 7 * DAY_MS);
    return date.toISOString().slice(0, 10);
  });

  return starts.map((start, index) => {
    const end = new Date(new Date(start + "T00:00:00Z").getTime() + 7 * DAY_MS);
    const endKey = end.toISOString().slice(0, 10);
    const commitsValue = commits.filter((item) => {
      const key = dateKey(item.commit.committer?.date || item.commit.author?.date);
      return key >= start && key < endKey;
    }).length;
    const mergedValue = pulls.filter((item) => {
      const key = dateKey(item.merged_at);
      return key >= start && key < endKey;
    }).length;
    return {
      label: index === 5 ? "This week" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(start + "T00:00:00Z")),
      commits: commitsValue,
      merged: mergedValue
    };
  });
}

function linePoints(values: number[], width: number, height: number, padding: number) {
  const max = Math.max(1, ...values);
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  return values.map((value, index) => {
    const x = padding + (values.length <= 1 ? innerWidth / 2 : (index / (values.length - 1)) * innerWidth);
    const y = height - padding - (value / max) * innerHeight;
    return { x, y };
  });
}

function polyline(points: Array<{ x: number; y: number }>) {
  return points.map((point) => point.x.toFixed(1) + "," + point.y.toFixed(1)).join(" ");
}

function chartMax(values: number[]) {
  return Math.max(1, ...values);
}

export default function OwnerDevelopmentAnalytics({
  projectId,
  compact = false
}: {
  projectId: string;
  compact?: boolean;
}) {
  const [database, setDatabase] = useState<DevelopmentAnalytics | null>(null);
  const [github, setGithub] = useState<GithubSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState("");
  const [githubError, setGithubError] = useState("");
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const loadDatabase = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setDatabaseError("Supabase client is not configured.");
      return;
    }

    const result = await supabase.rpc("get_owner_development_analytics_v1", {
      target_project: projectId
    });

    if (result.error) {
      setDatabaseError(result.error.message);
      return;
    }

    const next = result.data as unknown as DevelopmentAnalytics | null;
    if (!next?.authorized) {
      setDatabaseError("Owner access is required for development analytics.");
      return;
    }

    setDatabase(next);
    setDatabaseError("");
    setLastRefresh(new Date().toISOString());
  }, [projectId]);

  const loadGithub = useCallback(async () => {
    try {
      const sinceDate = new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10);
      const since = sinceDate + "T00:00:00Z";
      const mergedQuery = encodeURIComponent("repo:" + GITHUB_REPO + " is:pr is:closed merged:>=" + sinceDate);
      const commitQuery = encodeURIComponent("repo:" + GITHUB_REPO + " committer-date:>=" + sinceDate);
      const [openPulls, openPullSearch, supabasePulls, mergedPullSearch, commitSearch, closedPulls, commits, workflowRuns] = await Promise.all([
        githubJson<GithubPull[]>("/repos/" + GITHUB_REPO + "/pulls?state=open&per_page=100&sort=updated&direction=desc"),
        githubJson<GithubIssueSearch>("/search/issues?q=repo%3A" + encodeURIComponent(GITHUB_REPO) + "+is%3Apr+is%3Aopen&per_page=1"),
        githubJson<GithubIssueSearch>("/search/issues?q=repo%3A" + encodeURIComponent(GITHUB_REPO) + "+is%3Apr+is%3Aopen+path%3Asupabase&per_page=100"),
        githubJson<GithubIssueSearch>("/search/issues?q=" + mergedQuery + "&per_page=1"),
        githubJson<GithubCommitSearch>("/search/commits?q=" + commitQuery + "&per_page=1"),
        githubJson<GithubPull[]>("/repos/" + GITHUB_REPO + "/pulls?state=closed&per_page=100&sort=updated&direction=desc"),
        githubJson<GithubCommit[]>("/repos/" + GITHUB_REPO + "/commits?since=" + encodeURIComponent(since) + "&per_page=100"),
        githubJson<{ workflow_runs: GithubWorkflowRun[] }>("/repos/" + GITHUB_REPO + "/actions/runs?per_page=50")
      ]);

      setGithub({
        repository: { default_branch: "main" },
        openPulls,
        openPullCount: openPullSearch.total_count,
        supabaseOpenCount: supabasePulls.total_count,
        supabaseOpenItems: supabasePulls.items || [],
        mergedPullCount30d: mergedPullSearch.total_count,
        commitCount30d: commitSearch.total_count,
        closedPulls,
        commits,
        workflowRuns: workflowRuns.workflow_runs || [],
        fetchedAt: new Date().toISOString()
      });
      setGithubError("");
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : "Unable to load GitHub development data.");
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.allSettled([loadDatabase(), loadGithub()]);
    setLoading(false);
  }, [loadDatabase, loadGithub]);

  useEffect(() => {
    void load();
    const dbTimer = window.setInterval(() => void loadDatabase(), DB_INTERVAL_MS);
    const githubTimer = window.setInterval(() => void loadGithub(), GITHUB_INTERVAL_MS);
    return () => {
      window.clearInterval(dbTimer);
      window.clearInterval(githubTimer);
    };
  }, [load, loadDatabase, loadGithub]);

  const recentWorkflowRuns = useMemo(() => {
    if (!github) return [];
    const cutoff = Date.now() - 30 * DAY_MS;
    return github.workflowRuns.filter((run) => !run.created_at || new Date(run.created_at).getTime() >= cutoff);
  }, [github]);

  const ciSuccessRate = useMemo(() => {
    if (!recentWorkflowRuns.length) return null;
    const completed = recentWorkflowRuns.filter((run) => run.status === "completed");
    if (!completed.length) return null;
    const passed = completed.filter((run) => run.conclusion === "success").length;
    return Math.round((passed / completed.length) * 100);
  }, [recentWorkflowRuns]);

  const githubWeeks = useMemo(
    () => (github ? aggregateGithubWeeks(github.commits, github.closedPulls) : []),
    [github]
  );

  const githubCommitMax = chartMax(githubWeeks.map((week) => week.commits));
  const githubMergedMax = chartMax(githubWeeks.map((week) => week.merged));

  const activityPoints = useMemo(() => {
    const trend = database?.trend || [];
    return {
      events: linePoints(trend.map((item) => item.events), 640, 180, 18),
      runs: linePoints(trend.map((item) => item.runs), 640, 180, 18),
      updates: linePoints(trend.map((item) => item.development_updates), 640, 180, 18)
    };
  }, [database]);

  const openPulls = github?.openPulls.slice(0, compact ? 4 : 8) || [];

  return (
    <section className={styles.shell} aria-label="Owner development analytics">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>OWNER ADMIN · DEVELOPMENT INTELLIGENCE</p>
          <h2>{compact ? "Development statistics" : "Development & integration analytics"}</h2>
          <p className={styles.lede}>
            GitHub delivery signals and live Supabase development telemetry inside the DataNest Control Center.
          </p>
        </div>
        <button className={styles.refresh} type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {(databaseError || githubError) && (
        <div className={styles.error} role="alert">
          <strong>Some analytics are unavailable.</strong>
          <span>{[databaseError, githubError].filter(Boolean).join(" · ")}</span>
        </div>
      )}

      <div className={styles.kpis}>
        <article className={styles.metric}>
          <span>Open GitHub PRs</span>
          <strong>{formatNumber(github?.openPullCount || 0)}</strong>
          <small>{github?.repository.default_branch || "main"} branch</small>
        </article>
        <article className={styles.metric}>
          <span>Open Supabase PRs</span>
          <strong>{formatNumber(github?.supabaseOpenCount || 0)}</strong>
          <small>PRs touching /supabase</small>
        </article>
        <article className={styles.metric}>
          <span>Commits · 30d</span>
          <strong>{formatNumber(github?.commitCount30d || 0)}</strong>
          <small>GitHub search count</small>
        </article>
        <article className={styles.metric}>
          <span>Merged PRs · 30d</span>
          <strong>{formatNumber(github?.mergedPullCount30d || 0)}</strong>
          <small>GitHub search count</small>
        </article>
        <article className={styles.metric}>
          <span>CI success</span>
          <strong>{ciSuccessRate == null ? "—" : ciSuccessRate + "%"}</strong>
          <small>{formatNumber(recentWorkflowRuns.length)} workflow runs</small>
        </article>
        <article className={styles.metric}>
          <span>DB migrations</span>
          <strong>{formatNumber(database?.database.migration_count || 0)}</strong>
          <small>{formatNumber(database?.database.public_table_count || 0)} public tables</small>
        </article>
      </div>

      {!compact && (
        <div className={styles.grid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>GITHUB DELIVERY</p>
                <h3>Commits & merged PRs</h3>
              </div>
              <span className={styles.meta}>Last 6 weeks</span>
            </div>
            <svg className={styles.chart} viewBox="0 0 640 190" role="img" aria-label="GitHub commits and merged pull requests by week">
              {[0, 1, 2, 3].map((line) => {
                const y = 26 + line * 38;
                return <line key={line} x1="20" x2="620" y1={y} y2={y} className={styles.gridLine} />;
              })}
              {githubWeeks.map((week, index) => {
                const x = 34 + index * 102;
                const commitHeight = (week.commits / githubCommitMax) * 106;
                const mergedHeight = (week.merged / githubMergedMax) * 76;
                return (
                  <g key={week.label}>
                    <rect x={x} y={148 - commitHeight} width="26" height={commitHeight} rx="5" className={styles.barPrimary} />
                    <rect x={x + 34} y={148 - mergedHeight} width="26" height={mergedHeight} rx="5" className={styles.barSecondary} />
                    <text x={x + 13} y="173" textAnchor="middle" className={styles.axisLabel}>{week.label.split(" ").slice(0, 2).join(" ")}</text>
                  </g>
                );
              })}
            </svg>
            <div className={styles.legend}>
              <span><i className={styles.legendPrimary} /> Commits</span>
              <span><i className={styles.legendSecondary} /> Merged PRs</span>
              {github && <span className={styles.timestamp}>GitHub snapshot {formatDate(github.fetchedAt)}</span>}
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>SUPABASE RUNTIME</p>
                <h3>Development activity</h3>
              </div>
              <span className={styles.meta}>30 days</span>
            </div>
            <svg className={styles.chart} viewBox="0 0 640 190" role="img" aria-label="Supabase project development activity over 30 days">
              {[0, 1, 2, 3].map((line) => {
                const y = 26 + line * 38;
                return <line key={line} x1="20" x2="620" y1={y} y2={y} className={styles.gridLine} />;
              })}
              <polyline points={polyline(activityPoints.events)} fill="none" className={styles.lineEvents} />
              <polyline points={polyline(activityPoints.runs)} fill="none" className={styles.lineRuns} />
              <polyline points={polyline(activityPoints.updates)} fill="none" className={styles.lineUpdates} />
              {activityPoints.events.filter((_, index) => index % 5 === 0).map((point, index) => (
                <circle key={index} cx={point.x} cy={point.y} r="3" className={styles.dotEvents} />
              ))}
            </svg>
            <div className={styles.legend}>
              <span><i className={styles.legendEvents} /> Events</span>
              <span><i className={styles.legendRuns} /> Runs</span>
              <span><i className={styles.legendUpdates} /> Development updates</span>
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>OPEN DELIVERY QUEUE</p>
                <h3>Current pull requests</h3>
              </div>
              <a className={styles.link} href={"https://github.com/" + GITHUB_REPO + "/pulls"} target="_blank" rel="noreferrer">Open GitHub ↗</a>
            </div>
            <div className={styles.prList}>
              {openPulls.length ? openPulls.map((pull) => (
                <a key={pull.number} className={styles.pr} href={pull.html_url} target="_blank" rel="noreferrer">
                  <span className={styles.prNumber}>#{pull.number}</span>
                  <span className={styles.prBody}>
                    <b>{pull.title}</b>
                    <small>{pull.user?.login || "unknown"} · {pull.head?.ref || "branch"} → {pull.base?.ref || "main"} · updated {formatDate(pull.updated_at)}</small>
                  </span>
                  {pull.draft ? <span className={styles.badge}>DRAFT</span> : null}
                </a>
              )) : <p className={styles.muted}>No open pull requests.</p>}
            </div>
            <div className={styles.queueFooter}>
              <span><b>{formatNumber(github?.openPullCount || 0)}</b> open</span>
              <span><b>{formatNumber(github?.supabaseOpenCount || 0)}</b> touching Supabase</span>
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>SCHEMA & PROJECT</p>
                <h3>Supabase footprint</h3>
              </div>
              <span className={styles.meta}>{database ? formatDate(database.generated_at) : "Loading…"}</span>
            </div>
            <div className={styles.statsList}>
              <div><span>Database</span><strong>{database?.database.database_version || "—"}</strong></div>
              <div><span>Public tables</span><strong>{formatNumber(database?.database.public_table_count || 0)}</strong></div>
              <div><span>Views / functions</span><strong>{formatNumber(database?.database.public_view_count || 0)} / {formatNumber(database?.database.function_count || 0)}</strong></div>
              <div><span>Auth users / members</span><strong>{formatNumber(database?.database.auth_user_count || 0)} / {formatNumber(database?.database.active_member_count || 0)}</strong></div>
              <div><span>Jobs / runs</span><strong>{formatNumber(database?.project.total_jobs || 0)} / {formatNumber(database?.project.run_count || 0)}</strong></div>
              <div><span>Audit events</span><strong>{formatNumber(database?.project.audit_event_count || 0)}</strong></div>
              <div><span>AI development updates</span><strong>{formatNumber(database?.project.development_update_count || 0)}</strong></div>
              <div><span>Optimizer runs / suggestions</span><strong>{formatNumber(database?.project.optimizer_run_count || 0)} / {formatNumber(database?.project.optimizer_suggestion_count || 0)}</strong></div>
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>CONTROL PLANE</p>
                <h3>Operational development signals</h3>
              </div>
              <span className={styles.meta}>Live</span>
            </div>
            <div className={styles.signalGrid}>
              <div><span>Active jobs</span><strong>{formatNumber(database?.project.active_jobs || 0)}</strong></div>
              <div><span>Running</span><strong>{formatNumber(database?.project.running_jobs || 0)}</strong></div>
              <div><span>Blocked</span><strong>{formatNumber(database?.project.blocked_jobs || 0)}</strong></div>
              <div><span>Completed</span><strong>{formatNumber(database?.project.completed_jobs || 0)}</strong></div>
              <div><span>Control events</span><strong>{formatNumber(database?.project.control_event_count || 0)}</strong></div>
              <div><span>Control checks</span><strong>{formatNumber(database?.project.control_run_count || 0)}</strong></div>
          </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>SUPABASE PR SCOPE</p>
                <h3>PRs touching migrations & functions</h3>
              </div>
              <span className={styles.meta}>{formatNumber(github?.supabaseOpenCount || 0)} open</span>
            </div>
            <div className={styles.prList}>
              {(github?.supabaseOpenItems || []).slice(0, 6).map((item) => (
                <a key={item.number} className={styles.pr} href={item.html_url} target="_blank" rel="noreferrer">
                  <span className={styles.prNumber}>#{item.number}</span>
                  <span className={styles.prBody}><b>{item.title}</b><small>Open Supabase-scoped pull request</small></span>
                </a>
              ))}
              {!github?.supabaseOpenItems?.length && <p className={styles.muted}>No open PRs currently match the Supabase path filter.</p>}
            </div>
          </article>
        </div>
      )}

      <div className={styles.footer}>
        <span>{lastRefresh ? "Supabase snapshot " + formatDate(lastRefresh) : "Loading owner snapshot…"}</span>
        <span>GitHub snapshot {github ? formatDate(github.fetchedAt) : "—"}</span>
        <span>Owner-only control center telemetry</span>
      </div>
    </section>
  );
}
