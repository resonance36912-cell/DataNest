import { m as motion } from "@/lib/lazy-motion";
import { Lightbulb, Sparkles, Tag } from "lucide-react";
import type { ContentIdea, TitleTemplate } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import SectionRating from "@/components/SectionRating";

const potentialColor: Record<string, string> = {
  "Very High": "bg-success/20 text-success border-success/30",
  High: "bg-accent/20 text-accent border-accent/30",
  Medium: "bg-chart-4/20 text-chart-4 border-chart-4/30",
};

interface ContentIdeasTabProps {
  contentIdeas: ContentIdea[];
  titleTemplates: TitleTemplate[];
}

const ContentIdeasTab = ({ contentIdeas, titleTemplates }: ContentIdeasTabProps) => (
  <div className="space-y-6">
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          <h3 className="font-display font-semibold text-lg">AI-Generated Content Ideas</h3>
        </div>
        <SectionRating sectionName="Content Ideas" compact />
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        Based on your niche, audience behavior, and trending topics — optimized for discoverability.
      </p>

      <div className="space-y-4">
        {contentIdeas.map((idea, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 * i }}
            className="glass-card p-5 hover:border-primary/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <h4 className="font-display font-semibold text-foreground">{idea.title}</h4>
              <Badge variant="outline" className={`shrink-0 ${potentialColor[idea.potential] || ""}`}>
                {idea.potential}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mb-2 text-sm">
              <Lightbulb className="h-4 w-4 text-accent" />
              <span className="text-muted-foreground"><span className="text-accent font-medium">Hook:</span> {idea.hook}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              {idea.keywords.map((kw) => (
                <span key={kw} className="text-xs bg-secondary px-2 py-0.5 rounded-md text-muted-foreground">{kw}</span>
              ))}
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md ml-auto">{idea.type}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>

    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-lg">Title & Description Templates</h3>
        <SectionRating sectionName="Title Templates" compact />
      </div>
      <div className="space-y-3">
        {titleTemplates.map((t, i) => (
          <div key={i} className="bg-secondary/50 rounded-lg p-4">
            <p className="font-display font-medium text-sm text-foreground">{t.title}</p>
            <p className="text-muted-foreground text-xs mt-1">{t.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default ContentIdeasTab;
