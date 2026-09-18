// Shows the exact prompt + labeled reference images that will be sent to the
// generate-poster edge function. Mirrors the prompt builder in
// src/lib/posterPrompt.ts (which mirrors supabase/functions/generate-poster).
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Eye, EyeOff, FileText, Image as ImageIcon, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  buildPosterPrompt,
  labelReferences,
  type PosterPromptInputs,
} from "@/lib/posterPrompt";

interface Props {
  inputs: PosterPromptInputs;
  referenceImages: string[];
  /** Optional id of the element to scroll back to when the user clicks "Back to sources". */
  backTargetId?: string;
}

const roleBadge: Record<"primary" | "secondary" | "tertiary", string> = {
  primary: "bg-primary/80 text-primary-foreground",
  secondary: "bg-accent/70 text-accent-foreground",
  tertiary: "bg-white/10 text-foreground/80",
};

export default function PromptPreviewPanel({ inputs, referenceImages, backTargetId = "studio-source-section" }: Props) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState<1 | 2>(1);
  const [copied, setCopied] = useState(false);

  const labeled = useMemo(
    () => labelReferences(referenceImages, inputs.heroIsUpload),
    [referenceImages, inputs.heroIsUpload],
  );
  const prompt = useMemo(
    () => buildPosterPrompt(inputs, variant),
    [inputs, variant],
  );

  const copy = async () => {
    const refsBlock = labeled
      .map((r) => `${r.label}\n${r.url}`)
      .join("\n\n");
    const full = `${prompt}${refsBlock ? `\n\n--- Reference images ---\n${refsBlock}` : ""}`;
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: "Prompt copied", description: "Pasted prompt + references to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Clipboard not available.", variant: "destructive" });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/10 bg-background/40 backdrop-blur p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Prompt preview · generate-poster
          </p>
          <p className="text-sm font-medium text-foreground/90 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Exactly what the image model will see
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {open && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                if (typeof document !== "undefined") {
                  const el = document.getElementById(backTargetId);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
              title="Back to source material"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Back to sources
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen((v) => !v)}
            className="text-xs"
          >
            {open ? <EyeOff className="w-3.5 h-3.5 mr-1.5" /> : <Eye className="w-3.5 h-3.5 mr-1.5" />}
            {open ? "Hide" : "Show prompt"}
          </Button>
        </div>
      </div>

      {open && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex rounded-md border border-white/10 overflow-hidden text-xs">
              {[1, 2].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setVariant(n as 1 | 2)}
                  className={`px-2.5 py-1 transition-colors ${
                    variant === n
                      ? "bg-primary/80 text-primary-foreground"
                      : "bg-white/[0.02] text-foreground/70 hover:bg-white/[0.05]"
                  }`}
                >
                  Variant {n}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={copy} className="text-xs">
              {copied ? (
                <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 mr-1.5" />
              )}
              Copy
            </Button>
          </div>

          <pre className="text-[11px] leading-relaxed text-foreground/85 bg-black/40 border border-white/5 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-72">
{prompt}
          </pre>

          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ImageIcon className="w-3 h-3" />
              Multimodal references sent with prompt ({labeled.length})
            </p>
            {labeled.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">
                No reference images — model will design from text only.
              </p>
            ) : (
              <ol className="space-y-2">
                {labeled.map((r) => (
                  <li
                    key={r.index}
                    className="rounded-lg border border-white/10 bg-white/[0.03] p-2 flex gap-2.5"
                  >
                    <div className="w-14 h-14 shrink-0 rounded bg-black/40 overflow-hidden">
                      <img
                        src={r.url}
                        alt={`Reference ${r.index + 1}`}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <span
                        className={`inline-block text-[10px] font-mono px-1.5 py-0.5 rounded ${roleBadge[r.role]}`}
                      >
                        #{r.index + 1} · {r.role}
                      </span>
                      <p className="text-[11px] text-foreground/85 leading-snug">
                        {r.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate" title={r.url}>
                        {r.url.startsWith("data:")
                          ? `${r.url.slice(0, 32)}… (base64 upload)`
                          : r.url.replace(/^https?:\/\//, "")}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground border-t border-white/5 pt-2">
            Model: <span className="font-mono">google/gemini-3.1-flash-image-preview</span> ·
            Modalities: <span className="font-mono">image, text</span>
          </p>
        </div>
      )}
    </motion.div>
  );
}
