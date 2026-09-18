import { m as motion } from "@/lib/lazy-motion";
import { DollarSign, CheckCircle2, Clock, Rocket } from "lucide-react";
import type { MonetizationOpportunity, ActionWeek } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import SectionRating from "@/components/SectionRating";

const readinessIcon: Record<string, React.ReactNode> = {
  Ready: <CheckCircle2 className="h-4 w-4 text-success" />,
  Eligible: <Clock className="h-4 w-4 text-accent" />,
  Opportunity: <Rocket className="h-4 w-4 text-chart-4" />,
  Growing: <Rocket className="h-4 w-4 text-chart-5" />,
};

interface MonetizationTabProps {
  monetizationOpportunities: MonetizationOpportunity[];
  actionPlan: ActionWeek[];
}

const MonetizationTab = ({ monetizationOpportunities, actionPlan }: MonetizationTabProps) => (
  <div className="space-y-6">
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-success" />
          <h3 className="font-display font-semibold text-lg">Monetization Opportunities</h3>
        </div>
        <SectionRating sectionName="Monetization" compact />
      </div>
      <p className="text-muted-foreground text-sm mb-6">Revenue streams based on your current channel metrics and growth trajectory.</p>

      <div className="space-y-4">
        {monetizationOpportunities.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 * i }}
            className="glass-card p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {readinessIcon[m.readiness] || <Rocket className="h-4 w-4 text-chart-4" />}
                <span className="font-display font-semibold">{m.type}</span>
                <Badge variant="outline" className="text-xs">{m.readiness}</Badge>
              </div>
              <span className="font-display font-bold text-success text-sm">{m.estimatedRevenue}</span>
            </div>
            <p className="text-muted-foreground text-sm">{m.action}</p>
          </motion.div>
        ))}
      </div>
    </div>

    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-lg">📋 30-Day Action Plan</h3>
        <SectionRating sectionName="Action Plan" compact />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {actionPlan.map((week, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * i }}
            className="bg-secondary/50 rounded-xl p-4"
          >
            <h4 className="font-display font-semibold text-primary mb-3">{week.week}</h4>
            <ul className="space-y-2">
              {week.tasks.map((task, j) => (
                <li key={j} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  {task}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </div>
  </div>
);

export default MonetizationTab;
