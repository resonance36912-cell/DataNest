import { useEffect, useState, useCallback, useMemo } from "react";
import {
  RefreshCw, Ticket, Loader2, Plus, Pencil, Power, PowerOff, Trash2, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type CouponType = "discount" | "credits" | "tier";

interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  discount_kind: "percent" | "amount" | null;
  discount_value: number | null;
  discount_currency: string | null;
  credits_amount: number | null;
  tier: string | null;
  tier_duration_days: number | null;
  expires_at: string | null;
  max_uses: number | null;
  uses_count: number;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface RedemptionRow {
  id: string;
  user_id: string;
  code: string;
  type: CouponType;
  value_numeric: number | null;
  tier: string | null;
  expires_at: string | null;
  created_at: string;
}

const TYPE_BADGE: Record<CouponType, string> = {
  discount: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  credits: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  tier: "bg-sky-500/10 text-sky-300 border-sky-500/30",
};

const blankForm = (): Partial<Coupon> => ({
  code: "",
  type: "discount",
  discount_kind: "percent",
  discount_value: 10,
  discount_currency: null,
  credits_amount: null,
  tier: null,
  tier_duration_days: null,
  expires_at: null,
  max_uses: null,
  active: true,
  notes: null,
});

export function CouponsSection() {
  const { user } = useAuth();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Coupon> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [cRes, rRes] = await Promise.all([
      supabase.from("coupons").select("*").order("created_at", { ascending: false }),
      supabase
        .from("coupon_redemptions")
        .select("id, user_id, code, type, value_numeric, tier, expires_at, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (cRes.error) toast.error(cRes.error.message);
    if (rRes.error) toast.error(rRes.error.message);
    setCoupons((cRes.data as Coupon[]) ?? []);
    setRedemptions((rRes.data as RedemptionRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async (form: Partial<Coupon>) => {
    if (!form.code || form.code.trim().length < 4) {
      toast.error("Code must be at least 4 characters");
      return;
    }
    const code = form.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(code)) {
      toast.error("Use only letters, numbers, dashes, underscores");
      return;
    }
    setSaving(true);

    // Clean payload: blank irrelevant fields based on type
    const payload: Partial<Coupon> = {
      code,
      type: form.type ?? "discount",
      active: form.active ?? true,
      expires_at: form.expires_at || null,
      max_uses: form.max_uses ?? null,
      notes: form.notes || null,
      discount_kind: form.type === "discount" ? form.discount_kind ?? "percent" : null,
      discount_value: form.type === "discount" ? Number(form.discount_value) || 0 : null,
      discount_currency: form.type === "discount" && form.discount_kind === "amount"
        ? form.discount_currency || "ZAR"
        : null,
      credits_amount: form.type === "credits" ? Number(form.credits_amount) || 0 : null,
      tier: form.type === "tier" ? form.tier ?? null : null,
      tier_duration_days: form.type === "tier" ? form.tier_duration_days ?? null : null,
    };

    let res;
    if (form.id) {
      res = await supabase.from("coupons").update(payload as never).eq("id", form.id);
    } else {
      res = await supabase.from("coupons").insert({ ...payload, created_by: user?.id ?? null } as never);
    }
    setSaving(false);
    if (res.error) {
      toast.error(res.error.message.includes("unique") ? "Code already exists" : res.error.message);
      return;
    }
    toast.success(form.id ? "Coupon updated" : "Coupon created");
    setEditing(null);
    void load();
  };

  const toggleActive = async (c: Coupon) => {
    const { error } = await supabase.from("coupons").update({ active: !c.active }).eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(c.active ? "Deactivated" : "Activated");
    setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, active: !c.active } : x));
  };

  const remove = async (c: Coupon) => {
    if (!confirm(`Delete coupon ${c.code}? Audit log entries are kept.`)) return;
    const { error } = await supabase.from("coupons").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Coupon deleted");
    setCoupons(prev => prev.filter(x => x.id !== c.id));
  };

  const copy = (code: string) => {
    navigator.clipboard.writeText(code).then(() => toast.message(`Copied ${code}`));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ticket className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Coupons</h2>
          <span className="text-[11px] text-muted-foreground">
            Local codes redeem first; Hub codes used as fallback
          </span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
          <Button size="sm" onClick={() => setEditing(blankForm())} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New coupon
          </Button>
        </div>
      </div>

      <Tabs defaultValue="codes">
        <TabsList>
          <TabsTrigger value="codes">Codes ({coupons.length})</TabsTrigger>
          <TabsTrigger value="redemptions">Redemptions ({redemptions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="codes" className="mt-3">
          <div className="rounded-xl border border-border/60 bg-card/50">
            {loading ? (
              <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
            ) : coupons.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No coupons yet. Click <strong>New coupon</strong> to create one.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {coupons.map((c) => <CouponRow
                  key={c.id} c={c}
                  onEdit={() => setEditing(c)}
                  onToggle={() => toggleActive(c)}
                  onDelete={() => remove(c)}
                  onCopy={() => copy(c.code)}
                />)}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="redemptions" className="mt-3">
          <div className="rounded-xl border border-border/60 bg-card/50">
            {redemptions.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No redemptions yet.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {redemptions.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="font-mono text-xs">{r.code}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${TYPE_BADGE[r.type]}`}>
                      {r.type}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {r.type === "credits" && r.value_numeric != null && `+${r.value_numeric} credits`}
                      {r.type === "discount" && r.value_numeric != null && `${r.value_numeric} off`}
                      {r.type === "tier" && r.tier && `${r.tier}${r.expires_at ? ` · until ${new Date(r.expires_at).toLocaleDateString()}` : ""}`}
                    </span>
                    <span className="ml-auto truncate text-[11px] text-muted-foreground" title={r.user_id}>
                      {r.user_id.slice(0, 8)}…
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <CouponEditor
        open={!!editing}
        initial={editing}
        saving={saving}
        onCancel={() => setEditing(null)}
        onSave={handleSave}
      />
    </div>
  );
}

// ─── Row ────
function CouponRow({
  c, onEdit, onToggle, onDelete, onCopy,
}: {
  c: Coupon;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onCopy: () => void;
}) {
  const expired = c.expires_at && new Date(c.expires_at).getTime() < Date.now();
  const exhausted = c.max_uses != null && c.uses_count >= c.max_uses;
  const usageLabel = c.max_uses != null ? `${c.uses_count}/${c.max_uses}` : `${c.uses_count}`;
  const valueLabel =
    c.type === "discount"
      ? c.discount_kind === "percent"
        ? `${c.discount_value}%`
        : `${c.discount_currency ?? ""}${c.discount_value}`
      : c.type === "credits"
      ? `+${c.credits_amount} credits`
      : c.tier
      ? `${c.tier}${c.tier_duration_days ? ` · ${c.tier_duration_days}d` : ""}`
      : "—";

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <button
        onClick={onCopy}
        title="Copy code"
        className="group inline-flex items-center gap-1.5 font-mono text-xs hover:text-foreground"
      >
        <span>{c.code}</span>
        <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
      </button>
      <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${TYPE_BADGE[c.type]}`}>
        {c.type}
      </span>
      <span className="text-xs text-muted-foreground">{valueLabel}</span>
      <span className="text-[11px] text-muted-foreground">Uses: {usageLabel}</span>
      {c.expires_at && (
        <span className={`text-[11px] ${expired ? "text-red-300" : "text-muted-foreground"}`}>
          {expired ? "Expired" : "Expires"} {new Date(c.expires_at).toLocaleDateString()}
        </span>
      )}
      <span className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] ${
        c.active && !expired && !exhausted
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-muted-foreground/30 bg-muted/30 text-muted-foreground"
      }`}>
        {!c.active ? "Inactive" : exhausted ? "Used up" : expired ? "Expired" : "Active"}
      </span>
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit} title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onToggle}
          title={c.active ? "Deactivate" : "Activate"}>
          {c.active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={onDelete} title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Editor dialog ────
function CouponEditor({
  open, initial, saving, onCancel, onSave,
}: {
  open: boolean;
  initial: Partial<Coupon> | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (form: Partial<Coupon>) => void;
}) {
  const [form, setForm] = useState<Partial<Coupon>>(initial ?? blankForm());

  useEffect(() => { setForm(initial ?? blankForm()); }, [initial]);

  const isEdit = !!initial?.id;
  const set = <K extends keyof Coupon>(k: K, v: Coupon[K] | null) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const expiryLocal = useMemo(() => {
    if (!form.expires_at) return "";
    const d = new Date(form.expires_at);
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
  }, [form.expires_at]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit coupon" : "New coupon"}</DialogTitle>
          <DialogDescription>
            Codes redeem in this app immediately. Hub codes are used as fallback.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Code</Label>
              <Input
                value={form.code ?? ""}
                disabled={isEdit}
                onChange={(e) => set("code", e.target.value.toUpperCase() as never)}
                placeholder="LAUNCH25"
                className="font-mono uppercase"
                maxLength={32}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={form.type ?? "discount"} onValueChange={(v) => set("type", v as CouponType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="discount">Discount (Hub checkout)</SelectItem>
                  <SelectItem value="credits">Grant credits</SelectItem>
                  <SelectItem value="tier">Unlock tier</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.type === "discount" && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Kind</Label>
                <Select
                  value={form.discount_kind ?? "percent"}
                  onValueChange={(v) => set("discount_kind", v as "percent" | "amount")}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent</SelectItem>
                    <SelectItem value="amount">Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Value</Label>
                <Input
                  type="number" min={0}
                  value={form.discount_value ?? ""}
                  onChange={(e) => set("discount_value", Number(e.target.value) as never)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Currency</Label>
                <Input
                  value={form.discount_currency ?? ""}
                  disabled={form.discount_kind !== "amount"}
                  onChange={(e) => set("discount_currency", e.target.value as never)}
                  placeholder="ZAR"
                />
              </div>
            </div>
          )}

          {form.type === "credits" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Credits to add</Label>
              <Input
                type="number" min={0}
                value={form.credits_amount ?? ""}
                onChange={(e) => set("credits_amount", Number(e.target.value) as never)}
                placeholder="50"
              />
            </div>
          )}

          {form.type === "tier" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tier</Label>
                <Select value={form.tier ?? ""} onValueChange={(v) => set("tier", v as never)}>
                  <SelectTrigger><SelectValue placeholder="Pick a tier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="creator">Creator</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                    <SelectItem value="all_access">All Access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Duration (days)</Label>
                <Input
                  type="number" min={1}
                  value={form.tier_duration_days ?? ""}
                  onChange={(e) => set("tier_duration_days", Number(e.target.value) as never)}
                  placeholder="30"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Expires</Label>
              <Input
                type="datetime-local"
                value={expiryLocal}
                onChange={(e) => set("expires_at", e.target.value ? new Date(e.target.value).toISOString() as never : null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max uses (blank = unlimited)</Label>
              <Input
                type="number" min={1}
                value={form.max_uses ?? ""}
                onChange={(e) => set("max_uses", e.target.value ? Number(e.target.value) as never : null)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes (admin only)</Label>
            <Textarea
              rows={2}
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value as never)}
              placeholder="Campaign reference, partner, etc."
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <Label htmlFor="coupon-active" className="text-xs">Active</Label>
            <Switch
              id="coupon-active"
              checked={form.active ?? true}
              onCheckedChange={(v) => set("active", v as never)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEdit ? "Save changes" : "Create coupon"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
