import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { runEpisodeAnalysis } from "./analyze-episode.server";

const InputSchema = z.object({
  videoUrl: z.string().min(1),
});

/**
 * Analyzes a single YouTube video (episode) with real metrics + AI insights.
 * Ported from supabase/functions/analyze-episode.
 */
export const analyzeEpisode = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const youtubeApiKey = process.env["YOUTUBE_API_KEY"];
    if (!youtubeApiKey) throw new Error("YouTube API key not configured");
    return runEpisodeAnalysis({ videoUrl: data.videoUrl, youtubeApiKey });
  });
