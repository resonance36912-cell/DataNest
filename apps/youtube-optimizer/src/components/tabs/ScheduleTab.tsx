import { m as motion } from "@/lib/lazy-motion";
import { Calendar, Clock, Monitor } from "lucide-react";
import type { ScheduleDay, ThumbnailConcept } from "@/lib/types";
import SectionRating from "@/components/SectionRating";

interface ScheduleTabProps {
  weeklySchedule: ScheduleDay[];
  thumbnailConcepts: ThumbnailConcept[];
}

const ScheduleTab = ({ weeklySchedule, thumbnailConcepts }: ScheduleTabProps) => (
  <div className="space-y-6">
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-chart-4" />
          <h3 className="font-display font-semibold text-lg">Optimized Weekly Posting Schedule</h3>
        </div>
        <SectionRating sectionName="Weekly Schedule" compact />
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        Based on your audience's peak activity times and platform best practices.
      </p>

      <div className="space-y-3">
        {weeklySchedule.map((day, i) => {
          const isRest = day.type === "—" || day.type === "-";
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i }}
              className={`flex items-center gap-4 rounded-xl p-4 ${isRest ? "bg-muted/30" : "glass-card"}`}
            >
              <span className={`font-display font-semibold text-sm w-24 ${isRest ? "text-muted-foreground" : "text-foreground"}`}>
                {day.day}
              </span>
              {isRest ? (
                <span className="text-muted-foreground text-sm italic">{day.note}</span>
              ) : (
                <>
                  <span className="bg-primary/10 text-primary font-medium text-xs px-3 py-1 rounded-md w-44 text-center">
                    {day.type}
                  </span>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground w-32">
                    <Clock className="h-3.5 w-3.5" />
                    {day.time}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-1">
                    <Monitor className="h-3.5 w-3.5" />
                    {day.platform}
                  </div>
                  <span className="text-xs text-muted-foreground hidden lg:block max-w-48">{day.note}</span>
                </>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>

    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-lg">📌 Thumbnail Concepts</h3>
        <SectionRating sectionName="Thumbnail Concepts" compact />
      </div>
      <p className="text-muted-foreground text-sm mb-4">Recommended thumbnail strategies for higher CTR.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {thumbnailConcepts.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 * i }}
            className="bg-secondary/50 rounded-xl p-4"
          >
            <h4 className="font-display font-semibold text-sm text-foreground mb-2">{c.style}</h4>
            <p className="text-xs text-muted-foreground mb-3">{c.desc}</p>
            <span className="text-xs bg-success/10 text-success px-2 py-1 rounded-md">Expected CTR: {c.ctr}</span>
          </motion.div>
        ))}
      </div>
    </div>
  </div>
);

export default ScheduleTab;
