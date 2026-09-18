import { useState } from "react";
import { Check, Sparkles, Type } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ThumbnailTextSuggestionsProps {
  videoTitle: string;
  niche?: string;
  suggestion?: string;
  onSelect?: (text: string) => void;
}

const generateTextSuggestions = (title: string, niche?: string, suggestion?: string): string[] => {
  const words = title.split(/\s+/).filter(Boolean);
  const suggestions: string[] = [];

  // From AI suggestion if available
  if (suggestion) {
    const cleaned = suggestion.replace(/^(use|try|add|consider)\s+/i, "").replace(/["""]/g, "").trim();
    if (cleaned.length > 2 && cleaned.length < 40) suggestions.push(cleaned.toUpperCase());
  }

  // Short power phrases from title
  if (words.length >= 3) {
    suggestions.push(words.slice(0, 3).join(" ").toUpperCase());
  }
  if (words.length >= 2) {
    suggestions.push(words.slice(0, 2).join(" ").toUpperCase() + "!");
  }

  // Emotional hooks
  const hooks = ["MUST WATCH", "GAME CHANGER", "YOU WON'T BELIEVE", "THE TRUTH", "FINALLY!", "NO WAY!", "SHOCKING", "EXPOSED"];
  const keyword = words.find(w => w.length > 4)?.toUpperCase() || "";
  if (keyword) {
    suggestions.push(`${keyword}?!`);
    suggestions.push(`THE ${keyword}`);
  }

  // Niche-aware
  if (niche) {
    suggestions.push(`#1 ${niche.toUpperCase()} TIP`);
  }

  // Add generic power text
  suggestions.push(...hooks.slice(0, 2));

  // Deduplicate and limit
  return [...new Set(suggestions)].slice(0, 8);
};

const ThumbnailTextSuggestions = ({ videoTitle, niche, suggestion, onSelect }: ThumbnailTextSuggestionsProps) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const suggestions = generateTextSuggestions(videoTitle, niche, suggestion);

  const handleSelect = (text: string, index: number) => {
    setSelectedIndex(index);
    if (onSelect) {
      onSelect(text);
    } else {
      navigator.clipboard.writeText(text);
    }
  };

  if (!suggestions.length) return null;

  return (
    <div className="space-y-2.5 mt-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <Sparkles className="h-3 w-3 text-accent" /> Recommended Thumbnail Text — Select one
      </p>
      <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-1 gap-1.5">
          {suggestions.map((text, i) => {
            const thumbnailText = text.trim().toUpperCase();
            const isSelected = selectedIndex === i;
            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleSelect(thumbnailText, i)}
                    className={`group flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg border transition-all text-sm font-bold ${
                      isSelected
                        ? "border-primary bg-primary/15 ring-1 ring-primary/30 shadow-xs"
                        : "border-border/40 bg-secondary/20 hover:bg-accent/10 hover:border-accent/30"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? "border-primary bg-primary"
                          : "border-muted-foreground/30 group-hover:border-accent/50"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <span
                      className={`transition-colors leading-snug break-words ${
                        isSelected ? "text-primary" : "text-foreground/80 group-hover:text-foreground"
                      }`}
                      style={{ fontFamily: '"Impact", "Arial Black", sans-serif', letterSpacing: '0.3px' }}
                    >
                      {thumbnailText}
                    </span>
                    {isSelected && (
                      <span className="ml-auto text-[9px] text-primary/70 font-normal shrink-0">Active</span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[360px] p-3 space-y-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Will display on thumbnail:</p>
                  <p
                    className="text-lg font-black break-words whitespace-pre-wrap"
                    style={{ fontFamily: '"Impact", "Arial Black", sans-serif', letterSpacing: '0.5px' }}
                  >
                    {thumbnailText}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
      <p className="text-[9px] text-muted-foreground/60">
        Select a text suggestion above — it will appear as an editable overlay on the thumbnail
      </p>
    </div>
  );
};

export default ThumbnailTextSuggestions;
