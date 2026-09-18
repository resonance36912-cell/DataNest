import { useEffect, useState, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, TrendingUp } from "lucide-react";

// Credits are unitless

interface DayBucket {
  date: string;
  video: number;
  image: number;
  total: number;
  cumulative: number;
}

export default function SpendChart() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [renderRows, setRenderRows] = useState<any[]>([]);
  const [genRows, setGenRows] = useState<any[]>([]);


  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("render_jobs").select("created_at, estimated_cost_gbp").eq("user_id", user.id).not("estimated_cost_gbp", "is", null).order("created_at", { ascending: true }),
      supabase.from("generation_jobs").select("created_at, estimated_cost_gbp").eq("user_id", user.id).not("estimated_cost_gbp", "is", null).order("created_at", { ascending: true }),
    ]).then(([r, g]) => {
      setRenderRows(r.data || []);
      setGenRows(g.data || []);
      setLoading(false);
    });
  }, [user]);

  const data = useMemo(() => {
    const map = new Map<string, { video: number; image: number }>();

    for (const row of renderRows) {
      const day = row.created_at.slice(0, 10);
      const entry = map.get(day) || { video: 0, image: 0 };
      entry.video += (row.estimated_cost_gbp || 0);
      map.set(day, entry);
    }
    for (const row of genRows) {
      const day = row.created_at.slice(0, 10);
      const entry = map.get(day) || { video: 0, image: 0 };
      entry.image += (row.estimated_cost_gbp || 0);
      map.set(day, entry);
    }

    const sorted = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    let cumulative = 0;
    return sorted.map(([date, { video, image }]): DayBucket => {
      const total = video + image;
      cumulative += total;
      return {
        date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        video: +video.toFixed(2),
        image: +image.toFixed(2),
        total: +total.toFixed(2),
        cumulative: +cumulative.toFixed(2),
      };
    });
  }, [renderRows, genRows]);



  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 rounded-xl border border-border bg-card">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data.length < 2) return null; // Not enough data for a chart

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Spend Over Time</h3>
        </div>
        <span className="text-[10px] text-muted-foreground">credits</span>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorVideo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorImage" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${v}`} width={45} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [`${value.toFixed(2)} credits`, name === "video" ? "🎬 Video" : name === "image" ? "🖼️ Image" : name]}
            labelStyle={{ fontWeight: 600, marginBottom: 4 }}
          />
          <Legend
            iconSize={8}
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value) => (value === "video" ? "Video" : value === "image" ? "Image" : value)}
          />
          <Area type="monotone" dataKey="video" stroke="hsl(var(--primary))" fill="url(#colorVideo)" strokeWidth={2} />
          <Area type="monotone" dataKey="image" stroke="hsl(var(--accent))" fill="url(#colorImage)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-muted-foreground text-right">
        Cumulative: {data[data.length - 1]?.cumulative.toFixed(2) || "0.00"} credits
      </p>
    </div>
  );
}
