// Sovereign-local compatibility surface. Hosted Lovable Cloud authentication
// is intentionally disabled. The local Supabase-compatibility layer supplies
// the on-device session used by the Studio.
type SignInOptions = { redirect_uri?: string; extraParams?: Record<string, string> };
export const lovable = {
  auth: {
    async signInWithOAuth(_provider: "google" | "apple" | "microsoft", _opts?: SignInOptions) {
      return { redirected: false, error: new Error("Hosted OAuth is disabled in sovereign-local preview mode."), local: true };
    },
  },
};
