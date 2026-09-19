import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Sparkles, CreditCard, Smartphone, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { clearEntitlementCache } from "@/lib/entitlement";
import { FREE_PROMOTION_ACTIVE, FREE_PROMOTION } from "@/lib/promotion";

type CreditPack = {
  id: string;
  label: string;
  credits: number;
  price_usd: number;
  play_product_id: string | null;
  paddle_price_id: string | null;
  sort_order: number;
};

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

function isAndroidNative(): boolean {
  try {
    // @ts-expect-error Capacitor global
    return !!(window.Capacitor && window.Capacitor.getPlatform?.() === "android");
  } catch {
    return false;
  }
}

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

/**
 * Dashboard top-up card — one-off credit purchases only. No subscription copy.
 * Mirrors the checkout logic from src/pages/Credits.tsx so this can act
 * standalone from the dashboard.
 */
export default function TopUpCard() {
  const { user } = useAuth();
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const native = useMemo(() => isAndroidNative(), []);

  useEffect(() => {
    if (FREE_PROMOTION_ACTIVE || !user) return;
    let cancelled = false;
    (async () => {
      const [packsRes, balRes] = await Promise.all([
        supabase.from("credit_packs").select("*").eq("active", true).order("sort_order"),
        supabase.from("user_credits").select("balance").eq("user_id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setPacks(((packsRes.data as CreditPack[]) ?? []).slice(0, 3));
      setBalance(balRes.data?.balance ?? 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Refresh balance when a new topup lands
  useEffect(() => {
    if (FREE_PROMOTION_ACTIVE || !user) return;
    const ch = supabase
      .channel(`dash-topup:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "credit_topups",
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from("user_credits")
            .select("balance")
            .eq("user_id", user.id)
            .maybeSingle();
          setBalance(data?.balance ?? 0);
          clearEntitlementCache();
          const newId = (payload.new as { id?: string } | null)?.id;
          toast.success("Credits added to your balance", {
            action: newId
              ? {
                  label: "View receipt",
                  onClick: () => {
                    window.location.href = `/receipt/${newId}`;
                  },
                }
              : undefined,
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  if (FREE_PROMOTION_ACTIVE) {
    return (
      <section className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-6">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{FREE_PROMOTION.shortLabel}</div>
            <h2 className="mt-1 text-lg font-semibold">Credit purchases are paused</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {FREE_PROMOTION.description} Storyboard, rendering, vocal sync, and export access are included during the promotion.
            </p>
          </div>
        </div>
      </section>
    );
  }

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
          toast.error("This pack isn't available on web yet.");
          return;
        }
        const Paddle = await loadPaddle();
        if (!Paddle) {
          toast.error("Checkout isn't configured yet.");
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
    <section className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            <Zap className="h-3 w-3" /> One-off top-up
          </div>
          <h2 className="text-base font-semibold">Buy credits</h2>
          <p className="text-xs text-muted-foreground">
            Pay once. Credits never expire. No subscription, no auto-renewal.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-primary/20 bg-background/60 px-3 py-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-muted-foreground">Balance</span>
          <span className="font-mono text-sm font-bold">
            {balance === null ? "—" : Math.round(balance).toLocaleString()}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : packs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
          No credit packs available yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {packs.map((pack, i) => {
            const isBest = i === 1;
            return (
              <div
                key={pack.id}
                className={`relative flex flex-col gap-3 rounded-lg border p-4 ${
                  isBest
                    ? "border-primary/50 bg-primary/5"
                    : "border-border/60 bg-background/40"
                }`}
              >
                {isBest && (
                  <span className="absolute -top-2 right-3 rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
                    Best value
                  </span>
                )}
                <div>
                  <div className="text-sm font-semibold">{pack.label}</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    One-time purchase
                  </div>
                </div>
                <div>
                  <div className="font-mono text-xl font-bold">
                    {pack.credits.toLocaleString()}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    credits
                  </div>
                </div>
                <div className="text-lg font-bold">${pack.price_usd.toFixed(2)}</div>
                <Button
                  size="sm"
                  className="w-full gap-1.5"
                  disabled={buying !== null}
                  onClick={() => handleBuy(pack)}
                >
                  {buying === pack.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : native ? (
                    <Smartphone className="h-3.5 w-3.5" />
                  ) : (
                    <CreditCard className="h-3.5 w-3.5" />
                  )}
                  Buy pack
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>Secure checkout · charged once · no recurring billing</span>
        <Link
          to="/credits"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          All packs & history <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </section>
  );
}
