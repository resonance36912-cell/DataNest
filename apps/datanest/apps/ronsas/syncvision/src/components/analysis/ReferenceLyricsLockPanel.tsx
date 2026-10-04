import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Lock, Unlock, ShieldCheck, AlertTriangle, FileCheck2, Upload, ScanText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/contexts/ProjectContext";
import { computeAlignment, tokenize, type AlignmentMetrics } from "@/lib/lyrics-alignment";
import { sampleVideoFrames } from "@/lib/video-frame-sampler";

interface Props {
  asrText: string;
  onLockedLyrics?: (locked: string) => void;
}

/**
 * VERIFIED_LYRICS_LOCK panel — lets the user paste a verified lyric
 * reference, see the diff vs. ASR, and lock the transcript so downstream
 * generation can proceed.
 */
export default function ReferenceLyricsLockPanel({ asrText, onLockedLyrics }: Props) {
  const {
    projectId,
    file,
    referenceTranscript, setReferenceTranscript,
    transcriptLockStatus, setTranscriptLockStatus,
    transcriptQualityStatus, setTranscriptQualityStatus,
    sourceOfTruth, setSourceOfTruth,
    setAlignmentMetrics,
    verification, setVerification,
  } = useProject();

  const [draft, setDraft] = useState<string>(referenceTranscript || "");
  const [saving, setSaving] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<string>("");

  const metrics: AlignmentMetrics | null = useMemo(() => {
    const ref = (draft || referenceTranscript || "").trim();
    if (!ref || !asrText?.trim()) return null;
    return computeAlignment(asrText, ref);
  }, [draft, referenceTranscript, asrText]);

  const refLines = useMemo(
    () => (draft || referenceTranscript || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    [draft, referenceTranscript],
  );
  const asrLines = useMemo(
    () => (asrText || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    [asrText],
  );
  const finalLines = useMemo(() => {
    if (transcriptLockStatus !== "unlocked" && referenceTranscript) return referenceTranscript.split(/\r?\n/).filter(Boolean);
    return refLines.length > 0 ? refLines : asrLines;
  }, [transcriptLockStatus, referenceTranscript, refLines, asrLines]);

  const handleFileUpload = async (file: File) => {
    const text = await file.text();
    setDraft(text);
  };

  const handleExtractBurnedInLyrics = async () => {
    if (!file) {
      toast.error("Upload the video first", { description: "OCR needs the original MP4 to read burned-in lyrics." });
      return;
    }
    if (!file.type.startsWith("video/")) {
      toast.error("Audio-only file", { description: "Burned-in OCR works only on video files (MP4, MOV, WebM)." });
      return;
    }
    setOcrBusy(true);
    setOcrProgress("Sampling frames…");
    try {
      const frames = await sampleVideoFrames(file, { count: 14, maxWidth: 720, quality: 0.78 });
      setOcrProgress(`Reading text from ${frames.length} frames…`);
      const { data, error } = await supabase.functions.invoke("ocr-burned-lyrics", {
        body: { frames },
      });
      if (error) throw error;
      const lines: string[] = Array.isArray(data?.lines) ? data.lines : [];
      if (lines.length === 0) {
        toast.warning("No burned-in lyrics detected", {
          description: "The video doesn't appear to have visible on-screen lyrics. Paste them manually.",
        });
        return;
      }
      const joined = lines.join("\n");
      setDraft(joined);
      toast.success(`Extracted ${lines.length} lyric line${lines.length === 1 ? "" : "s"} via OCR`, {
        description: "Review, edit, then click Lock or Mark verified.",
      });
    } catch (e: any) {
      toast.error("OCR failed", { description: e?.message || String(e) });
    } finally {
      setOcrBusy(false);
      setOcrProgress("");
    }
  };

  const persist = async (
    nextStatus: "unlocked" | "locked" | "verified",
    refText: string | null,
    nextMetrics: AlignmentMetrics | null,
    provenance?: "verified_reference" | "asr",
  ) => {
    if (!projectId) return;
    setSaving(true);
    try {
      const source =
        nextStatus === "unlocked" ? "asr" : provenance ?? "verified_reference";
      const update: any = {
        reference_transcript: refText,
        transcript_lock_status: nextStatus,
        transcript_quality_status: nextMetrics?.status || "unknown",
        source_of_truth: source,
        alignment_metrics: nextMetrics
          ? {
              line_similarity: nextMetrics.line_similarity,
              coverage_ratio: nextMetrics.coverage_ratio,
              hallucinated_terms: nextMetrics.hallucinated_terms,
              missing_reference_lines: nextMetrics.missing_reference_lines,
              forbidden_phrase_hits: nextMetrics.forbidden_phrase_hits,
              downgrade_reasons: nextMetrics.downgrade_reasons,
              confidence_pct: nextMetrics.confidence_pct,
              status: nextMetrics.status,
            }
          : {},
      };
      const { error } = await supabase.from("projects").update(update).eq("id", projectId);
      if (error) throw error;
      setReferenceTranscript(refText);
      setTranscriptLockStatus(nextStatus);
      setTranscriptQualityStatus((nextMetrics?.status as any) || "unknown");
      setSourceOfTruth(source);
      setAlignmentMetrics(update.alignment_metrics);
      if (nextStatus !== "unlocked" && refText) {
        onLockedLyrics?.(refText);
        if (verification) setVerification({ ...verification, verified_lyrics: refText });
      }
    } catch (e: any) {
      toast.error("Failed to save reference lyrics", { description: e.message || String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleLock = async () => {
    const ref = draft.trim();
    if (!ref) {
      toast.error("Paste or upload reference lyrics first.");
      return;
    }
    const m = computeAlignment(asrText, ref);
    await persist("locked", ref, m, "verified_reference");
    toast.success(`Transcript locked. Final lyrics = verified reference (${m.confidence_pct}% similar to ASR).`);
  };

  const handleVerify = async () => {
    const hasReference = Boolean(draft.trim() || referenceTranscript);
    const ref = draft.trim() || referenceTranscript || asrText?.trim() || "";
    if (!ref) {
      toast.error("Nothing to verify yet", { description: "Run transcription or paste reference lyrics first." });
      return;
    }
    const m = metrics ?? (hasReference && asrText?.trim() ? computeAlignment(asrText, ref) : null);

    // Block ASR-only verification when ASR quality is failing
    const asrFailing =
      transcriptQualityStatus === "failed" ||
      (verification && (verification as any).final_status === "failed");
    if (!hasReference && asrFailing) {
      toast.error("ASR quality too low to verify", {
        description: "Paste a verified reference — transcription has forbidden phrases or critical hallucinations.",
      });
      return;
    }

    const provenance: "verified_reference" | "asr" = hasReference ? "verified_reference" : "asr";
    await persist("verified", ref, m, provenance);

    if (!hasReference) {
      toast.warning("Verified using ASR text only", {
        description: "No reference lyrics were provided. Downstream scenes will be built from the raw transcription.",
      });
    } else {
      toast.success("Transcript marked verified. Downstream generation unlocked.");
    }
  };

  const handleUnlock = async () => {
    await persist("unlocked", referenceTranscript, null);
    toast.info("Transcript unlocked. ASR text restored as the working lyrics.");
  };

  const statusBadge = () => {
    if (transcriptLockStatus === "verified") {
      return <Badge className="bg-success/15 text-success border-success/30"><ShieldCheck className="h-3 w-3 mr-1" /> Verified</Badge>;
    }
    if (transcriptLockStatus === "locked") {
      return <Badge className="bg-primary/15 text-primary border-primary/30"><Lock className="h-3 w-3 mr-1" /> Locked to reference</Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground"><Unlock className="h-3 w-3 mr-1" /> Unlocked (ASR only)</Badge>;
  };

  const qualityBadge = () => {
    const s = metrics?.status || transcriptQualityStatus;
    if (s === "good") return <Badge className="bg-success/15 text-success border-success/30">Good</Badge>;
    if (s === "needs_review") return <Badge className="bg-warning/15 text-warning border-warning/30">Needs review</Badge>;
    if (s === "failed") return <Badge variant="destructive">Failed</Badge>;
    return <Badge variant="outline">Unknown</Badge>;
  };

  const refTokenSet = useMemo(() => new Set(tokenize((draft || referenceTranscript || ""))), [draft, referenceTranscript]);
  const asrTokenSet = useMemo(() => new Set(tokenize(asrText || "")), [asrText]);

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FileCheck2 className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Verified Lyrics Lock</h3>
          {statusBadge()}
          {qualityBadge()}
          {transcriptLockStatus !== "unlocked" && (
            sourceOfTruth === "verified_reference" ? (
              <Badge
                className="bg-success/15 text-success border-success/30 text-[10px]"
                title="Final lyrics came from your pasted/uploaded reference. ASR was used only for timing."
              >
                <ShieldCheck className="h-3 w-3 mr-1" /> Provenance: Verified reference
              </Badge>
            ) : (
              <Badge
                className="bg-warning/15 text-warning border-warning/30 text-[10px]"
                title="No reference lyrics were provided. Final lyrics come from raw ASR — downstream scenes may inherit transcription errors."
              >
                <AlertTriangle className="h-3 w-3 mr-1" /> Provenance: ASR only
              </Badge>
            )
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            id="ref-lyrics-upload"
            accept=".txt,.md,.lrc,text/plain"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleExtractBurnedInLyrics}
            disabled={ocrBusy || !file || !file.type.startsWith("video/")}
            className="gap-1.5"
            title={
              !file
                ? "Upload the video first"
                : !file.type.startsWith("video/")
                ? "OCR works only on video files"
                : "Sample frames and OCR burned-in lyric captions"
            }
          >
            {ocrBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanText className="h-3.5 w-3.5" />}
            {ocrBusy ? (ocrProgress || "Reading…") : "Extract from video (OCR)"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => document.getElementById("ref-lyrics-upload")?.click()} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> Upload .txt
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Paste verified lyrics (ChatGPT reference, official lyric sheet, your own transcription) here. When locked, these
        words become the source of truth — ASR is used only for timing. Downstream scene generation is blocked until the
        transcript is <strong>verified</strong> or quality is <strong>good</strong>.
      </p>

      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={"Paste verified lyrics here, one line per lyric line.\n\ne.g.\nI came up out of that pit\nMud on my name, still I drip\nCarried my doubt on my hip"}
        className="min-h-[160px] font-mono text-xs bg-background"
      />

      {metrics && (
        <div className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div><span className="text-muted-foreground">Line similarity:</span> <strong>{(metrics.line_similarity * 100).toFixed(0)}%</strong></div>
            <div><span className="text-muted-foreground">Coverage:</span> <strong>{(metrics.coverage_ratio * 100).toFixed(0)}%</strong></div>
            <div><span className="text-muted-foreground">Hallucinated terms:</span> <strong>{metrics.hallucinated_terms.length}</strong></div>
            <div><span className="text-muted-foreground">Missing ref lines:</span> <strong>{metrics.missing_reference_lines.length}</strong></div>
          </div>
          {(metrics.hallucinated_terms.length > 0 || metrics.forbidden_phrase_hits.length > 0 || metrics.downgrade_reasons.length > 0) && (
            <div className="space-y-1">
              {metrics.hallucinated_terms.length > 0 && (
                <div className="flex items-start gap-1.5 text-[11px] text-warning">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                  <span>ASR added risk terms not in reference: {metrics.hallucinated_terms.join(", ")}</span>
                </div>
              )}
              {metrics.forbidden_phrase_hits.length > 0 && (
                <div className="flex items-start gap-1.5 text-[11px] text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                  <span>Forbidden phrases found in ASR: {metrics.forbidden_phrase_hits.join(" · ")}</span>
                </div>
              )}
              {metrics.downgrade_reasons.length > 0 && (
                <div className="text-[10px] text-muted-foreground">
                  {metrics.downgrade_reasons.join(" — ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3-column compare */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <Column title="Verified Reference" lines={refLines} highlight={(t) => !asrTokenSet.has(t.toLowerCase())} highlightTone="success" />
        <Column title="ASR Guess" lines={asrLines} highlight={(t) => {
          const lc = t.toLowerCase().replace(/[^a-z']/g, "");
          if (!lc) return false;
          // Highlight tokens NOT present in reference
          return refTokenSet.size > 0 && !refTokenSet.has(lc);
        }} highlightTone="danger" />
        <Column title="Final Locked Lyrics" lines={finalLines} highlight={() => false} highlightTone="success" />
      </div>

      <div className="flex flex-wrap items-center gap-2 justify-end">
        {transcriptLockStatus !== "unlocked" && (
          <Button variant="ghost" size="sm" onClick={handleUnlock} disabled={saving}>
            Unlock
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleLock} disabled={saving || !draft.trim()} className="gap-1.5">
          <Lock className="h-3.5 w-3.5" /> Lock to reference
        </Button>
        <Button
          size="sm"
          onClick={handleVerify}
          disabled={saving || metrics?.status === "failed" || (!draft.trim() && !referenceTranscript && !asrText?.trim())}
          className="gap-1.5"
          title={
            metrics?.status === "failed"
              ? "Resolve forbidden phrases / low similarity first"
              : !draft.trim() && !referenceTranscript
              ? "Mark ASR transcript verified as-is (no reference provided)"
              : "Mark transcript verified — unlocks downstream generation"
          }
        >
          <ShieldCheck className="h-3.5 w-3.5" /> Mark verified
        </Button>
      </div>
    </div>
  );
}

function Column({
  title,
  lines,
  highlight,
  highlightTone,
}: {
  title: string;
  lines: string[];
  highlight: (token: string) => boolean;
  highlightTone: "danger" | "success";
}) {
  const hClass = highlightTone === "danger"
    ? "bg-destructive/20 text-destructive-foreground rounded px-0.5"
    : "bg-success/15 text-success rounded px-0.5";
  return (
    <div className="rounded-md border border-border/50 bg-secondary/30 p-2 overflow-hidden">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{title}</div>
      <div className="max-h-[260px] overflow-y-auto font-mono text-[11px] leading-snug whitespace-pre-wrap">
        {lines.length === 0 ? (
          <span className="italic text-muted-foreground">(empty)</span>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="py-0.5">
              {line.split(/(\s+)/).map((tok, j) => {
                if (/^\s+$/.test(tok)) return tok;
                const bare = tok.toLowerCase().replace(/[^a-z']/g, "");
                return bare && highlight(bare) ? (
                  <span key={j} className={hClass}>{tok}</span>
                ) : (
                  <span key={j}>{tok}</span>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
