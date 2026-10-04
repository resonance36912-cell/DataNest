type SignInOptions = { redirect_uri?: string; extraParams?: Record<string, string> };
type Provider = "google" | "apple" | "microsoft";
export const resonanceAuth = {
  auth: {
    async signInWithOAuth(_provider: Provider, _opts?: SignInOptions) {
      return { redirected: false, error: new Error("OAuth is disabled in sovereign local mode. Use the local Resonance account.") };
    },
  },
};