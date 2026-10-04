import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles, CheckCircle2, XCircle, Upload } from "lucide-react";

interface RubricItem { key: string; label: string }
interface ScoreEntry { score: number; rationale: string }
interface Result {
  passed: boolean;
  avg: number;
  min: number;
  summary: string;
  scores: Record<string, ScoreEntry>;
  rubric: RubricItem[];
}

export const AIQualityCheck = () => {
  const [imageUrl, setImageUrl] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setImageUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const run = async () => {
    if (!imageUrl) { setError("Provide an image URL or upload a file"); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-quality-check", {
        body: { imageUrl, context: context || undefined },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as Result);
    } catch (e: any) {
      setError(e?.message ?? "Failed to score");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="studio-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-primary" />
        <h3 className="font-display font-bold text-foreground">AI Quality Check</h3>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Poster image URL</label>
            <input
              type="text"
              value={imageUrl.startsWith("data:") ? "(uploaded file)" : imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://… or upload below"
              className="w-full mt-1 px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload file</span>
            <input type="file" accept="image/*" className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <div>
            <label className="text-xs text-muted-foreground">Brief / context (optional)</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
              placeholder="Brand, product, headline, CTA…"
              className="w-full mt-1 px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground"
            />
          </div>
          <button
            onClick={run}
            disabled={loading || !imageUrl}
            className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Scoring…</> : <>Run quality check</>}
          </button>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {imageUrl && (
            <img src={imageUrl} alt="preview" className="w-full rounded-lg border border-border max-h-64 object-contain bg-background" />
          )}
        </div>

        <div>
          {!result && !loading && (
            <p className="text-xs text-muted-foreground">Results will appear here. Pass bar: avg ≥ 4.0 and no dimension &lt; 3.</p>
          )}
          {result && (
            <div className="space-y-3">
              <div className={`flex items-center gap-2 p-3 rounded-lg border ${result.passed ? "border-green-500/40 bg-green-500/10" : "border-destructive/40 bg-destructive/10"}`}>
                {result.passed ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-destructive" />}
                <div>
                  <p className="text-sm font-bold text-foreground">{result.passed ? "PASS" : "FAIL"}</p>
                  <p className="text-xs text-muted-foreground">avg {result.avg} · min {result.min}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground italic">{result.summary}</p>
              <div className="space-y-1.5">
                {result.rubric.map((r) => {
                  const s = result.scores[r.key];
                  if (!s) return null;
                  const color = s.score >= 4 ? "text-green-500" : s.score >= 3 ? "text-yellow-500" : "text-destructive";
                  return (
                    <div key={r.key} className="flex items-start justify-between gap-3 text-xs border-b border-border/50 pb-1.5">
                      <div className="flex-1">
                        <p className="text-foreground font-medium">{r.label}</p>
                        <p className="text-muted-foreground">{s.rationale}</p>
                      </div>
                      <span className={`font-bold ${color}`}>{s.score}/5</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIQualityCheck;
