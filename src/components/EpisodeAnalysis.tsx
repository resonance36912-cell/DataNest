import { useState, useCallback, useRef } from "react";
import { m as motion, AnimatePresence } from "@/lib/lazy-motion";
import { Link2, Loader2, AlertCircle, Eye, ThumbsUp, MessageSquare, Zap, TrendingUp, Star, CheckCircle2, XCircle, Image, Wand2, Download, Pencil, FileText, Hash, AtSign, Clock, Upload, X, Search, MessageCircle, PlayCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { analyzeEpisode as analyzeEpisodeFn } from "@/lib/analyze-episode.functions";
import { generateThumbnail as generateThumbnailFn } from "@/lib/generate-thumbnail.functions";
import ThumbnailTextEditor from "@/components/ThumbnailTextEditor";
import CopyBlock from "@/components/CopyBlock";
import { classifyPromotionCostingError, trackPromotionCosting } from "@/lib/costing-telemetry";

interface EpisodeVideoData {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
  tags: string[];
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: string;
  channelTitle: string;
}

interface EpisodeAnalysisResult {
  performanceRating: string;
  overallScore: number;
  summary: string;
  thumbnailFeedback: string;
  thumbnailSuggestion: string;
  titleFeedback: string;
  titleSuggestion: string;
  titleAlternatives: string[];
  descriptionFeedback: string;
  descriptionSuggestion: string;
  seoKeywords: string[];
  seoScore: number;
  seoTips: string[];
  tagsSuggestion: string;
  hashtagFeedback: string;
  suggestedHashtags: string[];
  mentionsSuggestion: string;
  postingTimeFeedback: string;
  bestPostingTime: string;
  engagementAnalysis: string;
  retentionTips: string[];
  viralPotential: string;
  viralFactors: string[];
  contentStrengths: string[];
  improvementAreas: string[];
  ctaSuggestion: string;
  hookSuggestion: string;
  pinCommentSuggestion: string;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

const ratingColor: Record<string, string> = {
  Excellent: "bg-success/20 text-success border-success/30",
  Good: "bg-accent/20 text-accent border-accent/30",
  Average: "bg-warning/20 text-warning border-warning/30",
  "Below Average": "bg-destructive/20 text-destructive border-destructive/30",
};

const viralColor: Record<string, string> = {
  "Very High": "bg-success/20 text-success",
  High: "bg-accent/20 text-accent",
  Medium: "bg-warning/20 text-warning",
  Low: "bg-destructive/20 text-destructive",
};

const ALIGN_OPTIONS = [
  { value: "left" as const, label: "Left" },
  { value: "center" as const, label: "Center" },
  { value: "right" as const, label: "Right" },
];
const VPOS_OPTIONS = [
  { value: "top" as const, label: "Top" },
  { value: "center" as const, label: "Middle" },
  { value: "bottom" as const, label: "Bottom" },
];

const EpisodeAnalysis = () => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoData, setVideoData] = useState<EpisodeVideoData | null>(null);
  const [analysis, setAnalysis] = useState<EpisodeAnalysisResult | null>(null);

  // Thumbnail generation state
  const [thumbLoading, setThumbLoading] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbError, setThumbError] = useState<string | null>(null);
  const [overlayText, setOverlayText] = useState("");
  const [hAlign, setHAlign] = useState<"left" | "center" | "right">("center");
  const [vPos, setVPos] = useState<"top" | "center" | "bottom">("bottom");
  const [thumbValidation, setThumbValidation] = useState<{ passed: boolean; issues: string[] } | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [regenPrompt, setRegenPrompt] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const analyzeEpisode = async () => {
    if (!url.trim()) return;
    const startedAt = performance.now();
    setLoading(true);
    setError(null);
    setVideoData(null);
    setAnalysis(null);
    setThumbUrl(null);
    try {
      const data = await analyzeEpisodeFn({ data: { videoUrl: url.trim() } });
      setVideoData(data.videoData);
      setAnalysis(data.analysis);
      setOverlayText(data.analysis?.thumbnailSuggestion || "");
      void trackPromotionCosting({
        operation: "episode_analysis",
        source: "EpisodeAnalysis",
        outcome: "success",
        durationMs: performance.now() - startedAt,
        inputUnits: 1,
        outputUnits: 1,
      });
    } catch (err: any) {
      setError(err.message || "Failed to analyze episode");
      void trackPromotionCosting({
        operation: "episode_analysis",
        source: "EpisodeAnalysis",
        outcome: "failure",
        durationMs: performance.now() - startedAt,
        inputUnits: 1,
        errorKind: classifyPromotionCostingError(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const generateThumbnail = useCallback(async () => {
    if (!videoData || !analysis) return;
    const startedAt = performance.now();
    let inputBytes: number | undefined;
    setThumbLoading(true);
    setThumbError(null);
    try {
      const imgRes = await fetch(videoData.thumbnailUrl);
      if (!imgRes.ok) throw new Error("Could not fetch current thumbnail.");
      const blob = await imgRes.blob();
      inputBytes = blob.size;
      const originalThumbnail = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const data = await generateThumbnailFn({
        data: {
          videoTitle: videoData.title,
          thumbnailFeedback: analysis.thumbnailFeedback,
          thumbnailSuggestion: analysis.thumbnailSuggestion,
          niche: "general",
          originalThumbnail,
          suggestText: true,
          userPrompt: regenPrompt || undefined,
          referenceImage: referenceImage || undefined,
        },
      });
      if (!data?.imageUrl) throw new Error("No thumbnail generated.");
      setThumbUrl(data.imageUrl);
      if (data?.suggestedText) setOverlayText(data.suggestedText);
      setThumbValidation(data.qualityValidation || null);
      void trackPromotionCosting({
        operation: "thumbnail_generation",
        source: "EpisodeAnalysis",
        outcome: "success",
        durationMs: performance.now() - startedAt,
        inputUnits: 1,
        outputUnits: 1,
        inputBytes,
      });
    } catch (err: any) {
      setThumbError(err.message);
      setThumbValidation(null);
      void trackPromotionCosting({
        operation: "thumbnail_generation",
        source: "EpisodeAnalysis",
        outcome: "failure",
        durationMs: performance.now() - startedAt,
        inputUnits: 1,
        inputBytes,
        errorKind: classifyPromotionCostingError(err),
      });
    } finally {
      setThumbLoading(false);
    }
  }, [videoData, analysis, regenPrompt, referenceImage]);

  const downloadImage = (dataUrl: string, filename: string) => {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="h-5 w-5 text-primary" />
          <h3 className="font-display font-semibold text-lg">Analyze a Single Episode</h3>
        </div>
        <p className="text-muted-foreground text-sm mb-4">
          Paste any YouTube video link to get AI-powered analysis, suggestions, and thumbnail optimization.
        </p>
        <div className="flex gap-3">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=... or youtu.be/..."
            className="flex-1"
            onKeyDown={(e) => e.key === "Enter" && analyzeEpisode()}
          />
          <Button onClick={analyzeEpisode} disabled={loading || !url.trim()} className="gap-2 font-display">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</> : "Analyze"}
          </Button>
        </div>
        {error && (
          <div className="flex items-center gap-2 text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 mt-3 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-8">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div key={i} className="w-2.5 h-2.5 rounded-full gradient-primary" animate={{ y: [0, -8, 0] }} transition={{ duration: 0.6, delay: i * 0.15, repeat: Infinity }} />
            ))}
          </div>
          <p className="text-muted-foreground text-sm animate-pulse-glow">Analyzing episode...</p>
        </motion.div>
      )}

      {/* Results */}
      <AnimatePresence>
        {videoData && analysis && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Video Overview */}
            <div className="glass-card p-6">
              <div className="flex flex-col md:flex-row gap-6">
                <img src={videoData.thumbnailUrl} alt={videoData.title} className="w-full md:w-72 aspect-video rounded-xl object-cover border border-border/50" />
                <div className="flex-1 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="font-display font-bold text-lg leading-tight">{videoData.title}</h4>
                    <Badge variant="outline" className={`shrink-0 ${ratingColor[analysis.performanceRating] || ""}`}>
                      {analysis.performanceRating}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{videoData.channelTitle}</p>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Eye className="h-4 w-4" />{formatNumber(videoData.viewCount)}</span>
                    <span className="flex items-center gap-1"><ThumbsUp className="h-4 w-4" />{formatNumber(videoData.likeCount)}</span>
                    <span className="flex items-center gap-1"><MessageSquare className="h-4 w-4" />{formatNumber(videoData.commentCount)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-primary" />
                      <span className="font-display font-bold text-xl">{analysis.overallScore}</span>
                      <span className="text-xs text-muted-foreground">/100</span>
                    </div>
                    <Badge className={`${viralColor[analysis.viralPotential] || ""}`}>
                      <Zap className="h-3 w-3 mr-1" /> {analysis.viralPotential} Viral Potential
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{analysis.summary}</p>
                </div>
              </div>
            </div>

            {/* Strengths & Improvements */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="glass-card p-5">
                <h4 className="font-display font-semibold text-sm mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" /> Content Strengths
                </h4>
                <ul className="space-y-2">
                  {analysis.contentStrengths?.map((s, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="text-success font-bold mt-0.5">✓</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="glass-card p-5">
                <h4 className="font-display font-semibold text-sm mb-3 flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-warning" /> Areas for Improvement
                </h4>
                <ul className="space-y-2">
                  {analysis.improvementAreas?.map((a, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="text-warning font-bold mt-0.5">→</span> {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Detailed Feedback Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Thumbnail Section */}
              <div className="glass-card p-5 md:col-span-2 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-sm font-display font-semibold">
                    <Image className="h-4 w-4 text-primary" /> Thumbnail Optimization
                  </div>
                  {/* Reference Image Upload - next to heading */}
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return;
                        const reader = new FileReader();
                        reader.onloadend = () => setReferenceImage(String(reader.result));
                        reader.readAsDataURL(file);
                      }}
                      className="hidden"
                    />
                    {referenceImage ? (
                      <div className="flex items-center gap-2">
                        <img src={referenceImage} alt="Reference" className="h-8 rounded border border-primary/30 object-cover" />
                        <button
                          onClick={() => { setReferenceImage(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                          className="text-destructive hover:text-destructive/80"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="h-7 text-[10px] gap-1.5">
                        <Upload className="h-3 w-3" /> Upload Reference Image
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{analysis.thumbnailFeedback}</p>
                <p className="text-xs"><span className="font-semibold text-primary">Suggestion:</span> {analysis.thumbnailSuggestion}</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Current</p>
                    <img src={videoData.thumbnailUrl} alt="Current" className="w-full aspect-video rounded-lg border border-border/50 object-cover" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">AI Optimized</p>
                    {thumbLoading ? (
                      <div className="w-full aspect-video rounded-lg border border-primary/20 bg-primary/5 flex flex-col items-center justify-center gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="text-[10px] text-muted-foreground">Generating with text...</span>
                      </div>
                    ) : thumbUrl ? (
                      <img src={thumbUrl} alt="AI Optimized" className="w-full aspect-video rounded-lg border border-primary/30 object-cover" />
                    ) : (
                      <div className="w-full aspect-video rounded-lg border border-dashed border-border/50 bg-secondary/20 flex items-center justify-center text-[10px] text-muted-foreground">Click Generate below</div>
                    )}
                  </div>
                </div>

                {thumbError && <p className="text-[10px] text-destructive bg-destructive/10 rounded-md px-2 py-1.5">{thumbError}</p>}

                {/* Quality Validation Badge */}
                {thumbValidation && (
                  <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-[11px] ${
                    thumbValidation.passed
                      ? "bg-success/10 border border-success/20 text-success"
                      : "bg-warning/10 border border-warning/20 text-warning"
                  }`}>
                    {thumbValidation.passed ? (
                      <><CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Quality validated — composition, relevance, and clarity passed</>
                    ) : (
                      <><AlertCircle className="h-3.5 w-3.5 shrink-0" /> Auto-corrected: {thumbValidation.issues.slice(0, 2).join(", ")}</>
                    )}
                  </div>
                )}

                {/* Full-width Text Editor — only after thumbnail is generated */}
                {thumbUrl && (
                  <div className="border-t border-border/30 pt-3">
                    <ThumbnailTextEditor
                      imageUrl={thumbUrl}
                      videoId={videoData.id}
                      defaultText={overlayText || analysis.thumbnailSuggestion || ""}
                    />
                  </div>
                )}

                <div className="space-y-2.5 border-t border-border/30 pt-3">
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                      <Pencil className="h-3 w-3 inline mr-1" />Additional prompt (optional)
                    </label>
                    <Input value={regenPrompt} onChange={(e) => setRegenPrompt(e.target.value)} placeholder="e.g. Make it darker, add more contrast, warmer colors..." className="text-xs h-8 bg-background/50" />
                  </div>
                  <Button onClick={generateThumbnail} disabled={thumbLoading} className="w-full h-9 gap-2 text-xs">
                    {thumbLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : <><Wand2 className="h-4 w-4" /> {thumbUrl ? "Regenerate Thumbnail" : "Generate AI Thumbnail"}</>}
                  </Button>
                </div>
              </div>

              {/* Title Optimization */}
              <div className="glass-card p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-display font-semibold"><FileText className="h-4 w-4 text-primary" /> Title Optimization</div>
                <p className="text-xs text-muted-foreground">{analysis.titleFeedback}</p>
                <CopyBlock text={analysis.titleSuggestion} label="Optimized Title — Copy & Paste" compact />
                {analysis.titleAlternatives?.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Alternative Titles</p>
                    {analysis.titleAlternatives.map((alt, i) => (
                      <CopyBlock key={i} text={alt} compact />
                    ))}
                  </div>
                )}
              </div>

            {/* Description */}
              <div className="glass-card p-5 space-y-3 md:col-span-2">
                <div className="flex items-center gap-2 text-sm font-display font-semibold"><FileText className="h-4 w-4 text-primary" /> Description Optimization</div>
                <p className="text-xs text-muted-foreground">{analysis.descriptionFeedback}</p>
                <CopyBlock text={analysis.descriptionSuggestion} label="Full Optimized Description — Copy & Paste into YouTube Studio" />
                <p className="text-[9px] text-muted-foreground/60">💡 Replace bracketed placeholders with your actual links, handles, and timestamps before pasting.</p>
              </div>

              {/* SEO & Keywords */}
              <div className="glass-card p-5 space-y-3 md:col-span-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-display font-semibold"><Search className="h-4 w-4 text-primary" /> SEO & Keywords</div>
                  {analysis.seoScore > 0 && (
                    <Badge variant="outline" className={`text-xs ${
                      analysis.seoScore >= 70 ? "bg-success/20 text-success border-success/30" :
                      analysis.seoScore >= 40 ? "bg-warning/20 text-warning border-warning/30" :
                      "bg-destructive/20 text-destructive border-destructive/30"
                    }`}>
                      SEO Score: {analysis.seoScore}/100
                    </Badge>
                  )}
                </div>
                {analysis.seoKeywords?.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Target Keywords</p>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.seoKeywords.map((kw, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] cursor-pointer hover:bg-primary/20 transition-colors" onClick={() => navigator.clipboard.writeText(kw)}>{kw}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {analysis.tagsSuggestion && (
                  <CopyBlock text={analysis.tagsSuggestion} label="YouTube Tags — Copy & Paste into Studio" />
                )}
                {analysis.seoTips?.length > 0 && (
                  <ul className="space-y-1.5">
                    {analysis.seoTips.map((tip, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-2"><span className="text-primary font-bold mt-0.5">→</span>{tip}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Hashtags & Mentions */}
              <div className="glass-card p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-display font-semibold"><Hash className="h-4 w-4 text-primary" /> Hashtags & Mentions</div>
                <p className="text-xs text-muted-foreground">{analysis.hashtagFeedback}</p>
                {analysis.suggestedHashtags?.length > 0 && (
                  <CopyBlock text={analysis.suggestedHashtags.join(" ")} label="Hashtags — Copy & Paste" compact />
                )}
                {analysis.mentionsSuggestion && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><AtSign className="h-3 w-3 text-primary" /> {analysis.mentionsSuggestion}</p>
                )}
              </div>

              {/* Hook & CTA */}
              <div className="glass-card p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-display font-semibold"><PlayCircle className="h-4 w-4 text-primary" /> Hook & Call-to-Action</div>
                {analysis.hookSuggestion && (
                  <CopyBlock text={analysis.hookSuggestion} label="Opening Hook (First 5 Seconds)" compact />
                )}
                {analysis.ctaSuggestion && (
                  <CopyBlock text={analysis.ctaSuggestion} label="Call-to-Action Script" compact />
                )}
                {analysis.pinCommentSuggestion && (
                  <CopyBlock text={analysis.pinCommentSuggestion} label="Pinned Comment — Copy & Paste" />
                )}
              </div>

              {/* Posting Time */}
              <div className="glass-card p-5 space-y-2">
                <div className="flex items-center gap-2 text-sm font-display font-semibold"><Clock className="h-4 w-4 text-primary" /> Posting Time</div>
                <p className="text-xs text-muted-foreground">{analysis.postingTimeFeedback}</p>
                <p className="text-xs font-semibold text-primary">Recommended: {analysis.bestPostingTime}</p>
              </div>

              {/* Engagement */}
              <div className="glass-card p-5 space-y-2">
                <div className="flex items-center gap-2 text-sm font-display font-semibold"><TrendingUp className="h-4 w-4 text-primary" /> Engagement Analysis</div>
                <p className="text-xs text-muted-foreground">{analysis.engagementAnalysis}</p>
              </div>

              {/* Retention Tips */}
              <div className="glass-card p-5 space-y-2">
                <h4 className="font-display font-semibold text-sm">🎯 Retention Tips</h4>
                <ul className="space-y-1.5">
                  {analysis.retentionTips?.map((t, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2"><span className="text-primary font-bold mt-0.5">→</span>{t}</li>
                  ))}
                </ul>
              </div>

              {/* Viral Factors */}
              <div className="glass-card p-5 space-y-2">
                <h4 className="font-display font-semibold text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Viral Factors</h4>
                <ul className="space-y-1.5">
                  {analysis.viralFactors?.map((f, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2"><span className="text-primary font-bold mt-0.5">⚡</span>{f}</li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EpisodeAnalysis;
