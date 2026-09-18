import { m as motion } from "@/lib/lazy-motion";
import { TrendingUp, Target, Clock, BarChart3 } from "lucide-react";
import type { TrendTopic, Competitor } from "@/lib/types";
import SectionRating from "@/components/SectionRating";

interface TrendsTabProps {
  trendTopics: TrendTopic[];
  competitors: Competitor[];
}

const TrendsTab = ({ trendTopics, competitors }: TrendsTabProps) => (
  <div className="space-y-6">
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h3 className="font-display font-semibold text-lg">Trending Topics in Your Niche</h3>
        </div>
        <SectionRating sectionName="Trend Topics" compact />
      </div>
      <p className="text-muted-foreground text-sm mb-6">Topics with rising search volume relevant to your content.</p>

      <div className="space-y-3">
        {trendTopics.map((t, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 * i }}
            className="flex items-center justify-between bg-secondary/50 rounded-lg p-4"
          >
            <div className="flex items-center gap-4">
              <span className="font-display font-bold text-primary text-lg">#{i + 1}</span>
              <div>
                <p className="font-display font-medium text-foreground">{t.topic}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t.timeframe}</span>
                  <span className="flex items-center gap-1"><Target className="h-3 w-3" />Relevance: {t.relevance}</span>
                </div>
              </div>
            </div>
            <span className="text-success font-display font-semibold text-sm">{t.growth}</span>
          </motion.div>
        ))}
      </div>
    </div>

    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-accent" />
          <h3 className="font-display font-semibold text-lg">Competitor Analysis</h3>
        </div>
        <SectionRating sectionName="Competitor Analysis" compact />
      </div>
      <p className="text-muted-foreground text-sm mb-6">Similar channels and opportunities to differentiate.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {competitors.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 * i }}
            className="glass-card p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-display font-bold text-sm text-muted-foreground">
                {c.name[0]}
              </div>
              <div>
                <p className="font-display font-semibold text-sm">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.subscribers} subs · {c.avgViews} avg views</p>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="bg-secondary/50 rounded p-2">
                <span className="text-muted-foreground">Strength: </span>
                <span className="text-foreground">{c.strength}</span>
              </div>
              <div className="bg-success/5 border border-success/20 rounded p-2">
                <span className="text-success font-medium">Opportunity: </span>
                <span className="text-foreground">{c.opportunity}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  </div>
);

export default TrendsTab;
