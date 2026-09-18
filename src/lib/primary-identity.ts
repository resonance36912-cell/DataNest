import { supabase } from "@/integrations/supabase/client";

/**
 * "Primary sign-in method" preference.
 *
 * Supabase has no native concept of a primary identity, so we persist the
 * user's preferred identity id on their profile row (and mirror it locally so
 * the UI can render instantly / offline).
 */

const localKey = (userId: string) => `rsv:primary-identity:${userId}`;

export function getLocalPrimaryIdentity(userId: string): string | null {
  try {
    return localStorage.getItem(localKey(userId));
  } catch {
    return null;
  }
}

function setLocalPrimaryIdentity(userId: string, identityId: string | null) {
  try {
    if (identityId) localStorage.setItem(localKey(userId), identityId);
    else localStorage.removeItem(localKey(userId));
  } catch {
    /* storage unavailable */
  }
}

export async function fetchPrimaryIdentity(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("primary_identity_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return getLocalPrimaryIdentity(userId);

  const value = (data?.primary_identity_id as string | null) ?? null;
  setLocalPrimaryIdentity(userId, value);
  return value;
}

export async function savePrimaryIdentity(
  userId: string,
  identityId: string | null,
): Promise<{ error: string | null }> {
  setLocalPrimaryIdentity(userId, identityId);

  const { error } = await supabase
    .from("profiles")
    .update({ primary_identity_id: identityId })
    .eq("user_id", userId);

  return { error: error ? error.message : null };
}
