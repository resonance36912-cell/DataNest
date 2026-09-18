import { useState } from "react";
import { Star, MessageSquare } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface StarRatingProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  comment?: string;
  onCommentChange?: (c: string) => void;
  commentPlaceholder?: string;
}

export default function StarRating({ label, value, onChange, comment, onCommentChange, commentPlaceholder }: StarRatingProps) {
  const [hover, setHover] = useState(0);
  const [showComment, setShowComment] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => onChange(star)}
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(0)}
              className="p-0.5 transition-colors"
            >
              <Star
                className={`h-4 w-4 transition-colors ${
                  star <= (hover || value)
                    ? "fill-primary text-primary"
                    : "text-muted-foreground/30"
                }`}
              />
            </button>
          ))}
        </div>
        {value > 0 && <span className="text-xs text-primary font-medium">{value}/5</span>}
        {value > 0 && onCommentChange && (
          <button
            type="button"
            onClick={() => setShowComment(!showComment)}
            className={`p-0.5 transition-colors ${comment ? "text-primary" : "text-muted-foreground/50 hover:text-muted-foreground"}`}
            title="Add feedback for AI optimization"
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {value > 0 && showComment && onCommentChange && (
        <div className="space-y-1">
          <Textarea
            placeholder={commentPlaceholder || "Feedback for AI to auto-optimize this scene…"}
            value={comment || ""}
            onChange={(e) => onCommentChange(e.target.value)}
            className="text-xs min-h-[48px] h-12 resize-none bg-secondary/50 border-border placeholder:text-muted-foreground/60"
          />
          <p className="text-[10px] text-muted-foreground/60 italic">
            💡 Comments assist in AI optimization for updates & future version releases.
          </p>
        </div>
      )}
    </div>
  );
}
