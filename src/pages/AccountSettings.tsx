import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  LogOut,
  RefreshCw,
  Loader2,
  Clock,
  MonitorSmartphone,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import Navbar from "@/components/Navbar";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { hubSupabase } from "@/integrations/hub/client";
import { broadcastSignOut } from "@/lib/auth-broadcast";
import SecurityAuditLog from "@/components/account/SecurityAuditLog";
import AccountDataExport from "@/components/account/AccountDataExport";
import SessionAlertsPanel from "@/components/account/SessionAlertsPanel";
import LinkedIdentitiesPanel from "@/components/account/LinkedIdentitiesPanel";
import FallbackEmailCard from "@/components/account/FallbackEmailCard";
import ChangeEmailCard from "@/components/account/ChangeEmailCard";
import MergeAccountsCard from "@/components/account/MergeAccountsCard";


import { recordSecurityEvent } from "@/lib/security-audit-log";



function formatDateTime(value?: string | number | null): string {
  if (!value) return "—";
  const d = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatRelative(expiresAt?: number | null): string {
  if (!expiresAt) return "—";
  const mins = Math.round((expiresAt * 1000 - Date.now()) / 60000);
  if (mins <= 0) return "expired";
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `in ${hrs}h ${mins % 60}m`;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium text-foreground break-all">{value}</span>
    </div>
  );
}

export default function AccountSettings() {
  const { user, hubUser, hubSession, session, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState<"local" | "global" | null>(null);
  const [confirmGlobal, setConfirmGlobal] = useState(false);
  const [tick, setTick] = useState(0);

  // Keep the "expires in" copy honest without a full re-fetch.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const meta = (hubUser?.user_metadata ?? user?.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    profile?.display_name ||
    (meta.full_name as string) ||
    (meta.name as string) ||
    user?.email?.split("@")[0] ||
    "Your account";
  const avatarUrl = profile?.avatar_url || (meta.avatar_url as string) || (meta.picture as string) || "";

  const expiresAt = hubSession?.expires_at ?? session?.expires_at ?? null;
  void tick; // re-render dependency for the relative expiry label

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const [hub, spoke] = await Promise.all([
        hubSupabase.auth.refreshSession(),
        supabase.auth.refreshSession(),
      ]);
      if (hub.error || spoke.error) {
        toast.error("Could not refresh your session. Try signing in again.");
      } else {
        toast.success("Session refreshed");
      }
    } catch {
      toast.error("Could not refresh your session.");
    } finally {
      setRefreshing(false);
    }
  };

  // This device only: drop local tokens and tell sibling tabs to follow.
  const handleSignOutDevice = async () => {
    setSigningOut("local");
    try {
      await recordSecurityEvent({
        type: "sign_out",
        userId: user?.id ?? null,
        email: user?.email ?? null,
        scope: "local",
      });
      await Promise.allSettled([
        hubSupabase.auth.signOut({ scope: "local" }),
        supabase.auth.signOut({ scope: "local" }),
      ]);
      broadcastSignOut();
      toast.success("Signed out on this device");
      navigate("/login", { replace: true });
    } finally {
      setSigningOut(null);
    }
  };

  // Everywhere: global scope revokes every refresh token server-side.
  const handleSignOutEverywhere = async () => {
    setSigningOut("global");
    try {
      await recordSecurityEvent({
        type: "sign_out",
        userId: user?.id ?? null,
        email: user?.email ?? null,
        scope: "global",
      });
      await signOut();
      toast.success("Signed out on all devices");
      navigate("/login", { replace: true });

    } catch {
      toast.error("Sign out failed. Please try again.");
    } finally {
      setSigningOut(null);
      setConfirmGlobal(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Account Settings | Resonance SyncVision</title>
        <meta
          name="description"
          content="Manage your Google session, review linked identity details, and sign out everywhere."
        />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <Navbar />

      <main className="container max-w-3xl py-8 md:py-12">
        <header className="mb-6 flex items-center gap-3">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`${displayName} profile picture`}
              className="h-12 w-12 rounded-full border border-border object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold text-foreground md:text-2xl">Account Settings</h1>
            <p className="text-xs text-muted-foreground">{user?.email ?? "Not signed in"}</p>
          </div>
        </header>

        {/* Session */}
        <Card className="mb-4 border-border/60 bg-card/60 p-4 backdrop-blur">
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Session</h2>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {hubUser && user ? "Hub + app linked" : hubUser ? "Hub only" : "App only"}
            </Badge>
          </div>
          <Separator className="mb-1" />
          <InfoRow
            label="Access token expires"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-muted-foreground" />
                {formatRelative(expiresAt)}
              </span>
            }
          />
          <InfoRow label="Last sign-in" value={formatDateTime(user?.last_sign_in_at)} />
          <InfoRow label="Account created" value={formatDateTime(user?.created_at)} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh session
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href="https://reson8.life/account" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Manage on the Hub
              </a>
            </Button>
          </div>
        </Card>

        {/* Linked identities */}
        <LinkedIdentitiesPanel />

        {/* Change account email */}
        <ChangeEmailCard />

        {/* Merge a second account */}
        <MergeAccountsCard />

        {/* Verified fallback email */}
        <FallbackEmailCard />




        {/* Session alerts */}
        <SessionAlertsPanel />

        {/* Security audit log */}
        <SecurityAuditLog />

        {/* Data export */}
        <AccountDataExport />



        {/* Sign out */}
        <Card className="border-destructive/30 bg-card/60 p-4 backdrop-blur">
          <div className="mb-2 flex items-center gap-2">
            <LogOut className="h-4 w-4 text-destructive" />
            <h2 className="text-sm font-semibold text-foreground">Sign out</h2>
          </div>
          <Separator className="mb-3" />
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 rounded-lg border border-border/60 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <MonitorSmartphone className="h-3.5 w-3.5" /> This device
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Clears the session in every tab on this device. Other devices stay signed in.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full"
                onClick={handleSignOutDevice}
                disabled={signingOut !== null}
              >
                {signingOut === "local" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Sign out here
              </Button>
            </div>
            <div className="flex-1 rounded-lg border border-destructive/40 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> Everywhere
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Revokes every refresh token on the Hub and this app, cancels running render jobs, and
                ends admin sessions too.
              </p>
              <Button
                size="sm"
                variant="destructive"
                className="mt-3 w-full"
                onClick={() => setConfirmGlobal(true)}
                disabled={signingOut !== null}
              >
                {signingOut === "global" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Sign out everywhere
              </Button>
            </div>
          </div>
        </Card>
      </main>

      <AlertDialog open={confirmGlobal} onOpenChange={setConfirmGlobal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out on all devices?</AlertDialogTitle>
            <AlertDialogDescription>
              Every browser and device signed in with this account will be logged out immediately, and
              any queued or running render jobs will be cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSignOutEverywhere}>Sign out everywhere</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
