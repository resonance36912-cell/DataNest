import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles, Loader2, CreditCard, Smartphone, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import { SeoHead } from "@/components/SeoHead";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { clearEntitlementCache, HUB_URL } from "@/lib/entitlement";
import CreditsSyncStatus from "@/components/credits/CreditsSyncStatus";


type CreditPack = {
  id: string;
  label: string;
  credits: number;
  price_usd: number;
  play_product_id: string | null;
  paddle_price_id: string | null;
  sort_order: number;
};

type TopupRow = {
  id: string;
  amount: number;
  source: string;
  pack_id: string | null;
  description: string | null;
  paid_at: string;
};

// Native (Capacitor + Play Billing) bridge — wrapped optionally so web build doesn't break.
async function tryPlayPurchase(productId: string): Promise<{ purchaseToken: string } | null> {
  try {
    const modName = ["@capgo", "capacitor-purchases"].join("/");
    const mod: any = await import(/* @vite-ignore */ modName).catch(() => null);
    if (!mod?.Purchases) return null;
    const result = await mod.Purchases.purchaseProduct({ productIdentifier: productId });
    const token =
      result?.transaction?.transactionIdentifier ||
      result?.purchaseToken ||
      result?.transaction?.purchaseToken;
    if (!token) return null;
    return { purchaseToken: token };
  } catch (e) {
    console.error("Play purchase failed", e);
    return null;
  }
}

function isAndroidNative(): boolean {
  try {
    // @ts-expect-error Capacitor global
    return !!(window.Capacitor && window.Capacitor.getPlatform?.() === "android");
  } catch {
    return false;
  }
}

declare global {
  interface Window {
    Paddle?: any;
  }
}

const PADDLE_CLIENT_TOKEN = (import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string) || "";
const PADDLE_ENV = (import.meta.env.VITE_PADDLE_ENV as string) || "sandbox";

async function loadPaddle(): Promise<any | null> {
  if (window.Paddle) return window.Paddle;
  if (!PADDLE_CLIENT_TOKEN) return null;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Paddle script failed to load"));
    document.head.appendChild(s);
  });
  if (PADDLE_ENV !== "live") window.Paddle?.Environment.set("sandbox");
  window.Paddle?.Initialize({ token: PADDLE_CLIENT_TOKEN });
  return window.Paddle;
}

