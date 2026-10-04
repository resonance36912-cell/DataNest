import { useState, useEffect } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  projectId: string | null;
  versionId: string;
}

export default function AcceptVersionButton({ projectId, versionId }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!versionId) return;
    supabase
      .from("transcript_versions")
      .select("status")
      .eq("id", versionId)
      .single()
      .then(({ data }) => {
        if (data) setStatus(data.status);
      });
  }, [versionId]);

  if (status === "accepted") {
    return (
      <Badge className="bg-success/10 text-success border-success/20 gap-1">
        <ShieldCheck className="h-3 w-3" /> Accepted
      </Badge>
    );
  }

  const accept = async () => {
    if (!projectId || !versionId) return;
    setAccepting(true);
    try {
      const { error } = await supabase
        .from("transcript_versions")
        .update({ status: "accepted" } as any)
        .eq("id", versionId);

      if (error) throw error;

      // Audit events are now written server-side only
      setStatus("accepted");
      toast.success("Transcript version accepted — ready for export.");
    } catch (err: any) {
      toast.error(err.message || "Failed to accept version.");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={accept}
      disabled={accepting}
      className="gap-1.5 text-xs border-success/30 text-success hover:bg-success/10"
    >
      {accepting ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <CheckCircle2 className="h-3 w-3" />
      )}
      Accept Version
    </Button>
  );
}
