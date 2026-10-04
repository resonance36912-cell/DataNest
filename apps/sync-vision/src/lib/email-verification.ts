import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Email-verification helpers for the admin portal.
 *
 * Admin access requires a *confirmed* mailbox: `email_confirmed_at` is set by
 * the auth server only after the recipient opens the verification link, so it
 * cannot be forged client-side.
 */

const COOLDOWN_KEY = "syncvision.verify.resend.v1";
export const RESEND_COOLDOWN_MS = 60_000;

export function isEmailVerified(user: User | null | undefined): boolean {
  if (!user) return false;
  const u = user as User & { confirmed_at?: string | null };
  return Boolean(user.email_confirmed_at || u.confirmed_at);
}

/** Milliseconds left before another verification email may be requested. */
export function resendCooldownRemaining(email: string): number {
  try {
    const raw = localStorage.getItem(`${COOLDOWN_KEY}:${email.toLowerCase()}`);
    if (!raw) return 0;
    const last = Number(raw);
    if (!Number.isFinite(last)) return 0;
    return Math.max(0, RESEND_COOLDOWN_MS - (Date.now() - last));
  } catch {
    return 0;
  }
}

function markResent(email: string): void {
  try {
    localStorage.setItem(`${COOLDOWN_KEY}:${email.toLowerCase()}`, String(Date.now()));
  } catch {
    /* storage unavailable — cooldown is best-effort */
  }
}

export interface ResendResult {
  error: Error | null;
  /** Cooldown remaining after this attempt, in ms. */
  cooldownMs: number;
}

/** Re-sends the branded verification email, respecting a local cooldown. */
export async function resendVerificationEmail(email: string): Promise<ResendResult> {
  const address = email.trim();
  if (!address) {
    return { error: new Error("No email address on this account."), cooldownMs: 0 };
  }

  const remaining = resendCooldownRemaining(address);
  if (remaining > 0) {
    return {
      error: new Error(
        `Please wait ${Math.ceil(remaining / 1000)}s before requesting another email.`,
      ),
      cooldownMs: remaining,
    };
  }

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: address,
    options: { emailRedirectTo: `${window.location.origin}/admin/login` },
  });

  if (error) {
    return { error: new Error(error.message), cooldownMs: 0 };
  }

  markResent(address);
  return { error: null, cooldownMs: RESEND_COOLDOWN_MS };
}
