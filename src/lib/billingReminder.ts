/**
 * billingReminder
 *
 * Lightweight, frontend-only reminder system for fal.ai billing-exhausted
 * events. When a merge fails (or partially completes) due to billing, we:
 *
 *   1) Persist a flag in localStorage so the reminder survives reloads /
 *      step changes inside the same browser.
 *   2) Schedule a follow-up "Top up & retry" toast ~60s later, giving the
 *      user enough time to top up and let credits propagate before we
 *      nudge them to retry the merge.
 *   3) Surface a one-time persistent toast on hook mount if a recent
 *      (<24h) unresolved reminder is found, so users who close the tab
 *      and come back still get the prompt.
 *
 * Email delivery is intentionally out of scope here — the project does not
 * yet have an email domain configured, and an in-app toast covers the
 * stated need ("in-app notification or email prompt"). If the user later
 * wires up Lovable Emails, this module is the single integration point.
 */

import { toast } from "sonner";
import { FREE_PROMOTION_ACTIVE } from "@/lib/promotion";

const STORAGE_KEY = "merge.billingReminder.v1";
const REMINDER_DELAY_MS = 60_000; // 60s — enough time for a fal.ai top-up to propagate
const REMINDER_TTL_MS = 24 * 60 * 60 * 1000; // 24h — drop stale reminders

interface ReminderRecord {
  exhaustedAt: number;
  projectId?: string | null;
  /** True once the delayed reminder toast has been shown for this record. */
  reminded?: boolean;
}

const safeRead = (): ReminderRecord | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as ReminderRecord;
    if (!rec || typeof rec.exhaustedAt !== "number") return null;
    if (Date.now() - rec.exhaustedAt > REMINDER_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return rec;
  } catch {
    return null;
  }
};

const safeWrite = (rec: ReminderRecord) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
  } catch {
    /* quota or disabled — best-effort only */
  }
};

const safeClear = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
};

const showReminderToast = (onRetry?: () => void) => {
  if (FREE_PROMOTION_ACTIVE) {
    toast.warning("Rendering capacity is temporarily unavailable.", {
      id: "billing-retry-reminder",
      description:
        "Your promotional access remains free. The video provider is temporarily unavailable; retry shortly or contact support if the issue persists.",
      duration: 20_000,
      action: onRetry ? { label: "Retry now", onClick: onRetry } : undefined,
    });
    return;
  }

  toast.warning("Provider billing requires attention. Try the merge again after funding is restored.", {
    id: "billing-retry-reminder",
    description:
      "Provider balances usually propagate within ~30 seconds. Click Retry to resume.",
    duration: 20_000,
    action: onRetry ? { label: "Retry now", onClick: onRetry } : undefined,
  });
};

/**
 * Mark that fal.ai billing exhausted, and schedule a follow-up reminder
 * toast. Safe to call multiple times — only the first call within a TTL
 * window will arm a fresh timer.
 */
export function scheduleBillingReminder(opts: {
  projectId?: string | null;
  onRetry?: () => void;
}): void {
  const existing = safeRead();
  if (existing && !existing.reminded) {
    // Reminder already armed for this exhaustion event.
    return;
  }

  const rec: ReminderRecord = {
    exhaustedAt: Date.now(),
    projectId: opts.projectId ?? null,
    reminded: false,
  };
  safeWrite(rec);

  window.setTimeout(() => {
    const current = safeRead();
    if (!current) return; // user cleared / merged successfully
    showReminderToast(opts.onRetry);
    safeWrite({ ...current, reminded: true });
  }, REMINDER_DELAY_MS);
}

/**
 * Re-surface the reminder if a recent unresolved billing event is sitting
 * in storage (e.g. user reloaded the page, switched steps, or closed the
 * tab between exhaustion and retry). Only fires once per page load.
 */
export function maybeReplayBillingReminder(opts: {
  projectId?: string | null;
  onRetry?: () => void;
}): void {
  const rec = safeRead();
  if (!rec) return;
  if (opts.projectId && rec.projectId && rec.projectId !== opts.projectId) return;

  // If the original 60s timer never fired (page was closed), show now.
  // Otherwise re-show as a persistent nudge.
  showReminderToast(opts.onRetry);
  safeWrite({ ...rec, reminded: true });
}

/**
 * Clear the reminder — call on a fresh merge start or a successful
 * completion so the user isn't nagged after they've already retried.
 */
export function clearBillingReminder(): void {
  safeClear();
  toast.dismiss("billing-retry-reminder");
}
