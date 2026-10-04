import { createContext, useContext, useCallback, useEffect, useRef, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { hubSupabase } from "@/integrations/hub/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import {
  broadcastSignOut,
  onAuthBroadcast,
  rememberReturnPath,
  consumeReturnPath,
} from "@/lib/auth-broadcast";
import { recordSecurityEvent } from "@/lib/security-audit-log";
import {
  recordSessionAlert,
  rememberSignInMarker,
  getSignInMarker,
  clearSignInMarker,
  SESSION_ALERT_MESSAGES,
} from "@/lib/session-alerts";


interface AuthContextType {
  /**
   * Spoke session — used for all product-DB reads/writes and RLS
   * (`auth.uid() = user_id`). This is what the 40+ existing `useAuth().user`
   * consumers expect, so we keep `user`/`session` pointed at the spoke.
   */
  session: Session | null;
  user: User | null;
  /**
   * Hub session — source of truth for identity, entitlement, and credits on
   * the Resonance Hub. Use this only when calling hub HTTP endpoints
   * (`/api/public/entitlement`, `/api/public/usage/*`) or when you need the
   * hub user id to link back to `profiles.hub_user_id`.
   */
  hubSession: Session | null;
  hubUser: User | null;
  profile: { display_name: string; avatar_url: string } | null;
  loading: boolean;
  /**
   * True when the product (spoke) session is ready for RLS-backed reads and
   * writes. The Hub session is optional because Google OAuth is brokered for
   * the product project and may be linked later in the background.
   */
  spokeReady: boolean;
  /**
   * Google sign-in. Pass a same-origin relative path to return the user
   * there once the session is confirmed (never used as the OAuth
   * `redirect_uri`, which always stays on the public app origin).
   */
  signInWithGoogle: (returnTo?: string) => Promise<{ error: Error | null }>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  /** Passwordless fallback: email a 6-digit sign-in code. */
  sendEmailOtp: (email: string) => Promise<{ error: Error | null }>;
  /** Passwordless fallback: verify the emailed code and open a session. */
  verifyEmailOtp: (email: string, token: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;

}


const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Detect Supabase "invalid credentials" without depending on a specific error
// code enum (it varies between gotrue versions).
function isInvalidCredentials(err: { message?: string; status?: number } | null | undefined): boolean {
  if (!err) return false;
  const msg = (err.message || "").toLowerCase();
  return err.status === 400 && (msg.includes("invalid") || msg.includes("credentials"));
}

async function backfillHubUserIdMapping(spokeUserId: string, hubUserId: string): Promise<void> {
  try {
    // `hub_user_id` was added in a recent migration; the generated types may
    // not include it yet in this build. Cast the payload to bypass the
    // narrow row type without altering runtime behaviour.
    const { error } = await supabase
      .from("profiles")
      .update({ hub_user_id: hubUserId } as never)
      .eq("user_id", spokeUserId)
      .is("hub_user_id", null);
    if (error && !/hub_user_id/i.test(error.message)) {
      console.warn("[auth] hub_user_id backfill failed:", error.message);
    }
  } catch (e) {
    console.warn("[auth] hub_user_id backfill threw:", e);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Spoke is the primary session for `user`/`session` because every product
  // consumer of `useAuth()` reads/writes spoke tables and expects the spoke
  // auth.uid(). Hub session is exposed separately for hub HTTP calls.
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [hubSession, setHubSession] = useState<Session | null>(null);
  const [hubUser, setHubUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{ display_name: string; avatar_url: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Guards mapping backfill from double-firing across the two subscriptions.
  const mappedRef = useRef<string | null>(null);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("user_id", userId)
      .single();
    if (data) setProfile(data);
  };

  useEffect(() => {
    let disposed = false;

    // Hub subscription — identity + entitlement only.
    const { data: { subscription: hubSub } } = hubSupabase.auth.onAuthStateChange((_e, hs) => {
      setHubSession(hs);
      setHubUser(hs?.user ?? null);
      setLoading(false);
    });

    // Spoke subscription — product-DB access + profile. This is the `user`
    // exposed by useAuth().
    const { data: { subscription: spokeSub } } = supabase.auth.onAuthStateChange((event, spokeSession) => {
      setSession(spokeSession);
      const su = spokeSession?.user ?? null;
      setUser(su);
      if (su) {
        setTimeout(() => fetchProfile(su.id), 0);
        // Baseline for "new session on another device" detection: this device's
        // own session was issued at this `last_sign_in_at`.
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
          rememberSignInMarker(su.id, su.last_sign_in_at);
        }
      } else {
        setProfile(null);
        mappedRef.current = null;
      }


      // Security audit trail (local, per-device).
      const auditType =
        event === "SIGNED_IN" ? "sign_in" :
        event === "TOKEN_REFRESHED" ? "session_refresh" :
        event === "SIGNED_OUT" ? "sign_out" : null;
      if (auditType) {
        void recordSecurityEvent({
          type: auditType,
          userId: su?.id ?? null,
          email: su?.email ?? null,
          provider: (su?.app_metadata?.provider as string | undefined) ?? null,
        });
      }
    });


    // Initial hydration for both. A stalled secondary auth project must never
    // leave the entire application behind a permanent loading spinner.
    const hydrationTimeout = window.setTimeout(() => {
      if (!disposed) setLoading(false);
    }, 8_000);

    void Promise.allSettled([
      hubSupabase.auth.getSession(),
      supabase.auth.getSession(),
    ]).then(([hubResult, spokeResult]) => {
      if (disposed) return;

      const hub = hubResult.status === "fulfilled" ? hubResult.value.data : null;
      const spoke = spokeResult.status === "fulfilled" ? spokeResult.value.data : null;

      setHubSession(hub?.session ?? null);
      setHubUser(hub?.session?.user ?? null);
      setSession(spoke?.session ?? null);
      setUser(spoke?.session?.user ?? null);
      if (spoke?.session?.user) void fetchProfile(spoke.session.user.id);
      setLoading(false);
    }).finally(() => window.clearTimeout(hydrationTimeout));

    return () => {
      disposed = true;
      window.clearTimeout(hydrationTimeout);
      hubSub.unsubscribe();
      spokeSub.unsubscribe();
    };
  }, []);

  // ---- Session stability -------------------------------------------------
  // Browsers throttle timers in background tabs, so Supabase's auto-refresh
  // can miss its window and the user comes back to a dead token (silent 401s
  // on every product query). Re-validate both sessions whenever the tab
  // becomes visible or regains focus, and proactively refresh when the access
  // token expires within the next two minutes.
  useEffect(() => {
    const REFRESH_MARGIN_SEC = 120;
    let running = false;

    const ensureFresh = async () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const nowSec = Math.floor(Date.now() / 1000);
        await Promise.all(
          ([
            ["hub", hubSupabase] as const,
            ["spoke", supabase] as const,
          ]).map(async ([label, client]) => {
            const { data } = await client.auth.getSession();
            const s = data.session;
            if (!s) return;
            if ((s.expires_at ?? 0) - nowSec > REFRESH_MARGIN_SEC) return;
            const { error } = await client.auth.refreshSession();
            if (error) console.warn(`[auth] ${label} refresh failed:`, error.message);
          }),
        );
        await detectRemoteSessionChanges();
      } finally {
        running = false;
      }
    };

    // ---- Account-level session notifications ------------------------------
    // Runs on the same cadence as the freshness check (focus / visibility /
    // online / 60s). Two signals, both derived from the auth server:
    //   * the server no longer honours this device's refresh token while we
    //     still hold a local session -> the account was signed out everywhere;
    //   * `last_sign_in_at` moved ahead of the value this device's session was
    //     issued with -> a new session was created on another device.
    const detectRemoteSessionChanges = async () => {
      const marker = getSignInMarker();
      const { data: local } = await supabase.auth.getSession();
      if (!local.session) return;

      const { data: remote, error } = await supabase.auth.getUser();
      const status = (error as { status?: number } | null)?.status;

      if (error && (status === 401 || status === 403)) {
        recordSessionAlert({
          type: "signed_out_everywhere",
          email: local.session.user.email ?? null,
          detail: "The auth server rejected this device's session.",
        });
        toast.error("Signed out everywhere", {
          description: SESSION_ALERT_MESSAGES.signed_out_everywhere,
        });
        clearSignInMarker();
        await Promise.allSettled([
          hubSupabase.auth.signOut({ scope: "local" }),
          supabase.auth.signOut({ scope: "local" }),
        ]);
        setSession(null);
        setUser(null);
        setHubSession(null);
        setHubUser(null);
        setProfile(null);
        mappedRef.current = null;
        return;
      }

      const remoteUser = remote?.user;
      if (!remoteUser?.last_sign_in_at) return;

      if (!marker || marker.userId !== remoteUser.id) {
        rememberSignInMarker(remoteUser.id, remoteUser.last_sign_in_at);
        return;
      }

      const remoteAt = new Date(remoteUser.last_sign_in_at).getTime();
      const knownAt = new Date(marker.lastSignInAt).getTime();
      if (Number.isFinite(remoteAt) && Number.isFinite(knownAt) && remoteAt > knownAt + 1000) {
        rememberSignInMarker(remoteUser.id, remoteUser.last_sign_in_at);
        recordSessionAlert({
          type: "new_session",
          email: remoteUser.email ?? null,
          detail: `Signed in at ${new Date(remoteAt).toLocaleString()}`,
        });
        toast.warning("New sign-in detected", {
          description: SESSION_ALERT_MESSAGES.new_session,
        });
      }
    };


    const onVisible = () => {
      if (document.visibilityState === "visible") void ensureFresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    const interval = window.setInterval(() => void ensureFresh(), 60_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
      window.clearInterval(interval);
    };
  }, []);

  // ---- Single sign-out across tabs / dashboards ---------------------------
  // A sign-out anywhere (user dashboard, admin dashboard, another tab) tears
  // down both sessions here too, so admin and product surfaces can never end
  // up in mismatched auth states.
  useEffect(() => {
    return onAuthBroadcast(async (e) => {
      if (e.type !== "signout") return;
      await Promise.allSettled([
        hubSupabase.auth.signOut({ scope: "local" }),
        supabase.auth.signOut({ scope: "local" }),
      ]);
      setSession(null);
      setUser(null);
      setHubSession(null);
      setHubUser(null);
      setProfile(null);
      mappedRef.current = null;
    });
  }, []);

  // After an OAuth round-trip, return the user to where they started.
  useEffect(() => {
    if (!user && !hubUser) return;
    const target = consumeReturnPath();
    if (target && target !== window.location.pathname) {
      window.history.replaceState(null, "", target);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, [user, hubUser]);

  // Whenever both sessions exist, ensure profiles.hub_user_id is linked.
  useEffect(() => {
    if (!user || !hubUser) return;
    const key = `${user.id}:${hubUser.id}`;
    if (mappedRef.current === key) return;
    mappedRef.current = key;
    void backfillHubUserIdMapping(user.id, hubUser.id);
  }, [user, hubUser]);


  const spokeReady = !!user;


  const signInWithGoogle = useCallback(
    async (returnTo?: string): Promise<{ error: Error | null }> => {
      if (returnTo) rememberReturnPath(returnTo);
      try {
        const result = await lovable.auth.signInWithOAuth("google", {
          // Always a public, same-origin URL — never a guarded route.
          redirect_uri: window.location.origin,
          extraParams: { prompt: "select_account" },
        });

        if (result?.error) {
          const err = new Error(result.error.message || "Google sign-in failed");
          toast.error(err.message);
          return { error: err };
        }


        // Full-page redirect flow: the browser is leaving; nothing else to do.
        if (result?.redirected) return { error: null };

        // Popup flow: the session is already set on the client.
        return { error: null };
      } catch (e) {
        const err = e instanceof Error ? e : new Error("Google sign-in failed");
        toast.error(err.message);
        return { error: err };
      }
    },
    [],
  );


  const signInWithEmail = async (email: string, password: string) => {
    // 1. Hub sign-in must succeed.
    const hub = await hubSupabase.auth.signInWithPassword({ email, password });
    if (hub.error) return { error: new Error(hub.error.message) };

    // 2. Spoke sign-in with the same credentials. If the spoke doesn't have
    //    the user yet, provision them so RLS keeps working.
    let spoke = await supabase.auth.signInWithPassword({ email, password });
    if (spoke.error && isInvalidCredentials(spoke.error)) {
      const meta = hub.data.user?.user_metadata ?? {};
      const name = (meta.full_name as string) || (meta.name as string) || "";
      const signup = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: window.location.origin,
        },
      });
      if (signup.error) {
        await hubSupabase.auth.signOut();
        return { error: new Error(`Spoke provisioning failed: ${signup.error.message}`) };
      }
      // Auto-confirm is on, so signIn should now work.
      spoke = await supabase.auth.signInWithPassword({ email, password });
    }
    if (spoke.error) {
      await hubSupabase.auth.signOut();
      return { error: new Error(`Spoke sign-in failed: ${spoke.error.message}`) };
    }

    return { error: null };
  };

