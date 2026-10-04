import { supabase } from "../supabase/client";
export function isLovableOAuthAvailable(): boolean { return false; }
export const lovable = { auth: { signInWithOAuth: async (_provider: "google"|"apple"|"microsoft", _opts?: any) => {
  const result = await supabase.auth.signInWithPassword({ email: "local@resonance.invalid", password: "local" });
  return { redirected: false, error: result.error, tokens: result.data?.session ?? null };
}}};
