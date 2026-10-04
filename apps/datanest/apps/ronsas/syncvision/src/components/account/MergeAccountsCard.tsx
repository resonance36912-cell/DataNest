import { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { GitMerge, Loader2, MailCheck, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Summary = {
  from_email: string | null;
  credits: number;
  coupons: number;
  topups: number;
  projects: number;
};

/**
 * Merges a second account (verified with an emailed code) into the account the
 * user is currently signed into, so credits and coupons live in one place.
 */
export default function MergeAccountsCard() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code" | "confirm" | "done">("email");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [secondaryToken, setSecondaryToken] = useState<string | null>(null);

  // Isolated client so verifying the other account never replaces the current session.
  const shadow = useMemo(
    () =>
      createClient(
        import.meta.env.VITE_SUPABASE_URL as string,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        { auth: { persistSession: false, autoRefreshToken: false, storageKey: "sv-merge-shadow" } },
      ),
    [],
  );

  const normalized = email.trim().toLowerCase();
  const emailValid = EMAIL_RE.test(normalized) && normalized !== (user?.email ?? "").toLowerCase();

  const sendCode = async () => {
    setBusy(true);
    const { error } = await shadow.auth.signInWithOtp({
      email: normalized,
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message || "Could not send a code to that address.");
      return;
    }
    setStage("code");
    toast.success(`Code sent to ${normalized}`);
  };

  const verifyCode = async () => {
    setBusy(true);
    const { data, error } = await shadow.auth.verifyOtp({
      email: normalized,
      token: code.trim(),
      type: "email",
    });
    if (error || !data.session?.access_token) {
      setBusy(false);
      toast.error(error?.message || "That code didn't work.");
      return;
    }
    const token = data.session.access_token;
    setSecondaryToken(token);

    const { data: preview, error: previewError } = await supabase.functions.invoke("merge-accounts", {
      body: { secondary_access_token: token, dry_run: true },
    });
    setBusy(false);
    if (previewError) {
      toast.error("Could not read the other account.");
      return;
    }
    setSummary(preview?.summary ?? null);
    setStage("confirm");
  };

  const runMerge = async () => {
    if (!secondaryToken) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("merge-accounts", {
      body: { secondary_access_token: secondaryToken },
    });
    setBusy(false);
    if (error) {
      toast.error("Merge failed. Nothing was lost — try again.");
      return;
    }
    setSummary(data?.summary ?? summary);
    setSecondaryToken(null);
    void shadow.auth.signOut();
    setStage("done");
    toast.success("Accounts merged — credits and coupons are now in one place.");
  };

  if (!user) return null;

  return (
    <Card className="mb-4 border-border/60 bg-card/60 p-4 backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        <GitMerge className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Merge another account</h2>
        {stage === "done" && (
          <Badge variant="secondary" className="ml-auto text-[10px]">
            Merged
          </Badge>
        )}
      </div>
      <Separator className="mb-3" />

      <p className="mb-3 text-[11px] text-muted-foreground">
        If you have credits or coupons on a second address, verify it with an emailed code and we'll
        move everything into <span className="font-medium text-foreground">{user.email}</span>. Your
        Google sign-in keeps working — link it under Linked identities.
      </p>

      {stage === "email" && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (emailValid && !busy) void sendCode();
          }}
        >
          <Label htmlFor="merge-email" className="text-xs">
            Other account's email
          </Label>
          <Input
            id="merge-email"
            type="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9 text-xs"
          />
          <Button type="submit" size="sm" disabled={!emailValid || busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MailCheck className="h-3.5 w-3.5" />}
            Send verification code
          </Button>
        </form>
      )}

      {stage === "code" && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length >= 6 && !busy) void verifyCode();
          }}
        >
          <Label htmlFor="merge-code" className="text-xs">
            6-digit code sent to {normalized}
          </Label>
          <Input
            id="merge-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="h-9 w-32 text-xs tracking-widest"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={code.trim().length < 6 || busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              Verify
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setStage("email")} disabled={busy}>
              Use a different address
            </Button>
          </div>
        </form>
      )}

      {stage === "confirm" && summary && (
        <div className="space-y-3">
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
            <p className="font-medium text-foreground">Ready to merge {summary.from_email}</p>
            <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
              <li>{summary.credits} credits will be added to your balance</li>
              <li>{summary.coupons} redeemed coupons transfer over</li>
              <li>{summary.topups} purchases and {summary.projects} projects move across</li>
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void runMerge()} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />}
              Merge into {user.email}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStage("email")} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {stage === "done" && summary && (
        <p className="text-xs text-muted-foreground">
          Moved {summary.credits} credits, {summary.coupons} coupons and {summary.projects} projects
          from {summary.from_email}. Everything now lives on {user.email}.
        </p>
      )}
    </Card>
  );
}
