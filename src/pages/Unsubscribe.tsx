import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { SeoHead } from "@/components/SeoHead";

type Stage = "loading" | "confirm" | "done" | "used" | "invalid";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [stage, setStage] = useState<Stage>("loading");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStage("invalid");
      return;
    }
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`;
    fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStage(data?.reason === "already_used" ? "used" : "invalid");
          return;
        }
        if (data?.alreadyUnsubscribed || data?.already_used) {
          setStage("used");
        } else {
          setEmail(data?.email ?? null);
          setStage("confirm");
        }
      })
      .catch(() => setStage("invalid"));
  }, [token]);

  const confirm = async () => {
    setBusy(true);
    const { error } = await supabase.functions.invoke("handle-email-unsubscribe", {
      body: { token },
    });
    setBusy(false);
    setStage(error ? "invalid" : "done");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <SeoHead path="/unsubscribe" title="Unsubscribe | Resonance SyncVision" description="Manage your email preferences for Resonance SyncVision." />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Email preferences</CardTitle>
          <CardDescription>
            {stage === "loading" && "Checking your link…"}
            {stage === "confirm" && (email ? `Unsubscribe ${email} from these emails?` : "Confirm you want to unsubscribe.")}
            {stage === "done" && "You've been unsubscribed."}
            {stage === "used" && "This address is already unsubscribed."}
            {stage === "invalid" && "This unsubscribe link is invalid or has expired."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {stage === "confirm" && (
            <Button onClick={confirm} disabled={busy} className="w-full">
              {busy ? "Unsubscribing…" : "Confirm unsubscribe"}
            </Button>
          )}
          <Button variant="outline" asChild className="w-full">
            <a href="/">Back to Resonance SyncVision</a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
