import { lazy, Suspense, useState, useEffect, useRef, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Image, ImageOff, FileText, Megaphone, Video, Share2, Loader2, Layers, AlertTriangle, X, RotateCw, Save, ChevronDown, Sparkles } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import ConfigSidebar from "@/components/studio/ConfigSidebar";
const PreviewPanel = lazy(() => import("@/components/studio/PreviewPanel"));
import StudioNav from "@/components/studio/StudioNav";
import StudioStageNav, { type StudioStageId } from "@/components/studio/StudioStageNav";
import LiveProgress from "@/components/studio/LiveProgress";
// Heavy / conditional panels — code-split so they don't bloat the initial Studio bundle.
const CreativeBriefPanel = lazy(() => import("@/components/studio/CreativeBriefPanel"));
const SocialTab = lazy(() => import("@/components/studio/SocialTab"));
const SourceBriefPanel = lazy(() => import("@/components/studio/SourceBriefPanel"));
const ReferenceImagesPanel = lazy(() => import("@/components/studio/ReferenceImagesPanel"));
const PromptPreviewPanel = lazy(() => import("@/components/studio/PromptPreviewPanel"));
const MergePreviewPanel = lazy(() => import("@/components/studio/MergePreviewPanel"));
const ScrapeTimingReport = lazy(() => import("@/components/studio/ScrapeTimingReport"));
const VariantPicker = lazy(() => import("@/components/studio/VariantPicker"));
const CompliancePanel = lazy(() => import("@/components/studio/CompliancePanel"));
const BrandDnaPanel = lazy(() => import("@/components/studio/BrandDnaPanel"));
import type { BriefVariant } from "@/components/studio/VariantPicker";
import type { ComplianceFlag } from "@/components/studio/CompliancePanel";
import { recordScrapeTiming } from "@/lib/scrapeTimings";
import { buildUploadFallback } from "@/lib/uploadFallback";
import type { MergeSourceEntry, MergeOrigins, MergeSource, MergeResolution } from "@/components/studio/MergePreviewPanel";
import { DEFAULT_SOCIAL_CONFIG, type SocialMediaConfig } from "@/components/studio/socialConfig";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { fileToVisualReference, getSourceDisplayName } from "@/lib/media";
import { handleEdgeFunctionError, handlePremiumGatePayload } from "@/lib/errorHandlers";
import SEO from "@/components/SEO";
import PipelineProgress, { type PipelineState, type ControlledExitReason } from "@/components/studio/PipelineProgress";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/use-mobile";
import StudioLogPanel, { StudioLogToggleButton } from "@/components/studio/StudioLogPanel";
import { studioLog, useStudioLogs } from "@/lib/studioLog";
import WatchdogDebugPanel, { type WatchdogTrip } from "@/components/studio/WatchdogDebugPanel";
import { saveDraft, clearDraft, saveProjectSnapshot } from "@/lib/studioDraft";
import { saveProjectAsync, saveProjectBeacon, getProject } from "@/lib/studioProjects";
import { type SourceBrief } from "@/lib/sourceBrief";
import { buildAutoHintPrompt } from "@/lib/promptPresets";
import { buildDefaultBrief } from "@/lib/defaultBrief";
import { streamPoster } from "@/lib/streamPoster";
import { cleanBriefVoice } from "@/lib/voiceGuard";
import { briefFromDna, fetchImageAsBase64 } from "@/lib/briefFromDna";
import { getMyBrandDna, listMyProducts, listMyMoodboards, type BrandDna, type Product, type Moodboard } from "@/lib/brandDna";
import StudioHealthIndicator from "@/components/studio/StudioHealthIndicator";
import AuthDiagnosticsPanel, { AuthDiagnosticsToggleButton } from "@/components/studio/AuthDiagnosticsPanel";
import PricingConfirmDialog, { type PricingDecision } from "@/components/studio/PricingConfirmDialog";
import { validatePriceWithRules } from "@/lib/pricingRules";


export interface CreativeBrief {
  brand: string;
  headline: string;
  subheadline: string;
  keyPoints: string[];
  targetAudience: string;
  callToAction: string;
  colorSuggestions: string[];
  instructions: string;
  tone: string;
  variants?: BriefVariant[];
  complianceFlags?: ComplianceFlag[];
  activeAngle?: BriefVariant["angle"];
}

const contentTabs = [
  { id: "poster", label: "Poster", icon: Image },
  { id: "brochure", label: "Brochure", icon: FileText },
  { id: "ad", label: "Advertisement", icon: Megaphone },
  { id: "video", label: "Video", icon: Video },
  { id: "social", label: "Social Media", icon: Share2 },
];

