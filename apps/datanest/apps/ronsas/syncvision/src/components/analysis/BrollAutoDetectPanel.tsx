import { useMemo, useState } from "react";
import { Wand2, Film, CheckCircle2, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/contexts/ProjectContext";
import { classifySegmentsForBroll, summarizeBrollPlan, type SegmentClassification } from "@/lib/broll-detection";
import { parseTierRequired } from "@/lib/tierRequired";
import { reportTierRequired } from "@/lib/invokeGated";

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function BrollAutoDetectPanel() {
  const {
    audioSegments, transcription, verification, brollPlan, setBrollPlan,
  } = useProject();
  const [minGap, setMinGap] = useState(4);
  const [minDensity, setMinDensity] = useState(0.5);
  const [generatingPrompts, setGeneratingPrompts] = useState(false);

  const classified = useMemo<SegmentClassification[]>(() => {
    if (!audioSegments?.length) return [];
    return classifySegmentsForBroll(
      audioSegments.map(s => ({ index: s.index, start_sec: s.start_sec, end_sec: s.end_sec })),
      transcription?.words as { start: number; end: number; text?: string }[] | undefined,
      { minGapSec: minGap, minDensityWps: minDensity },
    );
  }, [audioSegments, transcription, minGap, minDensity]);

  const summary = useMemo(() => summarizeBrollPlan(classified), [classified]);
  const planSize = Object.keys(brollPlan).length;
  const promptsReady = Object.values(brollPlan).filter(p => p.is_broll && p.broll_prompt).length;
  const brollNeedingPrompts = classified.filter(r => r.is_broll);

  if (!audioSegments?.length) return null;

  const apply = () => {
    const next: Record<number, { is_broll: boolean; broll_prompt?: string; reason?: string }> = {};
    for (const r of classified) {
      const prev = brollPlan[r.index];
      next[r.index] = {
        is_broll: r.is_broll,
        reason: r.reason,
        broll_prompt: prev?.broll_prompt,
      };
    }
    setBrollPlan(next);
    toast.success(`B-Roll plan ready: ${summary.broll_count}/${summary.total} segments flagged (${fmtTime(summary.broll_seconds)} of ${fmtTime(summary.coverage_seconds)})`);
  };

  const toggle = (index: number, isBroll: boolean) => {
    setBrollPlan({ ...brollPlan, [index]: { ...(brollPlan[index] || {}), is_broll: isBroll } });
  };

  const generatePrompts = async () => {
    if (!brollNeedingPrompts.length) { toast.info("Run auto-detect first."); return; }
    setGeneratingPrompts(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const segs = brollNeedingPrompts.map(r => {
        const seg = audioSegments[r.index];
        return {
          index: r.index,
          start_sec: r.start_sec,
          end_sec: r.end_sec,
          reason: r.reason,
          surrounding_lyrics: seg?.lyrics?.slice(0, 200) || "",
        };
      });
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-broll-prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          segments: segs,
          mood: verification?.mood,
          genre: (verification as any)?.genre,
          energy: verification?.energy,
          theme: (verification as any)?.theme,
        }),
      });
      if (!res.ok) {
        if (res.status === 402) {
          const errBody = await res.clone().json().catch(() => null);
          const tier = await parseTierRequired(errBody, "generate-broll-prompts");
          if (tier) { await reportTierRequired(tier); return; }
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      const next = { ...brollPlan };
      for (const p of json.prompts as Array<{ index: number; broll_prompt: string }>) {
        next[p.index] = { ...(next[p.index] || { is_broll: true }), is_broll: true, broll_prompt: p.broll_prompt };
      }
      setBrollPlan(next);
      toast.success(`Generated ${json.prompts?.length || 0} cinematic B-Roll prompts${json.fallback ? " (fallback)" : ""}.`);
    } catch (e) {
      toast.error("Failed to generate B-Roll prompts", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setGeneratingPrompts(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Film className="h-4 w-4 text-primary" /> Auto B-Roll Detection</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Flags instrumental / sparse-vocal segments so the storyboard ignores the reference image and uses AI cinematic visuals instead. Covers the entire track via your existing segments.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={apply} disabled={!classified.length}>
            <Wand2 className="h-3.5 w-3.5 mr-1.5" /> Auto-detect
          </Button>
          <Button size="sm" onClick={generatePrompts} disabled={generatingPrompts || !planSize}>
            {generatingPrompts ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Film className="h-3.5 w-3.5 mr-1.5" />}
            Generate prompts
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground flex justify-between"><span>Instrumental gap ≥</span><span className="font-mono">{minGap.toFixed(1)}s</span></label>
          <Slider value={[minGap]} min={2} max={10} step={0.5} onValueChange={(v) => setMinGap(v[0])} className="mt-1.5" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground flex justify-between"><span>Vocal density &lt;</span><span className="font-mono">{minDensity.toFixed(2)} wps</span></label>
          <Slider value={[minDensity]} min={0.1} max={1.5} step={0.05} onValueChange={(v) => setMinDensity(v[0])} className="mt-1.5" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="rounded bg-primary/15 text-primary px-2 py-0.5 font-medium">{summary.broll_count} B-Roll</span>
        <span className="rounded bg-foreground/10 px-2 py-0.5 font-medium">{summary.aroll_count} A-Roll</span>
        <span className="text-muted-foreground">B-Roll: {fmtTime(summary.broll_seconds)} · A-Roll: {fmtTime(summary.aroll_seconds)} · Total: {fmtTime(summary.coverage_seconds)}</span>
        {planSize > 0 && <span className="ml-auto text-success flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Plan applied · {promptsReady} prompts ready</span>}
      </div>

      {classified.length > 0 && (
        <div className="max-h-64 overflow-y-auto border border-border/60 rounded">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 sticky top-0">
              <tr className="text-left">
                <th className="px-2 py-1 font-medium">#</th>
                <th className="px-2 py-1 font-medium">Time</th>
                <th className="px-2 py-1 font-medium">Words</th>
                <th className="px-2 py-1 font-medium">Density</th>
                <th className="px-2 py-1 font-medium">Max gap</th>
                <th className="px-2 py-1 font-medium">Reason</th>
                <th className="px-2 py-1 font-medium">B-Roll</th>
              </tr>
            </thead>
            <tbody>
              {classified.map(r => {
                const planned = brollPlan[r.index]?.is_broll ?? r.is_broll;
                const hasPrompt = !!brollPlan[r.index]?.broll_prompt;
                return (
                  <tr key={r.index} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="px-2 py-1 font-mono">{r.index + 1}</td>
                    <td className="px-2 py-1 font-mono text-muted-foreground">{fmtTime(r.start_sec)}–{fmtTime(r.end_sec)}</td>
                    <td className="px-2 py-1 font-mono">{r.word_count}</td>
                    <td className="px-2 py-1 font-mono">{r.words_per_sec.toFixed(2)}</td>
                    <td className="px-2 py-1 font-mono">{r.largest_gap_sec.toFixed(1)}s</td>
                    <td className="px-2 py-1 text-muted-foreground">{r.reason.replace(/_/g, " ")}{hasPrompt && <span className="ml-1 text-success">✓prompt</span>}</td>
                    <td className="px-2 py-1"><Switch checked={planned} onCheckedChange={(v) => toggle(r.index, v)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground flex items-start gap-1.5"><Info className="h-3 w-3 mt-0.5 shrink-0" /> When you build the storyboard, flagged segments are auto-marked as B-Roll with the generated cinematic prompts. You can still toggle any scene manually in the Storyboard step.</p>
    </div>
  );
}
