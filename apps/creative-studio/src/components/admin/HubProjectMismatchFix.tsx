import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";

const LS_URL = "hub_supabase_url";
const LS_KEY = "hub_supabase_publishable_key";
const LS_COPIED_AT = "hub_env_copied_at";

/**
 * Guided remediation surfaced when the Hub entitlement check returns 401/403.
 * The Hub doesn't expose its Supabase config publicly, so an admin pastes the
 * Hub project's URL + publishable key (one-time, persisted to localStorage),
 * then this panel renders a side-by-side diff + a copyable .env block.
 */
export function HubProjectMismatchFix() {
  const currentUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
  const currentKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

  const [hubUrl, setHubUrl] = useState("");
  const [hubKey, setHubKey] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [lastCopiedAt, setLastCopiedAt] = useState<string | null>(null);

  useEffect(() => {
    setHubUrl(localStorage.getItem(LS_URL) ?? "");
    setHubKey(localStorage.getItem(LS_KEY) ?? "");
    setLastCopiedAt(localStorage.getItem(LS_COPIED_AT));
  }, []);

  const save = () => {
    localStorage.setItem(LS_URL, hubUrl.trim());
    localStorage.setItem(LS_KEY, hubKey.trim());
  };

  const refMatch = (() => {
    const cur = currentUrl.match(/https?:\/\/([^.]+)\.supabase\.co/i)?.[1];
    const hub = hubUrl.match(/https?:\/\/([^.]+)\.supabase\.co/i)?.[1];
    if (!cur || !hub) return null;
    return { cur, hub, same: cur === hub };
  })();

  const envBlock = `VITE_SUPABASE_URL="${hubUrl.trim()}"
VITE_SUPABASE_PUBLISHABLE_KEY="${hubKey.trim()}"
VITE_SUPABASE_PROJECT_ID="${hubUrl.match(/https?:\/\/([^.]+)\.supabase\.co/i)?.[1] ?? ""}"`;

  const copy = async (label: string, text: string) => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setCopyError(null);
      const ts = new Date().toISOString();
      localStorage.setItem(LS_COPIED_AT, ts);
      setLastCopiedAt(ts);
      toast.success("Copied .env block to clipboard", {
        description: "Paste into your project's Environment variables and redeploy.",
      });
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Copy failed";
      setCopyError(msg);
      setCopied(null);
      toast.error("Couldn't copy to clipboard", {
        description: `${msg}. Select the block manually and press Cmd/Ctrl+C.`,
      });
      setTimeout(() => setCopyError(null), 4000);
    }
  };

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mt-3">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <h4 className="font-display font-bold text-foreground text-sm">Fix project mismatch</h4>
        {lastCopiedAt && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
            <Check className="w-3 h-3" />
            .env copied {new Date(lastCopiedAt).toLocaleString()}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Paste the Hub's Supabase project URL + anon (publishable) key below — ask the Hub team or
        grab them from <code className="text-foreground/80">reson8.life</code>'s{" "}
        <code className="text-foreground/80">.env</code>. Values are stored locally in your browser
        only.
      </p>

      <div className="grid gap-2 mb-3">
        <label className="text-xs font-medium text-foreground">Hub VITE_SUPABASE_URL</label>
        <input
          value={hubUrl}
          onChange={(e) => setHubUrl(e.target.value)}
          onBlur={save}
          placeholder="https://xxxxx.supabase.co"
          className="bg-background border border-border rounded px-3 py-2 text-xs font-mono text-foreground"
        />
        <label className="text-xs font-medium text-foreground mt-2">
          Hub VITE_SUPABASE_PUBLISHABLE_KEY (anon)
        </label>
        <textarea
          value={hubKey}
          onChange={(e) => setHubKey(e.target.value)}
          onBlur={save}
          placeholder="eyJhbGciOi..."
          rows={3}
          className="bg-background border border-border rounded px-3 py-2 text-xs font-mono text-foreground resize-none"
        />
      </div>

      {refMatch && (
        <div className="mb-3 rounded border border-border bg-background/60 p-3 text-xs">
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <span className="text-muted-foreground">Current project ref</span>
            <span className="font-mono text-foreground">{refMatch.cur}</span>
            <span className="text-muted-foreground">Hub project ref</span>
            <span className="font-mono text-foreground">{refMatch.hub}</span>
          </div>
          <div
            className={`mt-2 font-semibold ${refMatch.same ? "text-emerald-400" : "text-destructive"}`}
          >
            {refMatch.same
              ? "✓ Refs match — entitlement should now succeed."
              : "✗ Refs differ — update this app's env to the Hub values below."}
          </div>
        </div>
      )}

      {hubUrl && hubKey && (
        <button
          onClick={() => copy("env", envBlock)}
          aria-live="polite"
          className={`mb-3 w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition ${
            copyError
              ? "bg-destructive text-destructive-foreground hover:opacity-90"
              : copied === "env"
              ? "bg-emerald-500 text-white hover:opacity-90"
              : "bg-primary text-primary-foreground hover:opacity-90"
          }`}
        >
          {copyError ? (
            <X className="w-4 h-4" />
          ) : copied === "env" ? (
            <Check className="w-4 h-4" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
          {copyError
            ? "Copy failed — try manually"
            : copied === "env"
            ? "Copied to clipboard ✓"
            : "Copy .env block to clipboard"}
        </button>
      )}

      {hubUrl && hubKey && refMatch && !refMatch.same && (
        <>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-foreground">Copy into this app's .env</span>
            <button
              onClick={() => copy("env", envBlock)}
              className="inline-flex items-center gap-1 text-xs text-primary hover:opacity-80"
            >
              {copied === "env" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied === "env" ? "Copied" : "Copy block"}
            </button>
          </div>
          <pre className="text-xs bg-background/60 rounded p-3 overflow-x-auto text-muted-foreground border border-border">
{envBlock}
          </pre>
          <ol className="mt-3 text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Open Project Settings → Environment variables.</li>
            <li>Replace the three <code className="text-foreground/80">VITE_SUPABASE_*</code> values above.</li>
            <li>Redeploy / restart preview. Re-run the entitlement check.</li>
            <li>
              Note: <code className="text-foreground/80">src/integrations/supabase/client.ts</code> is
              auto-generated and re-points automatically once env updates.
            </li>
          </ol>
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:opacity-80"
          >
            Open Supabase dashboard <ExternalLink className="w-3 h-3" />
          </a>
        </>
      )}
    </div>
  );
}
