import { useEffect, useState } from "react";
import { Fingerprint, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { SourceBrief } from "@/lib/sourceBrief";

interface BrandProfile {
  brand_name: string | null;
  colors: string[] | null;
  tone: { adjectives?: string[]; voice?: string; avoidPhrases?: string[] } | null;
  audience: { primary?: string; painPoints?: string[]; desires?: string[] } | null;
  visual_style: { mood?: string; composition?: string; textures?: string[] } | null;
  content_pillars: string[] | null;
  updated_at: string;
}

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./i, "").toLowerCase(); }
  catch { return ""; }
}

const MIN_DESCRIPTION_LENGTH = 20;

interface BrandDnaPanelProps {
  sourceBrief: SourceBrief;
  hasUpload?: boolean;
  description?: string;
}

const BrandDnaPanel = ({ sourceBrief, hasUpload = false, description = "" }: BrandDnaPanelProps) => {
  const { toast } = useToast();
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const domain = domainOf(sourceBrief.sourceUrl);

  useEffect(() => {
    if (!domain) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("brand_profiles")
        .select("brand_name, colors, tone, audience, visual_style, content_pillars, updated_at")
        .eq("domain", domain)
        .maybeSingle();
      if (!cancelled && data) setProfile(data as unknown as BrandProfile);
    })();
    return () => { cancelled = true; };
  }, [domain]);

  const descriptionLength = description.trim().length;
  const sourceReady = hasUpload || descriptionLength >= MIN_DESCRIPTION_LENGTH;
  const gateMessage = hasUpload
    ? ""
    : `Upload an image or write at least ${MIN_DESCRIPTION_LENGTH} characters of description (${descriptionLength}/${MIN_DESCRIPTION_LENGTH}) to enable Brand DNA.`;


  const build = async (force = false) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("build-brand-dna", {
        body: { sourceBrief, force },
      });
      if (error || !data?.success) throw new Error(error?.message || data?.error || "Failed");
      setProfile(data.profile as BrandProfile);
      toast({
        title: data.cached ? "Brand DNA loaded" : "Brand DNA built",
        description: `For ${data.profile?.brand_name ?? domain}`,
      });
      setExpanded(true);
    } catch (e) {
      toast({
        title: "Brand DNA failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white/[0.025] ring-1 ring-white/[0.06] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Fingerprint className="w-4 h-4 text-primary" />
        <h3 className="font-display text-sm font-bold text-foreground">Brand DNA</h3>
        <span className="text-[10.5px] text-muted-foreground ml-auto truncate">{domain}</span>
      </div>

      {profile ? (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-primary hover:underline"
          >
            {expanded ? "Hide details" : "Show details"}
          </button>
          {expanded && (
            <div className="space-y-2 text-xs text-foreground/85">
              {profile.tone?.voice && (
                <p><span className="text-muted-foreground">Voice:</span> {profile.tone.voice}</p>
              )}
              {profile.tone?.adjectives?.length ? (
                <p><span className="text-muted-foreground">Tone:</span> {profile.tone.adjectives.join(", ")}</p>
              ) : null}
              {profile.audience?.primary && (
                <p><span className="text-muted-foreground">Audience:</span> {profile.audience.primary}</p>
              )}
              {profile.visual_style?.mood && (
                <p><span className="text-muted-foreground">Mood:</span> {profile.visual_style.mood}</p>
              )}
              {profile.content_pillars?.length ? (
                <p><span className="text-muted-foreground">Pillars:</span> {profile.content_pillars.join(" · ")}</p>
              ) : null}
              {profile.colors?.length ? (
                <div className="flex gap-1.5 pt-1">
                  {profile.colors.slice(0, 6).map((c) => (
                    <span
                      key={c}
                      title={c}
                      className="w-5 h-5 rounded ring-1 ring-white/20"
                      style={{ background: c }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )}
          <button
            type="button"
            disabled={busy || !sourceReady}
            title={sourceReady ? "Refresh Brand DNA from latest source" : gateMessage}
            onClick={() => build(true)}
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Refresh DNA
          </button>
        </>
      ) : (
        <div className="space-y-1.5">
          <button
            type="button"
            disabled={busy || !domain || !sourceReady}
            title={sourceReady ? "Generate Brand DNA" : gateMessage}
            onClick={() => build(false)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-primary/15 ring-1 ring-primary/40 text-primary hover:bg-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Fingerprint className="w-3.5 h-3.5" />}
            Build Brand DNA
          </button>
          {!sourceReady && (
            <p className="text-[10.5px] leading-snug text-muted-foreground">{gateMessage}</p>
          )}
        </div>
      )}

    </section>
  );
};

export default BrandDnaPanel;
