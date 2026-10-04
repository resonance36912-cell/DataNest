import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  loadAutoEmail,
  saveAutoEmail,
  sendChecklistReport,
  retryDelivery,
  sendTestReport,
  loadTestAddress,
  saveTestAddress,
} from "@/lib/report-email";
import {
  loadDeliveryLog,
  clearDeliveryLog,
  deleteDeliveryLogEntry,
  type DeliveryLogEntry,
} from "@/lib/report-email-log";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  HelpCircle,
  Loader2,
  PlayCircle,
  RotateCcw,
  Send,
  Trash2,
  XCircle,
  Clock,
  X,
} from "lucide-react";
import {
  runSeoLiveChecks,
  passedStepIds,
  type SeoCheckResult,
} from "@/lib/seo-live-checks";
import {
  loadRuns,
  saveRun,
  clearRuns,
  diffRuns,
  isNoChange,
  type SeoRun,
  type SeoDiffEntry,
} from "@/lib/seo-run-history";
import {
  buildChecklistPdf,
  checklistPdfFilename,
} from "@/lib/seo-checklist-pdf";
import { downloadChecklistCsv } from "@/lib/seo-checklist-csv";
import { BUILD_INFO, formatBuildInfo } from "@/lib/build-info";
import RecipientListEditor from "@/components/admin/RecipientListEditor";
import PlaceholderField from "@/components/admin/PlaceholderField";
import TokenInspector from "@/components/admin/TokenInspector";
import TemplateLibraryBar from "@/components/admin/TemplateLibraryBar";
import LintIssueNavigator, { issueOffset } from "@/components/admin/LintIssueNavigator";
import LintSeveritySummary from "@/components/admin/LintSeveritySummary";

import TemplateLintReport from "@/components/admin/TemplateLintReport";
import TemplateDiffDialog from "@/components/admin/TemplateDiffDialog";
import {
  autoFixTemplate,
  lintTemplate,
  type LintIssue,
  type LintReport,
} from "@/lib/report-email-template-lint";
import RetryBlockedDialog from "@/components/admin/RetryBlockedDialog";
import {
  loadBlockedRetry,
  saveBlockedRetry,
  clearBlockedRetry,
  type BlockedRetryRecord,
} from "@/lib/retry-blocked-store";


import {
  DEFAULT_TEMPLATE,
  PLACEHOLDER_HELP,
  TEMPLATE_PLACEHOLDERS,
  loadEmailTemplate,
  validateTemplate,
  validationMessage,
  activeBody,
  setActiveBody,
  renderBody,
  saveEmailTemplate,
  resetEmailTemplate,
  renderTemplate,
  templateValues,
  type ReportEmailTemplate,
} from "@/lib/report-email-template";

import {
  listArchivedPdfs,
  saveArchivedPdf,
  downloadArchivedPdf,
  deleteArchivedPdf,
  clearArchivedPdfs,
  formatBytes,
  MAX_ARCHIVE_ENTRIES,
  type ArchivedPdfMeta,
} from "@/lib/seo-pdf-archive";
import {
  DEFAULT_BRANDING,
  loadBranding,
  saveBranding,
  clearBranding,
  readLogoFile,
  type ChecklistBranding,
} from "@/lib/seo-checklist-branding";






/**
 * Internal ops runbook. Lives under /admin so it is never indexed and never
 * appears in the sitemap (scripts/lib/routes.ts drops /admin-prefixed paths).
 */

const HUB_SITEMAP = "https://www.reson8.life/sitemap.xml";
const HUB_SITEMAP_INDEX = "https://www.reson8.life/sitemap-index.xml";
const GSC = "https://search.google.com/search-console";
const MAX_HISTORY_SHOWN = 5;


interface Step {
  id: string;
  title: string;
  detail: string;
  note?: string;
}

interface Section {
  id: string;
  title: string;
  summary: string;
  steps: Step[];
}

const SECTIONS: Section[] = [
  {
    id: "prep",
    title: "1 · Before you deploy",
    summary: "The build already blocks most SEO regressions — confirm it ran clean.",
    steps: [
      {
        id: "prep-build",
        title: "Prebuild validators passed",
        detail:
          "The build runs generate-sitemap, check-sitemap-robots, check-html-meta, check-page-jsonld, check-page-locale, check-canonical-sitemap and check-hub-canonical. A red build means the sitemap, robots.txt or canonicals are wrong — fix before deploying.",
      },
      {
        id: "prep-routes",
        title: "New public routes are in the sitemap",
        detail:
          "Entries are derived from src/App.tsx. Protected routes only appear if listed in PROTECTED_INDEXABLE; /admin routes never appear.",
      },
      {
        id: "prep-hash",
        title: "Note the versioned sitemap filename",
        detail:
          "Each build emits sitemap.<hash>.xml and sitemap-index.<hash>.xml. Copy the hashed index name from the build log — you submit the stable URLs, but the hash tells you whether the deploy actually shipped new content.",
      },
    ],
  },
  {
    id: "deploy",
    title: "2 · Right after the deploy",
    summary: "Confirm the live hub is serving the new files before touching Search Console.",
    steps: [
      {
        id: "deploy-fetch",
        title: "Fetch robots.txt and both sitemaps",
        detail:
          `Open ${HUB_SITEMAP} and ${HUB_SITEMAP_INDEX} in a browser. Both must return 200 XML, and the index must reference the hashed sub-sitemaps from this build.`,
      },
      {
        id: "deploy-robots",
        title: "robots.txt lists the current Sitemap directives",
        detail:
          "It should show the stable /sitemap.xml line plus the content-addressed index line. A stale hash means the CDN has not purged yet.",
      },
      {
        id: "deploy-canonical",
        title: "Run the hub canonical crawler",
        detail:
          "bun run check:hub-canonical — it fetches every hub URL and reports canonical/hreflang drift against the sitemap. Zero mismatches before you continue.",
      },
    ],
  },
  {
    id: "submit",
    title: "3 · Submit in Google Search Console",
    summary: "Property is the hub, not the spoke domain.",
    steps: [
      {
        id: "gsc-property",
        title: "Open the verified reson8.life property",
        detail:
          "Search Console → property picker. Canonicals point at www.reson8.life, so submissions belong on that property. The spoke domain only 301s to the hub.",
      },
      {
        id: "gsc-submit",
        title: "Sitemaps → add /sitemap.xml",
        detail:
          "Submit the stable path only. Never submit a hashed filename — it changes every build and leaves dead entries in the Sitemaps report.",
      },
      {
        id: "gsc-status",
        title: "Status reads Success with the expected URL count",
        detail:
          "Refresh after a few minutes. 'Couldn't fetch' usually means the deploy has not propagated or robots.txt blocks the path.",
      },
      {
        id: "gsc-remove",
        title: "Remove obsolete sitemap entries",
        detail:
          "Delete any previously submitted sitemap that no longer exists so the report stays interpretable.",
      },
    ],
  },
  {
    id: "verify",
    title: "4 · Verify coverage and canonicalization",
    summary: "Do this 24–72 hours after submitting — Search Console data lags.",
    steps: [
      {
        id: "cov-pages",
        title: "Pages report: check 'Not indexed' reasons",
        detail:
          "Expect Discovered/Crawled — currently not indexed to shrink over time. Investigate any Redirect error, Blocked by robots.txt, or Server error (5xx).",
      },
      {
        id: "cov-canonical",
        title: "Look for 'Duplicate, Google chose different canonical'",
        detail:
          "This is the failure mode for a hub/spoke setup. It means Google trusts a different URL than our declared canonical — recheck the 301s from the spoke domain and the canonical tag on the hub page.",
      },
      {
        id: "cov-inspect",
        title: "URL-inspect one page per section",
        detail:
          "Inspect a marketing page and an app page. Confirm 'User-declared canonical' and 'Google-selected canonical' are identical and both point at the hub URL.",
      },
      {
        id: "cov-hreflang",
        title: "Confirm hreflang has no errors",
        detail:
          "Alternates must be reciprocal and every declared locale (en-ZA, en-GB, en-US, en, x-default) must appear on the page and in the sitemap.",
      },
      {
        id: "cov-log",
        title: "Record the outcome",
        detail:
          "Note the date, the sitemap hash and any unresolved errors so the next deploy can tell new problems from carry-over.",
      },
    ],
  },
];

