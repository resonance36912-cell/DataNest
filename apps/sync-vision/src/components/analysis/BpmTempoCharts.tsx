import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { Activity } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { VerificationResult } from "@/contexts/ProjectContext";

// Standard classical tempo-feel ranges (BPM)
const TEMPO_FEELS: { name: string; min: number; max: number }[] = [
  { name: "Largo", min: 40, max: 60 },
  { name: "Adagio", min: 60, max: 76 },
  { name: "Andante", min: 76, max: 108 },
  { name: "Moderato", min: 108, max: 120 },
  { name: "Allegro", min: 120, max: 156 },
  { name: "Vivace", min: 156, max: 176 },
  { name: "Presto", min: 176, max: 200 },
];

interface Props {
  verification: VerificationResult | null;
  bpm: string | number | null;
}

const chartConfig: ChartConfig = {
  value: { label: "BPM", color: "hsl(var(--primary))" },
  remainder: { label: "Headroom", color: "hsl(var(--muted))" },
  range: { label: "Range width (BPM)", color: "hsl(var(--primary))" },
};

export default function BpmTempoCharts({ verification, bpm }: Props) {
  const bpmNum = typeof bpm === "string" ? Number(bpm) : bpm;
  if (!verification || !bpmNum || !Number.isFinite(bpmNum) || bpmNum <= 0) return null;

  const activeFeelLower = verification.tempo_feel?.trim().toLowerCase() ?? "";

  const feelData = TEMPO_FEELS.map((f) => {
    const inRange = bpmNum >= f.min && bpmNum < f.max;
    const namedMatch = activeFeelLower && f.name.toLowerCase() === activeFeelLower;
    return {
      name: f.name,
      range: f.max - f.min,
      span: `${f.min}–${f.max}`,
      active: Boolean(inRange || namedMatch),
    };
  });

  const gaugeMax = 200;
  const clampedBpm = Math.min(bpmNum, gaugeMax);
  const gaugeData = [
    {
      name: "Tempo",
      value: clampedBpm,
      remainder: Math.max(0, gaugeMax - clampedBpm),
    },
  ];

  return (
    <div className="glass-card p-6 space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <Activity className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Tempo Visualization</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {Math.round(bpmNum)} BPM · {verification.tempo_feel || "—"}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground mb-2">BPM gauge (0–{gaugeMax})</p>
          <ChartContainer config={chartConfig} className="h-[140px] w-full aspect-auto">
            <BarChart data={gaugeData} layout="vertical" margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
              <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeOpacity={0.4} />
              <XAxis
                type="number"
                domain={[0, gaugeMax]}
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickCount={6}
              />
              <YAxis
                type="category"
                dataKey="name"
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                width={48}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="value" stackId="g" fill="hsl(var(--primary))" radius={[4, 0, 0, 4]} />
              <Bar dataKey="remainder" stackId="g" fill="hsl(var(--muted))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2">
            Tempo-feel ranges — your track's bucket is highlighted
          </p>
          <ChartContainer config={chartConfig} className="h-[200px] w-full aspect-auto">
            <BarChart data={feelData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.4} />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} width={32} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(value, _name, item) => {
                      const span = (item?.payload as { span?: string })?.span;
                      return `${span} BPM (${value} wide)`;
                    }}
                  />
                }
              />
              <Bar dataKey="range" radius={[4, 4, 0, 0]}>
                {feelData.map((d) => (
                  <Cell key={d.name} fill={d.active ? "hsl(var(--primary))" : "hsl(var(--muted))"} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  );
}
