/**
 * Guided relink / connect flow.
 *
 * Four steps that survive the OAuth round-trip (state is persisted in
 * sessionStorage and resumed when Google bounces the user back to /account):
 *
 *   1. Re-authenticate  — Google, or an emailed code as fallback.
 *   2. Connect          — link (or relink) the Google identity.
 *   3. Verify           — read identities back from the auth server and
 *                         confirm a Google identity is present.
 *   4. Done             — hand the refreshed list back to the panel.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Loader2, ShieldCheck, Link2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { recordSecurityEvent } from "@/lib/security-audit-log";
import EmailOtpFallback from "@/components/auth/EmailOtpFallback";
import { fetchFallbackEmail, getLocalFallbackEmail, type FallbackEmail } from "@/lib/fallback-email";


const STATE_KEY = "sv-relink-wizard";

export type WizardMode = "connect" | "relink";

type WizardStep = "reauth" | "connect" | "verify" | "done";

interface PersistedState {
  mode: WizardMode;
  step: WizardStep;
  /** Google identity ids known before the flow started. */
  before: string[];
  startedAt: number;
}

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "reauth", label: "Re-authenticate" },
  { id: "connect", label: "Connect Google" },
  { id: "verify", label: "Verify identity" },
  { id: "done", label: "Updated" },
];

/** Sensitive actions require a sign-in within this window. */
const REAUTH_WINDOW_MS = 10 * 60 * 1000;

type Identity = {
  identity_id?: string;
  provider: string;
  identity_data?: Record<string, unknown> | null;
  last_sign_in_at?: string | null;
};

