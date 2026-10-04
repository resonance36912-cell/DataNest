import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Public, unguarded OAuth callback route.
 *
 * Handles both PKCE (?code=…) and implicit (#access_token=…) responses,
 * then routes the user to `sessionStorage.post_login_redirect` (falling
 * back to `/`). Must NOT be wrapped in any auth guard.
 */
const AuthCallback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const finish = (path: string) => {
      let target = "/";
      try {
        const stored = sessionStorage.getItem("post_login_redirect");
        if (stored && stored.startsWith("/") && !stored.startsWith("//")) {
          target = stored;
        }
      } catch { /* ignore */ }
      try { sessionStorage.removeItem("post_login_redirect"); } catch { /* ignore */ }
      navigate(target || path, { replace: true });
    };

    (async () => {
      try {
        const url = new URL(window.location.href);
        const hasCode = url.searchParams.has("code");
        const errParam =
          url.searchParams.get("error_description") ||
          url.searchParams.get("error");

        if (errParam) {
          setError(errParam);
          return;
        }

        if (hasCode) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(
            window.location.href,
          );
          if (exErr) {
            setError(exErr.message);
            return;
          }
        }

        // For implicit flow (hash tokens), detectSessionInUrl handles it.
        // Give it a tick to settle, then read the session.
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          finish("/");
        } else {
          // Wait briefly for onAuthStateChange to fire
          const sub = supabase.auth.onAuthStateChange((_e, session) => {
            if (session) {
              sub.data.subscription.unsubscribe();
              finish("/");
            }
          });
          setTimeout(() => {
            sub.data.subscription.unsubscribe();
            supabase.auth.getSession().then(({ data: d }) => {
              if (d.session) finish("/");
              else setError("No session was created. Please try signing in again.");
            });
          }, 2500);
        }
      } catch (err: any) {
        setError(err?.message ?? String(err));
      }
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center space-y-3 max-w-md">
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-foreground">Sign-in failed</h1>
            <p className="text-sm text-muted-foreground break-words">{error}</p>
            <button
              type="button"
              onClick={() => navigate("/login", { replace: true })}
              className="text-primary hover:underline text-sm"
            >
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Completing sign-in…</p>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;
