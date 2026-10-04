"use client";

import dynamic from "next/dynamic";
import CollaborationVisual from "./CollaborationVisual";
import MotionControl from "./MotionControl";
import ResonanceBrandLockup from "./platform/ResonanceBrandLockup";
import GovernanceTrustMark from "./platform/GovernanceTrustMark";
import PlatformFooter from "./platform/PlatformFooter";
import ThemeControl from "./platform/ThemeControl";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { DATANEST_CANONICAL_NAME, DATANEST_PUBLIC_URL, RESON8_HUB_URL } from "@/lib/reson8";

function friendlyAuthError(error:unknown,fallback:string):string {
  const raw=error instanceof Error ? error.message.toLowerCase() : "";
  if (raw.includes("invalid login credentials")) return "We couldn’t sign you in. Check your email and password.";
  if (raw.includes("email not confirmed")) return "Your email has not been confirmed yet. Check your inbox for the confirmation message.";
  if (raw.includes("rate limit") || raw.includes("too many requests")) return "Too many attempts. Please wait a moment and try again.";
  if (raw.includes("network") || raw.includes("failed to fetch") || raw.includes("fetch")) return "DataNest could not reach the authentication service. Check your connection and try again.";
  return fallback;
}

const DataNestApp = dynamic(() => import("@/components/DataNestApp"), {
  ssr: false,
  loading: () => (
    <main className="authShell" aria-live="polite">
      <div className="bootPulse" aria-hidden="true" />
      <p>Loading DataNest workspace…</p>
    </main>
  )
});

type StartupState = "signed-out" | "signed-in" | "set-password" | "config-error";
const STARTUP_TIMEOUT_MS = 10000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error("Authentication service did not respond in time.")), timeoutMs);
    })
  ]);
}

