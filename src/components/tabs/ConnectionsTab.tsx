import { m as motion } from "@/lib/lazy-motion";
import { Handshake, Mail, ExternalLink } from "lucide-react";
import type { Collaboration } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import SectionRating from "@/components/SectionRating";

const compatColor: Record<string, string> = {
  "Very High": "bg-success/20 text-success border-success/30",
  High: "bg-accent/20 text-accent border-accent/30",
  Medium: "bg-chart-4/20 text-chart-4 border-chart-4/30",
};

interface ConnectionsTabProps {
  collaborations: Collaboration[];
}

const ConnectionsTab = ({ collaborations }: ConnectionsTabProps) => (
  <div className="space-y-6">
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Handshake className="h-5 w-5 text-accent" />
          <h3 className="font-display font-semibold text-lg">Collaboration Opportunities</h3>
        </div>
        <SectionRating sectionName="Collaborations" compact />
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        Creators in adjacent niches with audience overlap potential. All contacts are publicly listed.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {collaborations.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 * i }}
            className="glass-card p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center font-display font-bold text-muted-foreground">
                  {c.name.slice(0, 2)}
                </div>
                <div>
                  <p className="font-display font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.subscribers} · {c.niche}</p>
                </div>
              </div>
              <Badge variant="outline" className={compatColor[c.compatibility] || ""}>
                {c.compatibility}
              </Badge>
            </div>
            <div className="flex items-center gap-2 bg-secondary/50 rounded-lg p-3 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{c.contactType}:</span>
              <span className="text-foreground font-medium">{c.contact}</span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground ml-auto cursor-pointer hover:text-foreground transition-colors" />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  </div>
);

export default ConnectionsTab;
