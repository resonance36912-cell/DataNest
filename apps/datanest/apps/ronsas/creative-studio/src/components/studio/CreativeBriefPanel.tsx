import { motion } from "framer-motion";
import { CheckCircle2, Circle, Image as ImageIcon, Link as LinkIcon, Sparkles, Wand2 } from "lucide-react";
import type { CreativeBrief } from "@/pages/Studio";

interface CreativeBriefPanelProps {
  contentType: string;
  style: string;
  aspectRatio: string;
  files: File[];
  url: string;
  instructions: string;
  brief: CreativeBrief | null;
}

const contentLabels: Record<string, string> = {
  poster: "Poster",
  brochure: "Brochure",
  ad: "Advertisement",
  video: "Video",
  social: "Social Media",
};

const Row = ({
  icon: Icon,
  label,
  value,
  done,
}: {
  icon: typeof Sparkles;
  label: string;
  value: React.ReactNode;
  done: boolean;
}) => (
  <div className="flex items-start gap-3">
    <div
      className={`mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center ring-1 shrink-0 ${
        done
          ? "bg-gradient-to-br from-accent/30 to-primary/25 ring-primary/40 text-foreground"
          : "bg-white/[0.03] ring-white/10 text-muted-foreground"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
      <p className="text-sm text-foreground truncate">{value}</p>
    </div>
    {done ? (
      <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-1 shrink-0" />
    ) : (
      <Circle className="w-3.5 h-3.5 text-muted-foreground/40 mt-1 shrink-0" />
    )}
  </div>
);

const CreativeBriefPanel = ({
  contentType,
  style,
  aspectRatio,
  files,
  url,
  instructions,
  brief,
}: CreativeBriefPanelProps) => {
  const hasSource = files.length > 0 || url.trim().length > 0;
  const sourceLabel = files.length
    ? `${files.length} file${files.length === 1 ? "" : "s"}`
    : url.trim()
    ? "Link"
    : "Not set";
  const promptLabel = instructions.trim()
    ? `${instructions.trim().slice(0, 40)}${instructions.trim().length > 40 ? "…" : ""}`
    : "Auto from style + uploads";

  return (
    <motion.aside
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="hidden xl:flex flex-col gap-4 w-72 shrink-0 p-4 border-l border-white/[0.05] overflow-y-auto scrollbar-thin"
    >
      <div>
        <h3 className="font-display text-sm font-bold text-foreground">Creative Brief</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Live summary of your current setup.
        </p>
      </div>

      <div className="rounded-2xl bg-white/[0.025] ring-1 ring-white/[0.06] p-4 space-y-3.5">
        <Row icon={Wand2} label="Type" value={contentLabels[contentType] ?? contentType} done />
        <Row icon={Sparkles} label="Style" value={<span className="capitalize">{style}</span>} done />
        <Row icon={ImageIcon} label="Aspect" value={aspectRatio} done />
        <Row icon={LinkIcon} label="Source" value={sourceLabel} done={hasSource} />
        <Row icon={Sparkles} label="Prompt" value={promptLabel} done={!!instructions.trim()} />
      </div>

      {brief && (
        <div className="rounded-2xl bg-gradient-to-br from-accent/10 via-primary/5 to-transparent ring-1 ring-primary/20 p-4 space-y-2">
          <p className="text-[10.5px] uppercase tracking-wider text-primary font-semibold">
            AI Brief Ready
          </p>
          <p className="text-sm font-display font-bold text-foreground leading-snug">
            {brief.headline}
          </p>
          {brief.subheadline && (
            <p className="text-xs text-muted-foreground leading-relaxed">{brief.subheadline}</p>
          )}
          {brief.callToAction && (
            <p className="text-[11px] text-foreground/80 pt-1">
              CTA: <span className="text-primary">{brief.callToAction}</span>
            </p>
          )}
        </div>
      )}
    </motion.aside>
  );
};

export default CreativeBriefPanel;
