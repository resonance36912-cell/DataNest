import { useState, useEffect } from "react";
import { m as motion, AnimatePresence } from "@/lib/lazy-motion";
import { Search, Loader2, AlertCircle, Eye, ThumbsUp, MessageSquare, PlayCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { analyzeEpisode } from "@/lib/analyze-episode.functions";
import { classifyPromotionCostingError, trackPromotionCosting } from "@/lib/costing-telemetry";
import ResonanceScoreGauge from "./ResonanceScoreGauge";
import DataTransparencyCard from "./DataTransparencyCard";
import ModeBanner from "./ModeBanner";
import {
  calculateResonanceScore,
  fetchPrivateMetrics,
  type ResonanceData,
  type ResonanceResult,
} from "@/utils/youtubeAnalytics";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  const shortMatch = trimmed.match(/youtu\.be\/([\w-]{11})/);
  if (shortMatch) return shortMatch[1] ?? null;
  const watchMatch = trimmed.match(/[?&]v=([\w-]{11})/);
  if (watchMatch) return watchMatch[1] ?? null;
  const embedMatch = trimmed.match(/youtube\.com\/embed\/([\w-]{11})/);
  if (embedMatch) return embedMatch[1] ?? null;
  const shortsMatch = trimmed.match(/youtube\.com\/shorts\/([\w-]{11})/);
  if (shortsMatch) return shortsMatch[1] ?? null;
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  return null;
}

const VideoScoreAnalyzer = () => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResonanceResult | null>(null);
  const [videoInfo, setVideoInfo] = useState<{
    title: string;
    thumbnail: string;
    channel: string;
    views: number;
    likes: number;
    comments: number;
  } | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [providerToken, setProviderToken] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      setProviderToken(session?.provider_token ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
      setProviderToken(session?.provider_token ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const analyzeVideo = async () => {
    const videoId = extractVideoId(url);
    if (!videoId) {
      setError("Please enter a valid YouTube video URL or ID.");
      return;
    }

    const startedAt = performance.now();
    setLoading(true);
    setError(null);
    setResult(null);
    setVideoInfo(null);

    try {
      // Fetch public metrics via server function
      const data = await analyzeEpisode({ data: { videoUrl: url.trim() } });

      const vd = data.videoData;
      setVideoInfo({
        title: vd.title,
        thumbnail: vd.thumbnailUrl,
        channel: vd.channelTitle,
        views: vd.viewCount,
        likes: vd.likeCount,
        comments: vd.commentCount,
      });

      // Build resonance data
      const resonanceData: ResonanceData = {
        views: vd.viewCount,
        likes: vd.likeCount,
        comments: vd.commentCount,
        isPrivate: isAuthenticated,
      };

      // If authenticated, try fetching private metrics
      if (isAuthenticated && providerToken) {
        const privateMetrics = await fetchPrivateMetrics(providerToken, videoId);
        if (privateMetrics) {
          resonanceData.retention = privateMetrics.retention;
          resonanceData.shares = privateMetrics.shares;
        }
      }

      const resonanceResult = calculateResonanceScore(resonanceData);
      setResult(resonanceResult);
      void trackPromotionCosting({
        operation: "video_score_analysis",
        source: "VideoScoreAnalyzer",
        outcome: "success",
        durationMs: performance.now() - startedAt,
        mode: isAuthenticated ? "creator" : "guest",
        inputUnits: 1,
        outputUnits: 1,
      });
    } catch (err: any) {
      setError(err.message || "Failed to analyze video");
      void trackPromotionCosting({
        operation: "video_score_analysis",
        source: "VideoScoreAnalyzer",
        outcome: "failure",
        durationMs: performance.now() - startedAt,
        mode: isAuthenticated ? "creator" : "guest",
        inputUnits: 1,
        errorKind: classifyPromotionCostingError(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const mode = isAuthenticated ? "creator" : "guest";

  return (
    <div className="space-y-6">
      {/* Mode Banner */}
      <div className="flex justify-center">
        <ModeBanner mode={mode} />
      </div>

      {/* Input */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border/40 bg-card/40 backdrop-blur-xl p-6"
      >
        <div className="flex items-center gap-2 mb-3">
          <PlayCircle className="h-5 w-5 text-primary" />
          <h3 className="font-display font-semibold text-lg">Resonance Score</h3>
        </div>
        <p className="text-muted-foreground text-sm mb-4">
          Enter a YouTube video to calculate its Resonance Score — a measure of true audience connection.
        </p>
        <div className="flex gap-3">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a YouTube video URL or ID..."
            className="flex-1 bg-secondary/40"
            onKeyDown={(e) => e.key === "Enter" && !loading && analyzeVideo()}
          />
          <Button
            onClick={analyzeVideo}
            disabled={loading || !url.trim()}
            className="gap-2 font-display rounded-full px-6"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Scoring...</>
            ) : (
              <><Search className="h-4 w-4" /> Score</>
            )}
          </Button>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2 mt-3 text-sm"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </motion.div>
        )}
      </motion.div>

      {/* Loading */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 py-12"
          >
            <div className="relative">
              <div className="w-20 h-20 rounded-full border-4 border-secondary" />
              <motion.div
                className="absolute inset-0 w-20 h-20 rounded-full border-4 border-transparent border-t-primary"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm text-muted-foreground font-display">Calculating Resonance Score...</p>
              <p className="text-[10px] text-muted-foreground/60">
                {isAuthenticated ? "Fetching public + private analytics" : "Analyzing public engagement data"}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence>
        {result && videoInfo && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Video info card */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl border border-border/40 bg-card/40 backdrop-blur-xl p-5"
            >
              <div className="flex flex-col sm:flex-row gap-4">
                <img
                  src={videoInfo.thumbnail}
                  alt={videoInfo.title}
                  className="w-full sm:w-48 aspect-video rounded-xl object-cover border border-border/50"
                />
                <div className="flex-1 space-y-2">
                  <h4 className="font-display font-bold text-base leading-tight line-clamp-2">{videoInfo.title}</h4>
                  <p className="text-xs text-muted-foreground">{videoInfo.channel}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{formatNumber(videoInfo.views)}</span>
                    <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" />{formatNumber(videoInfo.likes)}</span>
                    <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{formatNumber(videoInfo.comments)}</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Score Gauge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl border border-border/40 bg-card/40 backdrop-blur-xl p-8"
            >
              <ResonanceScoreGauge result={result} />
            </motion.div>

            {/* Data Transparency */}
            <DataTransparencyCard result={result} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VideoScoreAnalyzer;
