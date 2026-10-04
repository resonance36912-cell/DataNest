import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CopyBlockProps {
  text: string;
  label?: string;
  compact?: boolean;
}

const CopyBlock = ({ text, label, compact = false }: CopyBlockProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!text) return null;

  return (
    <div className="relative group">
      {label && (
        <p className="text-[9px] font-semibold text-primary uppercase tracking-wider mb-1">{label}</p>
      )}
      <div
        className={`bg-background/60 border border-border/40 rounded-lg cursor-pointer hover:border-primary/30 transition-colors ${
          compact ? "px-3 py-2" : "px-4 py-3"
        }`}
        onClick={handleCopy}
      >
        <pre className={`whitespace-pre-wrap break-words font-sans text-foreground/90 ${compact ? "text-xs" : "text-xs leading-relaxed"}`}>
          {text}
        </pre>
        <button
          className={`absolute top-2 right-2 p-1.5 rounded-md transition-all ${
            copied
              ? "bg-success/20 text-success"
              : "bg-secondary/60 text-muted-foreground opacity-0 group-hover:opacity-100"
          }`}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <p className="text-[8px] text-muted-foreground/50 mt-0.5">
        {copied ? "✓ Copied to clipboard!" : "Click to copy"}
      </p>
    </div>
  );
};

export default CopyBlock;