// The edge scraper is internally hard-capped at 18s (totalInternalLimit) and
// returns an explicit status envelope. The client adds a small buffer; on
// abort we synthesize a controlled failed_fast response, never a thrown error.
// The extractor is now a fast, controlled pipeline: HTML/storefront metadata
// first, Firecrawl only as bounded enrichment. Keep the browser timeout close
// to the server budget so Generate never waits on redundant slow processes.
const SCRAPE_CLIENT_TIMEOUT_MS = 25_000;
// Generate should never wait for the full URL-reader watchdog. URL scraping is
// treated as OPTIONAL enrichment: if it hasn't returned a controlled response
// within this soft budget, we proceed with a default brief immediately and let
// the image-optimization pass capture a screenshot. Streaming poster generation
// now surfaces the first frame in ~4–8s, so a sub-10s URL budget keeps the
// scrape from gating perceived latency.
const GENERATE_ANALYZE_FALLBACK_MS = 8_000;
// Hard client-side watchdogs — fail the stage if it has been "active" for
// longer than this (covers backgrounded tabs, dropped sockets, etc.).
const ANALYZE_CLIENT_TIMEOUT_MS = 45_000;
// Per-variant timeout is 75s; worst case is v1 fail (75s) + v2 fallback (75s)
// + small jitter for the optimize-source-images pass. 180s gives ~30s of
// headroom while still surfacing real failures ~2 minutes earlier than the
// previous 300s ceiling.
const GENERATE_CLIENT_TIMEOUT_MS = 180_000;
const Index = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectName, setActiveProjectName] = useState<string | null>(null);

  const [contentType, setContentType] = useState("poster");
  const [style, setStyle] = useState("professional");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [secondaryUrl, setSecondaryUrl] = useState("");
  const [tertiaryUrl, setTertiaryUrl] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  // True from the moment the user clicks Cancel until aborts have propagated
  // to the in-flight network requests. Drives the "Cancelling…" state in the
  // live progress bar so the UI never looks frozen.
  const [isCanceling, setIsCanceling] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [brief, setBrief] = useState<CreativeBrief | null>(null);
  const [sourceBrief, setSourceBrief] = useState<SourceBrief | null>(null);
  // Mirror in a ref so scheduleAutoRetry (called from inside watchdog timers /
  // long-lived closures) can check the freshest value without stale captures.
  const sourceBriefRef = useRef<SourceBrief | null>(null);
  useEffect(() => { sourceBriefRef.current = sourceBrief; }, [sourceBrief]);

  // Pricing confirmation gate — generation is blocked until the user has
  // explicitly approved the price (or chosen "no price"). Approval is keyed
  // to the pricing value it was given for, so if extraction/brief changes
  // pricing later, the user has to re-confirm.
  const [pricingApproval, setPricingApproval] = useState<PricingDecision | null>(null);
  const pricingApprovalRef = useRef<PricingDecision | null>(null);
  useEffect(() => { pricingApprovalRef.current = pricingApproval; }, [pricingApproval]);
  const [pricingDialogOpen, setPricingDialogOpen] = useState(false);
  // Stash the overrideBrief that triggered the gate so we can resume the
  // exact same generate call after the user confirms.
  const pendingGenerateRef = useRef<CreativeBrief | null>(null);

  // Reset approval whenever the underlying pricing changes — keeps the gate
  // honest if a fresh extraction or DNA switch brings in a different number.
  useEffect(() => {
    const current = (sourceBrief?.pricing ?? "").trim();
    if (!pricingApproval) return;
    if (pricingApproval.mode === "use" && pricingApproval.value !== current) {
      setPricingApproval(null);
    } else if (pricingApproval.mode === "none" && current !== "") {
      setPricingApproval(null);
    }
  }, [sourceBrief?.pricing, pricingApproval]);
  // Mirror files/instructions so the master watchdog (long-lived setTimeout
  // closure) reads the freshest value when deciding whether to fall back to
  // user-supplied source material instead of failing fast.
  const filesRef = useRef<File[]>([]);
  const instructionsRef = useRef("");
  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { instructionsRef.current = instructions; }, [instructions]);

  // Async screenshot enrichment: poll source_extracts via authenticated
  // queries (RLS-scoped to auth.uid()) instead of subscribing over Realtime.
  // Realtime broadcast on this table was removed because row-level RLS does
  // not gate channel messages — any subscriber could otherwise receive other
  // users' raw_markdown / source_brief payloads.
  useEffect(() => {
    const currentUrl = sourceBrief?.sourceUrl;
    if (!currentUrl) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 10; // ~30s total
    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const { data } = await supabase
          .from("source_extracts")
          .select("source_brief, screenshot_url, normalized_url")
          .eq("normalized_url", currentUrl)
          .maybeSingle();
        const row = data as unknown as { normalized_url?: string; source_brief?: SourceBrief; screenshot_url?: string | null } | null;
        if (row?.source_brief) {
          const incomingShot = row.source_brief?.screenshot ?? row.screenshot_url ?? null;
          if (incomingShot) {
            setSourceBrief((prev) => {
              if (!prev) return prev;
              if (prev.screenshot === incomingShot) return prev;
              studioLog.info("scrape", "Background screenshot ready");
              return { ...prev, screenshot: incomingShot };
            });
            return; // done
          }
        }
      } catch { /* ignore polling errors */ }
      if (attempts < maxAttempts && !cancelled) {
        setTimeout(tick, 3000);
      }
    };
    const t = setTimeout(tick, 3000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [sourceBrief?.sourceUrl]);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [sourceMeta, setSourceMeta] = useState<{ cached: boolean; stale: boolean } | null>(null);

  // ── Brand DNA mode ─────────────────────────────────────────────────────
  // When a product is selected, Generate bypasses scrape/analyze entirely
  // and synthesises the brief from brand_dna + product + active moodboard.
  const [brandDna, setBrandDna] = useState<BrandDna | null>(null);
  const [dnaProducts, setDnaProducts] = useState<Product[]>([]);
  const [dnaMoodboards, setDnaMoodboards] = useState<Moodboard[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const selectedProduct = useMemo(
    () => dnaProducts.find((p) => p.id === selectedProductId) ?? null,
    [dnaProducts, selectedProductId],
  );
  const activeMoodboard = useMemo(
    () => dnaMoodboards.find((m) => m.is_active) ?? dnaMoodboards[0] ?? null,
    [dnaMoodboards],
  );
  const [pendingMerge, setPendingMerge] = useState<{
    sources: MergeSourceEntry[];
    origins: MergeOrigins;
    merged: SourceBrief;
    effectiveContentType: string;
    cached: boolean;
    stale: boolean;
  } | null>(null);
  const [posters, setPosters] = useState<string[]>([]);
  const [videos, setVideos] = useState<{ posterUrl: string; headline?: string; subheadline?: string; callToAction?: string; colors?: string[] }[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [welcomeBack, setWelcomeBack] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [pipeline, setPipeline] = useState<PipelineState>({ scrape: "pending", analyze: "pending", generate: "pending", controlledExitReason: null });
  type StepKey = "scrape" | "analyze" | "generate";
  type Timings = Partial<Record<`${StepKey}Start` | `${StepKey}End`, number>>;
  const timingsRef = useRef<Timings>({});
  const lastInputsRef = useRef<Record<string, unknown> | null>(null);
  const lastErrorRef = useRef<{ step: StepKey | null; message: string; status?: number; raw?: unknown; at: string } | null>(null);
  // Captured for per-variant re-roll. Stored separately from lastInputsRef so
  // we keep the heavy imageBase64 payload (which lastInputsRef strips for export).
  const lastPosterBodyRef = useRef<Record<string, unknown> | null>(null);
  const [regeneratingVariants, setRegeneratingVariants] = useState<number[]>([]);
  // Tracks the in-flight analyzeUrl run so a newer call (tab change, refresh,
  // fallback from generate) can cancel a stuck previous one.
  const analyzeAbortRef = useRef<AbortController | null>(null);
  // Watchdog for runAnalyzeContent (post-scrape brief synthesis).
  const analyzeContentWatchdogRef = useRef<number | null>(null);
  // Watchdog for the whole generate phase (covers poster + video paths).
  const generateWatchdogRef = useRef<number | null>(null);
  const generateAbortRef = useRef<AbortController | null>(null);
  // Tracks every in-flight controller (scrape, analyze, each poster variant) so
  // the user-initiated Cancel button can abort them all at once.
  const inFlightControllersRef = useRef<Set<AbortController>>(new Set());
  // Set when the user clicks Cancel so async result handlers (esp. video, which
  // can't be aborted mid-flight) can short-circuit and not overwrite state.
  const canceledRef = useRef(false);
  const registerController = (c: AbortController) => {
    inFlightControllersRef.current.add(c);
    return () => inFlightControllersRef.current.delete(c);
  };
  // Auto-retry: each failed step can self-recover up to MAX_AUTO_RETRIES times
  // with an increasing backoff before requiring the user. Countdown is visible
  // inside the pipeline panel so the UI never feels stuck.
  const MAX_AUTO_RETRIES = 3;
  const AUTO_RETRY_BACKOFF_S = [4, 8, 12]; // seconds between attempt N and N+1
  const AUTO_RETRY_PREF_KEY = "studio.autoRetryEnabled.v2";
  const AUTO_RETRY_DEFAULTS: Record<StepKey, boolean> = { scrape: true, analyze: true, generate: true };
  // Number of automatic retries already consumed per step in this session.
  const autoRetriedRef = useRef<Record<StepKey, number>>({ scrape: 0, analyze: 0, generate: 0 });
  const [autoRetriedCounts, setAutoRetriedCounts] = useState<Record<StepKey, number>>({ scrape: 0, analyze: 0, generate: 0 });
  const autoRetryTimerRef = useRef<number | null>(null);
  const [autoRetry, setAutoRetry] = useState<{ step: StepKey; secondsLeft: number } | null>(null);
  const [autoRetryEnabled, setAutoRetryEnabled] = useState<Record<StepKey, boolean>>(() => {
    if (typeof window === "undefined") return AUTO_RETRY_DEFAULTS;
    try {
      const raw = window.localStorage.getItem(AUTO_RETRY_PREF_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...AUTO_RETRY_DEFAULTS, ...parsed };
      }
      // Migrate legacy single-boolean pref if present.
      const legacy = window.localStorage.getItem("studio.autoRetryEnabled");
      if (legacy !== null) {
        const v = legacy === "true";
        return { scrape: v, analyze: v, generate: v };
      }
    } catch {}
    return AUTO_RETRY_DEFAULTS;
  });
  const autoRetryEnabledRef = useRef(autoRetryEnabled);
  useEffect(() => {
    autoRetryEnabledRef.current = autoRetryEnabled;
    try { window.localStorage.setItem(AUTO_RETRY_PREF_KEY, JSON.stringify(autoRetryEnabled)); } catch {}
  }, [autoRetryEnabled]);

  // Debug panel: visibility persisted; last watchdog trip kept in state so the panel can show it.
  const WATCHDOG_DEBUG_KEY = "studio.watchdogDebugVisible";
  const [debugVisible, setDebugVisible] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem(WATCHDOG_DEBUG_KEY) === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(WATCHDOG_DEBUG_KEY, String(debugVisible)); } catch {}
  }, [debugVisible]);

  // Live log panel: visibility persisted.
  const LOG_PANEL_KEY = "studio.logPanelVisible";
  const [logPanelVisible, setLogPanelVisible] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem(LOG_PANEL_KEY) === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(LOG_PANEL_KEY, String(logPanelVisible)); } catch {}
  }, [logPanelVisible]);
  const liveLogs = useStudioLogs();
  const logErrorCount = liveLogs.reduce((n, l) => n + (l.level === "error" ? 1 : 0), 0);
  const AUTH_PANEL_KEY = "studio.authPanelVisible";
  const [authPanelVisible, setAuthPanelVisible] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem(AUTH_PANEL_KEY) === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(AUTH_PANEL_KEY, String(authPanelVisible)); } catch {}
  }, [authPanelVisible]);
  const authAlert = useMemo(() => {
    const recent = liveLogs.slice(-40);
    return recent.some((l) =>
      (l.level === "error" || l.level === "warn") &&
      /bad[_ ]jwt|missing sub claim|invalid claim|jwt expired|unauthorized|\b401\b|\b403\b|auth (check|session) (timed out|failed)|sign[- ]?in (timed out|expired)/i.test(
        `${l.message} ${l.details ?? ""}`,
      ),
    );
  }, [liveLogs]);
  // Auto-open the auth diagnostics panel the first time we detect an auth-blocking error.
  const authAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (authAlert && !authAutoOpenedRef.current && !authPanelVisible) {
      authAutoOpenedRef.current = true;
      setAuthPanelVisible(true);
    }
  }, [authAlert, authPanelVisible]);

  const [lastWatchdogTrip, setLastWatchdogTrip] = useState<WatchdogTrip | null>(null);
  const WATCHDOG_HISTORY_KEY = "studio.watchdogTripHistory.v1";
  const WATCHDOG_HISTORY_MAX = 50;
  const [watchdogHistory, setWatchdogHistory] = useState<WatchdogTrip[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(WATCHDOG_HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, WATCHDOG_HISTORY_MAX) : [];
    } catch { return []; }
  });
  const appendWatchdogTrip = (trip: WatchdogTrip) => {
    setLastWatchdogTrip(trip);
    setWatchdogHistory((prev) => {
      const next = [trip, ...prev].slice(0, WATCHDOG_HISTORY_MAX);
      try { window.localStorage.setItem(WATCHDOG_HISTORY_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const clearWatchdogHistory = () => {
    setWatchdogHistory([]);
    setLastWatchdogTrip(null);
    try { window.localStorage.removeItem(WATCHDOG_HISTORY_KEY); } catch {}
  };
  const exportWatchdogHistory = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      budgetsMs: STEP_BUDGETS_MS,
      trips: watchdogHistory.map((t) => ({
        ...t,
        atIso: new Date(t.at).toISOString(),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `watchdog-trips-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  // Re-rendered each render; ticks for active stages so the debug panel timers move.

  // ── Master state-driven watchdog ────────────────────────────────────────
  // Independent of any in-flight async closure (analyzeUrl, runAnalyzeContent,
  // handleGenerate). If a stage stays "active" past its budget, this trips
  // the pipeline into "error" and fires auto-retry — even if the closure that
  // originally scheduled the timer was cancelled, replaced by HMR, or had its
  // timer cleared by an overlapping run.
  const STEP_BUDGETS_MS: Record<StepKey, number> = {
    scrape: SCRAPE_CLIENT_TIMEOUT_MS + 6_000,   // last-resort UI guard only
    analyze: ANALYZE_CLIENT_TIMEOUT_MS + 15_000, // 75s
    generate: GENERATE_CLIENT_TIMEOUT_MS + 15_000, // 255s
  };
  function hasSourceMaterialForFallback() {
    return (filesRef.current?.length ?? 0) > 0
      || (instructionsRef.current?.trim().length ?? 0) >= 20
      || !!sourceBriefRef.current;
  }

  function applySourceMaterialFallback(reason: string, showToast = false) {
    const currentFiles = filesRef.current ?? files;
    const currentInstructions = instructionsRef.current ?? instructions;
    const fallback = buildDefaultBrief({
      url,
      files: currentFiles,
      contentType,
      style,
      instructions: currentInstructions,
      sourceBrief: sourceBriefRef.current ?? sourceBrief,
    });
    setBrief(fallback);
    if (!currentInstructions.trim()) setInstructions(fallback.instructions);
    if (!sourceBriefRef.current) {
      const fallbackSource = buildFallbackSourceBriefFromDefault(fallback, url.trim(), reason);
      sourceBriefRef.current = fallbackSource;
      setSourceBrief(fallbackSource);
    }
    updateStep({ scrape: url.trim() ? "partial" : "done", analyze: "done", errorMessage: undefined, controlledExitReason: "client_abort" });
    if (showToast) toast({ title: "Continuing with source material", description: "The URL reader timed out, so generation will use your upload or Brand Brief / Instructions." });
    return fallback;
  }

  useEffect(() => {
    // Wall-clock interval poll — survives tab-throttle, HMR, and dropped
    // setTimeout fires. Re-evaluates every 2s and trips the moment elapsed
    // exceeds the stage budget. Also re-checks on visibilitychange so a
    // returning foreground tab catches an overdue stage instantly.
    const check = () => {
      (["scrape", "analyze", "generate"] as StepKey[]).forEach((step) => {
        if (pipeline[step] !== "active") return;
        const start = timingsRef.current[`${step}Start`] ?? Date.now();
        const elapsed = Date.now() - start;
        if (elapsed < STEP_BUDGETS_MS[step]) return;
        let tripped = false;
        const canUseSourceFallback = step === "scrape" && hasSourceMaterialForFallback();
        setPipeline((p) => {
          if (p[step] !== "active") return p;
          tripped = true;
          if (!timingsRef.current[`${step}End`]) timingsRef.current[`${step}End`] = Date.now();
          const message = step === "scrape"
            ? canUseSourceFallback
              ? "The URL reader timed out, so the studio is continuing with your uploaded image or Brand Brief / Instructions."
              : "The URL reader did not return a controlled status in time. Please upload the product image, provide a direct image URL, or try a retailer listing."
            : `${step[0].toUpperCase()}${step.slice(1)} exceeded ${Math.round(STEP_BUDGETS_MS[step] / 1000)}s — cancelled by safety watchdog. Please retry.`;
          recordError(step, message);
          if (step === "scrape") {
            if (canUseSourceFallback) {
              return {
                ...p,
                scrape: "partial",
                analyze: "done",
                generate: p.generate === "active" ? p.generate : "pending",
                errorMessage: undefined,
                userMessage: message,
                controlledExitReason: "client_abort",
              };
            }
            return {
              ...p,
              scrape: "failed_fast",
              analyze: "skipped",
              generate: "skipped",
              errorMessage: message,
              userMessage: message,
              controlledExitReason: "client_abort",
            };
          }
          return { ...p, [step]: "error", errorMessage: message };
        });
        if (tripped) {
          const reason = step === "scrape"
            ? "URL reader missed its controlled-status deadline."
            : `${step[0].toUpperCase()}${step.slice(1)} exceeded ${Math.round(STEP_BUDGETS_MS[step] / 1000)}s — cancelled by safety watchdog.`;
          appendWatchdogTrip({
            step, reason, at: Date.now(),
            budgetMs: STEP_BUDGETS_MS[step],
            elapsedMs: Date.now() - start,
          });
          // Best-effort: abort any in-flight scrape/generate request.
          if (analyzeAbortRef.current) {
            try { analyzeAbortRef.current.abort(); } catch { /* ignore */ }
          }
          if (step === "generate" && generateAbortRef.current) {
            try { generateAbortRef.current.abort(); } catch { /* ignore */ }
          }
          if (step === "scrape" && canUseSourceFallback) {
            applySourceMaterialFallback(reason, true);
            setIsAnalyzing(false);
            setIsGenerating(false);
            return;
          }
          setIsAnalyzing(false);
          setIsGenerating(false);
          if (step !== "scrape") scheduleAutoRetry(step);
        }
      });
    };
    const intervalId = window.setInterval(check, 2_000);
    const onVisibility = () => { if (!document.hidden) check(); };
    document.addEventListener("visibilitychange", onVisibility);
    // Immediate check on mount/state change too.
    check();
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pipeline.scrape, pipeline.analyze, pipeline.generate]);


  // Forward ref so watchdogs scheduled inside earlier-declared functions can
  // call into the retry handler that's only fully wired after handleGenerate.
  const triggerRetryRef = useRef<(step: StepKey) => void>(() => {});
  const cancelAutoRetry = () => {
    if (autoRetryTimerRef.current) { window.clearInterval(autoRetryTimerRef.current); autoRetryTimerRef.current = null; }
    setAutoRetry(null);
  };
  const scheduleAutoRetry = (step: StepKey) => {
    if (!autoRetryEnabledRef.current[step]) return; // user disabled auto-retry for this stage
    const attempts = autoRetriedRef.current[step] ?? 0;
    if (attempts >= MAX_AUTO_RETRIES) return; // budget exhausted — user must intervene
    // If scrape already produced a brief, re-scraping is pointless and races with
    // any in-flight Generate. Skip the retry — analyze has the data it needs.
    if (step === "scrape" && sourceBriefRef.current) return;
    const nextAttempt = attempts + 1;
    autoRetriedRef.current = { ...autoRetriedRef.current, [step]: nextAttempt };
    setAutoRetriedCounts({ ...autoRetriedRef.current });
    cancelAutoRetry();
    const backoffIdx = Math.min(attempts, AUTO_RETRY_BACKOFF_S.length - 1);
    let s = AUTO_RETRY_BACKOFF_S[backoffIdx];
    setAutoRetry({ step, secondsLeft: s });
    studioLog.warn(step, `Auto-retry scheduled (attempt ${nextAttempt}/${MAX_AUTO_RETRIES}) in ${s}s`);
    autoRetryTimerRef.current = window.setInterval(() => {
      s -= 1;
      if (s <= 0) {
        if (autoRetryTimerRef.current) { window.clearInterval(autoRetryTimerRef.current); autoRetryTimerRef.current = null; }
        setAutoRetry(null);
        triggerRetryRef.current(step);
      } else {
        setAutoRetry({ step, secondsLeft: s });
      }
    }, 1000);
  };
  const clearWatchdogs = () => {
    if (analyzeContentWatchdogRef.current) { window.clearTimeout(analyzeContentWatchdogRef.current); analyzeContentWatchdogRef.current = null; }
    if (generateWatchdogRef.current) { window.clearTimeout(generateWatchdogRef.current); generateWatchdogRef.current = null; }
  };
  const resetPipeline = () => {
    clearWatchdogs();
    cancelAutoRetry();
    autoRetriedRef.current = { scrape: 0, analyze: 0, generate: 0 };
    setAutoRetriedCounts({ scrape: 0, analyze: 0, generate: 0 });
    setPipeline({ scrape: "pending", analyze: "pending", generate: "pending", controlledExitReason: null });
    timingsRef.current = {};
    lastErrorRef.current = null;
  };
  // User-initiated cancel — aborts every in-flight request, clears watchdogs,
  // and marks in-flight/pending steps as "canceled" so the UI shows a clear
  // stopped state instead of silently resetting to idle.
  const cancelPipeline = () => {
    canceledRef.current = true;
    setIsCanceling(true);
    try { analyzeAbortRef.current?.abort(); } catch {}
    try { generateAbortRef.current?.abort(); } catch {}
    inFlightControllersRef.current.forEach((c) => { try { c.abort(); } catch {} });
    inFlightControllersRef.current.clear();
    clearWatchdogs();
    cancelAutoRetry();
    autoRetriedRef.current = { scrape: 0, analyze: 0, generate: 0 };
    setAutoRetriedCounts({ scrape: 0, analyze: 0, generate: 0 });
    // Mark anything that wasn't already done as canceled — done steps keep
    // their "done" status so the user sees how far the run actually got.
    setPipeline((p) => {
      const mark = (s: typeof p.scrape) =>
        s === "done" || s === "success" || s === "partial" ? s : "canceled" as const;
      return {
        ...p,
        scrape: mark(p.scrape),
        analyze: mark(p.analyze),
        generate: mark(p.generate),
        errorMessage: "Stopped by you — all in-flight requests were aborted.",
      };
    });
    // Flip the in-flight flags off so the submit/cancel button returns to
    // its idle state. Without this the button keeps rendering "Cancel
    // generating" even though every request has already been aborted.
    setIsGenerating(false);
    setIsAnalyzing(false);
    lastErrorRef.current = null;
    studioLog.info("system", "Pipeline canceled by user");
    toast({ title: "Generation canceled", description: "Stopped all in-flight requests." });
    // Clear the canceled / cancelling flags shortly after so the next run
    // starts clean and the "Cancelling…" indicator stops spinning.
    window.setTimeout(() => { canceledRef.current = false; }, 50);
    window.setTimeout(() => { setIsCanceling(false); }, 600);
  };
  // Dismiss the canceled banner — clears the pipeline back to idle without
  // starting a new run. Wired to the Dismiss button in the canceled state.
  const dismissPipeline = () => {
    setPipeline({ scrape: "pending", analyze: "pending", generate: "pending", controlledExitReason: null, errorMessage: undefined });
    timingsRef.current = {};
  };
  const updateStep = (patch: Partial<PipelineState>) => {
    const now = Date.now();
    (["scrape", "analyze", "generate"] as const).forEach((k) => {
      const v = patch[k];
      if (v === "active") {
        // Reset both ends so the master watchdog (which computes elapsed from
        // `${k}Start`) measures THIS attempt's budget, not the cumulative time
        // since the very first attempt. Without resetting, an auto-retry would
        // trip the watchdog after ~1s because the stale start is already past
        // the budget.
        timingsRef.current[`${k}Start`] = now;
        timingsRef.current[`${k}End`] = undefined;
        studioLog.info(k, `${k[0].toUpperCase()}${k.slice(1)} started`);
      }
      if (v === "done" && !timingsRef.current[`${k}End`]) {
        timingsRef.current[`${k}End`] = now;
        const start = timingsRef.current[`${k}Start`];
        const ms = start ? now - start : null;
        studioLog.success(k, `${k[0].toUpperCase()}${k.slice(1)} completed${ms != null ? ` in ${(ms / 1000).toFixed(1)}s` : ""}`);
      }
      if (v === "error" && !timingsRef.current[`${k}End`]) {
        timingsRef.current[`${k}End`] = now;
      }
    });
    setPipeline((p) => ({ ...p, ...patch }));
  };
  const recordError = (step: StepKey, message: string, extra?: { status?: number; raw?: unknown }) => {
    lastErrorRef.current = { step, message, status: extra?.status, raw: extra?.raw, at: new Date().toISOString() };
    studioLog.error(step, message, extra?.raw ?? (extra?.status !== undefined ? { status: extra.status } : undefined));
  };
  const getAccessTokenOrThrow = async (purpose: string, timeoutMs = 15_000): Promise<string> => {
    studioLog.info("system", `Checking sign-in before ${purpose}`);

    // getSession() reads from local storage and is normally instant, but in rare
    // cases (cross-tab lock contention, storage adapter stalls) it can hang.
    // Try the fast local read first; if it stalls, fall back to the in-memory
    // session via getUser() before failing with a clear message.
    let timeoutId: number | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error(`Sign-in check timed out before ${purpose}. Refresh this tab or sign in again.`)),
        timeoutMs,
      );
    });

    try {
      const result = await Promise.race([supabase.auth.getSession(), timeoutPromise]);
      const { data, error } = result;
      if (error) throw error;
      const session = data.session;
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Please sign in before generating.");
      setIsAuthenticated(true);
      setUserId(session.user?.id ?? null);
      return accessToken;
    } catch (err) {
      // Fallback: if getSession stalled, attempt a fresh refresh once.
      const message = err instanceof Error ? err.message : String(err);
      if (/timed out/i.test(message)) {
        try {
          const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
          if (!refreshErr && refreshed.session?.access_token) {
            setIsAuthenticated(true);
            setUserId(refreshed.session.user?.id ?? null);
            return refreshed.session.access_token;
          }
        } catch { /* ignore, rethrow original */ }
      }
      throw err;
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  };
  const buildErrorReport = () => {
    const t = timingsRef.current;
    const ms = (s?: number, e?: number) => (s && e ? e - s : null);
    return {
      generatedAt: new Date().toISOString(),
      app: "Resonance Creative Studio",
      route: typeof window !== "undefined" ? window.location.pathname : null,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      viewport: typeof window !== "undefined" ? { w: window.innerWidth, h: window.innerHeight } : null,
      pipeline,
      timings: {
        scrapeMs: ms(t.scrapeStart, t.scrapeEnd),
        analyzeMs: ms(t.analyzeStart, t.analyzeEnd),
        generateMs: ms(t.generateStart, t.generateEnd),
        totalMs: ms(t.scrapeStart ?? t.analyzeStart ?? t.generateStart, t.generateEnd ?? t.analyzeEnd ?? t.scrapeEnd),
        rawTimestamps: t,
      },
      lastError: lastErrorRef.current,
      inputs: lastInputsRef.current,
    };
  };
  const exportErrorDetails = () => {
    try {
      const report = buildErrorReport();
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `resonance-error-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      toast({ title: "Error details downloaded", description: "JSON saved to your downloads. Share it with support." });
    } catch (e: any) {
      toast({ title: "Could not export", description: e?.message || "Try again.", variant: "destructive" });
    }
  };
  const copyErrorDetails = async () => {
    try {
      const json = JSON.stringify(buildErrorReport(), null, 2);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
      } else {
        const ta = document.createElement("textarea");
        ta.value = json;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      toast({ title: "Error details copied", description: "Paste it in chat or an email to share." });
    } catch (e: any) {
      toast({ title: "Could not copy", description: e?.message || "Try again.", variant: "destructive" });
    }
  };
  const [isSharingError, setIsSharingError] = useState(false);
  const [sharedErrorUrl, setSharedErrorUrl] = useState<string | null>(null);
  const [errorBannerExpanded, setErrorBannerExpanded] = useState(false);
  const shareErrorDetails = async () => {
    setIsSharingError(true);
    try {
      const report = buildErrorReport();
      const json = JSON.stringify(report, null, 2);
      const id = (crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const path = `${new Date().toISOString().slice(0, 10)}/${id}.json`;
      const { error: upErr } = await supabase.storage
        .from("error-reports")
        .upload(path, new Blob([json], { type: "application/json" }), {
          contentType: "application/json",
          upsert: false,
        });
      if (upErr) throw upErr;
      // 1 year signed URL — long enough for support workflows.
      const { data, error: signErr } = await supabase.storage
        .from("error-reports")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr || !data?.signedUrl) throw signErr ?? new Error("Could not create share link");
      const url = data.signedUrl;
      setSharedErrorUrl(url);
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      } catch { /* ignore clipboard failures */ }
      toast({
        title: "Share link ready",
        description: `Copied to clipboard. Use "Open" to view it instantly.`,
      });
    } catch (e: any) {
      toast({
        title: "Could not create share link",
        description: e?.message || "Try again, or use Copy/Export instead.",
        variant: "destructive",
      });
    } finally {
      setIsSharingError(false);
    }
  };


  const [socialConfig, setSocialConfig] = useState<SocialMediaConfig>({ ...DEFAULT_SOCIAL_CONFIG });

  // Track all generated content for cross-posting to social
  const [generatedLibrary, setGeneratedLibrary] = useState<{ type: string; url: string; label: string }[]>([]);
  const [selectedSocialContent, setSelectedSocialContent] = useState<string | null>(null);
  const [socialUploadFiles, setSocialUploadFiles] = useState<File[]>([]);
  const [socialUploadPreview, setSocialUploadPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const isOAuthUser = (user: any): boolean => {
      try {
        const ids: any[] = Array.isArray(user?.identities) ? user.identities : [];
        if (ids.some((i) => i?.provider && i.provider !== "email")) return true;
        const provider = user?.app_metadata?.provider;
        if (provider && provider !== "email") return true;
        const providers = user?.app_metadata?.providers;
        if (Array.isArray(providers) && providers.some((p: string) => p && p !== "email")) return true;
      } catch { /* ignore */ }
      return false;
    };
    const gate = (session: any) => {
      if (cancelled) return;
      if (!session) {
        setIsAuthenticated(false);
        setUserId(null);
        navigate("/login", { replace: true });
        return;
      }
      // Block access until the user's email is verified.
      // OAuth providers (Google, Apple, etc.) are inherently verified — accept
      // them even if email_confirmed_at hasn't been mirrored on the user row
      // yet (first sign-in race, or when restoring a session from storage).
      const confirmed =
        !!session.user?.email_confirmed_at ||
        !!session.user?.confirmed_at ||
        !!session.user?.phone_confirmed_at ||
        isOAuthUser(session.user);
      if (!confirmed) {
        setIsAuthenticated(false);
        setUserId(null);
        supabase.auth.signOut().finally(() => navigate("/login?verify=1", { replace: true }));
        return;
      }
      setIsAuthenticated(true);
      setUserId(session.user?.id ?? null);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Always evaluate auth changes (including INITIAL_SESSION) so OAuth
      // callback tokens that arrive after mount are honoured.
      gate(session);
    });
    // Immediate check so the Generate button enables as soon as a stored
    // session is available — no 300ms wait when the user is already signed in.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) gate(session);
    });
    // Plus a short delayed re-check to give the OAuth callback handler a
    // window to populate the session on a cold load before we bounce.
    const initialCheck = setTimeout(() => {
      supabase.auth.getSession().then(({ data: { session } }) => gate(session));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(initialCheck);
      subscription.unsubscribe();
    };
  }, [navigate]);

  // Load Brand DNA + products + moodboards once authenticated. Cheap reads,
  // RLS-scoped to auth.uid(). Empty results just mean the user hasn't set
  // them up yet — Generate falls back to the legacy URL/upload flow.
  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [dna, prods, moods] = await Promise.all([
          getMyBrandDna().catch(() => null),
          listMyProducts().catch(() => []),
          listMyMoodboards().catch(() => []),
        ]);
        if (cancelled) return;
        setBrandDna(dna);
        setDnaProducts(prods);
        setDnaMoodboards(moods);
      } catch (e) {
        studioLog.warn("scrape", `Brand DNA load skipped: ${(e as Error).message}`);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, userId]);



  // Build the current serialisable draft snapshot.
  const draftSnapshot = () => ({
    contentType, style, aspectRatio, url, instructions, brief, sourceBrief,
    screenshotUrl, posters, videos, socialConfig, generatedLibrary,
  });
  const draftSnapshotRef = useRef(draftSnapshot);
  draftSnapshotRef.current = draftSnapshot;

  // On sign-in: ALWAYS start with a fresh, blank project. Any locally
  // persisted draft from a previous session is wiped so the studio opens
  // empty. The only exception is ?project=<id>, which loads a named
  // backend snapshot the user explicitly opened.
  useEffect(() => {
    if (!isAuthenticated || !userId || draftRestored) return;
    setDraftRestored(true);

    const projectId = searchParams.get("project");

    if (projectId) {
      // Load the named backend project (if any) — runs async, doesn't block reset.
      (async () => {
        const p = await getProject(userId, projectId);
        if (!p) return;
        const src = p.data || ({} as any);
        setContentType(src.contentType ?? "poster");
        setStyle(src.style ?? "professional");
        setAspectRatio(src.aspectRatio ?? "16:9");
        setUrl(src.url ?? "");
        setInstructions(src.instructions ?? "");
        setBrief(src.brief ?? null);
        setSourceBrief(src.sourceBrief ?? null);
        setScreenshotUrl(src.screenshotUrl ?? null);
        setPosters(src.posters || []);
        setVideos(src.videos || []);
        setSocialConfig(src.socialConfig || { ...DEFAULT_SOCIAL_CONFIG });
        setGeneratedLibrary(src.generatedLibrary || []);
        if ((src.posters?.length || 0) > 0) setHasGenerated(true);
        setActiveProjectId(p.id);
        setActiveProjectName(p.name);
        toast({
          title: `Opened "${p.name}"`,
          description: `Loaded from your saved projects.`,
        });
      })();
      return;
    }

    // Default sign-in path: clean slate.
    clearDraft(userId);
    setActiveProjectId(null);
    setActiveProjectName(null);
    // Strip any leftover ?new=1 from the URL.
    if (searchParams.get("new") === "1") {
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
    studioLog.info("system", "Fresh project started on sign-in");
  }, [isAuthenticated, userId, draftRestored, toast, searchParams, setSearchParams]);

  // Welcome banner after sign-in (Login redirects to /studio?welcome=1).
  useEffect(() => {
    if (searchParams.get("welcome") !== "1") return;
    setWelcomeBack(true);
    const next = new URLSearchParams(searchParams);
    next.delete("welcome");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Auto-dismiss the welcome banner after 10s so it doesn't linger on screen.
  useEffect(() => {
    if (!welcomeBack) return;
    const t = window.setTimeout(() => setWelcomeBack(false), 10_000);
    return () => window.clearTimeout(t);
  }, [welcomeBack]);




  // Track whether the working draft has unsaved changes since the last
  // successful save. Used to gate the native "Leave site?" prompt on tab
  // close so we don't pester users with an empty studio.
  const dirtyRef = useRef(false);
  const lastSavedJsonRef = useRef<string>("");

  // Debounced autosave (localStorage) + backend autosave + native exit prompt.
  useEffect(() => {
    if (!userId || !isAuthenticated || !draftRestored) return;

    const snap = draftSnapshotRef.current();
    const snapJson = JSON.stringify(snap);
    const isDirty = snapJson !== lastSavedJsonRef.current && (
      !!snap.url || !!snap.instructions || !!snap.brief || !!snap.sourceBrief ||
      (snap.posters?.length || 0) > 0 || (snap.videos?.length || 0) > 0 ||
      (snap.generatedLibrary?.length || 0) > 0
    );
    dirtyRef.current = isDirty;

    const flush = () => saveDraft(userId, draftSnapshotRef.current());
    window.__resonanceSaveDraft = flush;
    const t = setTimeout(() => {
      flush();
      // Backend autosave in the background — keeps the latest snapshot on
      // the server so exit/restore works across devices.
      if (isDirty) {
        void saveProjectAsync(
          userId,
          activeProjectName || brief?.headline || "Autosave",
          draftSnapshotRef.current(),
          { id: activeProjectId ?? undefined, isAutosave: !activeProjectId },
        ).then((row) => {
          if (row && !activeProjectId) {
            setActiveProjectId(row.id);
            setActiveProjectName(row.name);
          }
          lastSavedJsonRef.current = snapJson;
        });
      }
    }, 1200);

    // Native browser exit prompt (only when there are unsaved changes).
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      flush();
      // Best-effort backend save that survives the tab going away.
      if (dirtyRef.current) {
        const token = (supabase.auth as any)?.currentSession?.access_token
          // fall back: read the cached session synchronously from localStorage
          || (() => {
            try {
              const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
              if (!key) return "";
              const raw = JSON.parse(localStorage.getItem(key) || "{}");
              return raw?.access_token || raw?.currentSession?.access_token || "";
            } catch { return ""; }
          })();
        if (token) {
          saveProjectBeacon(
            userId,
            token,
            activeProjectName || brief?.headline || "Autosave on exit",
            draftSnapshotRef.current(),
            { id: activeProjectId ?? undefined, isAutosave: !activeProjectId },
          );
        }
        // Trigger native "Leave site? Changes you made may not be saved." prompt.
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };
    const onPageHide = () => flush();
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [userId, isAuthenticated, draftRestored, contentType, style, aspectRatio, url, instructions, brief, sourceBrief, screenshotUrl, posters, videos, socialConfig, generatedLibrary, activeProjectId, activeProjectName]);


  // Clear the draft helper (exposed via window for now; used after a fresh "Start over").
  const handleClearDraft = () => {
    if (userId) clearDraft(userId);
  };
  void handleClearDraft;

  // Full reset: brief, source, uploads, generated assets, social config, pipeline.
  const handleClearAll = () => {
    const hasContent =
      files.length > 0 || !!url || !!instructions || !!brief || !!sourceBrief ||
      posters.length > 0 || videos.length > 0 || generatedLibrary.length > 0;
    if (hasContent && !window.confirm("Clear everything? This removes your current brief, uploads and generated assets.")) {
      return;
    }
    setFiles([]);
    setUrl("");
    setInstructions("");
    setBrief(null);
    setSourceBrief(null);
    setScreenshotUrl(null);
    setPosters([]);
    setVideos([]);
    setGeneratedLibrary([]);
    setSelectedSocialContent(null);
    setSocialUploadFiles([]);
    setSocialConfig({ ...DEFAULT_SOCIAL_CONFIG });
    setHasGenerated(false);
    resetPipeline();
    if (userId) clearDraft(userId);
    toast({ title: "Cleared", description: "Studio reset to a fresh start." });
  };

  // Save the current working draft as a named project — writes to the
  // backend (studio_projects) so it's available across devices, and keeps
  // a localStorage copy as an offline fallback.
  const handleSaveProject = async () => {
    if (!userId) return;
    const defaultName =
      activeProjectName ||
      brief?.headline?.trim() ||
      (url ? new URL(url, window.location.href).hostname : "") ||
      `Project ${new Date().toLocaleString()}`;
    const name = window.prompt(
      activeProjectId ? "Update project name" : "Save project as…",
      defaultName,
    );
    if (name === null) return;
    const snapshot = draftSnapshotRef.current();
    // Backend save (primary).
    const saved = await saveProjectAsync(userId, name, snapshot, {
      id: activeProjectId ?? undefined,
      isAutosave: false,
    });
    // Local snapshot (offline fallback).
    saveProjectSnapshot(userId, name, snapshot, activeProjectId ?? undefined);
    if (saved) {
      setActiveProjectId(saved.id);
      setActiveProjectName(saved.name);
      lastSavedJsonRef.current = JSON.stringify(snapshot);
      dirtyRef.current = false;
      toast({
        title: activeProjectId ? "Project updated" : "Project saved",
        description: `"${saved.name}" is saved to your account.`,
      });
    } else {
      toast({
        title: "Saved locally",
        description: `"${name}" was saved to this browser. We couldn't reach the server.`,
        variant: "destructive",
      });
    }
  };





  // Track social upload preview
  useEffect(() => {
    if (socialUploadFiles.length > 0) {
      const objectUrl = URL.createObjectURL(socialUploadFiles[0]);
      setSocialUploadPreview(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }
    setSocialUploadPreview(null);
  }, [socialUploadFiles]);

  // Runs the analyze-content edge function against an already-merged source brief.
  // Extracted so both analyzeUrl (single source) and continueAnalyzeWithMerge
  // (post-confirmation) can share the same downstream flow.
  const runAnalyzeContent = async (
    sb: SourceBrief,
    effectiveContentType: string,
  ): Promise<CreativeBrief | null> => {
    try {
      setIsAnalyzing(true);
      updateStep({ analyze: "active", errorMessage: undefined });
      // Hard fail-safe so a stuck analyze never spins forever.
      if (analyzeContentWatchdogRef.current) window.clearTimeout(analyzeContentWatchdogRef.current);
      analyzeContentWatchdogRef.current = window.setTimeout(() => {
        let tripped = false;
        setPipeline((p) => {
          if (p.analyze !== "active") return p;
          tripped = true;
          return {
            ...p,
            analyze: "error",
            errorMessage: `Analysis stuck past ${Math.round(ANALYZE_CLIENT_TIMEOUT_MS / 1000)}s — cancelled. Please retry.`,
          };
        });
        setIsAnalyzing(false);
        if (tripped) scheduleAutoRetry("analyze");
      }, ANALYZE_CLIENT_TIMEOUT_MS);
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke("analyze-content", {
        body: {
          sourceBrief: sb,
          contentType: effectiveContentType,
          style,
          userInstructions: instructions,
          hasUpload: files.length > 0,
        },
      });
      if (analysisError) throw new Error(analysisError.message);
      if (analysisData?.needsManualInput) {
        updateStep({ analyze: "error", errorMessage: analysisData?.error });
        toast({
          title: "We need a hint from you",
          description: analysisData?.error || "Add a short brief and try again.",
          variant: "destructive",
        });
        return null;
      }
      if (!analysisData?.success) throw new Error(analysisData?.error || "Analysis failed");
      const b = analysisData.brief as CreativeBrief;
      setBrief(b);
      setInstructions(b.instructions);
      updateStep({ analyze: "done" });
      if (analysisData.softWarning) {
        toast({ title: "Brief ready (thin source)", description: analysisData.softWarning });
      } else {
        toast({ title: "Brief ready", description: `For "${b.brand}"` });
      }
      return b;
    } catch (err: any) {
      console.error("analyze-content error:", err);
      updateStep({ analyze: "error", errorMessage: err?.message || "Analysis failed" });
      recordError("analyze", err?.message || "Analysis failed", { raw: err });
      await handleEdgeFunctionError(toast, err, "Analysis");
      return null;
    } finally {
      if (analyzeContentWatchdogRef.current) {
        window.clearTimeout(analyzeContentWatchdogRef.current);
        analyzeContentWatchdogRef.current = null;
      }
      setIsAnalyzing(false);
    }
  };

  // User confirmed the merge preview — apply per-field source picks,
  // exclusions, scalar overrides, and logo override; then run analyze-content.
  const continueAnalyzeWithMerge = async (resolution: MergeResolution) => {
    if (!pendingMerge) return;
    const { sources: mergeSources, merged, origins, effectiveContentType } = pendingMerge;
    const ex = resolution.excluded;
    const ls = resolution.listSource;
    const filterList = (
      entries: Array<{ value: string; source: MergeSource }>,
      key: keyof typeof ex,
    ) => {
      const drop = new Set(ex[key] ?? []);
      const pick = ls[key] ?? "all";
      return entries
        .filter((e) => (pick === "all" || e.source === pick) && !drop.has(e.value))
        .map((e) => e.value);
    };
    // Resolve scalar fields: if user picked a source, take that source's value.
    const briefBy: Partial<Record<MergeSource, SourceBrief>> = {};
    for (const s of mergeSources) if (s.brief) briefBy[s.id] = s.brief;
    const scalarValue = (key: keyof SourceBrief, fallback: string): string => {
      const pick = resolution.scalarSource[key as keyof typeof resolution.scalarSource];
      if (pick && briefBy[pick]) {
        const v = (briefBy[pick] as any)[key];
        if (typeof v === "string" && v.trim()) return v;
      }
      return fallback;
    };
    const resolved: SourceBrief = {
      ...merged,
      brandName: scalarValue("brandName", merged.brandName),
      heroHeadline: scalarValue("heroHeadline", merged.heroHeadline),
      heroSubheadline: scalarValue("heroSubheadline", merged.heroSubheadline),
      offer: scalarValue("offer", merged.offer),
      audience: scalarValue("audience", merged.audience),
      pricing: scalarValue("pricing", merged.pricing),
      pageTitle: scalarValue("pageTitle", merged.pageTitle),
      metaDescription: scalarValue("metaDescription", merged.metaDescription),
      logo: resolution.logoOverride ?? origins.logo?.value ?? merged.logo,
      images: filterList(origins.images, "images"),
      colors: filterList(origins.colors, "colors"),
      products: filterList(origins.products, "products"),
      services: filterList(origins.services, "services"),
      benefits: filterList(origins.benefits, "benefits"),
      proofPoints: filterList(origins.proofPoints, "proofPoints"),
      callsToAction: filterList(origins.callsToAction, "callsToAction"),
    };
    sourceBriefRef.current = resolved;
    setSourceBrief(resolved);
    setPendingMerge(null);
    await runAnalyzeContent(resolved, effectiveContentType);
  };

  const cancelMergePreview = () => {
    setPendingMerge(null);
    updateStep({ analyze: "pending" });
    toast({ title: "Merge cancelled", description: "Adjust your sources and re-analyze when ready." });
  };


  // Direct-image URL short-circuit. If the user pastes a .jpg/.png/.webp URL
  // there is no page to scrape — synthesise a minimal product brief and skip
  // straight to analyze. Matches common CDN extensions with optional query.
  const isDirectImageUrl = (url: string) =>
    /\.(png|jpe?g|webp|avif|gif)(\?.*)?$/i.test(url);

  const buildBriefFromDirectImageUrl = (url: string): SourceBrief => ({
    sourceUrl: url,
    sourceType: "product",
    brandName: "",
    pageTitle: "",
    metaDescription: "",
    heroHeadline: "",
    heroSubheadline: "",
    offer: "",
    products: [],
    services: [],
    audience: "",
    benefits: [],
    proofPoints: [],
    pricing: "",
    callsToAction: [],
    colors: [],
    images: [url],
    logo: "",
    links: [url],
    rawMarkdown: "User provided a direct product image URL.",
    screenshot: null,
    confidenceScore: 45,
    extractionWarnings: ["Direct image URL used as product hero image."],
    pageType: "product",
    heroImageUrl: url,
    imageConfidence: "medium",
    imageSource: "scraped",
  });

  const buildFallbackSourceBriefFromDefault = (
    creative: CreativeBrief,
    targetUrl: string,
    warning: string,
  ): SourceBrief => ({
    sourceUrl: targetUrl,
    sourceType: targetUrl ? "product" : "unknown",
    brandName: creative.brand,
    pageTitle: creative.headline,
    metaDescription: creative.subheadline,
    heroHeadline: creative.headline,
    heroSubheadline: creative.subheadline,
    offer: creative.subheadline || creative.instructions,
    products: [creative.headline].filter(Boolean),
    services: [],
    audience: creative.targetAudience,
    benefits: creative.keyPoints,
    proofPoints: [],
    pricing: "",
    callsToAction: [creative.callToAction].filter(Boolean),
    colors: creative.colorSuggestions,
    images: [],
    logo: "",
    links: targetUrl ? [targetUrl] : [],
    rawMarkdown: creative.instructions,
    screenshot: null,
    confidenceScore: 30,
    extractionWarnings: [warning],
    pageType: targetUrl ? "product" : "generic",
    productMeta: targetUrl ? { name: creative.headline, brand: creative.brand } : undefined,
    imageConfidence: "none",
  });

  const optimizeSourceImagesForBrief = async (
    baseBrief: SourceBrief,
    targetUrl: string,
    effectiveContentType: string,
    showToast = true,
  ): Promise<SourceBrief> => {
    const token = await getAccessTokenOrThrow("image optimization").catch(() => null);
    if (!token) return baseBrief;
    const autoHint = buildAutoHintPrompt(
      {
        sourceUrl: baseBrief.sourceUrl,
        brandName: baseBrief.brandName,
        pageTitle: baseBrief.pageTitle,
        heroHeadline: baseBrief.heroHeadline,
        offer: baseBrief.offer,
        products: baseBrief.products,
        services: baseBrief.services,
        audience: baseBrief.audience,
        benefits: baseBrief.benefits,
        pricing: baseBrief.pricing,
        callsToAction: baseBrief.callsToAction,
      },
      effectiveContentType,
      style,
    );
    studioLog.info("scrape", "Optimizing source images (low confidence)");
    const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/optimize-source-images`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: targetUrl,
        contentType: effectiveContentType,
        aspectRatio,
        autoHint,
        brief: {
          brandName: baseBrief.brandName,
          productMeta: baseBrief.productMeta,
          products: baseBrief.products,
          benefits: baseBrief.benefits,
          audience: baseBrief.audience,
          logo: baseBrief.logo,
          screenshot: baseBrief.screenshot,
          images: baseBrief.images,
          heroImageUrl: baseBrief.heroImageUrl,
          imageConfidence: baseBrief.imageConfidence,
        },
      }),
    });
    const p = await r.json().catch(() => null);
    if (!p?.success) return baseBrief;
    const patched: SourceBrief = {
      ...baseBrief,
      screenshot: baseBrief.screenshot ?? p.screenshot ?? null,
      optimizedImages: {
        hero: p.hero,
        heroConfidence: p.heroConfidence,
        ranked: p.ranked ?? [],
        screenshot: p.screenshot ?? null,
        capturedScreenshot: !!p.capturedScreenshot,
        contentType: p.contentType,
        aspectRatio: p.aspectRatio,
        warnings: p.warnings ?? [],
      },
    };
    if (p.screenshot && !baseBrief.screenshot) setScreenshotUrl(p.screenshot);
    if (showToast && p.hero && (p.heroConfidence === "high" || p.heroConfidence === "medium")) {
      toast({
        title: "Source image optimized",
        description: `Picked best visual for ${effectiveContentType} (${p.heroConfidence} confidence).`,
      });
    }
    return patched;
  };


  const analyzeUrl = async (
    targetUrl: string,
    overrideContentType?: string,
    opts?: { forceRefresh?: boolean; includeScreenshot?: boolean; fallbackAfterMs?: number },
  ): Promise<CreativeBrief | null> => {
    if (!targetUrl.trim()) return null;
    const effectiveContentType = overrideContentType || contentType;
    // A forced refresh only re-extracts the source. We intentionally keep any
    // existing posters/videos so users can refresh the brief without losing
    // their current generation. Use the tab-level Regenerate buttons to wipe
    // generated output.
    if (opts?.forceRefresh) {
      setBrief(null);
      setScreenshotUrl(null);
    }
    // Cancel any in-flight analyzeUrl from a previous trigger (tab change /
    // URL refresh / generate fallback). Without this, a stuck previous run
    // keeps the pipeline showing "Final attempt before timeout…" forever.
    if (analyzeAbortRef.current) {
      try { analyzeAbortRef.current.abort(); } catch { /* ignore */ }
    }
    setIsAnalyzing(true);
    updateStep({ scrape: "active", analyze: "pending", errorMessage: undefined, controlledExitReason: undefined });

    // Direct image URL: skip the scrape entirely.
    if (isDirectImageUrl(targetUrl)) {
      const directBrief = buildBriefFromDirectImageUrl(targetUrl);
      sourceBriefRef.current = directBrief;
      setSourceBrief(directBrief);
      updateStep({ scrape: "partial", analyze: "active", generate: "pending", errorMessage: undefined, controlledExitReason: "direct_image_url" });
      studioLog.info("scrape", `Direct image URL detected — bypassing extractor.`, { controlledExitReason: "direct_image_url" });
      try {
        return await runAnalyzeContent(directBrief, effectiveContentType);
      } finally {
        setIsAnalyzing(false);
      }
    }



    try {
      toast({ title: "Reading the page…", description: "Extracting brand, offer, and CTAs" });
      lastInputsRef.current = {
        url: targetUrl,
        contentType: effectiveContentType,
        style,
        aspectRatio,
        hasInstructions: !!instructions,
        files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      };
      const accessToken = await getAccessTokenOrThrow("source scrape");

      const controller = new AbortController();
      analyzeAbortRef.current = controller;
      const unregisterScrape = registerController(controller);
      let didTimeout = false;
      const timeout = window.setTimeout(() => {
        didTimeout = true;
        controller.abort();
      }, SCRAPE_CLIENT_TIMEOUT_MS);
      let didFallbackAbort = false;
      const fallbackTimeout = opts?.fallbackAfterMs
        ? window.setTimeout(() => {
            didFallbackAbort = true;
            controller.abort();
          }, opts.fallbackAfterMs)
        : null;

      // Heavy-page hint after 10s so the user knows we're switching to deep extraction.
      const heavyHint = window.setTimeout(() => {
        setPipeline((p) => ({ ...p, errorMessage: undefined }));
        toast({
          title: "Heavy page — going deeper",
          description: "Trying a richer extraction pass, this can take a moment.",
        });
      }, 10_000);

      let payload: {
        success: boolean;
        brief?: SourceBrief;
        cached?: boolean;
        partial?: boolean;
        status?: "success" | "partial" | "needs_image_upload" | "failed_fast";
        controlledExitReason?: ControlledExitReason;
        userMessage?: string;
        diagnostics?: Record<string, unknown>;
        error?: string;
        timings?: Parameters<typeof recordScrapeTiming>[0] extends infer _ ? Record<string, unknown> : never;
      };
      const scrapeStartedAt = Date.now();
      let didReachTimeoutLabel = false;
      const timeoutLabelTimer = window.setTimeout(() => { didReachTimeoutLabel = true; }, SCRAPE_CLIENT_TIMEOUT_MS);
      // No separate stall probe: one bounded extractor request avoids duplicate
      // request races that previously surfaced as client_watchdog.
      try {
        const resp = await fetch("http://127.0.0.1:7867/v1/source-brief", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: targetUrl,
            forceRefresh: opts?.forceRefresh ?? false,
            // Drop screenshot on auto-retries — it's the slowest format and
            // not required when the user has uploaded a hero image.
            includeScreenshot:
              (autoRetriedRef.current?.scrape ?? 0) > 0
                ? false
                : (opts?.includeScreenshot ?? true),
          }),
          signal: controller.signal,
        });
        studioLog.info("scrape", `Source extractor responded with HTTP ${resp.status}`);
        payload = await resp.json().catch(() => ({ success: false, error: `HTTP ${resp.status}` }));
        if (!resp.ok || !payload?.success) {
          throw new Error(payload?.error || `Extraction failed (HTTP ${resp.status})`);
        }
        const t = (payload.timings ?? {}) as Record<string, unknown>;
        const fastMs = (t.fastPassMs as number | null) ?? null;
        const deepMs = (t.deepPassMs as number | null) ?? null;
        const emergMs = (t.emergencyPassMs as number | null) ?? null;
        const totalMs = (t.totalMs as number) ?? 0;
        const clientMs = Date.now() - scrapeStartedAt;
        const phaseStr = [
          `fast=${fastMs ?? "—"}ms${t.fastPassOk ? "✓" : "✗"}`,
          `deep=${t.deepPassSkipped ? "skipped" : `${deepMs ?? "—"}ms${t.deepPassOk ? "✓" : "✗"}`}`,
          t.emergencyRan ? `emergency=${emergMs ?? "—"}ms${t.emergencyOk ? "✓" : "✗"}` : null,
        ].filter(Boolean).join(" • ");
        studioLog.info(
          "scrape",
          `Phase timings — ${phaseStr} • server=${totalMs}ms • client=${clientMs}ms${payload.cached ? " (cached)" : ""}`,
        );
        recordScrapeTiming({
          url: targetUrl,
          at: Date.now(),
          fastPassMs: fastMs,
          deepPassMs: deepMs,
          emergencyPassMs: emergMs,
          totalMs,
          fastPassOk: Boolean(t.fastPassOk),
          deepPassOk: Boolean(t.deepPassOk),
          deepPassSkipped: Boolean(t.deepPassSkipped),
          emergencyRan: Boolean(t.emergencyRan),
          emergencyOk: Boolean(t.emergencyOk),
          clientElapsedMs: clientMs,
          reachedTimeoutLabel: didReachTimeoutLabel,
          cached: Boolean(payload.cached),
          timedOut: false,
        });
      } catch (e: any) {
        if (didFallbackAbort) {
          studioLog.warn("scrape", `URL reader exceeded ${Math.round((opts?.fallbackAfterMs ?? 0) / 1000)}s during Generate — continuing with default brief.`);
          return null;
        }
        recordScrapeTiming({
          url: targetUrl,
          at: Date.now(),
          fastPassMs: null,
          deepPassMs: null,
          emergencyPassMs: null,
          totalMs: 0,
          fastPassOk: false,
          deepPassOk: false,
          deepPassSkipped: false,
          emergencyRan: false,
          emergencyOk: false,
          clientElapsedMs: Date.now() - scrapeStartedAt,
          reachedTimeoutLabel: didReachTimeoutLabel,
          cached: false,
          timedOut: didTimeout || e?.name === "AbortError",
        });
        if (didTimeout || e?.name === "AbortError") {
          const message = "The URL reader reached its internal time limit before extracting enough product data. Please upload the product image, provide a direct image URL, or try a retailer listing.";
          payload = {
            success: true,
            status: "failed_fast",
            controlledExitReason: "client_abort",
            userMessage: message,
            partial: false,
            brief: {
              sourceUrl: targetUrl,
              sourceType: "website",
              brandName: "",
              pageTitle: "",
              metaDescription: "",
              heroHeadline: "",
              heroSubheadline: "",
              offer: "",
              products: [],
              services: [],
              audience: "",
              benefits: [],
              proofPoints: [],
              pricing: "",
              callsToAction: [],
              colors: [],
              images: [],
              logo: "",
              links: [],
              rawMarkdown: "",
              screenshot: null,
              confidenceScore: 0,
              extractionWarnings: [message],
              imageConfidence: "none",
            },
            diagnostics: { clientTimedOut: true, clientElapsedMs: Date.now() - scrapeStartedAt, controlledExitReason: "client_abort" },
          };
          studioLog.warn("scrape", message, { controlledExitReason: "client_abort" });
        } else {
          throw e;
        }
      } finally {
        window.clearTimeout(timeout);
        if (fallbackTimeout) window.clearTimeout(fallbackTimeout);
        window.clearTimeout(heavyHint);
        unregisterScrape();
        window.clearTimeout(timeoutLabelTimer);
      }

      const scrapeStatus = (payload.status ?? null) as
        | "success" | "partial" | "needs_image_upload" | "failed_fast" | null;
      const scrapeDiagnostics = (payload.diagnostics ?? null) as Record<string, unknown> | null;
      const effectiveStatus = scrapeStatus ?? (payload.success ? (payload.partial ? "partial" : "success") : "failed_fast");
      // Server is authoritative; fall back to a derived reason if the payload
      // is from an older deployment that hasn't been redeployed yet.
      const serverReason = (payload.controlledExitReason ?? (scrapeDiagnostics?.controlledExitReason as ControlledExitReason | undefined)) ?? null;
      const exitReason: ControlledExitReason = serverReason ?? (
        effectiveStatus === "success" ? "server_status_success"
        : effectiveStatus === "partial" ? "server_status_partial"
        : effectiveStatus === "needs_image_upload" ? "server_status_needs_image_upload"
        : "server_status_failed_fast"
      );
      studioLog.info("scrape", `Status: ${effectiveStatus}${payload.userMessage ? ` — ${payload.userMessage}` : ""}`, { controlledExitReason: exitReason });
      if (scrapeDiagnostics) {
        studioLog.info("scrape", `Diagnostics: ${JSON.stringify(scrapeDiagnostics)}`);
      }
      // Tag the pipeline early so the debug panel shows the reason even on success/partial.
      setPipeline((p) => ({ ...p, controlledExitReason: exitReason }));

      // ── Hard-stop CONTROLLED states ────────────────────────────────────
      // URL scrape failure is a normal product-ingestion outcome, not a
      // system error. Map it to a controlled status with downstream stages
      // explicitly "skipped" — never leave analyze or generate "pending".
      if (scrapeStatus === "failed_fast") {
        const userMessage = (payload.userMessage as string | undefined) ??
          "We could not extract enough product data from this URL. Please upload the product image, provide a direct image URL, or try a retailer listing.";
        const failedBrief = payload.brief ?? null;
        const fallbackBrief = buildDefaultBrief({
          url: targetUrl,
          files,
          contentType: effectiveContentType,
          style,
          instructions,
          sourceBrief: failedBrief,
        });
        const fallbackSource = failedBrief && (failedBrief.confidenceScore ?? 0) > 0
          ? failedBrief
          : buildFallbackSourceBriefFromDefault(fallbackBrief, targetUrl, userMessage);
        sourceBriefRef.current = fallbackSource;
        setSourceBrief(fallbackSource);
        setBrief(fallbackBrief);
        if (!instructions.trim()) setInstructions(fallbackBrief.instructions);
        updateStep({
          scrape: "partial",
          analyze: "done",
          generate: "pending",
          errorMessage: undefined,
          userMessage,
          controlledExitReason: exitReason,
        });
        studioLog.warn("scrape", `URL reader fallback used: ${userMessage}`, { controlledExitReason: exitReason });
        toast({
          title: "Using default brief",
          description: "The URL reader timed out, so the studio built an editable brief and will capture visuals during generation.",
        });
        setIsAnalyzing(false);
        setIsGenerating(false);
        // BUG logger — catches any regression where mapping leaves downstream pending.
        setTimeout(() => {
          setPipeline((p) => {
            if (p.analyze === "pending") {
              console.error(
                "BUG: URL fallback left analysis pending.",
                { scrape: p.scrape, analyze: p.analyze, generate: p.generate },
              );
            }
            return p;
          });
        }, 0);
        return fallbackBrief;
      }
      // BUG logger — scrape ran way past the internal timeout budget.
      const scrapeElapsed = Date.now() - scrapeStartedAt;
      if (scrapeElapsed > 18_000 + 5_000) {
        console.error(
          "BUG: scrape exceeded internal controlled timeout. Some promise is not wrapped or abortable.",
          { scrapeElapsed, scrapeStatus },
        );
      }

      const sb = payload.brief!;

      // Surface partial extractions so the user knows generation will lean on
      // their instructions / uploads rather than rich scraped content.
      const isPartial = scrapeStatus === "partial" || payload.partial === true || (sb.confidenceScore ?? 0) < 40;
      if (isPartial) {
        toast({
          title: "Partial scrape — using what we got",
          description:
            "This page had limited extractable content. For best results, paste key product details into Brand Brief / Instructions.",
        });
        studioLog.warn(
          "scrape",
          `Partial extraction (confidence ${sb.confidenceScore ?? 0}). ${(sb.extractionWarnings ?? []).join(" | ")}`,
        );
      }

      // ── Build merge preview from primary + secondary + tertiary in parallel ──
      const extras: { id: MergeSource; url: string }[] = [];
      if (secondaryUrl.trim() && secondaryUrl.trim() !== targetUrl) extras.push({ id: "secondary", url: secondaryUrl.trim() });
      if (tertiaryUrl.trim() && tertiaryUrl.trim() !== targetUrl) extras.push({ id: "tertiary", url: tertiaryUrl.trim() });

      const sources: MergeSourceEntry[] = [{ id: "primary", url: targetUrl, brief: sb }];

      if (extras.length > 0) {
        toast({
          title: `Merging ${extras.length} supporting source${extras.length === 1 ? "" : "s"}…`,
          description: "Pulling extra images, colors, and proof points.",
        });
        const EXTRA_TIMEOUT_MS = SCRAPE_CLIENT_TIMEOUT_MS;
        const results = await Promise.allSettled(
          extras.map(({ url: u }) => {
            const ac = new AbortController();
            const t = window.setTimeout(() => ac.abort(), EXTRA_TIMEOUT_MS);
            return fetch("http://127.0.0.1:7867/v1/source-brief", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ url: u, includeScreenshot: true }),
              signal: ac.signal,
            })
              .then((r) => r.json())
              .finally(() => window.clearTimeout(t));
          }),
        );
        extras.forEach((meta, i) => {
          const r = results[i];
          if (r.status === "fulfilled" && r.value?.success && r.value?.brief) {
            sources.push({ id: meta.id, url: meta.url, brief: r.value.brief as SourceBrief });
          } else {
            const err = r.status === "rejected" ? (r.reason?.message ?? "fetch failed") : (r.value?.error ?? "no brief returned");
            sources.push({ id: meta.id, url: meta.url, brief: null, error: err });
          }
        });
      }

      // Build merged brief + provenance map. Primary wins on scalar headline/offer/brand fields.
      const origins: MergeOrigins = {
        logo: null, images: [], colors: [], products: [], services: [],
        benefits: [], proofPoints: [], callsToAction: [],
      };
      const merged: SourceBrief = { ...sb };
      const seen = {
        images: new Set<string>(), colors: new Set<string>(),
        products: new Set<string>(), services: new Set<string>(),
        benefits: new Set<string>(), proofPoints: new Set<string>(),
        callsToAction: new Set<string>(),
      };
      const pushAll = (src: MergeSource, br: SourceBrief) => {
        if (!origins.logo && br.logo) origins.logo = { value: br.logo, source: src };
        const addList = (key: keyof typeof seen, arr: string[] | undefined, cap: number) => {
          for (const v of arr ?? []) {
            if (!v || seen[key].has(v) || origins[key].length >= cap) continue;
            seen[key].add(v);
            origins[key].push({ value: v, source: src });
          }
        };
        addList("images", br.images, 12);
        addList("colors", br.colors, 6);
        addList("products", br.products, 8);
        addList("services", br.services, 8);
        addList("benefits", br.benefits, 6);
        addList("proofPoints", br.proofPoints, 6);
        addList("callsToAction", br.callsToAction, 6);
      };
      for (const s of sources) if (s.brief) pushAll(s.id, s.brief);
      merged.logo = origins.logo?.value ?? merged.logo;
      merged.images = origins.images.map((e) => e.value);
      merged.colors = origins.colors.map((e) => e.value);
      merged.products = origins.products.map((e) => e.value);
      merged.services = origins.services.map((e) => e.value);
      merged.benefits = origins.benefits.map((e) => e.value);
      merged.proofPoints = origins.proofPoints.map((e) => e.value);
      merged.callsToAction = origins.callsToAction.map((e) => e.value);

      // Upload fallback: if Firecrawl returned no images/logo/colors (heavy SPA
      // pages often abort the fast pass with branding+images formats), seed
      // them from the primary uploaded image so the hero/gallery isn't empty.
      const primaryUpload = files[0] ?? null;
      const needsImageFallback = !merged.images?.length && !merged.logo;
      const needsColorFallback = !merged.colors?.length;
      if (primaryUpload && (needsImageFallback || needsColorFallback)) {
        const fb = await buildUploadFallback(primaryUpload);
        if (fb) {
          if (needsImageFallback) {
            merged.images = [fb.dataUrl];
            merged.logo = merged.logo || fb.dataUrl;
          }
          if (needsColorFallback && fb.colors.length) {
            merged.colors = fb.colors;
            merged.themeColor = merged.themeColor || fb.colors[0];
          }
          merged.extractionWarnings = [
            ...(merged.extractionWarnings ?? []),
            "Hero image, logo and palette derived from uploaded file (page returned no media).",
          ];
        }
      }

      sourceBriefRef.current = merged;
      setSourceBrief(merged);
      setSourceMeta({ cached: Boolean(payload.cached), stale: Boolean((payload as any).stale) });
      if (merged.screenshot) setScreenshotUrl(merged.screenshot);
      else if (merged.images?.[0]?.startsWith("data:image/")) setScreenshotUrl(merged.images[0]);

      // Phase-2 background screenshot fetch: if this run skipped the screenshot
      // (retry / fast path), kick off a low-priority call to fill it in without
      // blocking the analyze pipeline.
      if (!merged.screenshot && opts?.includeScreenshot === false) {
        (async () => {
          try {
            const token = await getAccessTokenOrThrow("background screenshot").catch(() => null);
            if (!token) return;
            const r = await fetch("http://127.0.0.1:7867/v1/source-brief", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ url: targetUrl, includeScreenshot: true, forceRefresh: false }),
            });
            const p = await r.json().catch(() => null);
            if (p?.success && p?.brief?.screenshot) setScreenshotUrl(p.brief.screenshot);
          } catch { /* background — ignore */ }
        })();
      }

      // Auto image optimization: when the scraped brief has no high-quality
      // hero (confidence none/low), screenshot the page (if missing) and ask a
      // vision model to score every candidate against the auto-hint brief +
      // requested content type / aspect ratio. Runs in background; once it
      // returns the chosen hero is merged into sourceBrief.optimizedImages and
      // generation picks it up automatically.
      const lowImageConfidence =
        merged.imageConfidence === "none" || merged.imageConfidence === "low";
      if (lowImageConfidence) {
        (async () => {
          try {
            const patched = await optimizeSourceImagesForBrief(merged, targetUrl, effectiveContentType);
            sourceBriefRef.current = { ...(sourceBriefRef.current ?? merged), screenshot: (sourceBriefRef.current ?? merged).screenshot ?? patched.screenshot, optimizedImages: patched.optimizedImages };
            setSourceBrief((prev) => {
              if (!prev) return prev;
              return { ...prev, screenshot: prev.screenshot ?? patched.screenshot, optimizedImages: patched.optimizedImages };
            });
          } catch (e) {
            studioLog.warn("scrape", `Image optimization failed: ${(e as Error).message}`);
          }
        })();
      }

      if ((merged.confidenceScore ?? 0) < 25 && merged.screenshot) {
        toast({
          title: "Using screenshot as source",
          description: "We had trouble reading that page — falling back to its screenshot as the visual reference.",
        });
      }
      updateStep({ scrape: "done", analyze: extras.length > 0 ? "pending" : "active" });

      toast({
        title: (payload as any).stale
          ? "Showing cached source (refresh failed)"
          : payload.cached ? "Source loaded from cache" : "Source extracted",
        description: `Confidence ${merged.confidenceScore}/100`,
      });

      // When extras are present, pause and show the merge preview. The user
      // confirms (or cancels) before analyze-content is invoked.
      if (extras.length > 0) {
        setPendingMerge({
          sources,
          origins,
          merged,
          effectiveContentType,
          cached: Boolean(payload.cached),
          stale: Boolean((payload as any).stale),
        });
        setIsAnalyzing(false);
        return null;
      }

      return await runAnalyzeContent(merged, effectiveContentType);

    } catch (err: any) {
      console.error("Analysis error:", err);
      const now = Date.now();
      let failedStepForRetry: StepKey = "scrape";
      setPipeline((p) => {
        const failedStep: StepKey = p.scrape === "active" ? "scrape" : "analyze";
        failedStepForRetry = failedStep;
        if (!timingsRef.current[`${failedStep}End`]) timingsRef.current[`${failedStep}End`] = now;
        recordError(failedStep, err?.message || "Analysis failed", { raw: err });
        return {
          ...p,
          scrape: p.scrape === "active" ? "error" : p.scrape,
          analyze: p.scrape === "done" ? "error" : p.analyze,
          errorMessage: err?.message || "Analysis failed",
          controlledExitReason: p.scrape === "active" ? "legacy_scrape_error" : p.controlledExitReason,
        };
      });
      scheduleAutoRetry(failedStepForRetry);
      await handleEdgeFunctionError(toast, err, "Analysis");
      return null;
    } finally {
      analyzeAbortRef.current = null;
      setIsAnalyzing(false);
    }
  };

  const handleTabChange = (newType: string) => {
    if (newType === contentType) return;
    setContentType(newType);
    if (newType !== "social") {
      setBrief(null);
      setInstructions("");
      setHasGenerated(false);
      setPosters([]);
      setVideos([]);
      if (url.trim()) {
        analyzeUrl(url, newType);
      }
    }
  };

  const clearPreviousGeneration = (scope: "all" | "current" = "current") => {
    if (scope === "all" || contentType === "video") setVideos([]);
    if (scope === "all" || contentType !== "video") setPosters([]);
    setHasGenerated(false);
  };

  const handleGenerate = async (overrideBrief?: CreativeBrief | null) => {
    // Dismiss the post-signin welcome banner as soon as the user generates —
    // it has served its purpose and was eating vertical space mid-render.
    setWelcomeBack(false);
    // Defensive: ignore anything that isn't a CreativeBrief-shaped object
    // (e.g. a stray React event from an onClick={handleGenerate} wiring).
    const safeOverride =
      overrideBrief && typeof overrideBrief === "object" && "headline" in (overrideBrief as object)
        ? overrideBrief
        : null;
    let effectiveBrief = safeOverride ?? brief;
    if (!isAuthenticated) {
      // Try once quickly to recover a valid session, but don't make the user
      // wait — if there's no token, go straight to sign-in.
      const token = await getAccessTokenOrThrow("generation start", 1_500).catch(() => null);
      if (token) {
        setIsAuthenticated(true);
      } else {
        toast({
          title: "Sign in to generate",
          description: "Create a free account or sign in — your brief and uploads are kept.",
          variant: "destructive",
        });
        navigate("/login?redirect=/studio");
        return;
      }
    }

    // ── Pricing confirmation gate ─────────────────────────────────────────
    // The user MUST explicitly approve the price (or choose "no price") before
    // we put any number on a generated asset. Approval is bound to the exact
    // pricing value seen at confirmation time — if pricing changes after, we
    // re-prompt.
    const briefPricingRaw =
      (effectiveBrief as { pricing?: string } | null)?.pricing ??
      (sourceBriefRef.current?.pricing ?? sourceBrief?.pricing ?? "");
    const briefPricing = (briefPricingRaw ?? "").trim();
    const approval = pricingApprovalRef.current;
    const approvalMatches =
      !!approval &&
      ((approval.mode === "none" && briefPricing === "") ||
        (approval.mode === "use" && approval.value === briefPricing && validatePriceWithRules(briefPricing).ok));
    if (!approvalMatches) {
      pendingGenerateRef.current = safeOverride;
      setPricingDialogOpen(true);
      return;
    }

    // Always wipe any prior output before kicking off a fresh job.
    clearPreviousGeneration();

    // ── DNA mode short-circuit ────────────────────────────────────────────
    // If the user picked a curated Product, skip scrape/analyze entirely.
    // Brief comes from brand_dna + product (+ active moodboard); hero image
    // is the product's stored image. No URL fetch, no Firecrawl race.
    const dnaMode = !!selectedProduct;
    if (dnaMode && selectedProduct) {
      if (analyzeAbortRef.current) {
        try { analyzeAbortRef.current.abort(); } catch { /* ignore */ }
        analyzeAbortRef.current = null;
      }
      resetPipeline();
      updateStep({
        scrape: "done",
        analyze: "done",
        controlledExitReason: "user_upload" as ControlledExitReason,
      });
      studioLog.info("scrape", `DNA mode: using product "${selectedProduct.name}" — scrape/analyze skipped.`);
      const dnaBrief = briefFromDna({
        dna: brandDna,
        product: selectedProduct,
        moodboard: activeMoodboard,
        contentType,
        style,
        instructions,
      });
      effectiveBrief = dnaBrief;
      setBrief(dnaBrief);
    }

    // Reset pipeline; if URL chain already analyzed, mark those steps as done.
    const hasUrl = !!url.trim();
    const hasUpload = files.length > 0;
    // When the user has uploaded source material, treat the URL as optional
    // metadata — never block generation on a slow/hanging scrape. The upload
    // is already the literal hero and the brief can be auto-derived.
    const shouldScrapeUrl = !dnaMode && hasUrl && !hasUpload;
    if (!dnaMode) {
      // Cancel any in-flight analyze/scrape request and pending auto-retry — they
      // would otherwise race with Generate and clobber its pipeline state mid-run.
      if (analyzeAbortRef.current) {
        try { analyzeAbortRef.current.abort(); } catch { /* ignore */ }
        analyzeAbortRef.current = null;
      }
      resetPipeline();
      if (shouldScrapeUrl && effectiveBrief) {
        updateStep({ scrape: "done", analyze: "done" });
      } else if (!shouldScrapeUrl) {
        // No URL flow (or upload overrides URL) — collapse scrape+analyze.
        updateStep({ scrape: "done", analyze: "done", controlledExitReason: "user_upload" });
        studioLog.info("scrape", "User upload supplied — skipping URL scrape.", { controlledExitReason: "user_upload" });
      }
    }

    // Kick off file encoding in parallel with URL analysis — both are independent
    // and the encode (image downscale / video frame grab) can take 100–500ms.
    // In DNA mode the "primary file" is synthesised from the product's hero
    // image URL (a signed library URL fetched as base64).
    const primaryFile = files[0] ?? null;
    const encodePromise: Promise<string | null> = dnaMode && selectedProduct?.hero_image_url
      ? fetchImageAsBase64(selectedProduct.hero_image_url)
      : primaryFile
      ? fileToVisualReference(primaryFile)
      : Promise.resolve(null);



    const applyDefaultBrief = (reason: string, showToast = true) => {
      const fallback = buildDefaultBrief({
        url,
        files,
        contentType,
        style,
        instructions,
        sourceBrief: sourceBriefRef.current ?? sourceBrief,
      });
      effectiveBrief = fallback;
      setBrief(fallback);
      if (!instructions.trim()) setInstructions(fallback.instructions);
      if (!sourceBriefRef.current && url.trim()) {
        const fallbackSource = buildFallbackSourceBriefFromDefault(fallback, url.trim(), reason);
        sourceBriefRef.current = fallbackSource;
        setSourceBrief(fallbackSource);
      }
      updateStep({
        scrape: url.trim() ? "partial" : "done",
        analyze: "done",
        controlledExitReason: url.trim() ? "client_abort" : hasUpload ? "user_upload" : null,
      });
      if (showToast) {
        toast({
          title: "Using default brief",
          description: "We couldn't read your source quickly enough — generating with a sensible default you can edit.",
        });
      }
      return fallback;
    };

    // Chain: if a URL is set but we haven't analyzed yet, analyze first and continue.
    // URL scrape is treated as optional enrichment with a soft budget — if it
    // doesn't return in time we synthesise a default brief and proceed rather
    // than blocking the user on a slow third-party page.
    if (shouldScrapeUrl && !effectiveBrief && !instructions) {
      studioLog.info(
        "scrape",
        `URL enrichment with ${Math.round(GENERATE_ANALYZE_FALLBACK_MS / 1000)}s soft budget — generation will not block past this point.`,
      );
      const b = await analyzeUrl(url, undefined, { fallbackAfterMs: GENERATE_ANALYZE_FALLBACK_MS });
      if (b) {
        effectiveBrief = b;
      } else {
        // Analyze failed (timeout, thin source, edge error). Instead of hard-
        // stopping the user, synthesise a sensible default brief from whatever
        // we do know (URL, uploads, partial sourceBrief) and continue.
        applyDefaultBrief(
          `URL reader exceeded ${Math.round(GENERATE_ANALYZE_FALLBACK_MS / 1000)}s or returned no analyzable brief during Generate; default brief used.`,
        );
      }
    }

    // Last-resort default: no URL, no analyze, no upload-derived brief.
    if (!effectiveBrief) {
      applyDefaultBrief("No prior brief was available; default brief used.", false);
    }

    setIsGenerating(true);
    updateStep({ generate: "active", errorMessage: undefined });

    // Hard fail-safe so a stuck generate never spins forever.
    if (generateWatchdogRef.current) window.clearTimeout(generateWatchdogRef.current);
    generateWatchdogRef.current = window.setTimeout(() => {
      // Only act if generate is still in-flight. Snapshot first so we know
      // whether to actually abort + retry.
      let tripped = false;
      setPipeline((p) => {
        if (p.generate !== "active") return p;
        tripped = true;
        return {
          ...p,
          generate: "error",
          errorMessage: `Generation stuck past ${Math.round(GENERATE_CLIENT_TIMEOUT_MS / 1000)}s — cancelled. Please retry.`,
        };
      });
      if (!tripped) return;
      // Abort every in-flight controller — without this the underlying fetch
      // keeps the connection open and the next retry queues behind it.
      try { generateAbortRef.current?.abort(); } catch {}
      inFlightControllersRef.current.forEach((c) => { try { c.abort(); } catch {} });
      inFlightControllersRef.current.clear();
      setIsGenerating(false);
      studioLog.error(
        "generate",
        `Watchdog tripped at ${Math.round(GENERATE_CLIENT_TIMEOUT_MS / 1000)}s — aborted in-flight poster requests.`,
      );
      scheduleAutoRetry("generate");
    }, GENERATE_CLIENT_TIMEOUT_MS);

    try {
      const sourceDisplayName = getSourceDisplayName(primaryFile, effectiveBrief?.brand || "Source product");
      const rawHeadline = effectiveBrief?.headline || instructions || `${style} ${contentType}`;
      const rawSubheadline = effectiveBrief?.subheadline || "";
      const rawCta = effectiveBrief?.callToAction || "Learn More";
      const rawKeyPoints = effectiveBrief?.keyPoints || [];
      const rawInstructions = instructions;

      // Voice guard — strip hype words ("amazing", "revolutionary",
      // "game-changer", etc.) before the copy reaches the poster model.
      // Cheaper than an OCR post-pass and prevents banned phrasing from
      // being baked into pixels.
      const cleaned = cleanBriefVoice({
        headline: rawHeadline,
        subheadline: rawSubheadline,
        callToAction: rawCta,
        instructions: rawInstructions,
        keyPoints: rawKeyPoints,
      });
      if (cleaned.flagged.length > 0) {
        studioLog.info(
          "generate",
          `Voice guard swapped: ${cleaned.flagged.join(", ")}`,
        );
        toast({
          title: "Brand voice applied",
          description: `Softened ${cleaned.flagged.length} hype word${cleaned.flagged.length === 1 ? "" : "s"}: ${cleaned.flagged.slice(0, 3).join(", ")}${cleaned.flagged.length > 3 ? "…" : ""}`,
        });
      }
      const headline = cleaned.headline;
      const subheadline = cleaned.subheadline;
      const callToAction = cleaned.callToAction;
      const tone = effectiveBrief?.tone || style;
      const colorSuggestions = effectiveBrief?.colorSuggestions || [];
      const keyPoints = cleaned.keyPoints;
      const brand = effectiveBrief?.brand || sourceDisplayName;

      // Awaiting here is essentially free if analyzeUrl ran — encoding overlapped with it.
      const imageBase64 = await encodePromise;

      const isVideo = contentType === "video";
      const videoInstructions = [cleaned.instructions, cleanBriefVoice({ instructions: effectiveBrief?.instructions }).instructions, primaryFile ? `${primaryFile.type.startsWith("video/") ? "Uploaded source video" : "Uploaded source image"}: ${sourceDisplayName}` : "No uploaded source file"]
        .filter(Boolean)
        .join("\n\n");

      const effectiveContentType = contentType === "ad" ? "advertisement" : contentType;
      let activeSourceBrief = sourceBriefRef.current ?? sourceBrief;
      const hasWrittenSourceBrief = instructions.trim().length >= 20 || (effectiveBrief?.instructions?.trim().length ?? 0) >= 20;
      const sourceNeedsOptimization =
        activeSourceBrief &&
        !imageBase64 &&
        !hasWrittenSourceBrief &&
        !activeSourceBrief.optimizedImages?.hero &&
        (activeSourceBrief.imageConfidence === "none" || activeSourceBrief.imageConfidence === "low");
      if (sourceNeedsOptimization) {
        toast({ title: "Optimizing source image…", description: "Capturing the page and choosing the best visual reference." });
        try {
          activeSourceBrief = await optimizeSourceImagesForBrief(
            activeSourceBrief,
            url || activeSourceBrief.sourceUrl,
            effectiveContentType,
            false,
          );
          sourceBriefRef.current = activeSourceBrief;
          setSourceBrief(activeSourceBrief);
        } catch (e) {
          studioLog.warn("generate", `Source image optimization skipped: ${(e as Error).message}`);
        }
      }

      // Multi-source visual prioritization: analyze-content returns a ranked
      // referenceImages[] (logo > screenshot > top scraped product shots). Use
      // the top 1–3 so the image model anchors on real brand identity.
      const rankedRefs: string[] = Array.isArray((effectiveBrief as any)?.referenceImages)
        ? ((effectiveBrief as any).referenceImages as string[]).filter(Boolean)
        : [];
      const fallbackRefs: string[] = [
        activeSourceBrief?.logo,
        activeSourceBrief?.screenshot ?? undefined,
        ...(activeSourceBrief?.images ?? []),
      ].filter((v): v is string => typeof v === "string" && v.length > 0);

      // Real-product-poster mode: when the scraper found a high/medium-confidence
      // heroImageUrl, force it to the front of referenceImages so the poster
      // model uses the actual product packaging as the hero visual.
      const heuristicHero: string | undefined = (effectiveBrief as any)?.heroImageUrl ?? (activeSourceBrief as any)?.heroImageUrl;
      const heuristicConfidence: string | undefined =
        (effectiveBrief as any)?.imageConfidence ?? (activeSourceBrief as any)?.imageConfidence;
      // Prefer the AI-optimized hero when the heuristic pass returned low/none
      // confidence AND optimize-source-images came back with a usable pick.
      const optimized = (effectiveBrief as any)?.optimizedImages ?? (activeSourceBrief as any)?.optimizedImages;
      const useOptimized =
        !!optimized?.hero &&
        optimized.heroConfidence !== "none" &&
        (heuristicConfidence === "none" || heuristicConfidence === "low" || !heuristicHero);
      const heroUrl: string | undefined = useOptimized ? optimized.hero : heuristicHero;
      const heroConfidence: string | undefined = useOptimized ? optimized.heroConfidence : heuristicConfidence;
      const baseRefs = rankedRefs.length ? rankedRefs : fallbackRefs;
      const refsWithHero = heroUrl
        ? [heroUrl, ...baseRefs.filter((u) => u !== heroUrl)]
        : baseRefs;
      const referenceImages: string[] = refsWithHero.slice(0, 3);
      const referenceImageUrl = imageBase64 ? null : referenceImages[0] ?? null;

      // Hard-block: product page with no upload AND no usable hero. Prevents
      // the model from inventing fake packaging when we have product data
      // (name/brand/price) but no real product image to anchor on.
      const isProductPage =
        ((effectiveBrief as any)?.pageType === "product") ||
        ((activeSourceBrief as any)?.pageType === "product") ||
        !!(effectiveBrief as any)?.productMeta?.name ||
        !!(activeSourceBrief as any)?.productMeta?.name;
      const hasUsableHero = !!heroUrl && heroConfidence !== "none";
      if (isProductPage && !imageBase64 && !hasUsableHero && !hasWrittenSourceBrief) {
        updateStep({ generate: "pending" });
        toast({
          title: "Product image required",
          description:
            "We couldn't find a reliable product image on the source page. Upload the product photo or add a Brand Brief / Instructions so the studio can generate source material from your description.",
          variant: "destructive",
        });
        setIsGenerating(false);
        return;
      }



      const bodyParams = {
        headline, subheadline, callToAction, style, contentType: effectiveContentType, tone,
        colorSuggestions, keyPoints, brand, imageBase64, referenceImageUrl, referenceImages, aspectRatio,
        instructions: contentType === "ad"
          ? `Create a high-converting advertisement design. Focus on clear value proposition, strong CTA, brand consistency, and visual hierarchy optimized for ad placements.\n\n${videoInstructions}`
          : videoInstructions,
        sourceMaterialName: sourceDisplayName,
        sourceMaterialType: primaryFile?.type || null,
        // Pricing reaches the server only after the user explicitly approved
        // it through the confirmation gate. We send `pricingVerified` so the
        // edge function accepts custom-format approvals (rules the built-in
        // server validator wouldn't recognise), still subject to a safety gate.
        pricing: (effectiveBrief as any)?.pricing ?? (activeSourceBrief as any)?.pricing ?? "",
        pricingVerified: !!pricingApproval && pricingApproval.mode === "use",
      };
      // Capture for per-variant re-roll (kept in-memory only; not persisted).
      lastPosterBodyRef.current = bodyParams;

      // Snapshot inputs (omit heavy base64) for error reporting / export
      const { imageBase64: _omit, ...bodyForReport } = bodyParams;
      lastInputsRef.current = {
        ...bodyForReport,
        url: url || null,
        hasInstructions: !!instructions,
        files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
        imageBase64Bytes: imageBase64 ? imageBase64.length : 0,
        brief: effectiveBrief || null,
      };


      if (isVideo) {
        toast({ title: "Generating videos…", description: "Creating 2 × 10s video variants" });
        const [r1, r2] = await Promise.all([
          supabase.functions.invoke("generate-video", { body: { ...bodyParams, variantIndex: 1 } }),
          supabase.functions.invoke("generate-video", { body: { ...bodyParams, variantIndex: 2 } }),
        ]);
        if (canceledRef.current) return;
        const v1ok = !r1.error && r1.data?.success;
        const v2ok = !r2.error && r2.data?.success;
        if (!v1ok && !v2ok) {
          // Both failed — surface whichever error is most informative.
          const msg = r1.error?.message || r1.data?.error || r2.error?.message || r2.data?.error || "Video generation failed";
          recordError("generate", msg, { raw: { r1: r1.data || r1.error, r2: r2.data || r2.error } });
          updateStep({ generate: "error", errorMessage: msg });
          toast({ title: "Generation failed", description: msg, variant: "destructive" });
          return;
        }
        // At least one succeeded — surface what we have, duplicating the survivor if needed.
        const winners = [
          ...(v1ok ? (r1.data?.videos || []) : []),
          ...(v2ok ? (r2.data?.videos || []) : []),
        ];
        const combined = winners.length >= 2 ? winners : [winners[0], winners[0]];
        setVideos(combined);
        if (!v1ok || !v2ok) {
          toast({ title: "One variant failed", description: "Showing the variant that succeeded — regenerate to retry the other." });
        }
      } else {
        const typeLabel = contentType === "brochure" ? "brochures" : contentType === "ad" ? "advertisements" : `${contentType}s`;
        toast({ title: `Generating ${typeLabel}…`, description: "Streaming previews — first frame in a few seconds." });
        const accessToken = await getAccessTokenOrThrow("poster generation");

        const TIMEOUT_MS = 90_000;
        // Per-variant latest frame. We only call setPosters with the non-empty
        // frames in slot order — PreviewPanel renders `posters[i]` directly
        // and would break on empty strings.
        const frames: { 1?: string; 2?: string } = {};
        const pushFrames = () => {
          const next: string[] = [];
          if (frames[1]) next.push(frames[1]);
          if (frames[2]) next.push(frames[2]);
          setPosters(next);
        };
        let firstFrameSeen = false;
        let doneCount = 0;
        updateStep({ generate: "active", generateProgress: { done: 0, total: 2 } });

        // Heartbeat stall thresholds: the edge function beats every 5s and
        // includes `sinceUpstreamMs`. If we don't see ANY beat for HB_GAP_MS,
        // the edge→browser channel is wedged. If upstream silence
        // (`sinceUpstreamMs`) exceeds UPSTREAM_STALL_MS the gateway/model is
        // wedged. Either case aborts the variant early so the existing
        // auto-retry path kicks in instead of waiting for the 60s/180s
        // watchdogs.
        const HB_GAP_MS = 20_000;
        const UPSTREAM_STALL_MS = 60_000;
        let anyStall = false;

        const streamVariant = async (variantIndex: 1 | 2) => {
          const controller = new AbortController();
          if (variantIndex === 1) generateAbortRef.current = controller;
          const unregister = registerController(controller);
          const deadline = Date.now() + TIMEOUT_MS;
          let didTimeout = false;
          let stallReason: "hb_gap" | "upstream_idle" | null = null;
          let lastBeatAt = Date.now();
          let lastSinceUpstream = 0;
          const deadlineTimer = window.setInterval(() => {
            if (Date.now() >= deadline) {
              didTimeout = true;
              try { controller.abort(); } catch { /* ignore */ }
              window.clearInterval(deadlineTimer);
            }
          }, 1_000);
          // Stall watcher — 2s tick so we react well within the 5s beat cadence.
          const stallTimer = window.setInterval(() => {
            const beatGap = Date.now() - lastBeatAt;
            if (beatGap > HB_GAP_MS) {
              stallReason = "hb_gap";
              studioLog.warn("generate", `Variant ${variantIndex}: no heartbeat for ${Math.round(beatGap / 1000)}s — aborting for auto-retry.`);
              try { controller.abort(); } catch { /* ignore */ }
              window.clearInterval(stallTimer);
              return;
            }
            if (lastSinceUpstream > UPSTREAM_STALL_MS) {
              stallReason = "upstream_idle";
              studioLog.warn("generate", `Variant ${variantIndex}: upstream silent for ${Math.round(lastSinceUpstream / 1000)}s — aborting for auto-retry.`);
              try { controller.abort(); } catch { /* ignore */ }
              window.clearInterval(stallTimer);
            }
          }, 2_000);
          try {
            const r = await streamPoster({
              url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-poster`,
              accessToken,
              apiKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              body: { ...bodyParams, variantIndex },
              signal: controller.signal,
              onFrame: (dataUrl, isFinal) => {
                // A real frame counts as activity — reset stall trackers so we
                // don't kill a generation that is producing partial bytes.
                lastBeatAt = Date.now();
                lastSinceUpstream = 0;
                frames[variantIndex] = dataUrl;
                pushFrames();
                if (!firstFrameSeen) {
                  firstFrameSeen = true;
                  setHasGenerated(true);
                }
                if (isFinal) {
                  setGeneratedLibrary(prev => [
                    ...prev,
                    { type: contentType, url: dataUrl, label: `${contentType} variant ${variantIndex}` },
                  ]);
                }
              },
              onHeartbeat: (info) => {
                lastBeatAt = Date.now();
                lastSinceUpstream = info.sinceUpstreamMs;
                updateStep({
                  generateHeartbeat: {
                    receivedAt: lastBeatAt,
                    sinceUpstreamMs: info.sinceUpstreamMs,
                    seq: info.seq,
                  },
                });
                if (info.sinceUpstreamMs > 30_000) {
                  studioLog.warn("generate", `Upstream slow: ${Math.round(info.sinceUpstreamMs / 1000)}s since last byte (variant ${variantIndex}).`);
                }
              },
            });
            if (r.ok) {
              doneCount += 1;
              updateStep({ generateProgress: { done: doneCount, total: 2 } });
              return { ok: true as const, variantIndex };
            }
            return { ok: false as const, variantIndex, error: r.error || "Stream failed", status: r.status, stall: stallReason };
          } catch (e: any) {
            if (stallReason) {
              anyStall = true;
              return { ok: false as const, variantIndex, error: `Variant ${variantIndex} stalled (${stallReason === "hb_gap" ? "no heartbeat" : "upstream idle"}) — will auto-retry`, status: 504, stall: stallReason };
            }
            if (didTimeout || e?.name === "AbortError") {
              return { ok: false as const, variantIndex, error: `Variant ${variantIndex} timed out after ${Math.round(TIMEOUT_MS / 1000)}s`, status: 504, stall: null };
            }
            return { ok: false as const, variantIndex, error: e?.message || `Variant ${variantIndex} failed`, status: 500, stall: null };
          } finally {
            window.clearInterval(deadlineTimer);
            window.clearInterval(stallTimer);
            if (stallReason) anyStall = true;
            unregister();
          }
        };

        // Stream both variants in parallel — each updates its own slot as
        // partial PNG frames arrive. We await variant 1 so we can surface a
        // hard error if it never produced a frame; variant 2 continues in
        // the background and fills its slot when ready.
        const v1Promise = streamVariant(1);
        const v2Promise = streamVariant(2);

        const r1 = await v1Promise;
        if (r1.ok) {
          updateStep({ generate: "done", generateProgress: { done: doneCount, total: 2 } });
          // Don't block on variant 2 — let it finish in the background.
          v2Promise.then((r2) => {
            if (!r2.ok && !frames[2]) {
              if (frames[1]) setPosters([frames[1], frames[1]]);
              toast({ title: "Second variant failed", description: r2.error || "Regenerate to retry the other slot." });
            }
          }).catch(() => { /* already handled inside streamVariant */ });
        } else {
          // Variant 1 never produced a frame — wait for variant 2 as a fallback.
          const r2 = await v2Promise;
          if (!r2.ok) {
            const stalled = !!(r1.stall || r2.stall || anyStall);
            const baseMsg = r1.error || r2.error || "Poster generation failed";
            const attempt = (autoRetriedRef.current?.generate ?? 0) + 1;
            const msg = stalled
              ? `${baseMsg} · auto-retry ${attempt}/${MAX_AUTO_RETRIES}`
              : baseMsg;
            recordError("generate", msg, { status: r1.status || r2.status, raw: { r1, r2, stalled } });
            updateStep({ generate: "error", errorMessage: msg });
            if (stalled) {
              toast({ title: "Generation stalled", description: `Auto-retrying with the same brief (attempt ${attempt}/${MAX_AUTO_RETRIES}).` });
              scheduleAutoRetry("generate");
            } else {
              toast({ title: "Generation failed", description: msg, variant: "destructive" });
            }
            return;
          }
          // Variant 2 saved us — duplicate so both slots fill.
          if (frames[2]) setPosters([frames[2], frames[2]]);
          setHasGenerated(true);
          updateStep({ generate: "done", generateProgress: { done: doneCount, total: 2 } });
        }
      }


      setHasGenerated(true);
      updateStep({ generate: "done" });
      const doneLabel = isVideo ? "video" : (contentType === "brochure" ? "brochure" : contentType === "ad" ? "advertisement" : contentType);
      toast({ title: "Done!", description: isVideo ? `2 ${doneLabel} variants ready. Pick your favourite or regenerate.` : `Variant 1 ready — variant 2 finishing in the background.` });
      setTimeout(() => resetPipeline(), 600);

    } catch (err: any) {
      console.error("Generate error:", err);
      const msg = err?.message || "Generation failed";
      recordError("generate", msg, { raw: { name: err?.name, stack: err?.stack } });
      updateStep({ generate: "error", errorMessage: msg });
      await handleEdgeFunctionError(toast, err, "Generation");
    } finally {
      if (generateWatchdogRef.current) {
        window.clearTimeout(generateWatchdogRef.current);
        generateWatchdogRef.current = null;
      }
      setIsGenerating(false);
    }
  };

  const handleRegenerate = () => {
    clearPreviousGeneration();
    resetPipeline();
    handleGenerate();
  };

  // Per-variant re-roll: re-stream a single poster slot using the cached body
  // params, without re-running scrape/analyze or touching the other variant.
  const regeneratePosterVariant = async (variantIndex: number) => {
    const body = lastPosterBodyRef.current;
    if (!body) {
      toast({ title: "Nothing to re-roll yet", description: "Generate a poster first." });
      return;
    }
    if (regeneratingVariants.includes(variantIndex)) return;
    setRegeneratingVariants((prev) => [...prev, variantIndex]);
    const controller = new AbortController();
    const unregister = registerController(controller);
    const TIMEOUT_MS = 90_000;
    const deadlineTimer = window.setTimeout(() => {
      try { controller.abort(); } catch { /* ignore */ }
    }, TIMEOUT_MS);
    try {
      const accessToken = await getAccessTokenOrThrow("variant re-roll");
      studioLog.info("generate", `Re-rolling variant ${variantIndex} (no scrape/analyze).`);
      const r = await streamPoster({
        url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-poster`,
        accessToken,
        apiKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        body: { ...body, variantIndex },
        signal: controller.signal,
        onFrame: (dataUrl, isFinal) => {
          setPosters((prev) => {
            const next = [...prev];
            while (next.length < variantIndex) next.push(next[next.length - 1] ?? "");
            next[variantIndex - 1] = dataUrl;
            return next;
          });
          if (isFinal) {
            setGeneratedLibrary((prev) => [
              ...prev,
              { type: contentType, url: dataUrl, label: `${contentType} variant ${variantIndex} (re-roll)` },
            ]);
          }
        },
        onHeartbeat: (info) => {
          if (info.sinceUpstreamMs > 30_000) {
            studioLog.warn("generate", `Re-roll upstream stall: ${Math.round(info.sinceUpstreamMs / 1000)}s since last byte (variant ${variantIndex}).`);
          }
        },
      });
      if (!r.ok) {
        toast({ title: "Re-roll failed", description: r.error || "Please try again.", variant: "destructive" });
      } else {
        toast({ title: `Variant ${variantIndex} re-rolled`, description: "Fresh take on the same brief." });
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        toast({ title: "Re-roll failed", description: e?.message || "Unknown error", variant: "destructive" });
      }
    } finally {
      window.clearTimeout(deadlineTimer);
      unregister();
      setRegeneratingVariants((prev) => prev.filter((v) => v !== variantIndex));
    }
  };


  // Re-run only the failed stage. Used by both the manual "Retry" button and
  // the auto-retry countdown after a watchdog trips.
  // Smart retry heuristic — pick includeScreenshot for the next scrape based
  // on why the previous one failed:
  //   • storefront URL (/products/, Shopify) → false (heavy screenshots make
  //     these the most common watchdog-trip culprits)
  //   • timeout / watchdog / stall / network / abort → false (screenshot is
  //     the slowest format; dropping it usually rescues a budget-blown scrape)
  //   • 4xx / auth / Firecrawl-config error → keep true (screenshot wasn't
  //     the cause; dropping it won't help and may hurt the brief)
  //   • anything else → false (faster default)
  const pickRetryScreenshotFlag = (reason: string | undefined, targetUrl: string): boolean => {
    const r = (reason ?? "").toLowerCase();
    const isStorefront = /\/products?\//i.test(targetUrl) || /myshopify\.com|\.shopify\./i.test(targetUrl);
    if (isStorefront) return false;
    if (/4\d\d|unauthor|forbidden|api key|firecrawl not configured|invalid url/i.test(r)) return true;
    return false;
  };

  const triggerRetry = (failedStep: StepKey) => {
    cancelAutoRetry();
    if (failedStep === "scrape") {
      setPipeline((p) => ({ ...p, scrape: "pending", analyze: "pending", generate: "pending", errorMessage: undefined, controlledExitReason: null }));
      if (url.trim()) {
        // Smart retry: pick includeScreenshot based on failure reason.
        const includeScreenshot = pickRetryScreenshotFlag(pipeline.errorMessage, url.trim());
        studioLog.info("scrape", `Smart retry: includeScreenshot=${includeScreenshot} (reason="${pipeline.errorMessage ?? "n/a"}")`);
        analyzeUrl(url, undefined, { forceRefresh: true, includeScreenshot });
      } else {
        resetPipeline();
        handleGenerate();
      }
    } else if (failedStep === "analyze") {
      setPipeline((p) => ({ ...p, analyze: "pending", generate: "pending", errorMessage: undefined }));
      if (sourceBrief) {
        runAnalyzeContent(sourceBrief, contentType);
      } else if (url.trim()) {
        analyzeUrl(url);
      } else {
        resetPipeline();
        handleGenerate();
      }
    } else {
      setPipeline((p) => ({ ...p, generate: "pending", errorMessage: undefined }));
      handleGenerate();
    }
  };
  // Keep the ref current so watchdogs (declared earlier in the render) can reach the latest closures.
  triggerRetryRef.current = triggerRetry;




  const isSocialTab = contentType === "social";
  const socialImageSource = selectedSocialContent || socialUploadPreview || null;

  // Pricing dialog handlers — confirm writes the user's decision onto the
  // brief + sourceBrief so downstream code (generate-poster body, prompts,
  // brief panel) all see the same verified value, then resumes generation.
  const handlePricingConfirm = (decision: PricingDecision) => {
    pricingApprovalRef.current = decision;
    setPricingApproval(decision);
    setPricingDialogOpen(false);
    const nextPricing = decision.mode === "use" ? decision.value : "";
    setSourceBrief((prev) => (prev ? { ...prev, pricing: nextPricing } : prev));
    setBrief((prev) =>
      prev ? ({ ...(prev as CreativeBrief & { pricing?: string }), pricing: nextPricing }) : prev,
    );
    const resume = pendingGenerateRef.current;
    pendingGenerateRef.current = null;
    // Re-enter with the same overrideBrief — gate will now pass.
    setTimeout(() => {
      void handleGenerate(
        resume
          ? ({ ...(resume as CreativeBrief & { pricing?: string }), pricing: nextPricing } as CreativeBrief)
          : null,
      );
    }, 0);
  };
  const handlePricingCancel = () => {
    setPricingDialogOpen(false);
    pendingGenerateRef.current = null;
  };

  const pricingDialogExtracted =
    (sourceBrief?.pricing ?? (brief as (CreativeBrief & { pricing?: string }) | null)?.pricing ?? "").trim();

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <PricingConfirmDialog
        open={pricingDialogOpen}
        extractedPrice={pricingDialogExtracted}
        onConfirm={handlePricingConfirm}
        onCancel={handlePricingCancel}
      />

      <SEO
        title="Studio — Resonance Creative Studio"
        description="Generate posters, brochures, ads, videos, and social posts with AI. Your personal Resonance Creative Studio workspace."
        path="/studio"
        noindex
      />
      <h1 className="sr-only">Resonance Creative Studio workspace</h1>

      <StudioNav isAnalyzing={isAnalyzing} isAuthenticated={isAuthenticated} />

      {welcomeBack && isAuthenticated && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="shrink-0 border-b border-primary/20 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 px-4 sm:px-6 py-2.5"
          role="status"
        >
          <div className="flex items-center justify-between gap-3 max-w-6xl mx-auto">
            <div className="flex items-center gap-2.5 min-w-0">
              <Sparkles className="w-4 h-4 text-primary shrink-0" />
              <p className="text-[12.5px] sm:text-sm text-foreground/90 truncate">
                <span className="font-medium text-foreground">You're signed in.</span>{" "}
                <span className="text-muted-foreground">
                  Head back to your brief below and click{" "}
                  <span className="text-foreground font-medium">Generate Creative</span> to continue.
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById("generate-creative-button");
                  if (!el) return;
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  // Wait for scroll to settle before focusing so the button
                  // doesn't get jump-focused mid-animation.
                  window.setTimeout(() => {
                    (el as HTMLButtonElement).focus({ preventScroll: true });
                    setWelcomeBack(false);
                  }, 450);
                }}
                className="inline-flex items-center gap-1.5 rounded-full studio-gradient-bg text-primary-foreground text-xs font-semibold px-3 py-1.5 shadow-[0_6px_18px_-6px_hsl(var(--primary)/0.7)] hover:shadow-[0_10px_24px_-6px_hsl(var(--primary)/0.9)] transition-shadow"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Go to Generate
              </button>
              <button
                type="button"
                onClick={() => setWelcomeBack(false)}
                aria-label="Dismiss welcome banner"
                className="text-muted-foreground hover:text-foreground transition-colors text-xs px-2 py-1 rounded-md hover:bg-white/[0.06]"
              >
                Dismiss
              </button>
            </div>
          </div>
        </motion.div>
      )}


      {/* Content Type Pills */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.35 }}
        className="shrink-0 border-b border-white/[0.05] bg-background/40 backdrop-blur-md px-4 sm:px-6 py-3"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin flex-1 min-w-0">
            {contentTabs.map((tab) => {
              const isActive = contentType === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`group relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                    isActive
                      ? "text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground bg-white/[0.03] ring-1 ring-white/[0.06] hover:bg-white/[0.06]"
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="activePill"
                      className="absolute inset-0 rounded-full studio-gradient-bg shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.7)]"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <Icon className="w-4 h-4 relative" />
                  <span className="relative">{tab.label}</span>
                </button>
              );
            })}
          </div>
          <StudioHealthIndicator />
          <button
            onClick={handleSaveProject}
            disabled={isGenerating || isAnalyzing || !isAuthenticated}
            title={activeProjectId ? `Update "${activeProjectName}"` : "Save current work as a named project"}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium text-foreground bg-white/[0.05] ring-1 ring-white/[0.1] hover:bg-white/[0.08] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {activeProjectId ? "Update Project" : "Save Project"}
            </span>
          </button>
          <button
            onClick={handleClearAll}
            disabled={isGenerating || isAnalyzing}
            title="Clear brief, uploads and generated assets"
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground bg-white/[0.03] ring-1 ring-white/[0.06] hover:bg-white/[0.06] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear all</span>
          </button>

        </div>

      </motion.div>

      {(() => {
        const hasOutput = posters.length > 0 || videos.length > 0 || generatedLibrary.length > 0;
        const hasSource = files.length > 0 || !!url.trim();
        const stages = [
          { id: "create" as const, label: "Create", hint: "Pick a content type", complete: !!contentType },
          { id: "source" as const, label: "Source", hint: "Upload an image or paste a reference link", complete: hasSource },
          { id: "brief" as const, label: "Brief", hint: "Review the generated creative brief", complete: !!sourceBrief, active: isAnalyzing && hasSource },
          { id: "generate" as const, label: "Generate", hint: "Render your creative assets", complete: hasOutput, active: isGenerating },
          { id: "export" as const, label: "Save / Export", hint: "Save the project or download assets", complete: !!activeProjectId && hasOutput },
        ];
        const scrollTo = (id: StudioStageId) => {
          const map: Record<StudioStageId, string> = {
            create: "studio-content-tabs",
            source: "studio-source-panel",
            brief: "studio-brief-panel",
            generate: "generate-creative-button",
            export: "studio-export-panel",
          };
          const el = document.getElementById(map[id]);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
        };
        return <StudioStageNav stages={stages} onStageClick={scrollTo} />;
      })()}

      <LiveProgress
        pipeline={pipeline}
        isAnalyzing={isAnalyzing}
        isGenerating={isGenerating}
        isCanceling={isCanceling}
        onCancel={cancelPipeline}
      />


      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        <AnimatePresence mode="wait">
          {isSocialTab ? (
            <Suspense
              key="social"
              fallback={
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              }
            >
              <SocialTab
                socialConfig={socialConfig}
                onSocialConfigChange={setSocialConfig}
                brief={brief}
                generatedLibrary={generatedLibrary}
                selectedSocialContent={selectedSocialContent}
                onSelectedSocialContentChange={setSelectedSocialContent}
                socialUploadFiles={socialUploadFiles}
                onSocialUploadFilesChange={setSocialUploadFiles}
                socialUploadPreview={socialUploadPreview}
                socialImageSource={socialImageSource}
              />
            </Suspense>
          ) : (
            <motion.div
              key="generator"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col md:flex-row overflow-hidden"
            >
              <ResizablePanelGroup
                direction={isMobile ? "vertical" : "horizontal"}
                autoSaveId="studio-layout-v2"
                className="flex-1"
              >
                <ResizablePanel
                  defaultSize={isMobile ? 42 : 24}
                  minSize={isMobile ? 25 : 16}
                  maxSize={isMobile ? 75 : 50}
                  className="overflow-hidden"
                >
                  <div className="h-full w-full border-white/[0.05] overflow-hidden flex flex-col">
                    {/* Brand DNA picker — when a product is selected, Generate
                        bypasses scrape/analyze and uses the curated brief. */}
                    <div className="shrink-0 px-4 pt-3 pb-2 border-b border-white/[0.05] bg-white/[0.02]">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <label className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-medium">
                          Brand DNA
                        </label>
                        <button
                          type="button"
                          onClick={() => navigate("/studio/products")}
                          className="text-[10px] text-primary hover:text-primary/80 transition-colors"
                        >
                          Manage →
                        </button>
                      </div>
                      <select
                        value={selectedProductId}
                        onChange={(e) => setSelectedProductId(e.target.value)}
                        disabled={isGenerating || isAnalyzing}
                        className="w-full text-xs bg-background/60 ring-1 ring-white/[0.08] rounded-md px-2.5 py-2 text-foreground focus:outline-none focus:ring-primary/40 disabled:opacity-50"
                      >
                        <option value="">
                          {dnaProducts.length === 0
                            ? "Skip — generate from URL or upload below"
                            : "— None (use URL / upload below) —"}
                        </option>
                        {dnaProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}{p.hero_image_url ? "" : " (no image)"}
                          </option>
                        ))}
                      </select>
                      {selectedProduct && (
                        <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
                          Using <span className="text-foreground">{selectedProduct.name}</span>
                          {brandDna?.brand_name ? ` for ${brandDna.brand_name}` : ""}
                          {activeMoodboard ? ` · mood: ${activeMoodboard.name}` : ""}.
                          Scrape skipped.
                        </p>
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <ConfigSidebar
                        contentType={contentType}
                        style={style}
                        aspectRatio={aspectRatio}
                        files={files}
                        url={url}
                        secondaryUrl={secondaryUrl}
                        tertiaryUrl={tertiaryUrl}
                        instructions={instructions}
                        isGenerating={isGenerating}
                        isAnalyzing={isAnalyzing}
                        hasGenerated={hasGenerated}
                        bypassSourceGuards={!!selectedProduct}
                        brief={brief}
                        sourceBrief={sourceBrief}
                        onContentTypeChange={handleTabChange}
                        onStyleChange={setStyle}
                        onAspectRatioChange={setAspectRatio}
                        onFilesChange={setFiles}
                        onUrlChange={setUrl}
                        onSecondaryUrlChange={setSecondaryUrl}
                        onTertiaryUrlChange={setTertiaryUrl}
                        onAnalyzeUrl={analyzeUrl}
                        onInstructionsChange={setInstructions}
                        onGenerate={handleGenerate}
                        onRegenerate={handleRegenerate}
                        onCancel={cancelPipeline}
                        isAuthenticated={isAuthenticated}
                      />
                    </div>
                  </div>
                </ResizablePanel>


                <ResizableHandle
                  withHandle
                  className="bg-white/[0.06] hover:bg-primary/40 transition-colors"
                />

                <ResizablePanel defaultSize={isMobile ? 58 : 76} minSize={isMobile ? 25 : 30} className="overflow-hidden">
                <motion.main
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.15 }}
                  className="h-full overflow-hidden flex flex-col min-w-0"
                >
                {/* Canvas Header */}
                <div className="shrink-0 px-5 pt-4 pb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary" />
                      <h2 className="font-display text-base font-bold text-foreground">Preview Canvas</h2>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      Your generated creative will appear here.
                    </p>
                  </div>
                </div>

                {/* Canvas surface */}
                <div className="flex-1 overflow-hidden px-5 pb-5">
                  <div className="h-full rounded-2xl ring-1 ring-white/[0.06] bg-gradient-to-br from-white/[0.025] to-transparent shadow-[inset_0_0_60px_-20px_rgba(0,0,0,0.45)] overflow-hidden relative">
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 opacity-[0.18]"
                      style={{
                        backgroundImage:
                          "radial-gradient(circle at 1px 1px, hsl(0 0% 100% / 0.18) 1px, transparent 0)",
                        backgroundSize: "22px 22px",
                      }}
                    />
                    <div className="pointer-events-none absolute top-4 right-4 z-20 flex flex-col items-end gap-2 max-w-[min(360px,calc(100%-2rem))]">
                      <PipelineProgress
                        state={pipeline}
                        autoRetry={autoRetry}
                        autoRetriedCounts={autoRetriedCounts}
                        maxAutoRetries={MAX_AUTO_RETRIES}
                        onRetryNow={(step) => triggerRetry(step)}
                        onCancelAutoRetry={cancelAutoRetry}
                        onCancel={cancelPipeline}
                        onDismiss={dismissPipeline}
                        onRestart={() => { dismissPipeline(); handleGenerate(); }}
                      />
                      <WatchdogDebugPanel
                        pipeline={pipeline}
                        budgets={STEP_BUDGETS_MS}
                        timings={timingsRef.current}
                        lastTrip={lastWatchdogTrip}
                        history={watchdogHistory}
                        onExportHistory={exportWatchdogHistory}
                        onClearHistory={clearWatchdogHistory}
                        autoRetryEnabled={autoRetryEnabled}
                        autoRetried={autoRetriedRef.current}
                        visible={debugVisible}
                        onClose={() => setDebugVisible(false)}
                      />
                      <StudioLogPanel visible={logPanelVisible} onClose={() => setLogPanelVisible(false)} />
                      <AuthDiagnosticsPanel
                        visible={authPanelVisible}
                        onClose={() => setAuthPanelVisible(false)}
                        isAuthenticated={isAuthenticated}
                        blockedStep={
                          pipeline.scrape === "error" || pipeline.scrape === "failed_fast" || pipeline.scrape === "needs_image_upload"
                            ? "scrape"
                            : pipeline.analyze === "error"
                            ? "analyze"
                            : pipeline.generate === "error"
                            ? "generate"
                            : null
                        }
                        onRetryStep={(step) => triggerRetry(step)}
                      />
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <AuthDiagnosticsToggleButton
                          open={authPanelVisible}
                          onClick={() => setAuthPanelVisible((v) => !v)}
                          alert={authAlert}
                        />
                        <StudioLogToggleButton
                          open={logPanelVisible}
                          onClick={() => setLogPanelVisible((v) => !v)}
                          errorCount={logErrorCount}
                        />
                        <button
                          type="button"
                          onClick={() => setDebugVisible((v) => !v)}
                          className="pointer-events-auto text-[10px] uppercase tracking-[0.16em] px-2.5 py-1 rounded-md bg-background/80 backdrop-blur ring-1 ring-white/[0.08] text-muted-foreground hover:text-foreground hover:ring-white/[0.16] transition-colors"
                          aria-pressed={debugVisible}
                        >
                          {debugVisible ? "Hide" : "Show"} watchdog debug
                        </button>
                      </div>
                    </div>
                    <AnimatePresence>
                      {(() => {
                        const scrapeFailed = pipeline.scrape === "error" || pipeline.scrape === "failed_fast" || pipeline.scrape === "needs_image_upload";
                        const analyzeFailed = pipeline.analyze === "error";
                        const generateFailed = pipeline.generate === "error";
                        const anyFailed = scrapeFailed || analyzeFailed || generateFailed;
                        if (!anyFailed || !pipeline.errorMessage) return null;
                        const failedStep: StepKey = scrapeFailed ? "scrape" : analyzeFailed ? "analyze" : "generate";
                        const retryLabel =
                          failedStep === "scrape" ? "Retry scrape"
                          : failedStep === "analyze" ? "Retry analysis"
                          : "Retry generation";
                        const isAutoRetrying = autoRetry?.step === failedStep;
                        const title =
                          generateFailed ? "Poster generation failed"
                          : analyzeFailed ? "Content analysis failed"
                          : pipeline.scrape === "needs_image_upload" ? "Product image needed"
                          : pipeline.scrape === "failed_fast" ? "Could not read this URL"
                          : "URL scrape failed";
                        return (
                          <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className="absolute top-4 right-4 z-30 w-[min(380px,calc(100%-2rem))]"
                            role="alert"
                            aria-live="assertive"
                          >
                            <div className="rounded-xl border border-destructive/40 bg-destructive/15 backdrop-blur-md shadow-lg overflow-hidden">
                              <div className="flex items-start gap-2.5 px-3 py-2.5">
                                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-destructive-foreground leading-tight">{title}</p>
                                  <p className="text-xs text-destructive-foreground/80 mt-0.5 line-clamp-2 break-words">
                                    {pipeline.errorMessage}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                    <button
                                      type="button"
                                      onClick={() => triggerRetry(failedStep)}
                                      className="inline-flex items-center gap-1 rounded-md bg-destructive/30 hover:bg-destructive/40 px-2 py-1 text-xs font-medium text-destructive-foreground transition-colors"
                                    >
                                      <RotateCw className="h-3 w-3" />
                                      {isAutoRetrying ? `Retry now (${autoRetry!.secondsLeft}s)` : retryLabel}
                                    </button>
                                    {isAutoRetrying && (
                                      <button
                                        type="button"
                                        onClick={cancelAutoRetry}
                                        className="rounded-md px-1.5 py-1 text-xs text-destructive-foreground/85 hover:text-destructive-foreground underline underline-offset-2"
                                      >
                                        Cancel
                                      </button>
                                    )}
                                    {failedStep === "scrape" && !isAutoRetrying && url.trim() && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          cancelAutoRetry();
                                          setPipeline((p) => ({ ...p, scrape: "pending", analyze: "pending", generate: "pending", errorMessage: undefined, controlledExitReason: null }));
                                          analyzeUrl(url, undefined, { forceRefresh: true, includeScreenshot: false });
                                        }}
                                        title="Skip the slow screenshot capture — fastest way to recover from a watchdog trip"
                                        className="inline-flex items-center gap-1 rounded-md bg-destructive/20 hover:bg-destructive/30 px-2 py-1 text-xs font-medium text-destructive-foreground transition-colors"
                                      >
                                        <ImageOff className="h-3 w-3" />
                                        Retry without screenshot
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => setErrorBannerExpanded((v) => !v)}
                                      aria-expanded={errorBannerExpanded}
                                      className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-destructive-foreground/85 hover:text-destructive-foreground"
                                    >
                                      More
                                      <ChevronDown className={`h-3 w-3 transition-transform ${errorBannerExpanded ? "rotate-180" : ""}`} />
                                    </button>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  aria-label="Dismiss error"
                                  onClick={() => resetPipeline()}
                                  className="text-destructive-foreground/70 hover:text-destructive-foreground -mr-0.5"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                              {errorBannerExpanded && (
                                <div className="border-t border-destructive/30 bg-destructive/[0.08] px-3 py-2.5 space-y-2.5">
                                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-destructive-foreground/85">
                                    <span className="opacity-75 uppercase tracking-wider">Auto-retry</span>
                                    {(["scrape", "analyze", "generate"] as StepKey[]).map((k) => (
                                      <label key={k} className="inline-flex items-center gap-1 cursor-pointer select-none">
                                        <input
                                          type="checkbox"
                                          checked={autoRetryEnabled[k]}
                                          onChange={(e) => {
                                            const next = e.target.checked;
                                            setAutoRetryEnabled((prev) => ({ ...prev, [k]: next }));
                                            if (!next && autoRetry?.step === k) cancelAutoRetry();
                                          }}
                                          className="h-3 w-3 accent-current cursor-pointer"
                                        />
                                        <span className="capitalize">{k}</span>
                                      </label>
                                    ))}
                                  </div>
                                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                                    {failedStep !== "scrape" && !isAutoRetrying && (
                                      <button
                                        type="button"
                                        onClick={() => { resetPipeline(); handleGenerate(); }}
                                        className="rounded-md px-2 py-1 bg-destructive/20 hover:bg-destructive/30 text-destructive-foreground"
                                      >
                                        Restart pipeline
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={copyErrorDetails}
                                      className="rounded-md px-2 py-1 bg-destructive/20 hover:bg-destructive/30 text-destructive-foreground"
                                    >
                                      Copy details
                                    </button>
                                    <button
                                      type="button"
                                      onClick={exportErrorDetails}
                                      className="rounded-md px-2 py-1 bg-destructive/20 hover:bg-destructive/30 text-destructive-foreground"
                                    >
                                      Export
                                    </button>
                                    <button
                                      type="button"
                                      onClick={shareErrorDetails}
                                      disabled={isSharingError}
                                      className="rounded-md px-2 py-1 bg-destructive/20 hover:bg-destructive/30 text-destructive-foreground disabled:opacity-60 disabled:cursor-wait"
                                    >
                                      {isSharingError ? "Creating link…" : "Share link"}
                                    </button>
                                    {sharedErrorUrl && (
                                      <a
                                        href={sharedErrorUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="rounded-md px-2 py-1 bg-destructive/20 hover:bg-destructive/30 text-destructive-foreground underline underline-offset-2"
                                      >
                                        Open link
                                      </a>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        );
                      })()}

                    </AnimatePresence>
                    <div className="relative h-full p-4">
                      <Suspense
                        fallback={
                          <div className="h-full flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                          </div>
                        }
                      >
                        <PreviewPanel
                          isGenerating={isGenerating}
                          hasGenerated={hasGenerated}
                          contentType={contentType}
                          style={style}
                          aspectRatio={aspectRatio}
                          files={files}
                          screenshotUrl={screenshotUrl}
                          brief={brief}
                          posters={posters}
                          videos={videos}
                          onPostersChange={setPosters}
                          onVideosChange={setVideos}
                          onRegenerateVariant={regeneratePosterVariant}
                          regeneratingVariants={regeneratingVariants}
                        />
                      </Suspense>
                    </div>
                  </div>
                </div>

                {/* Hero strip: live brief + variant picker — always visible.
                    Heavy diagnostics tuck behind a single toggle so the canvas
                    above reads as the hero. */}
                <div className="shrink-0 border-t border-white/[0.06] bg-background/40 max-h-[40vh] overflow-y-auto scrollbar-thin">
                  <div className="p-3 space-y-2">
                    <Suspense fallback={null}>
                      {sourceBrief && (
                        <SourceBriefPanel
                          brief={sourceBrief}
                          onRefresh={() => url.trim() && analyzeUrl(url, undefined, { forceRefresh: true, includeScreenshot: true })}
                          onUseScreenshot={() => sourceBrief.screenshot && setScreenshotUrl(sourceBrief.screenshot)}
                          busy={isAnalyzing}
                          stale={sourceMeta?.stale ?? false}
                        />
                      )}

                      {brief?.variants && brief.variants.length > 0 && (
                        <VariantPicker
                          variants={brief.variants}
                          activeAngle={brief.activeAngle ?? "clean-premium"}
                          onPick={(v) => {
                            setBrief((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    headline: v.headline,
                                    subheadline: v.subheadline,
                                    callToAction: v.callToAction,
                                    colorSuggestions:
                                      v.palette && v.palette.length
                                        ? v.palette
                                        : prev.colorSuggestions,
                                    activeAngle: v.angle,
                                  }
                                : prev,
                            );
                            toast({
                              title: "Angle applied",
                              description: v.headline,
                            });
                          }}
                        />
                      )}

                      {brief?.complianceFlags && brief.complianceFlags.length > 0 && (
                        <CompliancePanel flags={brief.complianceFlags} />
                      )}

                      <details className="group rounded-xl ring-1 ring-white/[0.05] bg-white/[0.015] open:bg-white/[0.025] open:ring-white/[0.08] transition-colors">
                        <summary className="cursor-pointer select-none px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground flex items-center justify-between">
                          <span>Diagnostics, prompt preview & brand DNA</span>
                          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="p-3 pt-0 space-y-2">
                          {sourceBrief && (
                            <BrandDnaPanel
                              sourceBrief={sourceBrief}
                              hasUpload={files.length > 0 || !!selectedProduct?.hero_image_url}
                              description={instructions}
                            />
                          )}

                          <ScrapeTimingReport />

                          {Array.isArray((brief as any)?.referenceImagesRanked) &&
                            (brief as any).referenceImagesRanked.length > 0 && (
                              <ReferenceImagesPanel
                                ranked={(brief as any).referenceImagesRanked}
                                uploadOverride={files.length > 0}
                              />
                            )}

                          {brief && (() => {
                            const rankedRefs: string[] = Array.isArray((brief as any)?.referenceImages)
                              ? ((brief as any).referenceImages as string[]).filter(Boolean)
                              : [];
                            const fallbackRefs: string[] = [
                              sourceBrief?.logo,
                              sourceBrief?.screenshot ?? undefined,
                              ...(sourceBrief?.images ?? []),
                            ].filter((v): v is string => typeof v === "string" && v.length > 0);
                            const refs = (rankedRefs.length ? rankedRefs : fallbackRefs).slice(0, 3);
                            const previewRefs = files.length > 0
                              ? [`upload://${files[0].name}`, ...refs].slice(0, 3)
                              : refs;
                            return (
                              <PromptPreviewPanel
                                referenceImages={previewRefs}
                                inputs={{
                                  brand: brief.brand,
                                  headline: brief.headline,
                                  subheadline: brief.subheadline,
                                  callToAction: brief.callToAction,
                                  keyPoints: brief.keyPoints,
                                  colorSuggestions: brief.colorSuggestions,
                                  style,
                                  tone: (brief as any)?.tone || style,
                                  contentType: contentType === "ad" ? "advertisement" : contentType,
                                  heroIsUpload: files.length > 0,
                                  hasHeroImage: files.length > 0 || refs.length > 0,
                                }}
                              />
                            );
                          })()}

                          <CreativeBriefPanel
                            contentType={contentType}
                            style={style}
                            aspectRatio={aspectRatio}
                            files={files}
                            url={url}
                            instructions={instructions}
                            brief={brief}
                          />
                        </div>
                      </details>
                    </Suspense>
                  </div>
                </div>
              </motion.main>

                </ResizablePanel>
              </ResizablePanelGroup>

              <Suspense fallback={null}>
                {pendingMerge && (
                  <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-background/70 backdrop-blur-sm p-3 md:p-6 overflow-y-auto">
                    <div className="w-full max-w-3xl my-auto">
                      <MergePreviewPanel
                        sources={pendingMerge.sources}
                        origins={pendingMerge.origins}
                        busy={isAnalyzing}
                        onContinue={continueAnalyzeWithMerge}
                        onCancel={cancelMergePreview}
                      />
                    </div>
                  </div>
                )}
              </Suspense>




            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Index;
