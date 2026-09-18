// Inline editor for user-defined price format rules. Lives inside the
// PricingConfirmDialog as a collapsible section so the user can teach the
// studio about currencies/formats the built-in validator doesn't recognise.
import { useState } from "react";
import { Plus, Trash2, Check, AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  BUILTIN_PRESETS,
  newRuleId,
  type PricingRule,
} from "@/lib/pricingRules";

interface Props {
  rules: PricingRule[];
  onChange: (rules: PricingRule[]) => void;
  /** Current value in the parent input — used to live-test a draft rule. */
  testValue: string;
}

function ruleValid(rule: PricingRule): { ok: boolean; reason?: string } {
  if (!rule.label.trim()) return { ok: false, reason: "Label required" };
  if (!rule.pattern.trim()) return { ok: false, reason: "Pattern required" };
  try {
    new RegExp(`^(?:${rule.pattern})$`, "i");
  } catch (err) {
    return { ok: false, reason: `Invalid regex: ${(err as Error).message}` };
  }
  if (rule.example) {
    try {
      const re = new RegExp(`^(?:${rule.pattern})$`, "i");
      if (!re.test(rule.example.trim())) {
        return { ok: false, reason: "Pattern doesn't match the example" };
      }
    } catch { /* handled above */ }
  }
  return { ok: true };
}

export default function PricingRulesEditor({ rules, onChange, testValue }: Props) {
  const [draft, setDraft] = useState<PricingRule>({
    id: newRuleId(),
    label: "",
    pattern: "",
    example: "",
    enabled: true,
  });

  const draftStatus = ruleValid(draft);

  const updateRule = (id: string, patch: Partial<PricingRule>) =>
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removeRule = (id: string) => onChange(rules.filter((r) => r.id !== id));

  const addDraft = () => {
    if (!draftStatus.ok) return;
    onChange([...rules, draft]);
    setDraft({ id: newRuleId(), label: "", pattern: "", example: "", enabled: true });
  };

  const addPreset = (preset: typeof BUILTIN_PRESETS[number]) => {
    if (rules.some((r) => r.label === preset.label)) return;
    onChange([...rules, { ...preset, id: newRuleId(), enabled: true }]);
  };

  const matchesDraft = (() => {
    if (!testValue.trim() || !draftStatus.ok) return false;
    try {
      return new RegExp(`^(?:${draft.pattern})$`, "i").test(testValue.trim());
    } catch { return false; }
  })();

  return (
    <div className="space-y-3 rounded-md border border-white/10 bg-background/40 p-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground/80">
          Custom price formats
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Approve formats the built-in validator doesn't know about. Stored on
          this device.
        </p>
      </div>

      {rules.length > 0 && (
        <ul className="space-y-2">
          {rules.map((r) => {
            const s = ruleValid(r);
            return (
              <li
                key={r.id}
                className="flex items-start gap-2 rounded border border-white/5 bg-background/60 px-2 py-1.5"
              >
                <Switch
                  checked={r.enabled}
                  onCheckedChange={(v) => updateRule(r.id, { enabled: v })}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <Input
                    value={r.label}
                    onChange={(e) => updateRule(r.id, { label: e.target.value })}
                    className="h-7 text-xs"
                    placeholder="Label"
                  />
                  <Input
                    value={r.pattern}
                    onChange={(e) => updateRule(r.id, { pattern: e.target.value })}
                    className="h-7 text-xs font-mono"
                    placeholder="Regex pattern"
                  />
                  <Input
                    value={r.example}
                    onChange={(e) => updateRule(r.id, { example: e.target.value })}
                    className="h-7 text-xs"
                    placeholder="Example value"
                  />
                  {!s.ok && (
                    <p className="text-[11px] text-amber-300/90 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {s.reason}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => removeRule(r.id)}
                  aria-label={`Remove ${r.label}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2 rounded border border-dashed border-white/10 p-2">
        <p className="text-[11px] font-medium text-foreground/80">Add a new format</p>
        <Input
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          className="h-7 text-xs"
          placeholder='Label (e.g. "Kenyan Shilling")'
        />
        <Input
          value={draft.pattern}
          onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
          className="h-7 text-xs font-mono"
          placeholder='Regex (e.g. KSh\s?\d{1,3}(?:,\d{3})*)'
        />
        <Input
          value={draft.example}
          onChange={(e) => setDraft({ ...draft, example: e.target.value })}
          className="h-7 text-xs"
          placeholder='Example (e.g. "KSh 1,250")'
        />
        <div className="flex items-center justify-between gap-2">
          {!draftStatus.ok && (draft.label || draft.pattern) ? (
            <p className="text-[11px] text-amber-300/90 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {draftStatus.reason}
            </p>
          ) : matchesDraft ? (
            <p className="text-[11px] text-emerald-300/90 flex items-center gap-1">
              <Check className="w-3 h-3" /> Matches current input
            </p>
          ) : <span />}
          <Button size="sm" variant="outline" disabled={!draftStatus.ok} onClick={addDraft}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add format
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Quick add
        </p>
        <div className="flex flex-wrap gap-1.5">
          {BUILTIN_PRESETS.map((p) => {
            const already = rules.some((r) => r.label === p.label);
            return (
              <button
                key={p.label}
                type="button"
                disabled={already}
                onClick={() => addPreset(p)}
                className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.03] text-foreground/80 hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {p.label}{already ? " ✓" : ""}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
