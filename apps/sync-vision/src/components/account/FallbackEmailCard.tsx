import { useCallback, useEffect, useState } from "react";
import { MailCheck, Loader2, Trash2, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import EmailOtpFallback from "@/components/auth/EmailOtpFallback";
import {
  clearFallbackEmail,
  fetchFallbackEmail,
  formatVerifiedAt,
  type FallbackEmail,
} from "@/lib/fallback-email";

/**
 * Shows the verified fallback (backup) email that will be pre-filled for
 * future relink and re-authentication attempts.
 */
export default function FallbackEmailCard() {
  const { user } = useAuth();
  const [value, setValue] = useState<FallbackEmail | null>(null);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setValue(await fetchFallbackEmail(user.id));
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRemove = async () => {
    if (!user?.id) return;
    setRemoving(true);
    const { error } = await clearFallbackEmail(user.id);
    setRemoving(false);
    if (error) {
      toast.error("Could not remove the fallback address.");
      return;
    }
    setValue(null);
    toast.success("Fallback email removed");
  };

  return (
    <Card className="mb-4 border-border/60 bg-card/60 p-4 backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        <MailCheck className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Fallback email</h2>
        {value ? (
          <Badge variant="secondary" className="ml-auto text-[10px]">
            Verified
          </Badge>
        ) : (
          <Badge variant="outline" className="ml-auto text-[10px]">
            Not set
          </Badge>
        )}
      </div>
      <Separator className="mb-3" />

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      ) : value ? (
        <div className="space-y-2">
          <div className="rounded-lg border border-border/60 p-3">
            <p className="flex items-center gap-1.5 break-all text-xs font-medium text-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              {value.email}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Verified {formatVerifiedAt(value.verifiedAt)} · used automatically when you relink or
              re-authenticate with an emailed code.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setVerifying((v) => !v)}>
              {verifying ? "Cancel" : "Verify a different address"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void handleRemove()} disabled={removing}>
              {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <p className="mb-3 text-[11px] text-muted-foreground">
          Verify a backup address with an emailed code. We'll remember it and pre-fill it the next
          time Google sign-in fails or you relink an identity.
        </p>
      )}

      {(verifying || !value) && !loading && (
        <div className="mt-3 rounded-lg border border-border/60 bg-background/40 p-3">
          <EmailOtpFallback
            onVerified={() => {
              setVerifying(false);
              void load();
            }}
          />
        </div>
      )}
    </Card>
  );
}