const ALL_STEP_IDS = SECTIONS.flatMap((s) => s.steps.map((st) => st.id));
const STORAGE_KEY = "seo-deploy-checklist:v1";
const SUBMIT_KEY = "seo-deploy-checklist:submission:v1";

const DEFAULT_PROPERTY = "https://www.reson8.life/";

interface SubmissionState {
  property: string;
  lastSubmittedAt: string | null;
  lastSitemap: string;
}

const DEFAULT_SUBMISSION: SubmissionState = {
  property: DEFAULT_PROPERTY,
  lastSubmittedAt: null,
  lastSitemap: HUB_SITEMAP,
};

/** Deep-link into the Sitemaps report for a specific property.
 *  Search Console expects the property id URL-encoded in `resource_id`. */
function sitemapsUrl(property: string) {
  const p = property.trim();
  if (!p) return `${GSC}/sitemaps`;
  return `${GSC}/sitemaps?resource_id=${encodeURIComponent(p)}`;
}

function inspectUrl(property: string, target: string) {
  const p = property.trim();
  const base = `${GSC}/inspect?url=${encodeURIComponent(target)}`;
  return p ? `${base}&resource_id=${encodeURIComponent(p)}` : base;
}

function formatWhen(iso: string | null) {
  if (!iso) return "never submitted";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const stamp = d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (days <= 0) return `${stamp} · today`;
  return `${stamp} · ${days} day${days === 1 ? "" : "s"} ago`;
}

function formatBlockedAgo(iso: string | null) {
  if (!iso) return "unknown time";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown time";
  const ms = Date.now() - d.getTime();
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const stamp = d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (seconds < 10) return `${stamp} · just now`;
  if (minutes < 1) return `${stamp} · ${seconds}s ago`;
  if (hours < 1) return `${stamp} · ${minutes}m ago`;
  if (days < 1) return `${stamp} · ${hours}h ago`;
  return `${stamp} · ${days} day${days === 1 ? "" : "s"} ago`;
}

