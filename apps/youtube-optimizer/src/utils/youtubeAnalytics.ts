// YouTube Analytics utility — Guest Mode & Creator Mode scoring

export interface ResonanceData {
  views: number;
  likes: number;
  comments: number;
  shares?: number;
  retention?: number; // averageViewPercentage (0-100)
  isPrivate: boolean;
}

export interface ResonanceResult {
  score: number;
  mode: "guest" | "creator";
  breakdown: {
    engagement: number;
    retention?: number;
    shares?: number;
  };
  fallback: boolean;
  fallbackReason?: string;
}

/**
 * Calculate Resonance Score.
 * Guest Mode  = 100% engagement-based (likes+comments / views)
 * Creator Mode = 45% retention + 30% engagement + 25% shares
 */
export function calculateResonanceScore(data: ResonanceData): ResonanceResult {
  const { views, likes, comments, shares, retention, isPrivate } = data;

  // Engagement sub-score (0-100)
  const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;
  // Map: >8% = 100, 5-8% = 80-100, 2-5% = 50-80, <2% scaled linearly
  const engagementScore = Math.min(100, engagementRate * 12.5);

  if (!isPrivate || retention == null) {
    // Guest Mode
    return {
      score: Math.round(Math.min(100, engagementScore)),
      mode: "guest",
      breakdown: { engagement: Math.round(engagementScore) },
      fallback: isPrivate && retention == null,
      fallbackReason: isPrivate ? "Private analytics unavailable — showing estimated score" : undefined,
    };
  }

  // Creator Mode
  const retentionScore = Math.min(100, retention * 2); // 50% retention = 100 score
  const sharesVal = shares ?? 0;
  const sharesRate = views > 0 ? (sharesVal / views) * 100 : 0;
  const sharesScore = Math.min(100, sharesRate * 50); // 2% share rate = 100

  const finalScore = Math.round(
    retentionScore * 0.45 + engagementScore * 0.30 + sharesScore * 0.25
  );

  return {
    score: Math.min(100, finalScore),
    mode: "creator",
    breakdown: {
      engagement: Math.round(engagementScore),
      retention: Math.round(retentionScore),
      shares: Math.round(sharesScore),
    },
    fallback: false,
  };
}

/**
 * Fetch private metrics from YouTube Analytics API using the user's OAuth access token.
 * Returns retention (averageViewPercentage) and shares count.
 */
export async function fetchPrivateMetrics(
  accessToken: string,
  videoId: string
): Promise<{ retention: number; shares: number } | null> {
  try {
    // YouTube Analytics API — get averageViewPercentage and shares
    const endDate = new Date().toISOString().split("T")[0];
    const startDate = "2000-01-01";

    const url = `https://youtubeanalytics.googleapis.com/v2/reports?` +
      `ids=channel==MINE` +
      `&startDate=${startDate}` +
      `&endDate=${endDate}` +
      `&metrics=averageViewPercentage,shares` +
      `&dimensions=video` +
      `&filters=video==${videoId}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      console.warn("YouTube Analytics API error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const row = data.rows?.[0];
    if (!row) return null;

    return {
      retention: row[1] ?? 0,  // averageViewPercentage
      shares: row[2] ?? 0,
    };
  } catch (err) {
    console.warn("Failed to fetch private metrics:", err);
    return null;
  }
}

/**
 * Get the score color based on value
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return "hsl(155, 55%, 45%)";   // success green
  if (score >= 60) return "hsl(192, 90%, 50%)";   // accent cyan
  if (score >= 40) return "hsl(42, 85%, 55%)";    // warning gold
  return "hsl(0, 72%, 55%)";                       // destructive red
}

export function getScoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Average";
  return "Needs Work";
}
