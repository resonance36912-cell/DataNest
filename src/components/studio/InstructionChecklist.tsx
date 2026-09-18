import { Check, Circle } from "lucide-react";

interface InstructionChecklistProps {
  instructions: string;
  minLength?: number;
}

const AUDIENCE_RX =
  /\b(for |audience|customer|client|buyer|shopper|woman|women|men|man|parent|family|families|teen|gen[\s-]?z|millennial|professional|student|kid|child|owner|business|brand)\b/i;
const MOOD_RX =
  /\b(mood|tone|style|feel|vibe|aesthetic|modern|minimal|bold|playful|premium|luxury|elegant|fun|warm|cool|edgy|clean|retro|cinematic|vibrant|moody|dark|bright|soft|gritty)\b/i;
const CTA_RX =
  /\b(cta|call to action|buy|shop|sign[\s-]?up|signup|register|book|order|download|subscribe|learn more|visit|join|claim|get|try|start|reserve|enquire|contact|whats?app)\b/i;

const InstructionChecklist = ({ instructions, minLength = 12 }: InstructionChecklistProps) => {
  const text = instructions.trim();
  const checks = [
    { label: `At least ${minLength} characters`, pass: text.length >= minLength },
    { label: "Names the audience (who it's for)", pass: AUDIENCE_RX.test(text) },
    { label: "Describes mood, tone or visual style", pass: MOOD_RX.test(text) },
    { label: "Includes a goal, CTA or action", pass: CTA_RX.test(text) },
  ];
  const passed = checks.filter((c) => c.pass).length;
  const pct = Math.round((passed / checks.length) * 100);

  return (
    <div className="rounded-xl bg-white/[0.025] ring-1 ring-white/[0.06] p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-foreground/70">
          Checklist
        </p>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {passed}/{checks.length} · {pct}%
        </span>
      </div>
      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full studio-gradient-bg transition-all duration-300"
          style={{ width: `${pct}%` }}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          role="progressbar"
        />
      </div>
      <ul className="space-y-1">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-1.5 text-[11px] leading-snug">
            {c.pass ? (
              <span className="mt-[1px] inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-primary/20 ring-1 ring-primary/40 shrink-0">
                <Check className="w-2.5 h-2.5 text-primary" />
              </span>
            ) : (
              <Circle className="w-3.5 h-3.5 text-muted-foreground/60 mt-[1px] shrink-0" />
            )}
            <span className={c.pass ? "text-foreground/80 line-through decoration-foreground/20" : "text-muted-foreground"}>
              {c.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default InstructionChecklist;
