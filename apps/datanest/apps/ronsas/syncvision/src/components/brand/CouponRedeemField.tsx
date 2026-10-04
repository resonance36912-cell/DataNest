import * as React from "react";
import { Loader2, Tag, Check, X, Ticket } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FREE_PROMOTION_ACTIVE } from "@/lib/promotion";
import {
  useRedeemCoupon,
  useValidateCoupon,
  formatDiscountLabel,
  getPendingDiscount,
  clearPendingDiscountCode,
  type CouponResult,
} from "@/lib/coupons";

type Variant = "checkout" | "billing";

/**
 * Inline coupon entry field. Used both on the paywall (checkout context — stores
 * a discount code to attach to Hub checkout) and the billing/account page
 * (immediate redeem for credits/tier unlocks).
 */
export function CouponRedeemField({
  variant = "billing",
  className = "",
  onRedeemed,
}: {
  variant?: Variant;
  className?: string;
  onRedeemed?: (result: CouponResult) => void;
}) {
  if (FREE_PROMOTION_ACTIVE) return null;

  const [code, setCode] = React.useState("");
  const [preview, setPreview] = React.useState<CouponResult | null>(null);
  const validate = useValidateCoupon();
  const redeem = useRedeemCoupon();
  const debounceRef = React.useRef<number | null>(null);
  const [pending, setPending] = React.useState(() => getPendingDiscount());

  // Debounced preview while typing (checkout variant only — keeps billing UI quiet).
  React.useEffect(() => {
    if (variant !== "checkout") return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setPreview(null);
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) return;
    debounceRef.current = window.setTimeout(() => {
      validate.mutate(trimmed, { onSuccess: (r) => setPreview(r) });
    }, 400);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, variant]);

  const handleRedeem = () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) return;
    redeem.mutate(trimmed, {
      onSuccess: (r) => {
        if (r.ok) {
          const label = formatDiscountLabel(r);
          toast.success(
            r.type === "credits"
              ? `Credits added — ${label}`
              : r.type === "tier"
              ? label
              : `Discount ready — ${label}`,
          );
          setCode("");
          setPreview(null);
          setPending(getPendingDiscount());
          onRedeemed?.(r);
        } else {
          toast.error(r.message || "Code not valid");
        }
      },
      onError: (e) => toast.error(e.message || "Couldn't redeem code"),
    });
  };

  const removePending = () => {
    clearPendingDiscountCode();
    setPending(null);
    toast.message("Discount removed");
  };

  const busy = redeem.isPending;
  const previewOk = preview?.ok && preview?.type;

  return (
    <div className={`space-y-2 ${className}`}>
      {variant === "checkout" && pending && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1.5 text-emerald-200">
            <Ticket className="h-3.5 w-3.5" />
            <strong className="font-mono">{pending.code}</strong>
            <span className="text-emerald-200/80">
              {pending.label ? `· ${pending.label}` : "· applied at checkout"}
            </span>
          </span>
          <button
            type="button"
            onClick={removePending}
            className="rounded p-0.5 text-emerald-200/70 hover:text-white"
            aria-label="Remove discount code"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <Tag className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") handleRedeem(); }}
            placeholder="Promo code"
            maxLength={32}
            className="h-9 pl-8 font-mono uppercase tracking-wider"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <Button
          type="button"
          onClick={handleRedeem}
          disabled={busy || code.trim().length < 4}
          size="sm"
          variant={variant === "checkout" ? "secondary" : "default"}
          className="h-9 min-w-[5.5rem]"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : variant === "checkout" ? "Apply" : "Redeem"}
        </Button>
      </div>

      {variant === "checkout" && preview && (
        <p
          className={`flex items-center gap-1.5 text-[11px] ${
            previewOk ? "text-emerald-300" : "text-red-300"
          }`}
        >
          {previewOk ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {previewOk ? formatDiscountLabel(preview) : preview.message}
        </p>
      )}
    </div>
  );
}
