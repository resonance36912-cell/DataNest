import { useEffect, useState } from "react";
import { Timer, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { VIDEO_PROVIDER_OPTIONS } from "@/lib/providers";
import {
  DEFAULT_PROVIDER_TIMEOUTS_MS,
  PROVIDER_TIMEOUT_MAX_MS,
  PROVIDER_TIMEOUT_MIN_MS,
  loadProviderTimeoutOverrides,
  saveProviderTimeoutOverride,
} from "@/types/storyboard";

const toMin = (ms: number) => Math.round(ms / 60000);

export default function ProviderTimeoutSettings() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const ov = loadProviderTimeoutOverrides();
    const seed: Record<string, string> = {};
    for (const opt of VIDEO_PROVIDER_OPTIONS) {
      const ms = ov[opt.value] ?? DEFAULT_PROVIDER_TIMEOUTS_MS[opt.value];
      seed[opt.value] = ms ? String(toMin(ms)) : "";
    }
    setValues(seed);
  }, [open]);

  const minMin = toMin(PROVIDER_TIMEOUT_MIN_MS);
  const maxMin = toMin(PROVIDER_TIMEOUT_MAX_MS);

  const save = () => {
    let saved = 0;
    for (const opt of VIDEO_PROVIDER_OPTIONS) {
      const raw = values[opt.value];
      const num = Number(raw);
      if (!raw || !Number.isFinite(num)) continue;
      if (num < minMin || num > maxMin) {
        toast.error(`${opt.label}: timeout must be ${minMin}–${maxMin} min`);
        return;
      }
      saveProviderTimeoutOverride(opt.value, num * 60000);
      saved += 1;
    }
    toast.success(`Saved timeouts for ${saved} provider${saved === 1 ? "" : "s"}`);
    setOpen(false);
  };

  const resetOne = (provider: string) => {
    saveProviderTimeoutOverride(provider, null);
    const ms = DEFAULT_PROVIDER_TIMEOUTS_MS[provider];
    setValues((v) => ({ ...v, [provider]: ms ? String(toMin(ms)) : "" }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" title="Configure per-provider polling timeouts">
          <Timer className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Timeouts</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Per-provider timeouts</DialogTitle>
          <DialogDescription>
            Maximum minutes to keep polling each video model before marking the
            job as a polling timeout. Stored locally in your browser.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {VIDEO_PROVIDER_OPTIONS.map((opt) => (
            <div key={opt.value} className="flex items-center gap-2">
              <Label htmlFor={`timeout-${opt.value}`} className="flex-1 text-xs">
                {opt.label}
                <span className="block text-[10px] text-muted-foreground">
                  default {toMin(DEFAULT_PROVIDER_TIMEOUTS_MS[opt.value] ?? 0) || "—"} min
                </span>
              </Label>
              <Input
                id={`timeout-${opt.value}`}
                type="number"
                min={minMin}
                max={maxMin}
                value={values[opt.value] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [opt.value]: e.target.value }))}
                className="w-20 h-8 text-xs"
              />
              <span className="text-[10px] text-muted-foreground">min</span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => resetOne(opt.value)}
                title="Reset to default"
                className="h-7 w-7"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
