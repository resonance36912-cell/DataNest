import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import OutputReview from "@/components/OutputReview";
import type { NormalizedLine, NormalizedWord } from "@/lib/transcript-normalizer";

interface KaraokePreviewSectionProps {
  activeTranscriptVersionId: string | null;
  audioUrl: string | null;
  exportingBundle: boolean;
  onExport: () => void;
}

export default function KaraokePreviewSection({ activeTranscriptVersionId, audioUrl, exportingBundle, onExport }: KaraokePreviewSectionProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [lines, setLines] = useState<NormalizedLine[]>([]);

  if (!activeTranscriptVersionId) return null;

  const togglePreview = async () => {
    if (showPreview) { setShowPreview(false); return; }
    if (lines.length === 0) {
      const { data: dbLines } = await supabase
        .from("lyric_lines").select("*")
        .eq("transcript_version_id", activeTranscriptVersionId)
        .order("line_index", { ascending: true });

      if (dbLines && dbLines.length > 0) {
        const lineIds = dbLines.map(l => l.id);
        const { data: words } = await supabase
          .from("word_tokens").select("*")
          .in("lyric_line_id", lineIds)
          .order("ordinal_index", { ascending: true });

        const wordsByLineId = new Map<string, NormalizedWord[]>();
        words?.forEach(w => {
          const arr = wordsByLineId.get(w.lyric_line_id) || [];
          arr.push({
            ordinal_index: w.ordinal_index, text: w.text,
            start_sec: w.start_sec, end_sec: w.end_sec,
            duration_sec: w.duration_sec ?? (w.end_sec - w.start_sec),
            gap_after: w.gap_after ?? 0, confidence: w.confidence ?? 1,
            timing_source: "native" as const,
            timing_status: (w.confidence ?? 1) >= 0.7 ? "verified" as const : "draft" as const,
          });
          wordsByLineId.set(w.lyric_line_id, arr);
        });

        setLines(dbLines.map(l => ({
          line_index: l.line_index, text: l.text,
          start_sec: l.start_sec ?? 0, end_sec: l.end_sec ?? 0,
          duration_sec: l.duration_sec ?? 0,
          words: wordsByLineId.get(l.id) || [],
        })));
      }
    }
    setShowPreview(true);
  };

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Eye className="h-5 w-5 text-primary" /> Karaoke Preview
        </h3>
        <Button size="sm" variant="outline" onClick={togglePreview} className="gap-1.5 border-border text-foreground hover:bg-secondary">
          <Eye className="h-3.5 w-3.5" /> {showPreview ? "Hide" : "Show"} Preview
        </Button>
      </div>
      {showPreview && lines.length > 0 && (
        <OutputReview audioUrl={audioUrl || ""} lines={lines}
          onExport={(fmt) => { if (fmt === "srt" || fmt === "vtt" || fmt === "karaoke_vtt" || fmt === "json") onExport(); }}
          exporting={exportingBundle} />
      )}
      {showPreview && lines.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
          <p className="text-sm font-medium">No Lyric Lines</p>
          <p className="text-xs">No lyric lines were found for this transcript version.</p>
        </div>
      )}
    </div>
  );
}
