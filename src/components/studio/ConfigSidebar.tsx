import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import StylePicker from "./StylePicker";
import AspectRatioSelector from "./AspectRatioSelector";
import UploadZone from "./UploadZone";
import InstructionEditor, { GenerateActions } from "./InstructionEditor";
import PromptPresets from "./PromptPresets";
import InstructionChecklist from "./InstructionChecklist";
import { useToast } from "@/hooks/use-toast";
import type { CreativeBrief } from "@/pages/Studio";
import type { SourceBrief } from "@/lib/sourceBrief";

const MIN_INSTRUCTIONS_WHEN_URL = 12;
const MIN_DESCRIPTION_LENGTH = 20;

interface ConfigSidebarProps {
  contentType: string;
  style: string;
  aspectRatio: string;
  files: File[];
  url: string;
  secondaryUrl?: string;
  tertiaryUrl?: string;
  instructions: string;
  isGenerating: boolean;
  isAnalyzing: boolean;
  hasGenerated: boolean;
  /** When true (DNA mode), bypass source-material + URL-instruction guards. */
  bypassSourceGuards?: boolean;
  brief: CreativeBrief | null;
  sourceBrief?: SourceBrief | null;
  onContentTypeChange: (type: string) => void;
  onStyleChange: (style: string) => void;
  onAspectRatioChange: (ratio: string) => void;
  onFilesChange: (files: File[]) => void;
  onUrlChange: (url: string) => void;
  onSecondaryUrlChange?: (url: string) => void;
  onTertiaryUrlChange?: (url: string) => void;
  onAnalyzeUrl: (url: string) => void;
  onInstructionsChange: (instructions: string) => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  /** Optional cancel handler — when provided, the Generate button toggles to
   *  a Cancel button (with confirm) while isGenerating. */
  onCancel?: () => void;
  isAuthenticated?: boolean;
}

interface SectionProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

const Section = ({ label, hint, children }: SectionProps) => (
  <section className="rounded-xl bg-white/[0.025] ring-1 ring-white/[0.06] p-3 space-y-2.5 backdrop-blur-sm">
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-[10.5px] uppercase tracking-[0.14em] font-semibold text-foreground/70">
        {label}
      </h2>
      {hint && <span className="text-[10px] text-muted-foreground truncate">{hint}</span>}
    </div>
    {children}
  </section>
);

