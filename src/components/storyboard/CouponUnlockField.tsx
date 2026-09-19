import { useState } from "react";
import { Ticket, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { CouponRedeemField } from "@/components/brand/CouponRedeemField";
import { grantCouponUnlock } from "@/lib/featureGates";
import { FREE_PROMOTION_ACTIVE } from "@/lib/promotion";

/**
 * Inline "Have a coupon?" toggle shown next to a locked Generate Video button.
 * On ANY successful redemption, we grant a local unlock for `storyboard_video`
 * so the gate flips to allowed immediately — independent of Hub propagation.
 * Tier coupons also bust the entitlement cache via useRedeemCoupon, so the
 * real tier upgrade lands on the next fetch and the local override expires.
 */
export default function CouponUnlockField() {
  const [open, setOpen] = useState(false);

  if (FREE_PROMOTION_ACTIVE) return null;

  return (
    <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 px-2 py-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <span className="inline-flex items-center gap-1.5">
          <Ticket className="h-3 w-3" />
          Have a coupon? Unlock video generation
        </span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-2">
          <CouponRedeemField
            variant="billing"
            onRedeemed={(r) => {
              if (!r.ok) return;
              grantCouponUnlock("storyboard_video");
              toast.success("Video generation unlocked");
            }}
          />
        </div>
      )}
    </div>
  );
}