function loadState(): PersistedState | null {
  try {
    const raw = window.sessionStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    // Stale flows (>30 min) are discarded.
    if (Date.now() - parsed.startedAt > 30 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveState(state: PersistedState | null): void {
  try {
    if (state) window.sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
    else window.sessionStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
}

/** True when a flow was interrupted by the OAuth redirect and can resume. */
export function hasPendingRelinkFlow(): boolean {
  return loadState() !== null;
}

interface Props {
  open: boolean;
  mode: WizardMode;
  onOpenChange: (open: boolean) => void;
  /** Called after the identity list has been verified so the panel can reload. */
  onCompleted: () => void;
}

export default function IdentityRelinkWizard({ open, mode, onOpenChange, onCompleted }: Props) {
  const { user, hubUser, signInWithGoogle } = useAuth();
  const [step, setStep] = useState<WizardStep>("reauth");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useOtp, setUseOtp] = useState(false);
  const [verified, setVerified] = useState<Identity | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [before, setBefore] = useState<string[]>([]);
  const [fallbackEmail, setFallbackEmail] = useState<FallbackEmail | null>(() =>
    getLocalFallbackEmail(),
  );


  const email = hubUser?.email ?? user?.email ?? "";
  const lastSignInAt = hubUser?.last_sign_in_at ?? user?.last_sign_in_at ?? null;
  const isFresh = useMemo(() => {
    if (!lastSignInAt) return false;
    const t = new Date(lastSignInAt).getTime();
    return Number.isFinite(t) && Date.now() - t < REAUTH_WINDOW_MS;
  }, [lastSignInAt]);

  // Load the saved fallback address so the OTP step is pre-filled.
  useEffect(() => {
    if (!open || !user?.id) return;
    void fetchFallbackEmail(user.id).then((v) => v && setFallbackEmail(v));
  }, [open, user?.id]);


  // Resume an interrupted flow (the OAuth redirect remounts this component).
  useEffect(() => {
    if (!open) return;
    const persisted = loadState();
    if (persisted) {
      setBefore(persisted.before);
      setStep(persisted.step === "reauth" && isFresh ? "connect" : persisted.step);
      return;
    }
    void (async () => {
      const { data } = await supabase.auth.getUserIdentities();
      const ids = ((data?.identities ?? []) as Identity[])
        .filter((i) => i.provider === "google")
        .map((i) => i.identity_id ?? "");
      setBefore(ids);
      const initial: WizardStep = isFresh ? "connect" : "reauth";
      setStep(initial);
      saveState({ mode, step: initial, before: ids, startedAt: Date.now() });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const goto = useCallback(
    (next: WizardStep) => {
      setStep(next);
      setError(null);
      const persisted = loadState();
      saveState({
        mode,
        step: next,
        before: persisted?.before ?? before,
        startedAt: persisted?.startedAt ?? Date.now(),
      });
    },
    [before, mode],
  );

  const close = (completed: boolean) => {
    saveState(null);
    onOpenChange(false);
    if (completed) onCompleted();
  };

  // Step 1 — re-authenticate with Google.
  const reauthGoogle = async () => {
    setBusy(true);
    setError(null);
    saveState({ mode, step: "connect", before, startedAt: Date.now() });
    const { error: err } = await signInWithGoogle("/account");
    setBusy(false);
    if (err) {
      setError("Google re-authentication didn't start. Use an emailed code instead.");
      setUseOtp(true);
      saveState({ mode, step: "reauth", before, startedAt: Date.now() });
    }
  };

  // Step 2 — link (or relink) the Google identity.
  const connectGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      saveState({ mode, step: "verify", before, startedAt: Date.now() });
      const { error: err } = await supabase.auth.linkIdentity({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/account` },
      });
      if (err) throw err;
      // A redirect normally happens here; if it doesn't, move on manually.
      goto("verify");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start the Google connection.";
      // Already-linked accounts are fine for a relink — go verify instead.
      if (/already/i.test(msg) && mode === "relink") {
        goto("verify");
      } else {
        setError(msg);
        saveState({ mode, step: "connect", before, startedAt: Date.now() });
      }
    } finally {
      setBusy(false);
    }
  };

  // Step 3 — read identities back and confirm Google is present.
  const verify = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.auth.getUserIdentities();
      if (err) throw err;
      const google = ((data?.identities ?? []) as Identity[]).filter((i) => i.provider === "google");
      if (google.length === 0) {
        setError("No Google identity is linked yet. Finish the Google consent screen and verify again.");
        return;
      }
      const fresh = google.find((g) => !before.includes(g.identity_id ?? "")) ?? google[0];
      const freshIsNew = !before.includes(fresh.identity_id ?? "");
      setVerified(fresh);
      setIsNew(freshIsNew);
      void recordSecurityEvent({
        type: freshIsNew ? "identity_connect" : "identity_relink",
        userId: user?.id ?? null,
        email: (fresh.identity_data?.email as string) ?? email ?? null,
        provider: "google",
        detail: freshIsNew
          ? "Connected a new Google identity"
          : "Re-verified the existing Google identity",
      });
      goto("done");
      toast.success(isNewLabel(!before.includes(fresh.identity_id ?? "")));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify the linked identity.");
    } finally {
      setBusy(false);
    }
  }, [before, goto, user, email]);

  // Auto-verify when we land back on this step after the OAuth redirect.
  useEffect(() => {
    if (open && step === "verify" && !busy && !verified) void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close(step === "done"))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {mode === "relink" ? "Relink your Google account" : "Connect a Google account"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            We re-authenticate you, verify the Google identity that comes back, then refresh your
            linked identity list.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <ol className="space-y-1.5">
          {STEPS.map((s, i) => {
            const done = i < stepIndex || step === "done";
            const active = s.id === step;
            return (
              <li key={s.id} className="flex items-center gap-2 text-xs">
                {done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Circle
                    className={`h-3.5 w-3.5 ${active ? "text-primary" : "text-muted-foreground/50"}`}
                  />
                )}
                <span className={active ? "font-medium text-foreground" : "text-muted-foreground"}>
                  {i + 1}. {s.label}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="rounded-lg border border-border/60 bg-background/40 p-3">
          {step === "reauth" && (
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground">
                For your security, confirm it's you before changing sign-in methods.
              </p>
              {!useOtp ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void reauthGoogle()} disabled={busy}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Continue with Google
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setUseOtp(true)}>
                    Use an email code
                  </Button>
                </div>
              ) : (
                <EmailOtpFallback
                  defaultEmail={email || fallbackEmail?.email || ""}
                  lockEmail={Boolean(email)}
                  onVerified={() => {
                    setUseOtp(false);
                    goto("connect");
                  }}
                />

              )}
            </div>
          )}

          {step === "connect" && (
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground">
                Identity confirmed. Now approve Google access — pick the account you want linked to{" "}
                <span className="text-foreground">{email || "this account"}</span>.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void connectGoogle()} disabled={busy}>
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Link2 className="h-3.5 w-3.5" />
                  )}
                  {mode === "relink" ? "Relink Google" : "Connect Google"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => goto("verify")}>
                  Already approved — verify
                </Button>
              </div>
            </div>
          )}

          {step === "verify" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Checking the auth server for your Google identity…
            </div>
          )}

          {step === "done" && verified && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium">
                  {isNew ? "New Google identity linked" : "Google identity re-verified"}
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  google
                </Badge>
              </div>
              <p className="break-all text-[11px] text-muted-foreground">
                {(verified.identity_data?.email as string) || email || "—"}
              </p>
            </div>
          )}

          {error && (
            <p className="mt-2 flex items-start gap-2 text-[11px] text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button size="sm" variant="ghost" onClick={() => close(step === "done")}>
            {step === "done" ? "Close" : "Cancel"}
          </Button>
          {step === "verify" && (
            <Button size="sm" onClick={() => void verify()} disabled={busy}>
              Verify again
            </Button>
          )}
          {step === "done" && (
            <Button size="sm" onClick={() => close(true)}>
              Update my identity list
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isNewLabel(isNew: boolean): string {
  return isNew ? "Google account linked and verified" : "Google identity verified";
}
