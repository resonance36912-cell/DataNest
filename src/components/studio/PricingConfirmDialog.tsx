// Explicit pricing confirmation gate â€” shown right before generation when the
// active brief has any pricing-related state (extracted, manually entered, or
// missing). User MUST pick "Use this price" with a verified amount, or "No
// price on design". There is no implicit acceptance â€” generation is blocked
// until the choice is recorded.
//
// Validation accepts both the built-in patterns and any custom currency/price
// rules the user has approved (see PricingRulesEditor + lib/pricingRules.ts).
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Ban, Settings2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { priceWarning } from "@/lib/priceValidator";
import { loadRules, saveRules, validatePriceWithRules, type PricingRule } from "@/lib/pricingRules";
import PricingRulesEditor from "./PricingRulesEditor";

export interface PricingDecision {
  mode: "use" | "none";
  value: string; // normalized verified price, or ""
}

interface Props {
  open: boolean;
  /** Pricing currently on the brief â€” pre-fills the editor. */
  extractedPrice: string;
  onCancel: () => void;
  onConfirm: (decision: PricingDecision) => void;
}

export default function PricingConfirmDialog({
  open,
  extractedPrice,
  onCancel,
  onConfirm,
}: Props) {
  const [value, setValue] = useState(extractedPrice);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => { if (open) { setValue(extractedPrice); setRules(loadRules()); } }, [open, extractedPrice]);
  // Persist rule edits as they happen so they survive cancel/reopen.
  useEffect(() => { if (open) saveRules(rules); }, [rules, open]);

  const check = useMemo(() => validatePriceWithRules(value, rules), [value, rules]);
  const trimmed = value.trim();
  const warning = trimmed ? priceWarning(check, value) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirm pricing before generating</DialogTitle>
          <DialogDescription>
            Pricing is rendered on the design only after you explicitly approve it.
            Confirm the exact amount we should print, or choose <em>No price</em>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Price as it will appear
          </label>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={'e.g. "R 549", "$19.99", "From R 119/month"'}
            autoFocus
          />
          {trimmed && (
            check.ok ? (
              <p className="flex items-start gap-2 text-xs text-emerald-300/90">
                <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Verified â€” will render as{" "}
                <span className="font-mono">"{check.normalized}"</span> on the design.
              </p>
            ) : (
              <p className="flex items-start gap-2 text-xs text-amber-300/90">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  {warning ?? "Use a real amount like \"R 549\" or \"$19.99\"."}{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-amber-200"
                    onClick={() => setRulesOpen(true)}
                  >
                    Add a custom format
                  </button>
                </span>
              </p>
            )
          )}
          {!trimmed && !extractedPrice && (
            <p className="text-xs text-muted-foreground">
              No price was extracted from your source â€” type one to include it, or
              continue without pricing.
            </p>
          )}

          <button
            type="button"
            onClick={() => setRulesOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Settings2 className="w-3 h-3" />
            {rulesOpen ? "Hide" : "Manage"} custom price formats
            {rulesOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {rules.filter((r) => r.enabled).length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[10px]">
                {rules.filter((r) => r.enabled).length} active
              </span>
            )}
          </button>
          {rulesOpen && (
            <PricingRulesEditor rules={rules} onChange={setRules} testValue={value} />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button
            variant="outline"
            onClick={() => onConfirm({ mode: "none", value: "" })}
          >
            <Ban className="w-4 h-4 mr-1.5" />
            No price on design
          </Button>
          <Button
            disabled={!check.ok}
            onClick={() => onConfirm({ mode: "use", value: check.normalized })}
          >
            <Check className="w-4 h-4 mr-1.5" />
            Use this price
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
