import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, RefreshCw, Loader2, ShieldAlert, Unlink, CheckCircle2, Mail, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import EmailOtpFallback from "@/components/auth/EmailOtpFallback";
import IdentityRelinkWizard, {
  hasPendingRelinkFlow,
  type WizardMode,
} from "@/components/account/IdentityRelinkWizard";
import { fetchPrimaryIdentity, savePrimaryIdentity } from "@/lib/primary-identity";
import { recordSecurityEvent } from "@/lib/security-audit-log";


type Identity = {
  identity_id?: string;
  id?: string;
  user_id?: string;
  provider: string;
  last_sign_in_at?: string | null;
  created_at?: string | null;
  identity_data?: Record<string, unknown> | null;
};

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  email: "Email & password",
  apple: "Apple",
};

/** Sensitive actions require a sign-in within this window. */
const REAUTH_WINDOW_MS = 10 * 60 * 1000;

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function LinkedIdentitiesPanel() {
  const { user, hubUser, signInWithGoogle } = useAuth();
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [savingPrimary, setSavingPrimary] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState<Identity | null>(null);
  const [showOtp, setShowOtp] = useState(false);
  const [wizard, setWizard] = useState<{ open: boolean; mode: WizardMode }>({
    open: false,
    mode: "relink",
  });

  // Resume a flow that was interrupted by the Google OAuth redirect.
  useEffect(() => {
    if (hasPendingRelinkFlow()) setWizard({ open: true, mode: "relink" });
  }, []);




  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) throw error;
      setIdentities((data?.identities ?? []) as Identity[]);
    } catch {
      // Fall back to whatever the session already carries.
      setIdentities(((hubUser?.identities ?? user?.identities ?? []) as Identity[]) || []);
    } finally {
      setLoading(false);
    }
    if (user?.id) setPrimaryId(await fetchPrimaryIdentity(user.id));
  }, [hubUser, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const lastSignInAt = hubUser?.last_sign_in_at ?? user?.last_sign_in_at ?? null;
  const isFresh = useMemo(() => {
    if (!lastSignInAt) return false;
    const t = new Date(lastSignInAt).getTime();
    return Number.isFinite(t) && Date.now() - t < REAUTH_WINDOW_MS;
  }, [lastSignInAt]);

  const hasGoogle = identities.some((i) => i.provider === "google");

  const identityKey = (i: Identity) => i.identity_id ?? `${i.provider}-${i.id ?? "0"}`;

  const makePrimary = async (identity: Identity) => {
    if (!user?.id) return;
    const next = identityKey(identity);
    setSavingPrimary(true);
    const previous = primaryId;
    setPrimaryId(next);
    const { error } = await savePrimaryIdentity(user.id, next);
    setSavingPrimary(false);
    if (error) {
      setPrimaryId(previous);
      toast.error("Could not save your primary sign-in method.");
      return;
    }
    toast.success(
      `${PROVIDER_LABELS[identity.provider] ?? identity.provider} is now your primary sign-in method.`,
    );
  };


  const handleReauth = async () => {
    const { error } = await signInWithGoogle("/account");
    if (error) {
      toast.error("Could not start Google re-authentication — use an email code instead.");
      setShowOtp(true);
    }
  };


  const doUnlink = async (identity: Identity) => {
    if (identities.length <= 1) {
      toast.error("This is your only sign-in method — connect another identity first.");
      setConfirmUnlink(null);
      return;
    }
    setBusyId(identity.identity_id ?? identity.provider);
    try {
      const { error } = await supabase.auth.unlinkIdentity(identity as never);
      if (error) throw error;
      if (user?.id && primaryId === identityKey(identity)) {
        await savePrimaryIdentity(user.id, null);
        setPrimaryId(null);
      }
      void recordSecurityEvent({
        type: "identity_remove",
        userId: user?.id ?? null,
        email: (identity.identity_data?.email as string) ?? user?.email ?? null,
        provider: identity.provider,
        detail: `Removed ${PROVIDER_LABELS[identity.provider] ?? identity.provider} identity`,
      });
      toast.success(`${PROVIDER_LABELS[identity.provider] ?? identity.provider} disconnected`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove this identity.");
    } finally {
      setBusyId(null);
      setConfirmUnlink(null);
    }
  };

  return (
    <Card className="mb-4 border-border/60 bg-card/60 p-4 backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        <Link2 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Linked identities</h2>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 px-2"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <Separator className="mb-3" />

      {/* Re-authentication status */}
      <div
        className={`mb-3 flex flex-wrap items-center gap-2 rounded-lg border p-2.5 ${
          isFresh ? "border-primary/40 bg-primary/5" : "border-border/60 bg-background/40"
        }`}
      >
        {isFresh ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
        ) : (
          <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <p className="text-[11px] text-muted-foreground">
          {isFresh
            ? "Recently re-authenticated — you can remove or relink identities."
            : "Re-authenticate to unlock removing or relinking identities."}
        </p>
        <Button size="sm" variant="outline" className="ml-auto h-7" onClick={handleReauth}>
          <RefreshCw className="h-3.5 w-3.5" /> Re-authenticate
        </Button>
      </div>

      {/* Passwordless fallback: no Google identity, or Google re-auth failed */}
      {(!hasGoogle || showOtp) && (
        <div className="mb-3 rounded-lg border border-border/60 bg-background/40 p-3">
          <p className="mb-2 text-[11px] text-muted-foreground">
            {hasGoogle
              ? "Google re-authentication didn't start. Verify with an emailed code instead."
              : "This account has no Google session. Verify with an emailed code instead."}
          </p>
          <EmailOtpFallback
            defaultEmail={hubUser?.email ?? user?.email ?? ""}
            lockEmail
            onVerified={() => {
              setShowOtp(false);
              void load();
            }}
          />
        </div>
      )}

      {hasGoogle && !showOtp && (
        <button
          type="button"
          onClick={() => setShowOtp(true)}
          className="mb-3 text-[11px] text-primary hover:underline"
        >
          Google not working? Use an email code instead
        </button>
      )}


      {loading ? (
        <p className="py-2 text-xs text-muted-foreground">Loading linked accounts…</p>
      ) : identities.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">No linked providers found for this session.</p>
      ) : (
        <ul className="space-y-2">
          {identities.map((identity) => {
            const data = identity.identity_data ?? {};
            const key = identityKey(identity);
            const isOnly = identities.length <= 1;
            const isPrimary = isOnly || primaryId === key;
            return (
              <li key={key} className="rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">
                    {PROVIDER_LABELS[identity.provider] ?? identity.provider}
                  </span>
                  {isPrimary && (
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <Star className="h-2.5 w-2.5 fill-current" /> Primary
                    </Badge>
                  )}
                  <div className="ml-auto flex gap-1.5">
                    {!isPrimary && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        disabled={savingPrimary || busyId !== null}
                        onClick={() => void makePrimary(identity)}
                        title="Use this identity as your primary sign-in method"
                      >
                        {savingPrimary ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Star className="h-3 w-3" />
                        )}
                        Make primary
                      </Button>
                    )}
                    {identity.provider === "google" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        disabled={busyId !== null}
                        onClick={() => setWizard({ open: true, mode: "relink" })}
                        title="Guided relink: re-authenticate, verify, update"
                      >
                        <RefreshCw className="h-3 w-3" /> Relink
                      </Button>

                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                      disabled={!isFresh || isOnly || busyId !== null}
                      onClick={() => setConfirmUnlink(identity)}
                      title={
                        isOnly
                          ? "You can't remove your only sign-in method"
                          : isFresh
                            ? "Remove this identity"
                            : "Re-authenticate first"
                      }
                    >
                      {busyId === (identity.identity_id ?? identity.provider) ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Unlink className="h-3 w-3" />
                      )}
                      Remove
                    </Button>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground break-all">
                  {(data.email as string) || user?.email || "—"}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Linked {formatDateTime(identity.created_at)} · Last used{" "}
                  {formatDateTime(identity.last_sign_in_at)}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busyId !== null}
          onClick={() => setWizard({ open: true, mode: "connect" })}
          title="Guided connect: re-authenticate, approve Google, verify"
        >
          {busyId === "link" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
          {hasGoogle ? "Connect another Google account" : "Connect a Google account"}
        </Button>
        <p className="text-[10px] text-muted-foreground">
          {identities.length <= 1
            ? "Add a second identity before removing this one — you can't remove your only sign-in method."
            : "Removing an identity needs a recent re-authentication."}
        </p>
      </div>


      <IdentityRelinkWizard
        open={wizard.open}
        mode={wizard.mode}
        onOpenChange={(o) => setWizard((w) => ({ ...w, open: o }))}
        onCompleted={() => void load()}
      />


      <AlertDialog open={confirmUnlink !== null} onOpenChange={(o) => !o && setConfirmUnlink(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this linked identity?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll no longer be able to sign in with{" "}
              {confirmUnlink ? PROVIDER_LABELS[confirmUnlink.provider] ?? confirmUnlink.provider : "this provider"}.
              Your projects and data stay intact, and you can relink it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmUnlink && void doUnlink(confirmUnlink)}>
              Remove identity
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
