import { supabase } from "@/integrations/supabase/client";

/**
 * Verified fallback email address.
 *
 * After a passwordless email code is verified we remember the address so it
 * can be pre-filled for future relink / re-authentication attempts. Persisted
 * on the user's profile row and mirrored locally for instant/offline reads.
 */

export interface FallbackEmail {
  email: string;
  verifiedAt: string | null;
}

const LOCAL_KEY = "rsv:fallback-email";

const keyFor = (userId?: string | null) => (userId ? `${LOCAL_KEY}:${userId}` : LOCAL_KEY);

export function getLocalFallbackEmail(userId?: string | null): FallbackEmail | null {
  try {
    const raw = localStorage.getItem(keyFor(userId)) ?? localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FallbackEmail;
    return parsed?.email ? parsed : null;
  } catch {
    return null;
  }
}

function setLocalFallbackEmail(userId: string | null | undefined, value: FallbackEmail | null) {
  try {
    if (value) {
      const payload = JSON.stringify(value);
      localStorage.setItem(keyFor(userId), payload);
      localStorage.setItem(LOCAL_KEY, payload);
    } else {
      localStorage.removeItem(keyFor(userId));
      localStorage.removeItem(LOCAL_KEY);
    }
  } catch {
    /* storage unavailable */
  }
}

export async function fetchFallbackEmail(userId: string): Promise<FallbackEmail | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("fallback_email, fallback_email_verified_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return getLocalFallbackEmail(userId);

  const row = data as { fallback_email?: string | null; fallback_email_verified_at?: string | null } | null;
  if (!row?.fallback_email) return getLocalFallbackEmail(userId);

  const value: FallbackEmail = {
    email: row.fallback_email,
    verifiedAt: row.fallback_email_verified_at ?? null,
  };
  setLocalFallbackEmail(userId, value);
  return value;
}

/** Record an address that has just passed OTP verification. */
export async function saveVerifiedFallbackEmail(
  email: string,
  userId?: string | null,
): Promise<{ error: string | null }> {
  const address = email.trim().toLowerCase();
  if (!address) return { error: "No email address" };

  const value: FallbackEmail = { email: address, verifiedAt: new Date().toISOString() };
  setLocalFallbackEmail(userId, value);

  const id = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
  if (!id) return { error: null };

  const { error } = await supabase
    .from("profiles")
    .update({ fallback_email: address, fallback_email_verified_at: value.verifiedAt })
    .eq("user_id", id);

  return { error: error ? error.message : null };
}

export async function clearFallbackEmail(userId: string): Promise<{ error: string | null }> {
  setLocalFallbackEmail(userId, null);
  const { error } = await supabase
    .from("profiles")
    .update({ fallback_email: null, fallback_email_verified_at: null })
    .eq("user_id", userId);
  return { error: error ? error.message : null };
}

export function formatVerifiedAt(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
