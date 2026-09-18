import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Link, X, Image as ImageIcon, Film, FileText, ArrowRight, Plus, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UploadZoneProps {
  files: File[];
  url: string;
  secondaryUrl?: string;
  tertiaryUrl?: string;
  onFilesChange: (files: File[]) => void;
  onUrlChange: (url: string) => void;
  onSecondaryUrlChange?: (url: string) => void;
  onTertiaryUrlChange?: (url: string) => void;
  onAnalyzeUrl: (url: string) => void;
  isAnalyzing: boolean;
  aiInstructionsSlot?: React.ReactNode;
  instructions?: string;
  minInstructionsLength?: number;
}

const MIN_INSTRUCTIONS = 12;

const UploadZone = ({
  files, url, secondaryUrl = "", tertiaryUrl = "",
  onFilesChange, onUrlChange, onSecondaryUrlChange, onTertiaryUrlChange,
  onAnalyzeUrl, isAnalyzing, aiInstructionsSlot,
  instructions = "", minInstructionsLength = MIN_INSTRUCTIONS,
}: UploadZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [extraSlots, setExtraSlots] = useState<number>(
    () => (tertiaryUrl ? 2 : secondaryUrl ? 1 : 0),
  );
  const { toast } = useToast();

  const trimmedInstructions = instructions.trim();
  const instructionsValid = trimmedInstructions.length >= minInstructionsLength;
  const hasAnyUrl = !!(url.trim() || secondaryUrl.trim() || tertiaryUrl.trim());
  const blockForInstructions = hasAnyUrl && !instructionsValid;

  const isValidUrl = (v: string) => {
    try {
      const u = new URL(v.trim());
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (hasAnyUrl && !instructionsValid) {
        toast({
          title: "Add Brand Brief / Instructions first",
          description: `Describe what to make from your sources (≥ ${minInstructionsLength} characters) before uploading more material.`,
          variant: "destructive",
        });
        return;
      }
      const dropped = Array.from(e.dataTransfer.files);
      onFilesChange([...files, ...dropped]);
    },
    [files, onFilesChange, hasAnyUrl, instructionsValid, minInstructionsLength, toast],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (hasAnyUrl && !instructionsValid) {
      e.target.value = "";
      toast({
        title: "Add Brand Brief / Instructions first",
        description: `Describe what to make from your sources (≥ ${minInstructionsLength} characters) before uploading more material.`,
        variant: "destructive",
      });
      return;
    }
    if (e.target.files) {
      onFilesChange([...files, ...Array.from(e.target.files)]);
    }
  };

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  const handleUrlSubmit = () => {
    if (!url.trim() || isAnalyzing) return;
    if (!isValidUrl(url)) {
      toast({
        title: "Invalid URL",
        description: "Enter a full URL starting with http:// or https://",
        variant: "destructive",
      });
      return;
    }
    if (!instructionsValid) {
      toast({
        title: "Add Brand Brief / Instructions first",
        description: `Tell the studio what to do with this URL — at least ${minInstructionsLength} characters.`,
        variant: "destructive",
      });
      return;
    }
    onAnalyzeUrl(url.trim());
  };

  const handleUrlKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleUrlSubmit();
  };


  const slotLabel = (i: number) => (i === 0 ? "Primary" : i === 1 ? "Secondary" : "Tertiary");
  const slotHint = (i: number) =>
    i === 0
      ? "Drives the brief — headline, offer, CTA"
      : i === 1
        ? "Extra reference — merges images & colors"
        : "Extra reference — merges images & colors";

  const renderRow = (i: number, value: string, onChange: (v: string) => void, onRemove?: () => void) => (
    <div key={i} className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          <span className={i === 0 ? "text-primary" : ""}>{slotLabel(i)}</span>
          <span className="text-muted-foreground/70 normal-case tracking-normal ml-1.5">· {slotHint(i)}</span>
        </p>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-foreground"
            title={`Remove ${slotLabel(i).toLowerCase()} URL`}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 rounded-xl bg-white/[0.03] ring-1 ring-white/10 px-3 py-2.5 focus-within:ring-primary/50 transition-all">
          <Link className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="url"
            placeholder={i === 0 ? "Paste a website, product page, article, or link" : "Optional supporting link"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={i === 0 ? handleUrlKeyDown : undefined}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none flex-1 min-w-0"
          />
        </div>
        {i === 0 && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleUrlSubmit}
            disabled={!url.trim() || isAnalyzing || !instructionsValid}
            className="studio-gradient-bg p-2.5 rounded-xl text-primary-foreground disabled:opacity-40 cursor-pointer shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.7)]"
            title={!instructionsValid ? "Add Brand Brief / Instructions first" : "Analyze sources"}
          >
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Drop Zone */}
      <motion.label
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative group flex flex-col items-center justify-center gap-2.5 rounded-2xl p-6 cursor-pointer transition-all border border-dashed ${
          isDragging
            ? "border-primary/60 bg-primary/[0.06] shadow-[0_0_30px_-10px_hsl(var(--primary)/0.6)]"
            : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
        }`}
      >
        <input type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.md" onChange={handleFileInput} className="hidden" />
        <div className="relative">
          <div className="absolute inset-0 rounded-full studio-gradient-bg opacity-30 blur-lg group-hover:opacity-50 transition-opacity" />
          <div className="relative w-11 h-11 rounded-full bg-gradient-to-br from-accent/30 to-primary/30 ring-1 ring-white/10 flex items-center justify-center">
            <Upload className="w-5 h-5 text-foreground" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-foreground">Drop files here</p>
          <p className="text-[11px] text-muted-foreground">Images, videos, PDFs, DOCX, PPTX</p>
        </div>
        <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] ring-1 ring-white/10 px-3 py-1 text-[11px] font-medium text-foreground/90 group-hover:bg-white/10 transition-colors">
          Browse files
        </span>
        <p className="text-[10px] text-muted-foreground/80">Up to 50 MB per file</p>
      </motion.label>

      {/* Uploaded files */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-2"
          >
            {files.map((file, i) => (
              <motion.div
                key={`${file.name}-${i}`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-2 rounded-full bg-white/[0.04] ring-1 ring-white/10 px-3 py-1.5"
              >
                {file.type.startsWith("video/") ? (
                  <Film className="w-3.5 h-3.5 text-accent" />
                ) : file.type.startsWith("image/") ? (
                  <ImageIcon className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <span className="text-xs text-foreground truncate max-w-[120px]">{file.name}</span>
                <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Brand Brief / Instructions (merged above URL inputs) */}
      {aiInstructionsSlot && (
        <div className="space-y-2 pt-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-foreground/70">
              Brand Brief / Instructions <span className="text-destructive">*</span>
            </p>
            <span className={`text-[10px] tabular-nums ${instructionsValid ? "text-muted-foreground" : "text-destructive"}`}>
              {trimmedInstructions.length}/{minInstructionsLength}+
            </span>
          </div>
          {aiInstructionsSlot}
          {blockForInstructions && (
            <div className="flex items-start gap-1.5 rounded-lg bg-destructive/10 ring-1 ring-destructive/30 px-2.5 py-1.5">
              <AlertCircle className="w-3 h-3 text-destructive mt-0.5 shrink-0" />
              <p className="text-[10.5px] text-destructive leading-snug">
                Required when a URL is provided. Tell the studio what to do with the link before analyzing or generating.
              </p>
            </div>
          )}
        </div>
      )}

      {/* URL Inputs — primary + optional secondary/tertiary */}
      <div className="space-y-2.5">
        {renderRow(0, url, onUrlChange)}

        {extraSlots >= 1 && onSecondaryUrlChange &&
          renderRow(1, secondaryUrl, onSecondaryUrlChange, () => {
            onSecondaryUrlChange("");
            if (extraSlots === 2 && onTertiaryUrlChange) onTertiaryUrlChange("");
            setExtraSlots(0);
          })}

        {extraSlots >= 2 && onTertiaryUrlChange &&
          renderRow(2, tertiaryUrl, onTertiaryUrlChange, () => {
            onTertiaryUrlChange("");
            setExtraSlots(1);
          })}

        {extraSlots < 2 && onSecondaryUrlChange && (
          <button
            type="button"
            onClick={() => setExtraSlots((n) => Math.min(2, n + 1))}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] ring-1 ring-white/[0.06] hover:ring-white/[0.12] text-[11px] text-muted-foreground hover:text-foreground py-1.5 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add {extraSlots === 0 ? "secondary" : "tertiary"} URL
          </button>
        )}
      </div>
    </div>
  );
};

export default UploadZone;
