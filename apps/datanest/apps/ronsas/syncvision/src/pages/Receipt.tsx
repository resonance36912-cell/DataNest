import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Download, Loader2, Printer, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import { SeoHead } from "@/components/SeoHead";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type Topup = {
  id: string;
  amount: number;
  currency: string;
  source: string;
  pack_id: string | null;
  description: string | null;
  external_id: string | null;
  paid_at: string;
  created_at: string;
};

type Pack = {
  id: string;
  label: string;
  price_usd: number;
  credits: number;
};

const COMPANY = {
  name: "Resonance Sync Vision",
  address: "Resonance Ecosystem · syncvision.life",
  support: "support@syncvision.life",
};

function receiptNumber(id: string, paidAt: string) {
  const date = new Date(paidAt);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `SV-${y}${m}-${id.slice(0, 8).toUpperCase()}`;
}

function buildInvoiceHtml(opts: {
  topup: Topup;
  pack: Pack | null;
  email: string;
  number: string;
}) {
  const { topup, pack, email, number } = opts;
  const paid = new Date(topup.paid_at).toLocaleString();
  const item = pack?.label ?? topup.description ?? topup.pack_id ?? "Credit top-up";
  const unit = topup.amount.toFixed(2);
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Receipt ${number}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color:#111; max-width:720px; margin:40px auto; padding:0 24px; }
  h1 { margin:0 0 4px; font-size:22px; }
  .muted { color:#666; font-size:12px; }
  table { width:100%; border-collapse:collapse; margin-top:24px; }
  th, td { text-align:left; padding:10px 8px; border-bottom:1px solid #eee; font-size:14px; }
  th { text-transform:uppercase; font-size:11px; letter-spacing:.08em; color:#666; }
  .right { text-align:right; }
  .totals { margin-top:16px; }
  .totals td { border:none; padding:4px 8px; }
  .badge { display:inline-block; padding:2px 8px; background:#e6f7ee; color:#137a3b; border-radius:999px; font-size:11px; font-weight:600; }
  header { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; }
</style></head><body>
<header>
  <div>
    <h1>${COMPANY.name}</h1>
    <div class="muted">${COMPANY.address}<br/>${COMPANY.support}</div>
  </div>
  <div style="text-align:right">
    <div style="font-weight:700; font-size:16px;">Receipt</div>
    <div class="muted">#${number}</div>
    <div style="margin-top:6px" class="badge">PAID</div>
  </div>
</header>
<section style="margin-top:28px; display:flex; justify-content:space-between; gap:24px;">
  <div>
    <div class="muted">Billed to</div>
    <div>${email}</div>
  </div>
  <div style="text-align:right">
    <div class="muted">Payment date</div>
    <div>${paid}</div>
    <div class="muted" style="margin-top:6px">Method</div>
    <div style="text-transform:capitalize">${topup.source}</div>
    ${topup.external_id ? `<div class="muted" style="margin-top:6px">Transaction</div><div style="font-family:ui-monospace,monospace;font-size:12px">${topup.external_id}</div>` : ""}
  </div>
</section>
<table>
  <thead><tr><th>Description</th><th class="right">Credits</th><th class="right">Amount (${topup.currency.toUpperCase()})</th></tr></thead>
  <tbody>
    <tr>
      <td>${item}${pack ? ` — ${pack.credits.toLocaleString()} credits pack` : ""}</td>
      <td class="right">+${Math.round(topup.amount).toLocaleString()}</td>
      <td class="right">${pack ? pack.price_usd.toFixed(2) : unit}</td>
    </tr>
  </tbody>
</table>
<table class="totals">
  <tr><td class="right muted">Subtotal</td><td class="right" style="width:120px">${pack ? pack.price_usd.toFixed(2) : unit} ${topup.currency.toUpperCase()}</td></tr>
  <tr><td class="right" style="font-weight:700">Total paid</td><td class="right" style="font-weight:700">${pack ? pack.price_usd.toFixed(2) : unit} ${topup.currency.toUpperCase()}</td></tr>
</table>
<p class="muted" style="margin-top:32px">Credits never expire. This receipt confirms a one-time purchase — no subscription was created. Questions? Contact ${COMPANY.support}.</p>
</body></html>`;
}

export default function Receipt() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [topup, setTopup] = useState<Topup | null>(null);
  const [pack, setPack] = useState<Pack | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from("credit_topups")
        .select("id, amount, currency, source, pack_id, description, external_id, paid_at, created_at")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error || !data) {
        toast.error("Receipt not found");
        setLoading(false);
        return;
      }
      setTopup(data as Topup);
      if (data.pack_id) {
        const { data: p } = await supabase
          .from("credit_packs")
          .select("id, label, price_usd, credits")
          .eq("id", data.pack_id)
          .maybeSingle();
        if (p) setPack(p as Pack);
      }
      setLoading(false);
    })();
  }, [id, user, navigate]);

  const number = topup ? receiptNumber(topup.id, topup.paid_at) : "";

  const handleDownload = useCallback(() => {
    if (!topup) return;
    const html = buildInvoiceHtml({
      topup,
      pack,
      email: user?.email ?? "—",
      number,
    });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-${number}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Receipt downloaded");
  }, [topup, pack, user, number]);

  const handlePrint = useCallback(() => {
    if (!topup) return;
    const html = buildInvoiceHtml({
      topup,
      pack,
      email: user?.email ?? "—",
      number,
    });
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) {
      toast.error("Popup blocked — allow popups to print");
      return;
    }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 300);
  }, [topup, pack, user, number]);

  return (
    <>
      <SeoHead
        title="Receipt — Sync Vision"
        description="Download your Sync Vision purchase receipt."
        path={`/receipt/${id ?? ""}`}
      />
      <Navbar />
      <main className="container max-w-3xl pt-24 pb-16">
        <Link
          to="/credits"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back to credits
        </Link>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !topup ? (
          <Card className="p-8 text-center border-white/10 bg-card/60">
            <p className="text-muted-foreground">
              We couldn't find that receipt. It may belong to another account.
            </p>
          </Card>
        ) : (
          <Card className="p-8 border-white/10 bg-card/60 backdrop-blur-md">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-1">
                  Receipt
                </p>
                <h1 className="text-2xl font-display font-bold">#{number}</h1>
                <div className="inline-flex items-center gap-1.5 mt-2 rounded-full bg-emerald-500/15 text-emerald-400 px-2.5 py-1 text-xs font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
                  <Printer className="h-4 w-4" /> Print
                </Button>
                <Button size="sm" onClick={handleDownload} className="gap-2">
                  <Download className="h-4 w-4" /> Download
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 text-sm mb-8">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Billed to
                </div>
                <div>{user?.email ?? "—"}</div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Payment date
                </div>
                <div>{new Date(topup.paid_at).toLocaleString()}</div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mt-3 mb-1">
                  Method
                </div>
                <div className="capitalize">{topup.source}</div>
                {topup.external_id && (
                  <>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mt-3 mb-1">
                      Transaction
                    </div>
                    <div className="font-mono text-xs break-all">{topup.external_id}</div>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5">Description</th>
                    <th className="text-right px-4 py-2.5">Credits</th>
                    <th className="text-right px-4 py-2.5">
                      Amount ({topup.currency.toUpperCase()})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-white/5">
                    <td className="px-4 py-3">
                      {pack?.label ?? topup.description ?? topup.pack_id ?? "Credit top-up"}
                      {pack && (
                        <div className="text-xs text-muted-foreground">
                          {pack.credits.toLocaleString()} credits pack
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      +{Math.round(topup.amount).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {pack ? pack.price_usd.toFixed(2) : topup.amount.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-4 text-sm">
              <div className="w-56">
                <div className="flex justify-between py-1 text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono">
                    {(pack ? pack.price_usd : topup.amount).toFixed(2)}{" "}
                    {topup.currency.toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between py-1 font-bold border-t border-white/10 mt-1 pt-2">
                  <span>Total paid</span>
                  <span className="font-mono">
                    {(pack ? pack.price_usd : topup.amount).toFixed(2)}{" "}
                    {topup.currency.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-8">
              Credits never expire. This receipt confirms a one-time purchase — no subscription
              was created. Questions? Contact {COMPANY.support}.
            </p>
          </Card>
        )}
      </main>
    </>
  );
}
