"use client";

import { FormEvent, useState } from "react";
import { getSupabase } from "@/lib/supabase";

type Props = {
  jobId: string;
  canInvite: boolean;
  compact?: boolean;
  onSent?: (message: string) => void;
};

export default function JobInviteForm({ jobId, canInvite, compact = false, onSent }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("contributor");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function sendInvite(event: FormEvent) {
    event.preventDefault();
    if (!canInvite || !email.trim()) return;

    const supabase = getSupabase();
    if (!supabase) return;

    setBusy(true);
    setMessage("");

    try {
      const { data, error } = await supabase.functions.invoke("send-job-invite", {
        body: {
          jobId,
          email: email.trim(),
          role
        }
      });

      if (error) throw error;

      const delivery = String((data as Record<string, unknown> | null)?.delivery || "invite");
      const success = delivery === "magic-link"
        ? "Existing user invited with a magic sign-in link."
        : "Collaborator invitation sent.";

      setMessage(success);
      setEmail("");
      onSent?.(success);
    } catch (inviteError) {
      setMessage(inviteError instanceof Error ? inviteError.message : "Unable to send invitation.");
    } finally {
      setBusy(false);
    }
  }

  if (!canInvite) return null;

  return <div className={"inviteControl " + (compact ? "compactInvite" : "")}>
    {!open ? (
      <button className="secondaryButton compact" type="button" onClick={() => setOpen(true)}>
        Invite collaborator
      </button>
    ) : (
      <form className="inviteForm" onSubmit={sendInvite} aria-busy={busy}>
        <div className="rowBetween">
          <b>Invite to this Job Manifest</b>
          <button className="textButton" type="button" onClick={() => setOpen(false)}>Close</button>
        </div>
        <label>
          Collaborator email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
          />
        </label>
        <label>
          Job role
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="contributor">Contributor</option>
            <option value="reviewer">Reviewer</option>
            <option value="observer">Observer</option>
          </select>
        </label>
        <button className="primaryButton compact" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send invite"}
        </button>
        {message && <small className="inviteMessage" role="status">{message}</small>}
      </form>
    )}
  </div>;
}