function formatBlockedExact(iso: string | null) {
  if (!iso) return "unknown time";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown time";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function downloadBlockedReport(retryBlocked: BlockedRetryRecord) {
  const payload = {
    exportedAt: new Date().toISOString(),
    ...retryBlocked,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeEmail = retryBlocked.email.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  a.href = url;
  a.download = `blocked-retry-report-${safeEmail}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function SeoChecklist() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [submission, setSubmission] = useState<SubmissionState>(DEFAULT_SUBMISSION);
  const [branding, setBranding] = useState<ChecklistBranding>(DEFAULT_BRANDING);
  const [logoError, setLogoError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setDone(JSON.parse(raw));
    } catch {
      /* ignore malformed state */
    }
    try {
      const raw = localStorage.getItem(SUBMIT_KEY);
      if (raw) setSubmission({ ...DEFAULT_SUBMISSION, ...JSON.parse(raw) });
    } catch {
      /* ignore malformed state */
    }
    setBranding(loadBranding());
  }, []);

  const persistBranding = useCallback((next: ChecklistBranding) => {
    setBranding(saveBranding(next));
  }, []);

  const onLogoPicked = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setLogoError(null);
      try {
        const dataUrl = await readLogoFile(file);
        setBranding((prev) => saveBranding({ ...prev, logoDataUrl: dataUrl }));
      } catch (err) {
        setLogoError(err instanceof Error ? err.message : "Could not load that logo");
      }
    },
    [],
  );

  const persistSubmission = useCallback((next: SubmissionState) => {
    setSubmission(next);
    try {
      localStorage.setItem(SUBMIT_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — stays in-memory */
    }
  }, []);


  const persist = useCallback((next: Record<string, boolean>) => {
    setDone(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — checklist stays in-memory */
    }
  }, []);

  const [checks, setChecks] = useState<SeoCheckResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [runs, setRuns] = useState<SeoRun[]>([]);
  const [autoEmail, setAutoEmail] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [testAddress, setTestAddress] = useState(() => loadTestAddress());
  const [testSending, setTestSending] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState<ReportEmailTemplate>(
    () => loadEmailTemplate(),
  );
  // Real-time linting: debounce the template while typing so the report
  // re-runs shortly after the user pauses instead of on every keystroke.
  const [lintSource, setLintSource] = useState<ReportEmailTemplate>(emailTemplate);
  useEffect(() => {
    const id = window.setTimeout(() => setLintSource(emailTemplate), 300);
    return () => window.clearTimeout(id);
  }, [emailTemplate]);
  const lintReport = useMemo(() => lintTemplate(lintSource), [lintSource]);
  const lintPending = lintSource !== emailTemplate;
  // Pending fix awaiting user review in the before/after diff dialog.
  const [pendingFix, setPendingFix] = useState<{
    title: string;
    description: string;
    before: { subject: string; body: string };
    after: { subject: string; body: string };
    next: ReportEmailTemplate;
    successMessage: string;
  } | null>(null);
  // Details of a retry blocked by template lint issues (persisted per session
  // so the dialog can be reopened after navigating away and back).
  const [retryBlocked, setRetryBlockedState] = useState<BlockedRetryRecord | null>(
    () => loadBlockedRetry(),
  );
  const [blockedOpen, setBlockedOpen] = useState(false);
  // Hide the blocked-retry banner without clearing the persisted report.
  // Dismissal resets when a new report is created or the page is reloaded.
  const [blockedBannerDismissed, setBlockedBannerDismissed] = useState(false);

  /** Persist + show the blocked-retry details. Pass null to clear entirely. */
  const setRetryBlocked = (
    next:
      | { email: string; report: LintReport }
      | null
      | ((prev: BlockedRetryRecord | null) => BlockedRetryRecord | null),
  ) => {
    if (typeof next === "function") {
      setRetryBlockedState((prev) => {
        const updated = next(prev);
        if (updated) saveBlockedRetry(updated);
        else clearBlockedRetry();
        return updated;
      });
      setBlockedBannerDismissed(false);
      return;
    }
    if (!next) {
      clearBlockedRetry();
      setRetryBlockedState(null);
      setBlockedOpen(false);
      setBlockedBannerDismissed(false);
      return;
    }
    setRetryBlockedState(saveBlockedRetry(next));
    setBlockedOpen(true);
    setBlockedBannerDismissed(false);
  };

  // Restore the persisted blocked-retry report after a full page refresh (and
  // when the tab regains focus, in case it was cleared/updated elsewhere).
  useEffect(() => {
    const rehydrate = () => {
      const stored = loadBlockedRetry();
      setRetryBlockedState((prev) => {
        if (!stored) return prev ? null : prev;
        if (prev && prev.blockedAt === stored.blockedAt && prev.email === stored.email) return prev;
        return stored;
      });
    };
    rehydrate();
    window.addEventListener("focus", rehydrate);
    return () => window.removeEventListener("focus", rehydrate);
  }, []);


  /** Focus the editor for an issue and select the offending text. */
  const jumpToIssue = (issue: LintIssue) => {
    window.setTimeout(() => {
      const el = document.getElementById(
        issue.field === "subject" ? "report-subject" : "report-body",
      ) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el) return;
      const start = issueOffset(el.value, issue);
      const end = Math.min(start + issue.snippet.length, el.value.length);
      el.focus();
      el.setSelectionRange(start, end);
      if (el instanceof HTMLTextAreaElement) {
        el.scrollTop = Math.max(0, (issue.line - 3) * 18);
      }
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
  };

  const applyLintFix = (issue: LintIssue) => {
    if (!issue.suggestion) return;
    const t = emailTemplate;
    const target = issue.field === "subject" ? t.subject : activeBody(t);
    const lines = target.split("\n");
    const idx = issue.line - 1;
    const line = lines[idx];
    if (line === undefined) return;
    lines[idx] =
      line.slice(0, issue.column) +
      issue.suggestion +
      line.slice(issue.column + issue.snippet.length);
    const replaced = lines.join("\n");
    const next =
      issue.field === "subject"
        ? { ...t, subject: replaced }
        : setActiveBody(t, replaced);
    setPendingFix({
      title: "Review fix",
      description: `Replace "${issue.snippet}" with "${issue.suggestion}" in the ${issue.field === "subject" ? "subject" : "message body"}.`,
      before: { subject: t.subject, body: activeBody(t) },
      after: { subject: next.subject, body: activeBody(next) },
      next,
      successMessage: "Fix applied",
    });
  };

  /**
   * Applies one issue's suggested replacement immediately (no diff review),
   * persists it, then re-runs lint so only that item disappears from the
   * blocked-retry dialog.
   */
  const autoFixIssue = (issue: LintIssue) => {
    if (!issue.suggestion) return;
    const t = loadEmailTemplate();
    const target = issue.field === "subject" ? t.subject : activeBody(t);
    const lines = target.split("\n");
    const idx = issue.line - 1;
    const line = lines[idx];
    if (line === undefined || !line.startsWith(issue.snippet, issue.column)) {
      toast.error("Could not auto-fix", {
        description: "The template changed — re-check the placeholder manually.",
      });
      return;
    }
    lines[idx] =
      line.slice(0, issue.column) +
      issue.suggestion +
      line.slice(issue.column + issue.snippet.length);
    const replaced = lines.join("\n");
    const next =
      issue.field === "subject"
        ? { ...t, subject: replaced }
        : setActiveBody(t, replaced);
    const saved = saveEmailTemplate(next);
    setEmailTemplate(saved);
    setLintSource(saved);
    const report = lintTemplate(saved);
    setRetryBlocked((prev) => (prev ? { ...prev, report } : prev));
    toast.success(`Fixed "${issue.snippet}" → "${issue.suggestion}"`, {
      description: report.ok
        ? "No placeholder issues left — retry the send."
        : `${report.issues.length} issue${report.issues.length === 1 ? "" : "s"} remaining.`,
    });
  };

  /**
   * Re-runs lint against the current saved template and updates the persisted
   * blocked-retry record, keeping only the originally-offending placeholders
   * (matched by field + snippet) plus any new issue at the same snippet.
   */
  const recheckBlockedPlaceholders = () => {
    const saved = loadEmailTemplate();
    setEmailTemplate(saved);
    setLintSource(saved);
    const fresh = lintTemplate(saved);
    setRetryBlocked((prev) => {
      if (!prev) return prev;
      const offending = new Set(
        prev.report.issues.map((i) => `${i.field}::${i.snippet}`),
      );
      const remaining = fresh.issues.filter((i) =>
        offending.has(`${i.field}::${i.snippet}`),
      );
      const counts = { unknown: 0, malformed: 0, "missing-braces": 0 } as Record<
        LintIssue["kind"],
        number
      >;
      for (const i of remaining) counts[i.kind] += 1;
      const resolved = prev.report.issues.length - remaining.length;
      if (remaining.length === 0) {
        toast.success("All saved placeholders now pass lint", {
          description: "Retry the send when you're ready.",
        });
      } else {
        toast.info(
          `${remaining.length} of ${prev.report.issues.length} saved placeholder issue${prev.report.issues.length === 1 ? "" : "s"} still failing`,
          {
            description:
              resolved > 0 ? `${resolved} resolved since the block.` : undefined,
          },
        );
      }
      return {
        ...prev,
        report: {
          ...fresh,
          ok: remaining.length === 0,
          issues: remaining,
          counts,
        },
      };
    });
  };

  /**
   * Regenerates the full blocked-retry report from the current saved template,
   * updates the saved timestamp, and persists the new report. Unlike recheck,
   * this does not filter to the originally offending placeholders — it captures
   * every issue currently present.
   */
  const regenerateBlockedReport = () => {
    const saved = loadEmailTemplate();
    setEmailTemplate(saved);
    setLintSource(saved);
    const fresh = lintTemplate(saved);
    setRetryBlocked((prev) => {
      if (!prev) return prev;
      const next = { ...prev, report: fresh, blockedAt: new Date().toISOString() };
      saveBlockedRetry(next);
      return next;
    });
    if (fresh.ok) {
      toast.success("Report regenerated", {
        description: "No placeholder issues remain — retry the send.",
      });
    } else {
      toast.info(
        `${fresh.issues.length} placeholder issue${fresh.issues.length === 1 ? "" : "s"} in regenerated report`,
        { description: "The saved timestamp has been updated." },
      );
    }
  };


  const applyAllLintFixes = () => {
    const t = emailTemplate;
    const { subject, body, fixed } = autoFixTemplate(t);
    if (!fixed) {
      toast.info("No auto-fixable placeholder issues");
      return;
    }
    const next = setActiveBody({ ...t, subject }, body);
    setPendingFix({
      title: `Review ${fixed} fix${fixed === 1 ? "" : "es"}`,
      description:
        "Auto-fix rewrites malformed placeholders, missing braces, and close-match unknown tokens.",
      before: { subject: t.subject, body: activeBody(t) },
      after: { subject: next.subject, body: activeBody(next) },
      next,
      successMessage: `Fixed ${fixed} placeholder issue${fixed === 1 ? "" : "s"}`,
    });
  };

  const confirmPendingFix = () => {
    if (!pendingFix) return;
    const saved = saveEmailTemplate(pendingFix.next);
    setEmailTemplate(saved);
    setLintSource(saved);
    toast.success(pendingFix.successMessage);
    setPendingFix(null);
  };

  const templatePreview = useMemo(() => {
    const values = templateValues(
      {
        ranAt: new Date().toISOString(),
        passing: 8,
        total: 10,
        failed: ["Canonical tags", "Hreflang alternates"],
        filename: "seo-checklist-example.pdf",
        commit: BUILD_INFO.commitShort,
        branch: BUILD_INFO.branch,
        origin: window.location.origin,
      },
      BUILD_INFO.builtAt || "unknown",
    );
    return {
      values,
      subject: renderTemplate(emailTemplate.subject, values),
      body: renderBody(emailTemplate, values),
    };
  }, [emailTemplate]);
  const [deliveryLog, setDeliveryLog] = useState<DeliveryLogEntry[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const afterRunRef = useRef<
    ((results: SeoCheckResult[], at: string) => void) | null
  >(null);

  useEffect(() => {
    setRuns(loadRuns());
    setAutoEmail(loadAutoEmail());
    setDeliveryLog(loadDeliveryLog());
  }, []);

  const runChecks = useCallback(async () => {
    setRunning(true);
    try {
      const results = await runSeoLiveChecks();
      setChecks(results);
      const at = new Date().toISOString();
      setRanAt(at);
      afterRunRef.current?.(results, at);
      setRuns(saveRun(results, at));
      const ticked = passedStepIds(results);
      if (ticked.length) {
        setDone((prev) => {
          const next = { ...prev };
          for (const id of ticked) next[id] = true;
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            /* storage unavailable */
          }
          return next;
        });
      }
    } finally {
      setRunning(false);
    }
  }, []);

  const diff = useMemo<SeoDiffEntry[] | null>(() => {
    if (runs.length < 2) return null;
    return diffRuns(runs[0], runs[1]);
  }, [runs]);

  const exportInput = useCallback(
    () => ({
      sections: SECTIONS,
      done,
      checks,
      ranAt,
      diff,
      runs,
      submission,
      origin: window.location.origin,
      branding,
      build: BUILD_INFO,
    }),
    [done, checks, ranAt, diff, runs, submission, branding],
  );

  const [archive, setArchive] = useState<ArchivedPdfMeta[]>([]);
  const [archiveBusy, setArchiveBusy] = useState(false);

  useEffect(() => {
    listArchivedPdfs().then(setArchive);
  }, []);

  const exportPdf = useCallback(async () => {
    const input = exportInput();
    const doc = buildChecklistPdf(input);
    const filename = checklistPdfFilename();
    doc.save(filename);

    // Archive the exact bytes that were downloaded so the report can be
    // re-downloaded later without re-running any checks.
    try {
      const blob = doc.output("blob") as Blob;
      await saveArchivedPdf(blob, {
        filename,
        title: branding.title || "SEO deploy verification",
        company: branding.company || "",
        progress: `${ALL_STEP_IDS.filter((id) => done[id]).length}/${ALL_STEP_IDS.length} steps`,
        checks: checks
          ? `${checks.filter((c) => c.status === "pass").length}/${checks.length} passing`
          : "not run",
        ranAt,
        commit: BUILD_INFO.commitShort,
        branch: BUILD_INFO.branch,
        builtAt: BUILD_INFO.builtAt,
      });
      setArchive(await listArchivedPdfs());
    } catch {
      /* archive is best-effort — the download already succeeded */
    }

  }, [exportInput, branding, done, checks, ranAt]);

  // Build + archive the PDF for a finished run, then email the saved
  // recipients a summary of it.
  const emailAfterRun = useCallback(
    async (results: SeoCheckResult[], at: string) => {
      const freshLint = lintTemplate(emailTemplate);
      setLintSource(emailTemplate);
      if (!freshLint.ok) {
        toast.error("Auto-email blocked", {
          description: `Fix ${freshLint.issues.length} placeholder issue${freshLint.issues.length === 1 ? "" : "s"} in the email template before running checks.`,
        });
        return;
      }
      setEmailing(true);
      try {
        const doc = buildChecklistPdf({
          sections: SECTIONS,
          done,
          checks: results,
          ranAt: at,
          diff,
          runs,
          submission,
          origin: window.location.origin,
          branding,
          build: BUILD_INFO,
        });
        const filename = checklistPdfFilename();
        try {
          await saveArchivedPdf(doc.output("blob") as Blob, {
            filename,
            title: branding.title || "SEO deploy verification",
            company: branding.company || "",
            progress: `${ALL_STEP_IDS.filter((id) => done[id]).length}/${ALL_STEP_IDS.length} steps`,
            checks: `${results.filter((c) => c.status === "pass").length}/${results.length} passing`,
            ranAt: at,
            commit: BUILD_INFO.commitShort,
            branch: BUILD_INFO.branch,
            builtAt: BUILD_INFO.builtAt,
          });
          setArchive(await listArchivedPdfs());
        } catch {
          /* archive is best-effort */
        }

        const issues = validateTemplate(loadEmailTemplate());
        if (!issues.ok) {
          toast.warning("Report template has unknown placeholders", {
            description: validationMessage(issues) ?? undefined,
          });
        }

        const outcome = await sendChecklistReport({
          ranAt: at,
          passing: results.filter((c) => c.status === "pass").length,
          total: results.length,
          failed: results.filter((c) => c.status !== "pass").map((c) => c.label),
          filename,
          commit: BUILD_INFO.commitShort,
          branch: BUILD_INFO.branch,
          origin: window.location.origin,
        });

        setDeliveryLog(loadDeliveryLog());
        if (outcome.ok) {
          toast.success(
            `Report emailed to ${outcome.sent ?? 0} recipient${outcome.sent === 1 ? "" : "s"}`,
          );
        } else {
          toast.error("Report email not sent", { description: outcome.reason });
        }
      } finally {
        setEmailing(false);
      }
    },
    [done, diff, runs, submission, branding, lintReport],
  );

  // Generate + archive the PDF right now and email it to my own address using
  // the subject/message currently in the editor (unsaved edits included).
  const sendTestEmail = useCallback(async () => {
    if (!testAddress.trim()) {
      toast.error("Enter an email address to send the test to");
      return;
    }
    const freshLint = lintTemplate(emailTemplate);
    setLintSource(emailTemplate);
    if (!freshLint.ok) {
      toast.error("Cannot send test email", {
        description: `Fix ${freshLint.issues.length} placeholder issue${freshLint.issues.length === 1 ? "" : "s"} first.`,
      });
      return;
    }
    const issues = validateTemplate(emailTemplate);
    if (!issues.ok) {
      toast.warning("Template has unknown placeholders", {
        description: validationMessage(issues) ?? undefined,
      });
    }
    setTestSending(true);
    try {
      const at = ranAt ?? new Date().toISOString();
      const doc = buildChecklistPdf(exportInput());
      const filename = checklistPdfFilename();
      try {
        await saveArchivedPdf(doc.output("blob") as Blob, {
          filename,
          title: branding.title || "SEO deploy verification",
          company: branding.company || "",
          progress: `${ALL_STEP_IDS.filter((id) => done[id]).length}/${ALL_STEP_IDS.length} steps`,
          checks: checks
            ? `${checks.filter((c) => c.status === "pass").length}/${checks.length} passing`
            : "not run",
          ranAt: at,
          commit: BUILD_INFO.commitShort,
          branch: BUILD_INFO.branch,
          builtAt: BUILD_INFO.builtAt,
        });
        setArchive(await listArchivedPdfs());
      } catch {
        /* archive is best-effort */
      }

      const outcome = await sendTestReport(
        testAddress.trim(),
        {
          ranAt: at,
          passing: checks ? checks.filter((c) => c.status === "pass").length : 0,
          total: checks ? checks.length : 0,
          failed: checks
            ? checks.filter((c) => c.status !== "pass").map((c) => c.label)
            : [],
          filename,
          commit: BUILD_INFO.commitShort,
          branch: BUILD_INFO.branch,
          origin: window.location.origin,
        },
        emailTemplate,
      );

      setDeliveryLog(loadDeliveryLog());
      if (outcome.ok) {
        toast.success(`Test email sent to ${testAddress.trim()}`);
      } else {
        toast.error("Test email not sent", { description: outcome.reason });
      }
    } finally {
      setTestSending(false);
    }
  }, [testAddress, ranAt, exportInput, branding, done, checks, emailTemplate, lintReport]);

  const retryEntry = useCallback(async (entry: DeliveryLogEntry) => {
    // Always re-run the lint report against the latest saved template so the
    // user sees current issues before a retry goes out.
    const current = loadEmailTemplate();
    setEmailTemplate(current);
    const report = lintTemplate(current);
    if (!report.ok) {
      setRetryBlocked({ email: entry.email, report });
      toast.error("Cannot retry send", {
        description: `${report.issues.length} placeholder issue${report.issues.length === 1 ? "" : "s"} blocked this retry — see details.`,
        action: {
          label: "Details",
          onClick: () => setRetryBlocked({ email: entry.email, report }),
        },
      });
      return;
    }

    setRetryingId(entry.id);
    try {
      const outcome = await retryDelivery(entry);
      setDeliveryLog(loadDeliveryLog());
      if (outcome.ok) {
        toast.success(`Report resent to ${entry.email}`);
      } else {
        toast.error("Retry failed", { description: outcome.reason });
      }
    } finally {
      setRetryingId(null);
    }
  }, []);


  useEffect(() => {
    afterRunRef.current = autoEmail ? emailAfterRun : null;
  }, [autoEmail, emailAfterRun]);


  const exportCsv = useCallback(() => {
    downloadChecklistCsv(exportInput());
  }, [exportInput]);


  const completed = useMemo(
    () => ALL_STEP_IDS.filter((id) => done[id]).length,
    [done],
  );
  const pct = Math.round((completed / ALL_STEP_IDS.length) * 100);


  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link to="/admin">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to admin
          </Link>
        </Button>

        <header className="mb-8">
          <Badge variant="outline" className="mb-3">
            Internal runbook · not indexed
          </Badge>
          <Badge variant="secondary" className="mb-3 ml-2 font-mono text-[10px]">
            {formatBuildInfo()}
          </Badge>

          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Post-deploy SEO checklist
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Run this after every deploy: submit the sitemap to Google Search Console,
            then verify coverage and canonicalization on the hub property.
          </p>

          <div className="mt-6 flex items-center gap-4">
            <Progress value={pct} className="h-2 flex-1" />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {completed}/{ALL_STEP_IDS.length} done
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => persist({})}
              disabled={completed === 0}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Reset
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <a href={GSC} target="_blank" rel="noreferrer noopener">
                Open Search Console
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={HUB_SITEMAP} target="_blank" rel="noreferrer noopener">
                sitemap.xml
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={HUB_SITEMAP_INDEX} target="_blank" rel="noreferrer noopener">
                sitemap-index.xml
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </header>

        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Search Console submission helper</CardTitle>
            <CardDescription className="mt-1">
              Stores your property URL locally and records when you last submitted the sitemap.
            </CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="gsc-property" className="text-xs">
                  Property URL (or sc-domain:example.com)
                </Label>
                <Input
                  id="gsc-property"
                  value={submission.property}
                  placeholder={DEFAULT_PROPERTY}
                  onChange={(e) =>
                    persistSubmission({ ...submission, property: e.target.value })
                  }
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="gsc-sitemap" className="text-xs">
                  Sitemap URL to submit (stable path only)
                </Label>
                <Input
                  id="gsc-sitemap"
                  value={submission.lastSitemap}
                  placeholder={HUB_SITEMAP}
                  onChange={(e) =>
                    persistSubmission({ ...submission, lastSitemap: e.target.value })
                  }
                  className="mt-1 h-9 text-sm"
                />
              </div>
            </div>

            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Last submitted:{" "}
              <span className="font-medium text-foreground">
                {formatWhen(submission.lastSubmittedAt)}
              </span>
            </div>

            <ol className="space-y-1 text-xs text-muted-foreground">
              <li>1. Open the Sitemaps report for the property below.</li>
              <li>2. Paste the sitemap path (never a hashed filename) and click Submit.</li>
              <li>3. Wait for status Success, then mark the date here.</li>
              <li>4. URL-inspect the hub page to confirm the canonical matches.</li>
            </ol>

            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <a
                  href={sitemapsUrl(submission.property)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Open Sitemaps report
                  <ExternalLink className="ml-1 h-3.5 w-3.5" />
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a
                  href={inspectUrl(submission.property, submission.property)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  URL inspect
                  <ExternalLink className="ml-1 h-3.5 w-3.5" />
                </a>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  persistSubmission({
                    ...submission,
                    lastSubmittedAt: new Date().toISOString(),
                  })
                }
              >
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                Mark submitted today
              </Button>
              {submission.lastSubmittedAt && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    persistSubmission({ ...submission, lastSubmittedAt: null })
                  }
                >
                  Clear date
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <RecipientListEditor />

        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Email report after checks</CardTitle>
            <CardDescription>
              When enabled, running the automated deploy checks archives the PDF and
              emails a summary of the run to your selected recipients.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border/60 p-3">
              <div className="space-y-1">
                <Label htmlFor="auto-email-reports" className="text-sm">
                  Send automatically after each run
                </Label>
                <p className="text-xs text-muted-foreground">
                  Requires a verified sender —{" "}
                  <Link to="/admin/email-sender" className="underline">
                    email sender setup
                  </Link>
                  . The full PDF stays in your deploy-notes history.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {emailing && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                <Switch
                  id="auto-email-reports"
                  checked={autoEmail}
                  onCheckedChange={(v) => setAutoEmail(saveAutoEmail(v))}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Email subject &amp; message</CardTitle>
            <CardDescription>
              Customise what the report email says. Placeholders are filled from the
              run and build metadata:{" "}
              {TEMPLATE_PLACEHOLDERS.map((p) => `{{${p}}}`).join(", ")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <TemplateLibraryBar
              current={emailTemplate}
              onLoad={(tpl) => setEmailTemplate(saveEmailTemplate(tpl))}
            />
            <LintIssueNavigator
              report={lintReport}
              subjectId="report-subject"
              bodyId="report-body"
            />

            <div className="space-y-1.5">
              <Label htmlFor="report-subject" className="text-sm">
                Subject
              </Label>
              <PlaceholderField
                id="report-subject"
                value={emailTemplate.subject}
                onChange={(v) =>
                  setEmailTemplate((t) => ({ ...t, subject: v }))
                }
                onBlur={() => saveEmailTemplate(emailTemplate)}
                placeholder={DEFAULT_TEMPLATE.subject}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="report-body" className="text-sm">
                  Message body
                </Label>
                <div className="flex items-center gap-1 rounded-md border border-border/60 p-0.5">
                  {(["text", "html"] as const).map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={emailTemplate.format === f ? "secondary" : "ghost"}
                      className="h-7 px-2 text-xs"
                      onClick={() =>
                        setEmailTemplate((t) =>
                          saveEmailTemplate({ ...t, format: f }),
                        )
                      }
                    >
                      {f === "text" ? "Plain text" : "HTML"}
                    </Button>
                  ))}
                </div>
              </div>
              <PlaceholderField
                id="report-body"
                multiline
                rows={emailTemplate.format === "html" ? 12 : 8}
                className="font-mono text-xs"
                value={activeBody(emailTemplate)}
                onChange={(v) =>
                  setEmailTemplate((t) => setActiveBody(t, v))
                }
                onBlur={() => saveEmailTemplate(emailTemplate)}
                placeholder={
                  emailTemplate.format === "html"
                    ? DEFAULT_TEMPLATE.htmlBody
                    : DEFAULT_TEMPLATE.body
                }
              />
              <p className="text-xs text-muted-foreground">
                {emailTemplate.format === "html"
                  ? "Inline styles only — placeholder values are HTML-escaped before sending."
                  : "Plain text is sent as-is with line breaks preserved."}
              </p>
            </div>
            <div
              className={
                lintPending ? "opacity-60 transition-opacity" : "transition-opacity"
              }
            >
              <LintSeveritySummary report={lintReport} />
            </div>
            {lintPending && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Checking placeholders…
              </p>
            )}
            <TemplateLintReport
              report={lintReport}
              onFix={applyLintFix}
              onFixAll={applyAllLintFixes}

            />
            <TemplateDiffDialog
              open={pendingFix !== null}
              onOpenChange={(o) => {
                if (!o) setPendingFix(null);
              }}
              title={pendingFix?.title ?? "Review fix"}
              description={pendingFix?.description}
              before={pendingFix?.before ?? { subject: "", body: "" }}
              after={pendingFix?.after ?? { subject: "", body: "" }}
              onConfirm={confirmPendingFix}
            />
            {retryBlocked && !blockedOpen && !blockedBannerDismissed ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                  <span className="text-foreground">
                    Last blocked retry: <span className="font-medium">{retryBlocked.email}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {retryBlocked.report.issues.length} placeholder issue
                    {retryBlocked.report.issues.length === 1 ? "" : "s"}
                  </span>
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex cursor-help items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatBlockedAgo(retryBlocked.blockedAt)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p className="text-[11px]">
                          {formatBlockedExact(retryBlocked.blockedAt)}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => setBlockedOpen(true)}
                  >
                    Reopen details
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => retryBlocked && downloadBlockedReport(retryBlocked)}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    Export JSON
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setRetryBlocked(null)}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Clear saved details
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Hide until next report or session"
                    aria-label="Hide blocked retry banner"
                    onClick={() => setBlockedBannerDismissed(true)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : null}
            <RetryBlockedDialog
              open={blockedOpen && retryBlocked !== null}
              onOpenChange={(o) => {
                setBlockedOpen(o);
              }}
              email={retryBlocked?.email}
              report={retryBlocked?.report ?? null}
              fixableCount={
                retryBlocked?.report.issues.filter(
                  (i) => i.suggestion || i.kind !== "unknown",
                ).length ?? 0
              }
              onFixAll={applyAllLintFixes}
              onJump={jumpToIssue}
              onFixIssue={autoFixIssue}
              onClear={() => setRetryBlocked(null)}
              onRecheck={recheckBlockedPlaceholders}
              onRegenerate={regenerateBlockedReport}
            />




            <div className="rounded-md border border-border/60 bg-muted/30 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Preview with sample data
                </p>
                {lintPending ? (
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Checking…
                  </span>
                ) : lintReport.ok ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    Lint passed — mock values
                  </span>
                ) : (
                  <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium text-destructive">
                    Lint failed
                  </span>
                )}
              </div>

              {!lintReport.ok && !lintPending ? (
                <p className="text-xs text-muted-foreground">
                  Fix {lintReport.issues.length} placeholder issue
                  {lintReport.issues.length === 1 ? "" : "s"} above to preview the
                  rendered subject and message.
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium">{templatePreview.subject}</p>
                  {emailTemplate.format === "html" ? (
                    <iframe
                      title="HTML email preview"
                      sandbox=""
                      className="mt-2 h-56 w-full rounded border border-border/60 bg-white"
                      srcDoc={templatePreview.body}
                    />
                  ) : (
                    <pre className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                      {templatePreview.body}
                    </pre>
                  )}
                  <div className="mt-3 border-t border-border/60 pt-2">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Sample values used
                    </p>
                    <dl className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
                      {Object.entries(templatePreview.values).map(([k, v]) => (
                        <div key={k} className="flex gap-1 text-[11px]">
                          <dt className="font-mono text-muted-foreground">
                            {"{{"}{k}{"}}"}
                          </dt>
                          <dd className="truncate">{String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </>
              )}
            </div>

            <div className="grid gap-2">
              <TokenInspector
                label="Subject tokens"
                text={emailTemplate.subject}
                values={templatePreview.values}
              />
              <TokenInspector
                label="Message tokens"
                text={
                  emailTemplate.format === "html"
                    ? emailTemplate.htmlBody
                    : emailTemplate.body
                }
                values={templatePreview.values}
              />
            </div>



            <div className="rounded-md border border-border/60 p-3">
              <div className="mb-2 flex items-center gap-2">
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-medium">Supported placeholders</p>
              </div>
              <dl className="grid gap-2 sm:grid-cols-2">
                {PLACEHOLDER_HELP.map((h) => (
                  <div
                    key={h.key}
                    className="flex flex-col gap-0.5 rounded-md bg-muted/30 p-2"
                  >
                    <dt className="font-mono text-xs font-medium">
                      {"{{"}{h.key}{"}}"}
                    </dt>
                    <dd className="text-xs text-muted-foreground">
                      {h.description}
                    </dd>
                    <dd className="truncate text-xs text-muted-foreground/80">
                      e.g. <span className="font-mono">{h.example}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  saveEmailTemplate(emailTemplate);
                  toast.success("Email template saved");
                }}
              >
                Save template
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEmailTemplate(resetEmailTemplate())}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Reset to default
              </Button>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label htmlFor="test-email-address" className="text-sm">
                Send test email
              </Label>
              <p className="text-xs text-muted-foreground">
                Generates and archives the PDF now, then emails you the subject and
                message exactly as previewed above (prefixed with [TEST]).
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="test-email-address"
                  type="email"
                  placeholder="you@example.com"
                  value={testAddress}
                  onChange={(e) => setTestAddress(e.target.value)}
                  onBlur={() => saveTestAddress(testAddress.trim())}
                />
                <Button
                  onClick={sendTestEmail}
                  disabled={testSending || !testAddress.trim()}
                  className="sm:w-auto"
                >
                  {testSending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-1 h-4 w-4" />
                  )}
                  Send test email
                </Button>
              </div>
            </div>

          </CardContent>
        </Card>


        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Email delivery log</CardTitle>
                <CardDescription className="mt-1">
                  Sent/failed status for every report email, with retry for failures.
                </CardDescription>
              </div>
              {deliveryLog.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeliveryLog(clearDeliveryLog())}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {deliveryLog.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No report emails have been attempted yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {deliveryLog.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start justify-between gap-3 rounded-md border border-border/60 p-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={entry.status === "sent" ? "secondary" : "destructive"}
                        >
                          {entry.status === "sent" ? "Sent" : "Failed"}
                        </Badge>
                        <span className="truncate text-sm">{entry.email}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.at).toLocaleString()} · attempt {entry.attempts} ·{" "}
                        {entry.summary.filename}
                      </p>
                      {entry.status === "failed" && entry.reason && (
                        <p className="text-xs text-destructive break-words">
                          {entry.reason}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {entry.status === "failed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={retryingId === entry.id}
                          onClick={() => retryEntry(entry)}
                        >
                          {retryingId === entry.id ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />
                          )}
                          Retry
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeliveryLog(deleteDeliveryLogEntry(entry.id))}
                        aria-label={`Remove log entry for ${entry.email}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>


        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">PDF branding</CardTitle>
            <CardDescription className="mt-1">
              Sets the document title, company name and logo used by the PDF export, so
              deploy notes match your team's standard format. Stored on this machine only.
            </CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="brand-title" className="text-xs">
                  Document title
                </Label>
                <Input
                  id="brand-title"
                  value={branding.title}
                  placeholder={DEFAULT_BRANDING.title}
                  onChange={(e) => persistBranding({ ...branding, title: e.target.value })}
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="brand-company" className="text-xs">
                  Company / team name
                </Label>
                <Input
                  id="brand-company"
                  value={branding.company}
                  placeholder="Resonance Hub — Ops"
                  onChange={(e) => persistBranding({ ...branding, company: e.target.value })}
                  className="mt-1 h-9 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div>
                <Label htmlFor="brand-logo" className="text-xs">
                  Logo (PNG or JPEG, optional)
                </Label>
                <Input
                  id="brand-logo"
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => onLogoPicked(e.target.files?.[0])}
                  className="mt-1 h-9 cursor-pointer text-sm file:text-xs"
                />
              </div>
              {branding.logoDataUrl && (
                <div className="flex items-center gap-3">
                  <img
                    src={branding.logoDataUrl}
                    alt="Current PDF logo preview"
                    className="h-10 max-w-[140px] rounded border bg-background object-contain p-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => persistBranding({ ...branding, logoDataUrl: null })}
                  >
                    Remove logo
                  </Button>
                </div>
              )}
            </div>

            {branding.logoDataUrl && (
              <div className="max-w-xs">
                <Label htmlFor="brand-logo-width" className="text-xs">
                  Logo width in the PDF: {branding.logoWidth}pt
                </Label>
                <input
                  id="brand-logo-width"
                  type="range"
                  min={40}
                  max={200}
                  step={5}
                  value={branding.logoWidth}
                  onChange={(e) =>
                    persistBranding({ ...branding, logoWidth: Number(e.target.value) })
                  }
                  className="mt-2 w-full accent-primary"
                />
              </div>
            )}

            {logoError && <p className="text-xs text-destructive">{logoError}</p>}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={exportPdf}>
                <Download className="mr-1 h-3.5 w-3.5" />
                Preview branded PDF
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setLogoError(null);
                  setBranding(clearBranding());
                }}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Reset branding
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Deploy-notes history</CardTitle>
                <CardDescription className="mt-1">
                  Every exported PDF is stored on this device (last{" "}
                  {MAX_ARCHIVE_ENTRIES}) so you can re-download an earlier report without
                  regenerating it.
                </CardDescription>
              </div>
              {archive.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={archiveBusy}
                  onClick={async () => {
                    setArchiveBusy(true);
                    try {
                      await clearArchivedPdfs();
                      setArchive([]);
                    } finally {
                      setArchiveBusy(false);
                    }
                  }}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Clear all
                </Button>
              )}
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            {archive.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No saved reports yet — export a PDF and it will appear here.
              </p>
            ) : (
              <ul className="space-y-2">
                {archive.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start justify-between gap-3 rounded-md border border-border/60 p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-medium">
                          {entry.filename}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString()} · {entry.progress} ·{" "}
                        {entry.checks} · {formatBytes(entry.size)}
                      </p>
                      {(entry.commit || entry.builtAt) && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-mono">{entry.commit ?? "unknown"}</span>
                          {entry.branch ? ` (${entry.branch})` : ""}
                          {entry.builtAt
                            ? ` · built ${new Date(entry.builtAt).toLocaleString()}`
                            : ""}
                        </p>
                      )}
                      {entry.company && (
                        <p className="text-xs text-muted-foreground">{entry.company}</p>
                      )}

                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadArchivedPdf(entry)}
                      >
                        <Download className="mr-1 h-3.5 w-3.5" />
                        Download
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${entry.filename}`}
                        onClick={async () => {
                          await deleteArchivedPdf(entry.id);
                          setArchive(await listArchivedPdfs());
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>




        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Automated deploy checks</CardTitle>
                <CardDescription className="mt-1">
                  Re-runs the sitemap/robots and canonical/hreflang validators against the
                  live files and ticks the matching boxes when they pass.
                </CardDescription>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={exportCsv}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Export CSV
                </Button>
                <Button size="sm" variant="outline" onClick={exportPdf}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Export PDF
                </Button>

                <Button size="sm" onClick={runChecks} disabled={running}>
                  {running ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PlayCircle className="mr-1 h-3.5 w-3.5" />
                  )}
                  {running ? "Running…" : "Run checks"}
                </Button>
              </div>
            </div>

          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            {!checks && (
              <p className="text-xs text-muted-foreground">
                Not run yet. Checks fetch /sitemap.xml, /sitemap-index.xml and /robots.txt
                from this origin — run them after the deploy has propagated.
              </p>
            )}
            {checks && (
              <>
                <ul className="space-y-3">
                  {checks.map((c) => (
                    <li key={c.id} className="flex gap-2">
                      {c.status === "pass" ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{c.label}</p>
                        <p className="mt-0.5 break-words text-xs text-muted-foreground">
                          {c.detail}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-muted-foreground">
                  Last run {formatWhen(ranAt)} ·{" "}
                  {passedStepIds(checks).length} checklist step(s) ticked automatically.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Coverage &amp; canonicalization diff</CardTitle>
                <CardDescription className="mt-1">
                  Compares the latest verification run against the previous deploy so
                  regressions and fixes are obvious at a glance.
                </CardDescription>
              </div>
              {runs.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setRuns(clearRuns())}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Clear history
                </Button>
              )}
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            {runs.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No history yet. Run the checks above after each deploy — the second run
                onwards shows a diff.
              </p>
            )}
            {runs.length === 1 && (
              <p className="text-xs text-muted-foreground">
                Baseline captured {formatWhen(runs[0].at)}. Run the checks again after the
                next deploy to see what changed.
              </p>
            )}
            {diff && (
              <>
                <p className="mb-3 text-xs text-muted-foreground">
                  {formatWhen(runs[1].at)} → {formatWhen(runs[0].at)}
                  {isNoChange(diff) && " · no changes since the previous deploy"}
                </p>
                <ul className="space-y-3">
                  {diff.map((d) => (
                    <li key={d.id} className="flex gap-2">
                      {d.kind === "regressed" ? (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      ) : d.kind === "fixed" ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      ) : (
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{d.label}</p>
                          <Badge
                            variant={
                              d.kind === "regressed"
                                ? "destructive"
                                : d.kind === "unchanged"
                                  ? "outline"
                                  : "secondary"
                            }
                            className="text-[10px] uppercase"
                          >
                            {d.kind}
                          </Badge>
                        </div>
                        {d.kind !== "unchanged" && (
                          <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                            {d.beforeDetail && (
                              <p className="break-words">
                                <span className="font-medium">Was ({d.before}):</span>{" "}
                                {d.beforeDetail}
                              </p>
                            )}
                            {d.afterDetail && (
                              <p className="break-words">
                                <span className="font-medium">Now ({d.after}):</span>{" "}
                                {d.afterDetail}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {runs.length > 2 && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    {runs.length} runs stored (most recent {MAX_HISTORY_SHOWN} shown in the
                    log below).
                  </p>
                )}
                <div className="mt-4 space-y-1">
                  {runs.slice(0, MAX_HISTORY_SHOWN).map((r, i) => {
                    const failed = r.results.filter((x) => x.status === "fail").length;
                    return (
                      <p key={r.at} className="text-xs text-muted-foreground">
                        {i === 0 ? "Latest" : `#${i + 1}`} · {formatWhen(r.at)} ·{" "}
                        {r.results.length - failed}/{r.results.length} passing
                      </p>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>



        <div className="space-y-5">

          {SECTIONS.map((section) => {
            const sectionDone = section.steps.filter((s) => done[s.id]).length;
            return (
              <Card key={section.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{section.title}</CardTitle>
                      <CardDescription className="mt-1">{section.summary}</CardDescription>
                    </div>
                    <Badge
                      variant={sectionDone === section.steps.length ? "default" : "secondary"}
                      className="shrink-0 tabular-nums"
                    >
                      {sectionDone}/{section.steps.length}
                    </Badge>
                  </div>
                </CardHeader>
                <Separator />
                <CardContent className="pt-4">
                  <ul className="space-y-4">
                    {section.steps.map((step) => (
                      <li key={step.id} className="flex gap-3">
                        <Checkbox
                          id={step.id}
                          checked={!!done[step.id]}
                          onCheckedChange={(v) =>
                            persist({ ...done, [step.id]: v === true })
                          }
                          className="mt-0.5"
                        />
                        <div className="min-w-0">
                          <label
                            htmlFor={step.id}
                            className={`block cursor-pointer text-sm font-medium ${
                              done[step.id] ? "text-muted-foreground line-through" : ""
                            }`}
                          >
                            {step.title}
                          </label>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {step.detail}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Search Console data lags by 1–3 days. If a coverage error persists past that
          window, treat it as real and trace it back to the canonical, the 301 from the
          spoke domain, or robots.txt.
        </p>
      </div>
    </div>
  );
}