export default function AuthGate() {
  const [startup, setStartup] = useState<StartupState>("signed-out");
  const [checkingSession, setCheckingSession] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [startupMessage, setStartupMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPasswordValue] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const initialize = useCallback(async () => {
    const supabase = getSupabase();

    if (!supabase) {
      setStartup("config-error");
      setStartupMessage("Public Supabase runtime configuration is missing.");
      return;
    }

    setStartupMessage("");
    setCheckingSession(true);

    try {
      const result = await withTimeout(supabase.auth.getSession(), STARTUP_TIMEOUT_MS);
      const flowType = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("type")
        || new URLSearchParams(window.location.search).get("type");

      if (result.error) {
        throw result.error;
      }

      setSession(result.data.session);
      setStartup(result.data.session
        ? (flowType === "invite" || flowType === "recovery" ? "set-password" : "signed-in")
        : "signed-out");
    } catch {
      setSession(null);
      setStartup("signed-out");
      setStartupMessage("We couldn’t verify an existing session. You can still sign in.");
    } finally {
      setCheckingSession(false);
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    void initialize();

    if (!supabase) return;

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      const flowType = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("type")
        || new URLSearchParams(window.location.search).get("type");
      setStartup(nextSession && (event === "PASSWORD_RECOVERY" || flowType === "invite" || flowType === "recovery")
        ? "set-password"
        : nextSession ? "signed-in" : "signed-out");
      setStartupMessage("");
    });

    return () => listener.subscription.unsubscribe();
  }, [initialize]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    const supabase = getSupabase();
    if (!supabase) return;

    setBusy(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (error) {
      setMessage(friendlyAuthError(error,"We couldn’t sign you in. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword(event: FormEvent) {
    event.preventDefault();
    const supabase = getSupabase();
    if (!supabase || !session) return;
    if (newPassword.length < 8) {
      setMessage("Use a password with at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      window.history.replaceState({}, document.title, window.location.pathname);
      setPassword("");
      setNewPasswordValue("");
      setConfirmPassword("");
      setStartup("signed-in");
      setMessage("Password updated. Your DataNest session is ready.");
    } catch (error) {
      setMessage(friendlyAuthError(error,"We couldn’t update your password. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function sendMagicLink() {
    const supabase = getSupabase();

    if (!supabase || !email) {
      setMessage("Enter your authorized email first.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const redirect = window.location.href.split("#")[0].split("?")[0];
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: redirect
        }
      });

      if (error) throw error;
      setMessage("Magic sign-in link sent.");
    } catch (error) {
      setMessage(friendlyAuthError(error,"We couldn’t send the magic link. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function sendPasswordReset() {
    const supabase = getSupabase();

    if (!supabase || !email) {
      setMessage("Enter your account email first.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const redirect = window.location.href.split("#")[0].split("?")[0];
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirect
      });

      if (error) throw error;
      setMessage("If this email belongs to an authorized account, a password reset link has been sent.");
    } catch (error) {
      setMessage(friendlyAuthError(error,"We couldn’t send the password reset email. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  if (startup === "config-error") {
    return (
      <main className="authShell">
        <section className="authCard" role="alert">
          <ResonanceBrandLockup />
          <h1>{DATANEST_CANONICAL_NAME}</h1>
          <p className="lede">{startupMessage}</p>
          <div className="setupBox">
            <b>Required public runtime values</b>
            <code>SUPABASE_URL</code>
            <code>SUPABASE_PUBLISHABLE_KEY</code>
          </div>
        </section>
      </main>
    );
  }

  if (startup === "set-password" && session) {
    return (
      <main className="authShell">
        <section className="authCard">
          <ResonanceBrandLockup />
          <h1>Set a new DataNest password</h1>
          <p className="lede">Choose a new password to finish secure account recovery or invitation setup.</p>
          <form onSubmit={submitNewPassword} className="authForm" aria-busy={busy}>
            <label>
              New password
              <div className="passwordField">
                <input type={showNewPassword ? "text" : "password"} required minLength={8} autoComplete="new-password" aria-label="New password" value={newPassword} onChange={(event) => setNewPasswordValue(event.target.value)} placeholder="At least 8 characters" />
                <button className="passwordToggle" type="button" aria-pressed={showNewPassword} aria-label={showNewPassword ? "Hide new password" : "Show new password"} onClick={() => setShowNewPassword(value => !value)}>{showNewPassword ? "Hide" : "Show"}</button>
              </div>
            </label>
            <label>
              Confirm password
              <div className="passwordField">
                <input type={showConfirmPassword ? "text" : "password"} required minLength={8} autoComplete="new-password" aria-label="Confirm password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Re-enter your password" />
                <button className="passwordToggle" type="button" aria-pressed={showConfirmPassword} aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"} onClick={() => setShowConfirmPassword(value => !value)}>{showConfirmPassword ? "Hide" : "Show"}</button>
              </div>
            </label>
            <button className="primaryButton" disabled={busy} type="submit">{busy ? "Saving…" : "Create password"}</button>
          </form>
          <div className="authMessageSlot" aria-live="polite" role="status">{message && <div className="authMessage">{message}</div>}</div>
        </section>
      </main>
    );
  }

  if (startup === "signed-in" && session) {
    return <DataNestApp session={session} />;
  }

  return (
    <main className="authShell authLanding">
      <a className="skipLink" href="#sign-in-email">Skip to sign in</a>
      <header className="landingHeader">
        <a className="landingBrand" href="#" aria-label="Resonance DataNest home"><ResonanceBrandLockup compact /></a>
        <div className="landingHeaderActions"><GovernanceTrustMark/><span className="landingThemeControl"><ThemeControl compact /></span><a className="landingHubLink" href={RESON8_HUB_URL} target="_blank" rel="noreferrer">Reson8 Hub <span aria-hidden="true">↗</span></a><a className="landingHubLink" href="./transparency">Public Audit Library <span aria-hidden="true">↗</span></a><MotionControl/></div>
      </header>
      <div className="landingLayout">
      <section className="landingStory" aria-labelledby="landing-title">
        <p className="aiIEyebrow">AI &amp; I · A SHARED WORKSPACE</p>
        <h2 id="landing-title">Your intent.<br/><span>Amplified.</span></h2>
        <p className="landingLede">Bring human direction and AI intelligence together. Turn ideas into governed work, with a clear path from first spark to execution.</p>
        <CollaborationVisual/>
        <ol className="landingSteps" aria-label="The Resonance workflow">
          <li><span>01</span><b>Spark</b><small>Capture intent</small></li>
          <li><span>02</span><b>Think</b><small>Explore with AI</small></li>
          <li><span>03</span><b>Govern</b><small>Review decisions</small></li>
          <li><span>04</span><b>Execute</b><small>Track the work</small></li>
        </ol>
      </section>
      <section className="authCard landingSignIn" aria-labelledby="sign-in-title">
        <ResonanceBrandLockup />
        <h1 id="sign-in-title">{DATANEST_CANONICAL_NAME}</h1>
        <p className="lede">Welcome to your workspace. Sign in to continue.</p>

        <form onSubmit={signIn} className="authForm" aria-busy={busy}>
          <label>
            Email
            <input
              id="sign-in-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Authorized email"
            />
          </label>
          <label>
            Password
            <div className="passwordField">
            <input
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              aria-label="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
            />
            <button className="passwordToggle" type="button" aria-pressed={showPassword} aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(value => !value)}>{showPassword ? "Hide" : "Show"}</button>
            </div>
          </label>
          <button className="primaryButton" disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button className="secondaryButton authMagicLink" disabled={busy} type="button" onClick={sendMagicLink}>
            Email me a magic link
          </button>
          <button className="authRecoveryButton" disabled={busy} type="button" onClick={sendPasswordReset}>
            Forgot password?
          </button>
        </form>

        <div className="authMessageSlot" aria-live="polite" role="status">
          {message && <div className="authMessage">{message}</div>}
        </div>
        <p className="securityNote">Sign in with your authorized account. Need access? Ask your project administrator for an invitation.</p>
        <p className={"sessionCheckNote"+(startupMessage ? " sessionCheckError" : "")} role="status" aria-live="polite">
          {checkingSession ? "Checking your existing session…" : startupMessage || ""}
          {startupMessage && !checkingSession && <button className="sessionCheckRetry" type="button" onClick={() => void initialize()}>Retry session check</button>}
        </p>
        <noscript><p className="authMessage">JavaScript is required to sign in. Enable JavaScript and reload this page.</p></noscript>
      </section>
      </div>
      <PlatformFooter compact />
    </main>
  );
}