  const signUpWithEmail = async (email: string, password: string, name: string) => {
    // 1. Hub sign-up first.
    const hub = await hubSupabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: window.location.origin,
      },
    });
    if (hub.error) return { error: new Error(hub.error.message) };

    // 2. Spoke sign-up. If the spoke user already exists with a different
    //    password, this returns an error — surface it and roll back the hub.
    const spoke = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: window.location.origin,
      },
    });
    if (spoke.error) {
      await hubSupabase.auth.signOut();
      return { error: new Error(`Spoke sign-up failed: ${spoke.error.message}`) };
    }

    return { error: null };
  };

  /**
   * Passwordless fallback used when Google re-auth fails or the account has
   * no Google identity. Emails a one-time code from the app (spoke) project,
   * which is the same session Google sign-in establishes.
   */
  const sendEmailOtp = async (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return { error: new Error("Enter your email address.") };
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin,
      },
    });
    return { error: error ? new Error(error.message) : null };
  };

  const verifyEmailOtp = async (email: string, token: string) => {
    const trimmed = email.trim().toLowerCase();
    const code = token.trim();
    if (code.length < 6) return { error: new Error("Enter the 6-digit code from your email.") };
    const { error } = await supabase.auth.verifyOtp({
      email: trimmed,
      token: code,
      type: "email",
    });
    return { error: error ? new Error(error.message) : null };
  };


  const signOut = async () => {
    // Cancel any active render jobs before signing out (spoke-side).
    try {
      if (user?.id) {
        await supabase
          .from("render_jobs")
          .update({ status: "cancelled", error: "Cleared on logout" })
          .eq("user_id", user.id)
          .in("status", ["queued", "submitted", "processing"]);
      }
    } catch (e) {
      console.warn("Failed to clear jobs on logout:", e);
    }
    // `global` revokes every refresh token for the user, so other devices and
    // the admin surface can't keep a stale session alive.
    const results = await Promise.allSettled([
      hubSupabase.auth.signOut({ scope: "global" }),
      supabase.auth.signOut({ scope: "global" }),
    ]);
    // If the network call failed, still drop the local session so the UI
    // never shows a signed-in state the server no longer honours.
    if (results.some((r) => r.status === "rejected")) {
      await Promise.allSettled([
        hubSupabase.auth.signOut({ scope: "local" }),
        supabase.auth.signOut({ scope: "local" }),
      ]);
    }

    setSession(null);
    setUser(null);
    setHubSession(null);
    setHubUser(null);
    setProfile(null);
    mappedRef.current = null;

    // Tell every other open tab (user + admin dashboards) to sign out too.
    clearSignInMarker();
    broadcastSignOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        hubSession,
        hubUser,
        profile,
        loading,
        spokeReady,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendEmailOtp,
        verifyEmailOtp,

        signOut,
      }}
    >

      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
