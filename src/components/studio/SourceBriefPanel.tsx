// Compact, read-only summary of the structured SourceBrief returned by
// extract-source-brief. Shown right after analysis so users can see exactly
// what the AI used as source-of-truth before generation.
import { motion } from "framer-motion";
import { Check, AlertTriangle, RefreshCw, Camera, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  type SourceBrief,
  checklistFor,
  confidenceLabel,
} from "@/lib/sourceBrief";
import { validatePriceWithRules } from "@/lib/pricingRules";

interface Props {
  brief: SourceBrief;
  onRefresh?: () => void;
  onUseScreenshot?: () => void;
  busy?: boolean;
  stale?: boolean;
}

const labelTone: Record<"high" | "medium" | "low", string> = {
  high: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
  medium: "bg-amber-500/15 text-amber-300 border-amber-400/30",
  low: "bg-rose-500/15 text-rose-300 border-rose-400/30",
};

export default function SourceBriefPanel({
  brief,
  onRefresh,
  onUseScreenshot,
  busy,
  stale,
}: Props) {
  const tone = confidenceLabel(brief.confidenceScore ?? 0);
  const checks = checklistFor(brief);
  const priceCheck = validatePriceWithRules(brief.pricing);
  const pricingVerified = !!brief.pricing && priceCheck.ok;
  const pricingUnverified = !!brief.pricing && !priceCheck.ok;
  const items: { key: keyof typeof checks; label: string }[] = [
    { key: "brand", label: "Brand" },
    { key: "hero", label: "Hero text" },
    { key: "offer", label: "Offer" },
    { key: "benefits", label: "Benefits" },
    { key: "cta", label: "CTA" },
    { key: "images", label: "Images" },
    { key: "pricing", label: pricingVerified ? "Pricing âœ“" : "Pricing" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/10 bg-background/40 backdrop-blur p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Source extracted
            </p>
            {stale && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/30"
                title="Last refresh failed â€” showing previously cached extraction"
              >
                Cached Â· refresh failed
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground/90 truncate max-w-[28ch]">
            {brief.brandName || brief.pageTitle || brief.sourceUrl}
          </p>
        </div>
        <span
          className={`text-xs px-2.5 py-1 rounded-full border ${labelTone[tone]}`}
          title="Source confidence score"
        >
          {brief.confidenceScore}/100 Â· {tone}
        </span>
      </div>

      <ul className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5 text-xs">
        {items.map(({ key, label }) => {
          const ok = checks[key];
          return (
            <li
              key={key}
              className={`flex items-center gap-1.5 ${
                ok ? "text-foreground/90" : "text-muted-foreground/60"
              }`}
            >
              {ok ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <span className="w-3.5 h-3.5 rounded-full border border-current opacity-50" />
              )}
              {label}
            </li>
          );
        })}
      </ul>

      {brief.heroHeadline || brief.offer ? (
        <div className="text-sm text-foreground/80 space-y-1 border-t border-white/5 pt-3">
          {brief.heroHeadline && (
            <p>
              <span className="text-muted-foreground">Headline: </span>
              {brief.heroHeadline}
            </p>
          )}
          {brief.offer && (
            <p>
              <span className="text-muted-foreground">Offer: </span>
              {brief.offer}
            </p>
          )}
          {brief.callsToAction?.length > 0 && (
            <p className="text-xs text-muted-foreground">
              CTA: {brief.callsToAction.slice(0, 3).join(" Â· ")}
            </p>
          )}
        </div>
      ) : null}

      {pricingUnverified && (
        <div className="flex gap-2 text-xs text-amber-300/90 border-t border-white/5 pt-3">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <p>
            Pricing <span className="font-mono">"{brief.pricing}"</span> couldn't be verified â€” it
            will be left off the generated design. Confirm a real amount (e.g.{" "}
            <span className="font-mono">R 549</span>, <span className="font-mono">$19.99</span>) in
            the source form to include it.
          </p>
        </div>
      )}

      {brief.extractionWarnings?.length > 0 && (
        <div className="flex gap-2 text-xs text-amber-300/90 border-t border-white/5 pt-3">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <ul className="space-y-0.5">
            {brief.extractionWarnings.slice(0, 3).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {onRefresh && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                className="text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Refresh source
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Refresh source extraction?</AlertDialogTitle>
                <AlertDialogDescription>
                  This re-fetches and re-analyzes the source URL, replacing the current brief, headline, offer, and screenshot. Your existing posters and videos will be kept, but any unsaved edits to the brief will be lost.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onRefresh}>
                  Yes, refresh source
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {onUseScreenshot && brief.screenshot && (
          <Button
            size="sm"
            variant="outline"
            onClick={onUseScreenshot}
            disabled={busy}
            className="text-xs"
          >
            <Camera className="w-3.5 h-3.5 mr-1.5" />
            Use screenshot as source
          </Button>
        )}
        {tone === "low" && (
          <span className="flex items-center gap-1 text-xs text-amber-300/80 ml-auto">
            <Sparkles className="w-3.5 h-3.5" />
            Add brand details in <strong className="font-semibold">Brand Brief / Instructions</strong> (left panel) for best results
          </span>
        )}
      </div>
    </motion.div>
  );
}