export default function Credits() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [topups, setTopups] = useState<TopupRow[]>([]);
  const [buying, setBuying] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [live, setLive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const native = useMemo(() => isAndroidNative(), []);

  const syncAccountData = useCallback(async () => {
    if (!user) return;
    const [packsRes, balRes, topupsRes] = await Promise.all([
      supabase.from("credit_packs").select("*").eq("active", true).order("sort_order"),
      supabase.from("user_credits").select("balance").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("credit_topups")
        .select("id, amount, source, pack_id, description, paid_at")
        .eq("user_id", user.id)
        .order("paid_at", { ascending: false })
        .limit(20),
    ]);
    setPacks((packsRes.data as CreditPack[]) ?? []);
    setBalance(balRes.data?.balance ?? 0);
    setTopups((topupsRes.data as TopupRow[]) ?? []);
    setLastSyncedAt(new Date());
  }, [user]);

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      clearEntitlementCache();
      await syncAccountData();
    } finally {
      setRefreshing(false);
    }
  }, [syncAccountData]);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    (async () => {
      await syncAccountData();
      setLoading(false);
    })();
  }, [user, navigate, syncAccountData]);

  // Realtime: refresh balance + history when a topup lands
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`credits:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "credit_topups", filter: `user_id=eq.${user.id}` },
        async (payload) => {
          await syncAccountData();
          clearEntitlementCache();
          const newId = (payload.new as { id?: string } | null)?.id;
          toast.success("Credits added to your balance", {
            action: newId
              ? { label: "View receipt", onClick: () => navigate(`/receipt/${newId}`) }
              : undefined,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "coupon_redemptions", filter: `user_id=eq.${user.id}` },
        async () => {
          await syncAccountData();
          clearEntitlementCache();
        },
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });
    return () => {
      setLive(false);
      supabase.removeChannel(ch);
    };
  }, [user, navigate, syncAccountData]);


  async function handleBuy(pack: CreditPack) {
    if (!user) return;
    setBuying(pack.id);
    try {
      if (native) {
        if (!pack.play_product_id) {
          toast.error("This pack isn't available on Android yet");
          return;
        }
        const purchase = await tryPlayPurchase(pack.play_product_id);
        if (!purchase) {
          toast.error("Google Play purchase failed");
          return;
        }
        const { data, error } = await supabase.functions.invoke("verify-play-purchase", {
          body: { productId: pack.play_product_id, purchaseToken: purchase.purchaseToken },
        });
        if (error) {
          toast.error(error.message || "Verification failed");
          return;
        }
        toast.success(`Added ${data?.credits ?? pack.credits} credits`);
      } else {
        if (!pack.paddle_price_id) {
          toast.error("This pack isn't available on web yet — Paddle price not configured.");
          return;
        }
        const Paddle = await loadPaddle();
        if (!Paddle) {
          toast.error("Paddle isn't configured. Set VITE_PADDLE_CLIENT_TOKEN.");
          return;
        }
        Paddle.Checkout.open({
          items: [{ priceId: pack.paddle_price_id, quantity: 1 }],
          customer: { email: user.email ?? "" },
          customData: { user_id: user.id, pack_id: pack.id },
          settings: { displayMode: "overlay", theme: "dark" },
        });
      }
    } finally {
      setBuying(null);
    }
  }

  return (
    <>
      <SeoHead
        title="Credits — Sync Vision"
        description="Top up your Sync Vision credits to generate AI music videos."
        path="/credits"
      />
      <Navbar />
      <main className="container max-w-5xl pt-24 pb-16">
        <header className="mb-10">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-2">
            Credits
          </p>
          <h1 className="text-3xl font-display font-bold">Top up your balance</h1>
          <p className="mt-2 text-muted-foreground">
            Credits power scene generation, vocal sync, and exports. They never expire.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm">Current balance:</span>
              <span className="font-mono text-base font-bold">
                {balance === null ? "—" : Math.round(balance).toLocaleString()}
              </span>
            </div>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href={`${HUB_URL}/pricing`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                View hub pricing
              </a>
            </Button>
          </div>
        </header>

        <CreditsSyncStatus
          user={user}
          lastSyncedAt={lastSyncedAt}
          live={live}
          onRefresh={handleManualRefresh}
          refreshing={refreshing}
        />


        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <section className="grid gap-4 md:grid-cols-3">
            {packs.map((pack) => (
              <Card
                key={pack.id}
                className="p-6 flex flex-col gap-4 border-white/10 bg-card/60 backdrop-blur-md"
              >
                <div>
                  <h3 className="font-display text-lg font-bold">{pack.label}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    One-time top-up
                  </p>
                </div>
                <div>
                  <div className="font-mono text-3xl font-bold">
                    {pack.credits.toLocaleString()}
                  </div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">
                    credits
                  </div>
                </div>
                <div className="text-2xl font-display font-bold">
                  ${pack.price_usd.toFixed(2)}
                </div>
                <Button
                  className="w-full gap-2"
                  disabled={buying !== null}
                  onClick={() => handleBuy(pack)}
                >
                  {buying === pack.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : native ? (
                    <Smartphone className="h-4 w-4" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  {native ? "Buy via Google Play" : "Buy with card"}
                </Button>
              </Card>
            ))}
          </section>
        )}

        {topups.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-lg font-bold mb-4">Purchase history</h2>
            <div className="rounded-xl border border-white/5 bg-card/40 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5">Date</th>
                    <th className="text-left px-4 py-2.5">Source</th>
                    <th className="text-left px-4 py-2.5">Pack</th>
                    <th className="text-right px-4 py-2.5">Credits</th>
                    <th className="text-right px-4 py-2.5">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {topups.map((t) => (
                    <tr key={t.id} className="border-t border-white/5">
                      <td className="px-4 py-2.5">
                        {new Date(t.paid_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 capitalize">{t.source}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {t.pack_id ?? t.description ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        +{Math.round(t.amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          to={`/receipt/${t.id}`}
                          className="text-primary hover:underline text-xs font-semibold"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