const ConfigSidebar = ({
  contentType,
  style, aspectRatio, files, url, secondaryUrl, tertiaryUrl, instructions,
  isGenerating, isAnalyzing, hasGenerated, bypassSourceGuards = false, brief, sourceBrief,
  onStyleChange, onAspectRatioChange,
  onFilesChange, onUrlChange, onSecondaryUrlChange, onTertiaryUrlChange, onAnalyzeUrl, onInstructionsChange,
  onGenerate, onRegenerate, onCancel, isAuthenticated = true,
}: ConfigSidebarProps) => {
  const { toast } = useToast();
  const regenerateLabel =
    contentType === "video" ? "video" :
    contentType === "brochure" ? "brochure" :
    contentType === "ad" ? "ad" :
    contentType === "social" ? "post" :
    "poster";
  const sourceUrlCount =
    (url.trim() ? 1 : 0) + (secondaryUrl?.trim() ? 1 : 0) + (tertiaryUrl?.trim() ? 1 : 0);
  const sourceHint = files.length
    ? `${files.length} file${files.length === 1 ? "" : "s"}${sourceUrlCount ? ` · ${sourceUrlCount} URL${sourceUrlCount === 1 ? "" : "s"}` : ""}`
    : sourceUrlCount
      ? `${sourceUrlCount} URL${sourceUrlCount === 1 ? "" : "s"}`
      : undefined;

  const instructionsTrimmed = instructions.trim();
  const instructionsValid = instructionsTrimmed.length >= MIN_INSTRUCTIONS_WHEN_URL;
  const hasDescription = instructionsTrimmed.length >= MIN_DESCRIPTION_LENGTH;
  const hasUpload = files.length > 0;
  // Brand DNA needs source material first: either an uploaded image or a
  // written description. URL + Brand Brief / Instructions then refine that DNA — they
  // cannot stand in for the seed material.
  const requireSourceMaterial = !bypassSourceGuards && !hasUpload && !hasDescription;
  const requireInstructions = !bypassSourceGuards && sourceUrlCount > 0 && !instructionsValid;
  const generateBlocked = requireSourceMaterial || requireInstructions;

  const guardedGenerate = () => {
    if (requireSourceMaterial) {
      toast({
        title: "Add source material first",
        description: `Upload an image or write at least ${MIN_DESCRIPTION_LENGTH} characters describing the product. The URL and Brand Brief / Instructions then refine your Brand DNA.`,
        variant: "destructive",
      });
      return;
    }
    if (requireInstructions) {
      toast({
        title: "Brand Brief / Instructions required",
        description: `Add at least ${MIN_INSTRUCTIONS_WHEN_URL} characters telling the studio what to do with your URL before generating.`,
        variant: "destructive",
      });
      return;
    }
    onGenerate();
  };
  const guardedRegenerate = () => {
    if (requireSourceMaterial) {
      toast({
        title: "Add source material first",
        description: `Upload an image or write at least ${MIN_DESCRIPTION_LENGTH} characters describing the product before regenerating.`,
        variant: "destructive",
      });
      return;
    }
    if (requireInstructions) {
      toast({
        title: "Brand Brief / Instructions required",
        description: `Add at least ${MIN_INSTRUCTIONS_WHEN_URL} characters telling the studio what to do with your URL before regenerating.`,
        variant: "destructive",
      });
      return;
    }
    onRegenerate();
  };
  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="h-full flex flex-col bg-background/30 overflow-hidden"
    >
      {/* Scrollable config sections */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 space-y-2.5">
        <Section label="Style">
          <StylePicker selected={style} onSelect={onStyleChange} />
        </Section>

        <Section label="Aspect Ratio">
          <AspectRatioSelector selected={aspectRatio} onSelect={onAspectRatioChange} />
        </Section>

        <section id="studio-source-section" className="rounded-xl bg-white/[0.025] ring-1 ring-white/[0.06] p-3 space-y-2.5 backdrop-blur-sm scroll-mt-20">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[10.5px] uppercase tracking-[0.14em] font-semibold text-foreground/70">
              Source Material
            </h2>
            {sourceHint && <span className="text-[10px] text-muted-foreground truncate">{sourceHint}</span>}
          </div>
          <UploadZone
            files={files}
            url={url}
            secondaryUrl={secondaryUrl}
            tertiaryUrl={tertiaryUrl}
            onFilesChange={onFilesChange}
            onUrlChange={onUrlChange}
            onSecondaryUrlChange={onSecondaryUrlChange}
            onTertiaryUrlChange={onTertiaryUrlChange}
            onAnalyzeUrl={onAnalyzeUrl}
            isAnalyzing={isAnalyzing}
            instructions={instructions}
            minInstructionsLength={MIN_INSTRUCTIONS_WHEN_URL}
            aiInstructionsSlot={
              <>
                <PromptPresets
                  contentType={contentType}
                  style={style}
                  currentInstructions={instructions}
                  sourceBrief={sourceBrief}
                  onApply={onInstructionsChange}
                />
                <InstructionEditor
                  instructions={instructions}
                  onInstructionsChange={onInstructionsChange}
                  onGenerate={guardedGenerate}
                  onRegenerate={guardedRegenerate}
                  isGenerating={isGenerating || isAnalyzing}
                  hasGenerated={hasGenerated}
                  textareaOnly
                />
                <InstructionChecklist
                  instructions={instructions}
                  minLength={MIN_INSTRUCTIONS_WHEN_URL}
                />
              </>
            }
          />
        </section>

        {brief && (
          <Section label={`Brief — ${brief.brand}`}>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2"
            >
              <p className="text-sm font-display font-bold text-foreground leading-snug">{brief.headline}</p>
              <p className="text-xs text-secondary-foreground leading-relaxed">{brief.subheadline}</p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {brief.keyPoints.map((point, i) => (
                  <span key={i} className="text-[10px] bg-white/[0.05] ring-1 ring-white/10 text-foreground/80 px-1.5 py-0.5 rounded">{point}</span>
                ))}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground">Colors:</span>
                {brief.colorSuggestions.map((color, i) => (
                  <span key={i} className="text-[10px] bg-white/[0.04] px-1.5 py-0.5 rounded text-foreground/80" style={{ borderLeft: `3px solid ${color}` }}>{color}</span>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                CTA: <span className="text-foreground">{brief.callToAction}</span> · Audience: <span className="text-foreground">{brief.targetAudience}</span>
              </p>
            </motion.div>
          </Section>
        )}
      </div>

      {/* Sticky Generate footer */}
      <div className="shrink-0 border-t border-white/[0.06] bg-background/80 backdrop-blur-xl px-3 py-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.6)] space-y-2">
        {!isAuthenticated && (
          <div
            className="flex items-start gap-2 rounded-lg px-2.5 py-2 bg-primary/10 ring-1 ring-primary/30 text-[11px] leading-snug text-foreground/90"
            role="status"
          >
            <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
            <div className="space-y-0.5">
              <p className="font-medium text-foreground">Sign in to generate</p>
              <p className="text-muted-foreground">
                Generating creatives is free, but needs an account so your work and credits are saved.{" "}
                <Link
                  to="/login?redirect=/studio"
                  className="text-primary hover:text-primary/80 underline underline-offset-2 font-medium"
                >
                  Sign up or sign in →
                </Link>
              </p>
            </div>
          </div>
        )}
        {isAuthenticated && generateBlocked && (
          <p
            className="text-[11px] leading-snug rounded-lg px-2.5 py-2 bg-destructive/10 ring-1 ring-destructive/30 text-destructive-foreground/90"
            role="status"
          >
            {requireSourceMaterial
              ? "Brand DNA needs source material first — upload an image or write a short description. URL + Brand Brief / Instructions then refine it."
              : `Add at least ${MIN_INSTRUCTIONS_WHEN_URL} characters in Brand Brief / Instructions for your URL to finalize the Brand DNA.`}
          </p>
        )}
        <GenerateActions
          onGenerate={guardedGenerate}
          onRegenerate={guardedRegenerate}
          isGenerating={isGenerating || isAnalyzing}
          hasGenerated={hasGenerated}
          regenerateLabel={regenerateLabel}
          isAuthenticated={isAuthenticated}
          isBlocked={generateBlocked}
          onCancel={onCancel}
        />
      </div>

    </motion.aside>
  );
};

export default ConfigSidebar;
