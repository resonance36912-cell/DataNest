import { useState } from "react";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { ArrowLeft, ArrowRight, Music, Loader2, CheckCircle2, AlertTriangle, AudioWaveform, Download, FileJson, FileText, FileSpreadsheet, Save, Zap, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import WaveformPreview from "@/components/analysis/WaveformPreview";
import StarRating from "@/components/StarRating";
import AcceptVersionButton from "@/components/AcceptVersionButton";
import SaveProgressButton from "@/components/SaveProgressButton";
import CinematicProgress, { type StageState } from "@/components/analysis/CinematicProgress";

import { useAnalysisEngine } from "@/hooks/useAnalysisEngine";
import { useProject } from "@/contexts/ProjectContext";
import { useReanalyze } from "@/hooks/useReanalyze";
import { downloadConfidenceJSON, downloadConfidencePDF, downloadConfidenceCSV, saveConfidenceReport, fetchSavedConfidenceReportJSON, type ReportBranding, type SavedConfidenceReport } from "@/lib/confidenceReport";
import LyricsPanel from "@/components/analysis/LyricsPanel";
import MusicAnalysisPanel from "@/components/analysis/MusicAnalysisPanel";
import SegmentationSection from "@/components/analysis/SegmentationSection";
import SavedReportsPanel from "@/components/analysis/SavedReportsPanel";
import ReportBrandingDialog, { loadStoredBranding, saveStoredBranding } from "@/components/analysis/ReportBrandingDialog";
import BpmTempoCharts from "@/components/analysis/BpmTempoCharts";
import ReferenceLyricsLockPanel from "@/components/analysis/ReferenceLyricsLockPanel";
import BrollAutoDetectPanel from "@/components/analysis/BrollAutoDetectPanel";
import TranscriptionQualityPanel from "@/components/analysis/TranscriptionQualityPanel";
import RunHistoryPanel from "@/components/analysis/RunHistoryPanel";
import CacheStatsPanel from "@/components/analysis/CacheStatsPanel";

interface StepProps { onNext: () => void; onPrev: () => void; isFirst: boolean; isLast: boolean; }

function CacheBadge({ debug, label }: { debug?: import("@/contexts/ProjectContext").VerificationResult["cache_debug"]; label: string }) {
  const badge = (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success cursor-help">
      <CheckCircle2 className="h-3 w-3" /> {label}
    </span>
  );
  if (!debug) return badge;
  const shortHash = `${debug.content_hash.slice(0, 12)}…${debug.content_hash.slice(-6)}`;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs space-y-1 font-mono">
          <div className="font-sans font-semibold text-[11px] uppercase tracking-wide text-muted-foreground">Cache hit reason</div>
          <div><span className="text-muted-foreground">mode:</span> {debug.mode}</div>
          <div><span className="text-muted-foreground">model:</span> {debug.model}</div>
          <div className="break-all"><span className="text-muted-foreground">hash:</span> {shortHash}</div>
          {typeof debug.hit_count === "number" && (
            <div><span className="text-muted-foreground">reused:</span> {debug.hit_count}×</div>
          )}
          {debug.created_at && (
            <div><span className="text-muted-foreground">stored:</span> {new Date(debug.created_at).toLocaleString()}</div>
          )}
          <div><span className="text-muted-foreground">source:</span> {debug.source === "hit" ? "cache hit (no LLM call)" : "fresh store"}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function AnalysisStep({ onNext, onPrev }: StepProps) {
  const engine = useAnalysisEngine();
  const { file, transcriptQualityStatus } = useProject();
  const { reanalyze, reanalyzing, clearCache, clearing } = useReanalyze();
  const [savedRefreshKey, setSavedRefreshKey] = useState(0);
  const [branding, setBranding] = useState<ReportBranding>(() => loadStoredBranding());

  const buildExportInput = (useEdited: boolean) => {
    const editedBpmNum = engine.bpm === "" ? null : Number(engine.bpm);
    return {
      projectName: branding.projectName ?? null,
      fileName: file?.name ?? null,
      transcription: engine.transcription!,
      verification: engine.verification,
      useEdited,
      editedLyrics: useEdited ? engine.lyrics : null,
      editedBpm: useEdited ? (Number.isFinite(editedBpmNum as number) ? editedBpmNum : null) : null,
      editedInstruments: useEdited ? (engine.verification?.instruments ?? null) : null,
      segments: engine.audioSegments ?? null,
      passStatus: engine.passStatus ?? null,
      branding,
    };
  };

  const handleExport = (format: "json" | "pdf" | "csv", useEdited = false) => {
    if (!engine.transcription) return;
    try {
      const input = buildExportInput(useEdited);
      const filename = format === "json"
        ? downloadConfidenceJSON(input)
        : format === "pdf"
        ? downloadConfidencePDF(input)
        : downloadConfidenceCSV(input);
      toast.success(`Confidence report downloaded`, { description: filename });
    } catch (err) {
      toast.error("Failed to export report", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleSave = async (format: "json" | "pdf" | "csv", useEdited = false) => {
    if (!engine.transcription) return;
    const t = toast.loading(`Saving ${format.toUpperCase()} report to your account...`);
    try {
      const saved = await saveConfidenceReport(buildExportInput(useEdited), format, engine.projectId ?? null);
      toast.success("Report saved to your account", { id: t, description: saved.file_name });
      setSavedRefreshKey(k => k + 1);
    } catch (err) {
      toast.error("Failed to save report", { id: t, description: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleLoadSavedReport = async (report: SavedConfidenceReport) => {
    const t = toast.loading(`Loading ${report.file_name}...`);
    try {
      const data = await fetchSavedConfidenceReportJSON(report);

      // Reconstruct a TranscriptionResult from the per-word table
      const wordsArr = (data.words ?? []).map(w => ({
        text: w.text,
        start: w.start_sec,
        end: w.end_sec,
        confidence: w.confidence_pct != null ? w.confidence_pct / 100 : undefined,
      }));
      const fullText = data.edited?.lyrics ?? wordsArr.map(w => w.text).join(" ").trim();
      engine.setTranscription({
        text: fullText,
        words: wordsArr,
        audio_events: [],
        quality: {
          has_content: fullText.length > 0,
          has_timestamps: wordsArr.length > 0,
          word_count: wordsArr.length || data.summary.word_count || 0,
          char_count: fullText.length,
        },
      });

      // Synthesize a VerificationResult so downstream UI / exports stay consistent
      const bpmNum = data.summary.bpm ?? data.edited?.bpm ?? 0;
      engine.setVerification({
        verified_lyrics: data.edited?.lyrics ?? fullText,
        bpm: typeof bpmNum === "number" ? bpmNum : Number(bpmNum) || 0,
        music_key: "",
        tempo_feel: "",
        mood: "",
        energy: "",
        instruments: data.edited?.instruments ?? [],
        confidence_lyrics: data.summary.lyrics_confidence_pct ?? 0,
        confidence_bpm: data.summary.bpm_confidence_pct ?? 0,
        confidence_instruments: data.summary.instruments_confidence_pct ?? 0,
        flagged_issues: data.flagged_issues ?? [],
        corrections_made: [],
        pass_1: data.pass_status.find(p => p.pass === "pass_1")?.status ?? "complete",
        pass_2: data.pass_status.find(p => p.pass === "pass_2")?.status ?? "complete",
        pass_3: data.pass_status.find(p => p.pass === "pass_3")?.status ?? "complete",
      });

      // Editable fields
      engine.setLyrics(data.edited?.lyrics ?? fullText);
      engine.setBpm(bpmNum != null ? String(bpmNum) : "");

      // Pass status badges
      const ps: Record<string, string> = {};
      for (const p of data.pass_status ?? []) ps[p.pass] = p.status;
      engine.setPassStatus(ps);

      // Segments
      const segs = (data.segments ?? []).map(s => ({
        index: s.index,
        start_sec: s.start_sec,
        end_sec: s.end_sec,
        duration_sec: s.duration_sec,
        lyrics: s.lyrics ?? undefined,
      }));
      engine.setAudioSegments(segs);
      engine.setSegmentsReady(segs.length > 0);

      // Restore branding block if present so re-exporting reproduces the same PDF
      if (data.branding) {
        const b: ReportBranding = {
          projectName: data.branding.projectName ?? null,
          watermarkText: data.branding.watermarkText ?? null,
          logoDataUrl: data.branding.logoDataUrl ?? null,
          watermarkOpacity: data.branding.watermarkOpacity ?? null,
          watermarkFontSize: data.branding.watermarkFontSize ?? null,
          watermarkRotation: data.branding.watermarkRotation ?? null,
          logoSize: data.branding.logoSize ?? null,
          logoPadding: data.branding.logoPadding ?? null,
          pageSize: data.branding.pageSize ?? null,
        };
        setBranding(b);
        saveStoredBranding(b);
      }

      toast.success("Saved report loaded", {
        id: t,
        description: `${data.summary.word_count} words • ${segs.length} segments • ${data.source}`,
      });
    } catch (err) {
      toast.error("Failed to load saved report", { id: t, description: err instanceof Error ? err.message : String(err) });
    }
  };


  const getPassIcon = (status: string) => {
    if (status === "complete") return <CheckCircle2 className="h-3.5 w-3.5" />;
    if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    if (status === "failed") return <AlertTriangle className="h-3.5 w-3.5" />;
    return null;
  };
  const getPassStyle = (status: string) => {
    if (status === "complete") return "bg-success/10 text-success";
    if (status === "running") return "bg-primary/10 text-primary";
    if (status === "failed") return "bg-destructive/10 text-destructive";
    return "bg-muted text-muted-foreground";
  };

  if (!engine.transcription) {
    return (
      <div className="glass-card flex flex-col items-center gap-4 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><Music className="h-6 w-6" /></div>
        <p className="text-muted-foreground max-w-md">No transcription available. Please go back and upload a track first.</p>
        <Button variant="outline" onClick={onPrev} className="gap-2 border-border text-foreground hover:bg-secondary"><ArrowLeft className="h-4 w-4" /> Back to Upload</Button>
      </div>
    );
  }

  // Cinematic 5-stage pipeline banner — advances as real signals arrive.
  const pipelineStages: Array<{ label: string; state: StageState }> = (() => {
    const hasWave = !!engine.transcription;
    const hasBeats = !!engine.verification?.bpm;
    const hasSections = !!(engine.verification as any)?.sections?.length || !!engine.verification?.music_key;
    const hasScenes = !!engine.verification && !engine.verifying;
    const ready = !!engine.verification && !engine.verifying;
    const step = (done: boolean, active: boolean): StageState => (done ? "done" : active ? "active" : "pending");
    return [
      { label: "Reading waveform", state: step(hasWave, !hasWave) },
      { label: "Mapping beats", state: step(hasBeats, hasWave && !hasBeats) },
      { label: "Detecting song sections", state: step(hasSections, hasBeats && !hasSections) },
      { label: "Building scene ideas", state: step(hasScenes, hasSections && !hasScenes) },
      { label: "Preparing storyboard", state: step(ready && !engine.verifying, hasScenes && engine.verifying) },
    ];
  })();

  return (
    <div className="space-y-6">
      <CinematicProgress stages={pipelineStages} />

      {/* Verification passes */}
      <div className="glass-card p-6">
        <h2 className="text-2xl font-bold mb-2">Analysis Results</h2>
        <p className="text-muted-foreground mb-4">
          {engine.verifying ? "Running multi-pass verification..." : engine.verification ? "Multi-pass verification complete. Review and edit before continuing." : "Preparing verification..."}
        </p>
        <div className="flex flex-wrap gap-3">
          {["Pass 1: Transcription", "Pass 2: Verification", "Pass 3: Confidence"].map((pass, i) => {
            const key = `pass_${i + 1}`;
            const status = engine.passStatus[key] || "pending";
            return (
              <div key={pass} className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${getPassStyle(status)}`}>
                {getPassIcon(status)} {pass}
              </div>
            );
          })}
          {/* Waveform extraction status */}
          <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
            engine.peakData ? "bg-success/10 text-success" : engine.extractingPeaks ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}>
            {engine.extractingPeaks ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : engine.peakData ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
            <AudioWaveform className="h-3.5 w-3.5" /> Waveform
          </div>
        </div>
        {engine.verification?.cached && (
          <div className="flex items-center gap-3 mt-3">
            <CacheBadge debug={engine.verification?.cache_debug} label="Analysis result is cached" />
            <Button
              size="sm"
              variant="ghost"
              onClick={clearCache}
              disabled={clearing}
              className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Clear cache
            </Button>
          </div>
        )}
        {engine.peakData && (
          <p className="text-xs text-muted-foreground mt-2">
            {engine.peakData.peaks.length} peaks · {engine.peakData.silence_gaps.length} silence gaps · Boundaries will auto-refine to ±2s
          </p>
        )}
      </div>

      {/* Upgrade transcription quality banner */}
      {(() => {
        const showBanner = transcriptQualityStatus !== "good" && engine.transcription != null && !engine.verifying;
        if (!showBanner) return null;
        return (
          <div className="glass-card p-4 border-l-4 border-l-warning/60">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3 min-w-0">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm">Transcription quality can be improved</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Current status: <span className="font-medium text-warning capitalize">{transcriptQualityStatus.replace(/_/g, " ")}</span>.
                    Run the enhanced verification pass for higher lyric confidence and AI-powered suggestions.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {engine.verification?.cached && (
                  <CacheBadge debug={engine.verification?.cache_debug} label="Cached" />
                )}
                <Button
                  size="sm"
                  onClick={reanalyze}
                  disabled={reanalyzing}
                  className="gap-2 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {reanalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  {reanalyzing ? "Upgrading…" : "Upgrade transcription quality"}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Waveform visualization */}
      {engine.peakData && (
        <SectionErrorBoundary name="Waveform Preview">
          <WaveformPreview peakData={engine.peakData} />
        </SectionErrorBoundary>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionErrorBoundary name="Lyrics Panel">
          <LyricsPanel lyrics={engine.lyrics} editingLyrics={engine.editingLyrics} verifying={engine.verifying}
            verification={engine.verification} onLyricsChange={engine.setLyrics} onToggleEdit={engine.toggleEditLyrics}
            vocalClassifications={engine.vocalClassifications} classifying={engine.classifying}
            onClassificationChange={engine.updateClassification} />
        </SectionErrorBoundary>
        <SectionErrorBoundary name="Music Analysis">
          <MusicAnalysisPanel verification={engine.verification} verifying={engine.verifying}
            bpm={engine.bpm} onBpmChange={engine.setBpm} onReVerify={engine.runVerification} />
        </SectionErrorBoundary>
      </div>

      <SectionErrorBoundary name="Verified Lyrics Lock">
        <ReferenceLyricsLockPanel
          asrText={engine.transcription?.text || engine.lyrics || ""}
          onLockedLyrics={(locked) => engine.setLyrics(locked)}
        />
      </SectionErrorBoundary>

      {engine.verification && (
        <SectionErrorBoundary name="Tempo Visualization">
          <BpmTempoCharts verification={engine.verification} bpm={engine.bpm} />
        </SectionErrorBoundary>
      )}

      {engine.transcription && (
        <SectionErrorBoundary name="Transcription Quality Report">
          <TranscriptionQualityPanel
            transcription={engine.transcription}
            verification={engine.verification}
            segments={engine.audioSegments ?? null}
          />
        </SectionErrorBoundary>
      )}

      <SectionErrorBoundary name="Run History">
        <RunHistoryPanel />
      </SectionErrorBoundary>

      <SectionErrorBoundary name="Cache Stats">
        <CacheStatsPanel />
      </SectionErrorBoundary>

      {/* Rating + transcript info */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <StarRating label="Transcription quality:" value={engine.transcriptionRating} onChange={engine.setTranscriptionRating} />
          <div className="flex items-center gap-2">
          <ReportBrandingDialog onChange={setBranding} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-border text-foreground hover:bg-secondary"
                disabled={!engine.transcription}
                title="Export transcription & BPM confidence scores"
              >
                <Download className="h-3.5 w-3.5" /> Export confidence
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs">
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Original engine output</div>
              <DropdownMenuItem onClick={() => handleExport("json", false)} className="gap-2">
                <FileJson className="h-3.5 w-3.5" /> Download JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("pdf", false)} className="gap-2">
                <FileText className="h-3.5 w-3.5" /> Download PDF report
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("csv", false)} className="gap-2">
                <FileSpreadsheet className="h-3.5 w-3.5" /> Download word CSV
              </DropdownMenuItem>
              <div className="mt-1 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground border-t border-border">Verified / edited values</div>
              <DropdownMenuItem onClick={() => handleExport("json", true)} className="gap-2" disabled={!engine.verification}>
                <FileJson className="h-3.5 w-3.5" /> Download verified JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("pdf", true)} className="gap-2" disabled={!engine.verification}>
                <FileText className="h-3.5 w-3.5" /> Download verified PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("csv", true)} className="gap-2" disabled={!engine.verification}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Download verified word CSV
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Save to account</div>
              <DropdownMenuItem onClick={() => handleSave("json", false)} className="gap-2">
                <Save className="h-3.5 w-3.5" /> Save JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSave("pdf", false)} className="gap-2">
                <Save className="h-3.5 w-3.5" /> Save PDF report
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSave("csv", false)} className="gap-2">
                <Save className="h-3.5 w-3.5" /> Save word CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSave("pdf", true)} className="gap-2" disabled={!engine.verification}>
                <Save className="h-3.5 w-3.5" /> Save verified PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Raw: {engine.transcription.quality.word_count} words, {engine.transcription.quality.char_count} chars</span>
          <span>Timestamps: {engine.transcription.quality.has_timestamps ? "✓" : "✗"}</span>
          {engine.transcription.audio_events.length > 0 && (
            <span>Audio events: {engine.transcription.audio_events.map(e => e.type).join(", ")}</span>
          )}
        </div>
        {(() => {
          const q = engine.transcription.quality;
          const hasSignal =
            q.coverage_ratio != null ||
            q.still_looped != null ||
            q.coverage_warning ||
            q.used_fallback ||
            q.provider_agreement != null ||
            q.hallucination_risk ||
            q.final_status != null;
          if (!hasSignal) return null;
          const cov = q.coverage_ratio;
          const covPct = cov != null ? Math.round(cov * 100) : null;
          const agreePct = q.provider_agreement != null ? Math.round(q.provider_agreement * 100) : null;
          // Prefer the server-computed final_status; fall back to local rules
          // for older cached payloads that predate Phase 1.
          const status: "good" | "rescued" | "needs_review" | "failed" =
            q.final_status ??
            (q.still_looped === true
              ? "failed"
              : q.hallucination_risk
                ? "needs_review"
                : q.coverage_warning === true || (cov != null && cov < 0.6)
                  ? "needs_review"
                  : q.used_fallback === true || (cov != null && cov < 0.9)
                    ? "rescued"
                    : "good");
          const tone =
            status === "failed"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : status === "needs_review"
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : status === "rescued"
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : "border-success/40 bg-success/10 text-success";
          const label =
            status === "failed"
              ? "Transcript quality: failed"
              : status === "needs_review"
                ? "Transcript quality: needs review"
                : status === "rescued"
                  ? "Transcript quality: rescued"
                  : "Transcript quality: good";
          const Icon = status === "good" ? CheckCircle2 : status === "rescued" ? AudioWaveform : AlertTriangle;
          return (
            <div className={`flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-[11px] ${tone}`}>
              <span className="inline-flex items-center gap-1 font-medium"><Icon className="h-3 w-3" />{label}</span>
              {covPct != null && <span className="opacity-90">Coverage: {covPct}%</span>}
              {agreePct != null && (
                <span
                  className="opacity-90"
                  title="Token agreement between primary and secondary ASR"
                >
                  Provider agreement: {agreePct}%
                </span>
              )}
              {q.still_looped && <span className="rounded bg-destructive/20 px-1.5 py-0.5">loop detected</span>}
              {q.coverage_warning && <span className="rounded bg-warning/20 px-1.5 py-0.5">low coverage</span>}
              {q.hallucination_risk && (
                <span
                  className="rounded bg-destructive/20 px-1.5 py-0.5"
                  title={
                    q.hallucination_terms && q.hallucination_terms.length > 0
                      ? `Single-source terms: ${q.hallucination_terms.join(", ")}`
                      : "One ASR contains risk-lexicon terms the other does not"
                  }
                >
                  hallucination risk
                </span>
              )}
              {q.used_fallback && <span className="rounded bg-foreground/10 px-1.5 py-0.5">fallback model</span>}
            </div>
          );
        })()}

        {engine.activeTranscriptVersionId && (
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 inline mr-1 text-success" /> Transcript version persisted
            </div>
            <AcceptVersionButton projectId={engine.projectId} versionId={engine.activeTranscriptVersionId} />
          </div>
        )}
      </div>

      <SectionErrorBoundary name="Saved Reports">
        <SavedReportsPanel projectId={engine.projectId ?? null} refreshKey={savedRefreshKey} onLoad={handleLoadSavedReport} />
      </SectionErrorBoundary>

      {/* Segmentation */}
      {engine.verification && (
        <SectionErrorBoundary name="Segmentation">
          <SegmentationSection segmenting={engine.segmenting} segmentsReady={engine.segmentsReady}
            segmentProgress={engine.segmentProgress} segmentWarnings={engine.segmentWarnings}
            audioSegments={engine.audioSegments} onSegment={engine.segmentAudio}
            peakData={engine.peakData}
            words={engine.transcription?.words as Array<{ start: number; end: number; text?: string }> | undefined}
            audioDuration={engine.peakData?.duration_sec} />
        </SectionErrorBoundary>
      )}

      {engine.segmentsReady && engine.audioSegments?.length > 0 && (
        <SectionErrorBoundary name="Auto B-Roll">
          <BrollAutoDetectPanel />
        </SectionErrorBoundary>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onPrev} className="gap-2 border-border text-foreground hover:bg-secondary"><ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back</span></Button>
          <SaveProgressButton stepIndex={1} />
        </div>
        <Button onClick={onNext} disabled={!engine.verification || engine.verifying || !engine.segmentsReady} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto">
          <span className="sm:hidden">Next</span><span className="hidden sm:inline">Build Character</span> <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
