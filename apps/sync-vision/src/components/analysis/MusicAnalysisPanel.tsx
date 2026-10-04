import { Gauge, Music, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getConfidenceBadge } from "./LyricsPanel";
import type { VerificationResult } from "@/contexts/ProjectContext";

// Confidence tier helper for editable fields. Verification confidence values
// are stored on a 0-100 scale (matching getConfidenceBadge thresholds).
function fieldConfidenceClasses(score: number | null | undefined) {
  if (score == null) return { ring: "", bg: "", hint: null as null | { tone: "warn" | "danger"; text: string } };
  if (score >= 90) return { ring: "ring-1 ring-success/30 focus-visible:ring-success/50", bg: "bg-success/5", hint: null };
  if (score >= 70) return { ring: "ring-1 ring-warning/40 focus-visible:ring-warning/60", bg: "bg-warning/5", hint: { tone: "warn" as const, text: `Borderline confidence (${score}%) — double-check this value before continuing.` } };
  return { ring: "ring-2 ring-destructive/50 focus-visible:ring-destructive/70", bg: "bg-destructive/5", hint: { tone: "danger" as const, text: `Low confidence (${score}%) — verify this value before continuing.` } };
}

interface MusicAnalysisPanelProps {
  verification: VerificationResult | null;
  verifying: boolean;
  bpm: string;
  onBpmChange: (v: string) => void;
  onReVerify: () => void;
}

export default function MusicAnalysisPanel({ verification, verifying, bpm, onBpmChange, onReVerify }: MusicAnalysisPanelProps) {
  return (
    <div className="space-y-4">
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Gauge className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Music Analysis</h3>
        </div>
        {verifying ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Analyzing music...
          </div>
        ) : verification ? (
          (() => {
            const bpmConf = fieldConfidenceClasses(verification.confidence_bpm);
            return (
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-xs text-muted-foreground">BPM</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      value={bpm}
                      onChange={(e) => onBpmChange(e.target.value)}
                      className={`w-20 bg-secondary border-border text-foreground transition-shadow ${bpmConf.ring} ${bpmConf.bg}`}
                    />
                    {getConfidenceBadge(verification.confidence_bpm)}
                  </div>
                  {bpmConf.hint && (
                    <p className={`mt-1 flex items-center gap-1 text-[10px] ${bpmConf.hint.tone === "danger" ? "text-destructive" : "text-warning"}`}>
                      <AlertTriangle className="h-2.5 w-2.5" /> {bpmConf.hint.text}
                    </p>
                  )}
                </div>
                <div><label className="text-xs text-muted-foreground">Key</label><p className="mt-1 font-medium">{verification.music_key}</p></div>
                <div><label className="text-xs text-muted-foreground">Tempo Feel</label><p className="mt-1 font-medium">{verification.tempo_feel}</p></div>
                <div><label className="text-xs text-muted-foreground">Mood</label><p className="mt-1 font-medium">{verification.mood}</p></div>
                <div><label className="text-xs text-muted-foreground">Energy</label><p className="mt-1 font-medium">{verification.energy}</p></div>
              </div>
            );
          })()
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">Waiting for verification...</p>
        )}
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Music className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Instruments</h3>
          {verification && getConfidenceBadge(verification.confidence_instruments)}
        </div>
        {verifying ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Detecting instruments...
          </div>
        ) : verification ? (
          <div className="flex flex-wrap gap-2">
            {verification.instruments.map((inst) => (
              <Badge key={inst} variant="outline" className="border-border text-secondary-foreground bg-secondary">{inst}</Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center">Waiting for verification...</p>
        )}
      </div>

      {verification && (
        <Button variant="outline" size="sm" onClick={onReVerify} disabled={verifying} className="w-full gap-1.5 border-border text-foreground hover:bg-secondary">
          {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Re-verify Analysis
        </Button>
      )}
    </div>
  );
}
