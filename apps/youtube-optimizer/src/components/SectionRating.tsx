import { useState } from "react";
import { StarIcon } from "lucide-react";

interface SectionRatingProps {
  sectionName: string;
  onRate?: (section: string, rating: number) => void;
  compact?: boolean;
}

const SectionRating = ({ sectionName, onRate, compact = false }: SectionRatingProps) => {
  const [rating, setRating] = useState(0);
  const [hovering, setHovering] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const handleRate = (star: number) => {
    setRating(star);
    setSubmitted(true);
    onRate?.(sectionName, star);
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => handleRate(star)}
            onMouseEnter={() => setHovering(star)}
            onMouseLeave={() => setHovering(0)}
            className="p-0 transition-transform hover:scale-125"
            title={`Rate ${star}/5`}
          >
            <StarIcon
              className={`h-3.5 w-3.5 transition-colors ${
                star <= (hovering || rating)
                  ? "text-accent fill-accent"
                  : "text-muted-foreground/30"
              }`}
            />
          </button>
        ))}
        {submitted && (
          <span className="text-[9px] text-muted-foreground ml-1">Thanks!</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-secondary/30 rounded-lg px-3 py-2 border border-border/30">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold shrink-0">
        Rate this section
      </span>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => handleRate(star)}
            onMouseEnter={() => setHovering(star)}
            onMouseLeave={() => setHovering(0)}
            className="p-0.5 transition-transform hover:scale-125"
            title={`Rate ${star}/5`}
          >
            <StarIcon
              className={`h-4 w-4 transition-colors ${
                star <= (hovering || rating)
                  ? "text-accent fill-accent"
                  : "text-muted-foreground/30"
              }`}
            />
          </button>
        ))}
      </div>
      {submitted && (
        <span className="text-[10px] text-accent font-medium animate-in fade-in">
          ⚡ {rating}/5 — Feedback saved
        </span>
      )}
    </div>
  );
};

export default SectionRating;
