import { useState } from "react";
import { AtSign, Loader2, MailCheck, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Lets a signed-in user change the email address on their account.
 * Supabase sends a confirmation link to BOTH the current and the new address;
 * the change only lands once the new address is confirmed.
 */
export default function ChangeEmailCard() {
  const { user } = useAuth();
  const currentEmail = user?.email ?? "";
  const pendingEmail = (user?.new_email as string | undefined) ?? null;

  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const normalized = email.trim().toLowerCase();
  const valid = EMAIL_RE.test(normalized) && normalized !== currentEmail.toLowerCase();

  const submit = async (address: string) => {
    setSaving(true);
    const { error } = await supabase.auth.updateUser(
      { email: address },
      { emailRedirectTo: `${window.location.origin}/account` },
    );
    setSaving(false);
    if (error) {
      toast.error(error.message || "Could not start the email change.");
      return;
    }
    setSentTo(address);
    setEmail("");
    toast.success("Confirmation sent — check both inboxes to finish the change.");
  };

  if (!user) return null;

  return (
    <Card className="mb-4 border-border/60 bg-card/60 p-4 backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        <AtSign className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Change account email</h2>
        {pendingEmail || sentTo ? (
          <Badge variant="secondary" className="ml-auto text-[10px]">
            Pending confirmation
          </Badge>
        ) : null}
      </div>
      <Separator className="mb-3" />

      <p className="mb-3 text-[11px] text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{currentEmail}</span>. Your
        credits and applied coupons stay on this account — only the sign-in address changes.
      </p>

      {(pendingEmail || sentTo) && (
        <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 break-all text-xs font-medium text-foreground">
            <MailCheck className="h-3.5 w-3.5 text-primary" />
            Waiting on confirmation for {pendingEmail ?? sentTo}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Open the confirmation link sent to that inbox (and to {currentEmail} if asked). Check
            spam if it hasn't arrived.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            disabled={saving}
            onClick={() => void submit((pendingEmail ?? sentTo) as string)}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Resend confirmation
          </Button>
        </div>
      )}

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !saving) void submit(normalized);
        }}
      >
        <Label htmlFor="new-account-email" className="text-xs">
          New email address
        </Label>
        <Input
          id="new-account-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-9 text-xs"
        />
        {email.trim() && !valid && (
          <p className="text-[11px] text-destructive">
            {normalized === currentEmail.toLowerCase()
              ? "That's already your current address."
              : "Enter a valid email address."}
          </p>
        )}
        <Button type="submit" size="sm" disabled={!valid || saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MailCheck className="h-3.5 w-3.5" />}
          Send confirmation
        </Button>
      </form>
    </Card>
  );
}
