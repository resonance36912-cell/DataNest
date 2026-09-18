import { useState, useCallback, useMemo, useRef } from "react";
import { m as motion, AnimatePresence } from "@/lib/lazy-motion";
import { CheckCircle2, AlertTriangle, XCircle, TrendingUp, TrendingDown, Users, Eye, Video, FileText, Clock, Hash, AtSign, Image, Type, ThumbsUp, MessageSquare, Star, ChevronDown, Lightbulb, Download, Loader2, Wand2, Pencil, BarChart3, RefreshCw, StarIcon, Upload, X, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { ChannelData, AuditResult, AuditMetric, VideoFeedback, VideoData } from "@/lib/types";
import HealthScore from "@/components/HealthScore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { editThumbnail } from "@/lib/edit-thumbnail.functions";
import { generateThumbnail as generateThumbnailFn } from "@/lib/generate-thumbnail.functions";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, AreaChart, Area } from "recharts";
import ThumbnailTextEditor from "@/components/ThumbnailTextEditor";
import SectionRating from "@/components/SectionRating";

/** Generate SEO tags from video title and niche */
const generateSeoTags = (title: string, niche: string): string[] => {
  const stopWords = new Set(["the", "a", "an", "is", "it", "to", "in", "for", "of", "and", "or", "on", "with", "my", "i", "you", "this", "that", "how", "why", "what", "do", "does", "did", "are", "was", "be", "been", "has", "have", "had", "will", "would", "can", "could", "should", "its", "but", "not", "from", "at", "by", "we", "they", "your", "our", "so", "if", "no", "all", "just", "get", "got", "here"]);
  const words = title.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));
  const nicheWords = niche.toLowerCase().replace(/[^a-z0-9\s&]/g, "").split(/[\s&]+/).filter((w) => w.length > 2 && !stopWords.has(w));
  const tags = new Set<string>();
  // Add 2-3 word combos from title
  for (let i = 0; i < words.length - 1 && tags.size < 5; i++) {
    tags.add(words.slice(i, i + 2).join(" "));
  }
  // Add individual strong words
  words.forEach((w) => { if (tags.size < 10) tags.add(w); });
  // Add niche words
  nicheWords.forEach((w) => { if (tags.size < 12) tags.add(w); });
  // Add common YouTube SEO suffixes
  if (tags.size < 14) tags.add("youtube");
  if (words.length > 0 && tags.size < 15) tags.add(`${words[0]} tutorial`);
  return Array.from(tags).slice(0, 12);
};

const statusIcon = {
  great: <CheckCircle2 className="h-5 w-5 text-success" />,
  good: <CheckCircle2 className="h-5 w-5 text-accent" />,
  "needs-work": <AlertTriangle className="h-5 w-5 text-warning" />,
  poor: <XCircle className="h-5 w-5 text-destructive" />,
};

const statusBg = {
  great: "border-success/20 bg-success/5",
  good: "border-accent/20 bg-accent/5",
  "needs-work": "border-warning/20 bg-warning/5",
  poor: "border-destructive/20 bg-destructive/5",
};

const ratingColor: Record<string, string> = {
  Excellent: "bg-success/20 text-success border-success/30",
  Good: "bg-accent/20 text-accent border-accent/30",
  Average: "bg-warning/20 text-warning border-warning/30",
  "Below Average": "bg-destructive/20 text-destructive border-destructive/30",
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

interface GeneratedThumbnail {
  imageUrl: string;
  styleLabel: string;
}

interface ThumbnailState {
  loading: boolean;
  thumbnail: GeneratedThumbnail | null;
  error: string | null;
}

interface NicheThumbnailState {
  loading: boolean;
  imageUrl: string | null;
  error: string | null;
}

const downloadImage = async (dataUrl: string, filename: string) => {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

interface AuditTabProps {
  channelData: ChannelData;
  audit: AuditResult;
  videos?: VideoData[];
}

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

// ── Star Rating ──
const ThumbnailRating = ({ rating, onRate }: { rating: number; onRate: (r: number) => void }) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((star) => (
      <button
        key={star}
        onClick={(e) => { e.stopPropagation(); onRate(star); }}
        className="p-0 transition-transform hover:scale-125"
        title={`Rate ${star}/5`}
      >
        <StarIcon
          className={`h-3.5 w-3.5 transition-colors ${
            star <= rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"
          }`}
        />
      </button>
    ))}
    {rating > 0 && <span className="text-[9px] text-muted-foreground ml-1">{rating}/5</span>}
  </div>
);

// ── Thumbnail Section ──
const ThumbnailSection = ({
  currentUrl, thumbState, nicheThumbState, overlayText, videoId,
  feedback, suggestion, canGenerate, niche, video,
  onGenerate, onGenerateNiche, onOverlayTextChange,
  aiRating, nicheRating, onAiRate, onNicheRate,
  regenPrompt, onRegenPromptChange,
  referenceImage, onReferenceImageChange,
  onUpdateAiImage, onUpdateNicheImage,
}: {
  currentUrl: string;
  thumbState: ThumbnailState;
  nicheThumbState: NicheThumbnailState;
  overlayText: string;
  videoId: string;
  feedback: string;
  suggestion: string;
  canGenerate: boolean;
  niche?: string;
  onGenerate: () => void;
  onGenerateNiche: () => void;
  onOverlayTextChange: (v: string) => void;
  aiRating: number;
  nicheRating: number;
  onAiRate: (r: number) => void;
  onNicheRate: (r: number) => void;
  regenPrompt: string;
  onRegenPromptChange: (v: string) => void;
  video?: VideoFeedback;
  referenceImage: string | null;
  onReferenceImageChange: (img: string | null) => void;
  onUpdateAiImage: (url: string) => void;
  onUpdateNicheImage: (url: string) => void;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingAi, setEditingAi] = useState(false);
  const [editingNiche, setEditingNiche] = useState(false);
  const [aiEditPrompt, setAiEditPrompt] = useState("");
  const [nicheEditPrompt, setNicheEditPrompt] = useState("");
  const [aiEditing, setAiEditing] = useState(false);
  const [nicheEditing, setNicheEditing] = useState(false);

  const handleEditImage = async (imageUrl: string, instruction: string, type: "ai" | "niche") => {
    const setEditing = type === "ai" ? setAiEditing : setNicheEditing;
    setEditing(true);
    try {
      const data = await editThumbnail({
        data: { imageUrl, editInstruction: instruction },
      });
      if (data?.imageUrl) {
        if (type === "ai") {
          onUpdateAiImage(data.imageUrl);
          setAiEditPrompt("");
          setEditingAi(false);
        } else {
          onUpdateNicheImage(data.imageUrl);
          setNicheEditPrompt("");
          setEditingNiche(false);
        }
      }
    } catch (e: any) {
      console.error("Edit failed:", e);
    } finally {
      setEditing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onloadend = () => onReferenceImageChange(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
  <div className="bg-secondary/30 rounded-lg p-4 space-y-3 md:col-span-2">
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-2 text-xs font-display font-semibold text-foreground">
        <Image className="h-3.5 w-3.5 text-primary" /> Thumbnail
      </div>
      {/* Reference Image Upload - next to heading */}
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
        {referenceImage ? (
          <div className="flex items-center gap-2">
            <img src={referenceImage} alt="Reference" className="h-8 rounded border border-primary/30 object-cover" />
            <button
              onClick={() => { onReferenceImageChange(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
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

    <p className="text-xs text-muted-foreground">{feedback}</p>
    <p className="text-xs"><span className="font-semibold text-primary">Suggestion:</span> {suggestion}</p>

    <div className="grid grid-cols-3 gap-3">
      {/* Current */}
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Current</p>
        {currentUrl ? (
          <img src={currentUrl} alt="Current thumbnail" className="w-full aspect-video rounded-lg border border-border/50 object-cover" loading="lazy" />
        ) : (
          <div className="w-full aspect-video rounded-lg border border-border/50 bg-secondary/40 flex items-center justify-center text-[10px] text-muted-foreground">Unavailable</div>
        )}
      </div>

      {/* AI Optimized */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">AI Optimized</p>
        {thumbState.loading ? (
          <div className="w-full aspect-video rounded-lg border border-primary/20 bg-primary/5 flex flex-col items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-[10px] text-muted-foreground">Generating...</span>
          </div>
        ) : thumbState.thumbnail ? (
          <>
           <div className="relative group">
            <img src={thumbState.thumbnail.imageUrl} alt="AI optimized" className="w-full aspect-video rounded-lg border border-primary/30 object-cover" />
            <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button size="sm" variant="secondary" className="h-6 w-6 p-0" onClick={() => setEditingAi(!editingAi)} title="Edit image">
                <Pencil className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="secondary" className="h-6 w-6 p-0" onClick={onGenerate} title="Regenerate">
                <RefreshCw className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="secondary" className="h-6 px-1.5 gap-1 text-[9px]" onClick={() => downloadImage(thumbState.thumbnail!.imageUrl, `thumbnail-${videoId}-optimized.png`)}>
                <Download className="h-3 w-3" />
              </Button>
            </div>
            <div className="absolute bottom-1 left-1 bg-background/80 rounded px-1.5 py-0.5">
              <ThumbnailRating rating={aiRating} onRate={onAiRate} />
            </div>
          </div>
          {editingAi && (
            <div className="flex gap-1.5 mt-1.5">
              <Input
                value={aiEditPrompt}
                onChange={(e) => setAiEditPrompt(e.target.value)}
                placeholder="e.g. Make background darker, add warm tones..."
                className="text-xs h-7 bg-background/50 flex-1"
                disabled={aiEditing}
                onKeyDown={(e) => { if (e.key === "Enter" && aiEditPrompt.trim()) handleEditImage(thumbState.thumbnail!.imageUrl, aiEditPrompt, "ai"); }}
              />
              <Button size="sm" className="h-7 px-2 text-[9px] gap-1" disabled={aiEditing || !aiEditPrompt.trim()} onClick={() => handleEditImage(thumbState.thumbnail!.imageUrl, aiEditPrompt, "ai")}>
                {aiEditing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} {aiEditing ? "Editing..." : "Apply"}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditingAi(false); setAiEditPrompt(""); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          </>
        ) : canGenerate ? (
          <button onClick={onGenerate} disabled={thumbState.loading} className="w-full aspect-video rounded-lg border border-dashed border-primary/30 bg-primary/5 flex flex-col items-center justify-center gap-1.5 text-[10px] text-primary hover:bg-primary/10 transition-colors cursor-pointer">
            <Wand2 className="h-4 w-4" /> Generate AI
          </button>
        ) : (
          <div className="w-full aspect-video rounded-lg border border-dashed border-border/50 bg-secondary/20 flex items-center justify-center text-[10px] text-muted-foreground">Not available</div>
        )}
        {canGenerate && (
          <div className="flex items-center gap-2">
            <p className="text-[9px] text-muted-foreground/70 flex-1 leading-snug">
              <Pencil className="h-2.5 w-2.5 inline mr-0.5 -mt-px" /> Hover over the thumbnail and tap the edit icon to refine text, expressions, colors, or any detail via a simple prompt.
            </p>
            <Button onClick={onGenerate} disabled={thumbState.loading || nicheThumbState.loading} className="h-8 gap-1.5 text-[10px] shrink-0">
              {thumbState.loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</> : <><Wand2 className="h-3.5 w-3.5" /> {thumbState.thumbnail ? "Regen AI" : "Generate AI"}</>}
            </Button>
          </div>
        )}
      </div>

      {/* Niche Optimized */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-accent uppercase tracking-wider mb-1">Niche Optimized</p>
        {nicheThumbState.loading ? (
          <div className="w-full aspect-video rounded-lg border border-accent/20 bg-accent/5 flex flex-col items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            <span className="text-[10px] text-muted-foreground">Generating...</span>
          </div>
        ) : nicheThumbState.imageUrl ? (
          <>
          <div className="relative group">
            <img src={nicheThumbState.imageUrl} alt="Niche optimized" className="w-full aspect-video rounded-lg border border-accent/30 object-cover" />
            <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button size="sm" variant="secondary" className="h-6 w-6 p-0" onClick={() => setEditingNiche(!editingNiche)} title="Edit image">
                <Pencil className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="secondary" className="h-6 w-6 p-0" onClick={onGenerateNiche} title="Regenerate">
                <RefreshCw className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="secondary" className="h-6 px-1.5 gap-1 text-[9px]" onClick={() => downloadImage(nicheThumbState.imageUrl!, `thumbnail-${videoId}-niche.png`)}>
                <Download className="h-3 w-3" />
              </Button>
            </div>
            <div className="absolute bottom-1 left-1 bg-background/80 rounded px-1.5 py-0.5">
              <ThumbnailRating rating={nicheRating} onRate={onNicheRate} />
            </div>
          </div>
          {editingNiche && (
            <div className="flex gap-1.5 mt-1.5">
              <Input
                value={nicheEditPrompt}
                onChange={(e) => setNicheEditPrompt(e.target.value)}
                placeholder="e.g. More vibrant colors, different composition..."
                className="text-xs h-7 bg-background/50 flex-1"
                disabled={nicheEditing}
                onKeyDown={(e) => { if (e.key === "Enter" && nicheEditPrompt.trim()) handleEditImage(nicheThumbState.imageUrl!, nicheEditPrompt, "niche"); }}
              />
              <Button size="sm" className="h-7 px-2 text-[9px] gap-1" disabled={nicheEditing || !nicheEditPrompt.trim()} onClick={() => handleEditImage(nicheThumbState.imageUrl!, nicheEditPrompt, "niche")}>
                {nicheEditing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} {nicheEditing ? "Editing..." : "Apply"}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditingNiche(false); setNicheEditPrompt(""); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          </>
        ) : canGenerate ? (
          <button onClick={onGenerateNiche} disabled={nicheThumbState.loading} className="w-full aspect-video rounded-lg border border-dashed border-accent/30 bg-accent/5 flex flex-col items-center justify-center gap-1.5 text-[10px] text-accent hover:bg-accent/10 transition-colors cursor-pointer">
            <Star className="h-4 w-4" /> Generate Niche
          </button>
        ) : (
          <div className="w-full aspect-video rounded-lg border border-dashed border-accent/20 bg-accent/5 flex items-center justify-center text-[10px] text-muted-foreground">Not available</div>
        )}
        {canGenerate && (
          <div className="flex items-center gap-2">
            <p className="text-[9px] text-muted-foreground/70 flex-1 leading-snug">
              <Pencil className="h-2.5 w-2.5 inline mr-0.5 -mt-px" /> Hover over the thumbnail and tap the edit icon to refine text, expressions, colors, or any detail via a simple prompt.
            </p>
            <Button onClick={onGenerateNiche} disabled={thumbState.loading || nicheThumbState.loading} variant="secondary" className="h-8 gap-1.5 text-[10px] border border-accent/30 shrink-0">
              {nicheThumbState.loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</> : <><Star className="h-3.5 w-3.5 text-accent" /> {nicheThumbState.imageUrl ? "Regen Niche" : "Generate Niche"}</>}
            </Button>
          </div>
        )}
      </div>
    </div>



    {thumbState.error && <p className="text-[10px] text-destructive bg-destructive/10 rounded-md px-2 py-1.5">{thumbState.error}</p>}
    {nicheThumbState.error && <p className="text-[10px] text-destructive bg-destructive/10 rounded-md px-2 py-1.5">Niche: {nicheThumbState.error}</p>}

    {canGenerate && (
      <div className="space-y-2.5 border-t border-border/30 pt-3">
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
            <Pencil className="h-3 w-3 inline mr-1" />Additional prompt (optional)
          </label>
          <Input value={regenPrompt} onChange={(e) => onRegenPromptChange(e.target.value)} placeholder="e.g. Make the background darker, add more contrast, use warmer colors..." className="text-xs h-8 bg-background/50" />
        </div>
        {(aiRating > 0 || nicheRating > 0) && (
          <p className="text-[9px] text-muted-foreground bg-secondary/40 rounded px-2 py-1.5">
            ⭐ Your ratings help improve future generations. Low ratings → try regenerating with different feedback.
          </p>
        )}
      </div>
    )}
  </div>
  );
};

// ── Video Feedback Card ──
const VideoFeedbackCard = ({
  video, index, isTop7, niche, sourceVideos, itemKey,
}: {
  video: VideoFeedback;
  index: number;
  isTop7: boolean;
  niche: string;
  sourceVideos?: VideoData[];
  itemKey: string;
}) => {
  const [thumbState, setThumbState] = useState<ThumbnailState>({ loading: false, thumbnail: null, error: null });
  const [nicheThumbState, setNicheThumbState] = useState<NicheThumbnailState>({ loading: false, imageUrl: null, error: null });
  const [overlayText, setOverlayText] = useState(video.thumbnailSuggestion || "");
  const [aiRating, setAiRating] = useState(0);
  const [nicheRating, setNicheRating] = useState(0);
  const [regenPrompt, setRegenPrompt] = useState("");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);

  const normalizedAuditTitle = video.videoTitle?.trim().toLowerCase() || "";
  const sourceById = sourceVideos?.find((v) => v.id === video.videoId);
  const sourceByTitle =
    sourceVideos?.find((v) => v.title.trim().toLowerCase() === normalizedAuditTitle) ||
    sourceVideos?.find((v) => {
      const sourceTitle = v.title.trim().toLowerCase();
      if (!sourceTitle || !normalizedAuditTitle) return false;
      return sourceTitle.includes(normalizedAuditTitle) || normalizedAuditTitle.includes(sourceTitle);
    });
  const isValidYoutubeId = /^[A-Za-z0-9_-]{11}$/.test(video.videoId);
  const currentThumbnailUrl =
    sourceById?.thumbnailUrl ||
    sourceByTitle?.thumbnailUrl ||
    (isValidYoutubeId ? `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg` : "") ||
    sourceVideos?.[index]?.thumbnailUrl ||
    "";

  const topPerformingThumbnails = useMemo(() => {
    if (!sourceVideos?.length) return [];
    return [...sourceVideos].sort((a, b) => b.viewCount - a.viewCount).slice(0, 5).map((v) => v.thumbnailUrl).filter(Boolean);
  }, [sourceVideos]);

  const fetchThumbnailAsBase64 = async (url: string): Promise<string> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Could not fetch thumbnail.");
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const generateThumbnail = useCallback(async () => {
    setThumbState({ loading: true, thumbnail: null, error: null });
    try {
      if (!currentThumbnailUrl) throw new Error("No current thumbnail found for this video.");
      const originalThumbnail = await fetchThumbnailAsBase64(currentThumbnailUrl);
      const data = await generateThumbnailFn({
        data: { videoTitle: video.videoTitle, thumbnailFeedback: video.thumbnailFeedback, thumbnailSuggestion: video.thumbnailSuggestion || "", niche, originalThumbnail, userPrompt: regenPrompt || undefined, referenceImage: referenceImage || undefined, suggestText: true },
      });
      if (!data?.imageUrl) throw new Error("No thumbnail generated. Please try again.");
      if (data?.suggestedText) setOverlayText(data.suggestedText);
      setThumbState({ loading: false, thumbnail: { imageUrl: data.imageUrl, styleLabel: "AI Optimized" }, error: null });
    } catch (err: any) {
      setThumbState({ loading: false, thumbnail: null, error: err.message });
    }
  }, [video, niche, currentThumbnailUrl, regenPrompt, referenceImage]);

  const generateNicheThumbnail = useCallback(async () => {
    setNicheThumbState({ loading: true, imageUrl: null, error: null });
    try {
      if (!currentThumbnailUrl) throw new Error("No current thumbnail found.");
      const originalThumbnail = await fetchThumbnailAsBase64(currentThumbnailUrl);
      const topThumbBase64: string[] = [];
      for (const url of topPerformingThumbnails.slice(0, 3)) {
        try { topThumbBase64.push(await fetchThumbnailAsBase64(url)); } catch { /* skip */ }
      }
      const data = await generateThumbnailFn({
        data: { videoTitle: video.videoTitle, thumbnailFeedback: video.thumbnailFeedback, thumbnailSuggestion: video.thumbnailSuggestion || "", niche, originalThumbnail, nicheOptimized: true, topPerformingThumbnails: topThumbBase64, userPrompt: regenPrompt || undefined, referenceImage: referenceImage || undefined, suggestText: true },
      });
      if (!data?.imageUrl) throw new Error("No thumbnail generated. Please try again.");
      if (data?.suggestedText) setOverlayText(data.suggestedText);
      setNicheThumbState({ loading: false, imageUrl: data.imageUrl, error: null });
    } catch (err: any) {
      setNicheThumbState({ loading: false, imageUrl: null, error: err.message });
    }
  }, [video, niche, currentThumbnailUrl, topPerformingThumbnails, regenPrompt, referenceImage]);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * index }}>
      <AccordionItem value={itemKey} className="glass-card border rounded-xl overflow-hidden">
        <AccordionTrigger className="px-5 py-4 hover:no-underline">
          <div className="flex items-start gap-4 text-left w-full pr-4">
            <span className="font-display font-bold text-lg text-muted-foreground w-6 shrink-0">#{index + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="font-display font-semibold text-sm line-clamp-1">{video.videoTitle}</p>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{formatNumber(video.views)}</span>
                <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" />{formatNumber(video.likes)}</span>
                <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{formatNumber(video.comments)}</span>
              </div>
            </div>
            <Badge variant="outline" className={`shrink-0 text-xs ${ratingColor[video.performanceRating] || ""}`}>
              {video.performanceRating}
            </Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-5 pb-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <ThumbnailSection
              currentUrl={currentThumbnailUrl}
              thumbState={thumbState}
              nicheThumbState={nicheThumbState}
              overlayText={overlayText}
              videoId={video.videoId}
              feedback={video.thumbnailFeedback}
              suggestion={video.thumbnailSuggestion}
              canGenerate={isTop7}
              niche={niche}
              onGenerate={generateThumbnail}
              onGenerateNiche={generateNicheThumbnail}
              onOverlayTextChange={setOverlayText}
              aiRating={aiRating}
              nicheRating={nicheRating}
              onAiRate={setAiRating}
              onNicheRate={setNicheRating}
              regenPrompt={regenPrompt}
              onRegenPromptChange={setRegenPrompt}
              referenceImage={referenceImage}
              onReferenceImageChange={setReferenceImage}
              onUpdateAiImage={(url) => setThumbState(prev => ({ ...prev, thumbnail: prev.thumbnail ? { ...prev.thumbnail, imageUrl: url } : null }))}
              onUpdateNicheImage={(url) => setNicheThumbState(prev => ({ ...prev, imageUrl: url }))}
              video={video}
            />
            <FeedbackSection icon={Type} title="Title" feedback={video.titleFeedback} suggestion={video.titleSuggestion} />
            <FeedbackSection icon={FileText} title="Description" feedback={video.descriptionFeedback} suggestion={video.descriptionSuggestion} />
            <div className="bg-secondary/30 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-display font-semibold text-foreground"><Hash className="h-3.5 w-3.5 text-primary" /> Hashtags & Mentions</div>
              <p className="text-xs text-muted-foreground">{video.hashtagFeedback}</p>
              {video.suggestedHashtags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {video.suggestedHashtags.map((tag) => <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>)}
                </div>
              )}
              {video.mentionsSuggestion && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><AtSign className="h-3 w-3 text-primary" /> {video.mentionsSuggestion}</p>
              )}
              {/* Auto-generated SEO Tags */}
              <div className="mt-3 pt-3 border-t border-border/40">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Tag className="h-3 w-3 text-accent" />
                  <span className="text-[10px] font-display font-semibold text-accent">SEO Tags (auto-generated)</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {generateSeoTags(video.videoTitle, niche).map((tag) => (
                    <span key={tag} className="text-[10px] bg-accent/10 text-accent border border-accent/20 px-1.5 py-0.5 rounded">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="bg-secondary/30 rounded-lg p-4 space-y-2 md:col-span-2">
              <div className="flex items-center gap-2 text-xs font-display font-semibold text-foreground"><Clock className="h-3.5 w-3.5 text-primary" /> Posting Time</div>
              <p className="text-xs text-muted-foreground">{video.postingTimeFeedback}</p>
              <p className="text-xs font-semibold text-primary">Recommended: {video.bestPostingTime}</p>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </motion.div>
  );
};

const FeedbackSection = ({ icon: Icon, title, feedback, suggestion }: { icon: any; title: string; feedback: string; suggestion: string }) => (
  <div className="bg-secondary/30 rounded-lg p-4 space-y-2">
    <div className="flex items-center gap-2 text-xs font-display font-semibold text-foreground"><Icon className="h-3.5 w-3.5 text-primary" /> {title}</div>
    <p className="text-xs text-muted-foreground">{feedback}</p>
    <p className="text-xs"><span className="font-semibold text-primary">Suggestion:</span> {suggestion}</p>
  </div>
);

const MetricCard = ({ metric, index }: { metric: AuditMetric; index: number }) => {
  const [expanded, setExpanded] = useState(false);
  const isThumbnail = metric.label === "Thumbnail Quality";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * index }}
      className={`glass-card border cursor-pointer transition-all hover:shadow-lg ${statusBg[metric.status]}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {statusIcon[metric.status]}
            <span className="font-display font-semibold text-sm">{metric.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-lg">{metric.score}</span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
          </div>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5 mb-3">
          <motion.div className="h-full rounded-full gradient-primary" initial={{ width: 0 }} animate={{ width: `${metric.score}%` }} transition={{ duration: 0.8, delay: 0.1 * index }} />
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">{metric.detail}</p>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="px-5 pb-5 space-y-3 border-t border-border/50 pt-4">
              {metric.suggestions?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-display font-semibold flex items-center gap-1.5"><Lightbulb className="h-3.5 w-3.5 text-primary" /> Suggestions</p>
                  <ul className="space-y-1.5">
                    {metric.suggestions.map((s, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-2"><span className="text-primary font-bold mt-0.5">→</span><span>{s}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              {!!metric.examples && metric.examples.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-display font-semibold text-muted-foreground">Examples</p>
                  {metric.examples.map((ex, i) => <p key={i} className="text-xs text-muted-foreground bg-secondary/40 rounded-md p-2 italic">"{ex}"</p>)}
                </div>
              )}
              {isThumbnail && !!metric.thumbnailUrls && metric.thumbnailUrls.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-display font-semibold text-muted-foreground">Channel Thumbnails</p>
                  <div className="grid grid-cols-2 gap-2">
                    {metric.thumbnailUrls.map((url, i) => <img key={i} src={url} alt={`Thumbnail ${i + 1}`} className="w-full rounded-lg border border-border/50 object-cover aspect-video" loading="lazy" />)}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ── Strategy Definitions ──
const STRATEGIES = [
  { id: "posting_time", label: "Optimal Posting Time", boost: 0.08, description: "Post during peak audience hours (YouTube Creator Academy data)" },
  { id: "posting_day", label: "Best Day Scheduling", boost: 0.06, description: "Shift uploads to highest-engagement days for your niche" },
  { id: "thumbnail", label: "Thumbnail Optimization", boost: 0.22, description: "CTR uplift from high-contrast, face-forward thumbnails (vidIQ benchmark)" },
  { id: "title", label: "Title & Hook Rewrite", boost: 0.15, description: "Curiosity-driven titles boost CTR 10-20% (TubeBuddy research)" },
  { id: "description", label: "SEO Description", boost: 0.05, description: "Keyword-rich descriptions improve search discovery" },
  { id: "hashtags", label: "Hashtag Strategy", boost: 0.03, description: "3-5 niche hashtags for discoverability (diminishing returns beyond 5)" },
  { id: "consistency", label: "Consistent Schedule", boost: 0.12, description: "Regular posting trains the algorithm and audience (Creator Insider)" },
];

// ── Posting Time Charts ──
const PostingTimeCharts = ({ videos, postingTimeAnalysis }: { videos?: VideoData[]; postingTimeAnalysis: any }) => {
  const dayOrder = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const shortDay = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const [enabledStrategies, setEnabledStrategies] = useState<Set<string>>(new Set());

  const toggleStrategy = (id: string) => {
    setEnabledStrategies((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const totalBoost = useMemo(() => {
    let boost = 0;
    STRATEGIES.forEach((s) => {
      if (enabledStrategies.has(s.id)) boost += s.boost;
    });
    return boost;
  }, [enabledStrategies]);

  const videosPerWeekEstimate = useMemo(() => {
    if (!videos?.length || videos.length < 2) return 1;
    const dates = videos.map((v) => new Date(v.publishedAt).getTime()).sort((a, b) => b - a);
    const spanDays = ((dates[0] ?? 0) - (dates[dates.length - 1] ?? 0)) / (1000 * 60 * 60 * 24);
    return spanDays > 0 ? (videos.length / spanDays) * 7 : 1;
  }, [videos]);

  const { dayData, hourData } = useMemo(() => {
    if (!videos?.length) return { dayData: [], hourData: [] };
    const dayBuckets: Record<number, { views: number; count: number }> = {};
    const hourBuckets: Record<number, { views: number; count: number }> = {};
    for (let i = 0; i < 7; i++) dayBuckets[i] = { views: 0, count: 0 };
    for (let h = 0; h < 24; h++) hourBuckets[h] = { views: 0, count: 0 };
    videos.forEach((v) => {
      const d = new Date(v.publishedAt);
      const day = d.getUTCDay();
      const hour = d.getUTCHours();
      const db = dayBuckets[day];
      if (db) {
        db.views += v.viewCount;
        db.count += 1;
      }
      const hb = hourBuckets[hour];
      if (hb) {
        hb.views += v.viewCount;
        hb.count += 1;
      }
    });
    const bestDays = postingTimeAnalysis?.bestDays?.map((d: string) => d.toLowerCase()) || [];
    const bestTimesStr = postingTimeAnalysis?.bestTimes || [];

    const dayData = dayOrder.map((name, i) => {
      const b = dayBuckets[i] ?? { views: 0, count: 0 };
      const avg = b.count > 0 ? Math.round(b.views / b.count) : 0;
      const isBest = bestDays.some((bd: string) => name.toLowerCase().startsWith(bd.slice(0, 3).toLowerCase()));
      // Projected = baseline + strategy boosts; best days get extra from posting_day strategy
      let dayBoost = totalBoost;
      if (isBest && enabledStrategies.has("posting_day")) dayBoost += 0.08;
      const projected = Math.round(avg * (1 + dayBoost));
      return { day: shortDay[i], current: avg, projected, videos: b.count };
    });

    const hourData = Array.from({ length: 24 }, (_, h) => {
      const b = hourBuckets[h] ?? { views: 0, count: 0 };
      const avg = b.count > 0 ? Math.round(b.views / b.count) : 0;
      const label = h === 0 ? "12AM" : h < 12 ? `${h}AM` : h === 12 ? "12PM" : `${h - 12}PM`;
      // Best hours get extra boost from posting_time strategy
      const isPeakHour = bestTimesStr.some((t: string) => {
        const match = t.match(/(\d+)/);
        if (!match) return false;
        const peakH = parseInt(match[1] ?? "0");
        return Math.abs(h - peakH) <= 2 || Math.abs(h - (peakH + 12)) <= 2;
      });
      let hourBoost = totalBoost;
      if (isPeakHour && enabledStrategies.has("posting_time")) hourBoost += 0.08;
      const projected = Math.round(avg * (1 + hourBoost));
      return { hour: label, current: avg, projected, videos: b.count };
    });
    return { dayData, hourData };
  }, [videos, postingTimeAnalysis, totalBoost, enabledStrategies]);

  if (!dayData.length) return null;

  const formatViews = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toString();
  };

  const boostPercent = Math.round(totalBoost * 100);

  return (
    <div className="space-y-4">
      {/* Strategy Toggles */}
      <div className="bg-secondary/20 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-accent" />
            <h4 className="font-display font-semibold text-sm">Strategy Impact Simulator</h4>
          </div>
          {boostPercent > 0 && (
            <Badge className="bg-success/20 text-success border-success/30 text-xs gap-1">
              <TrendingUp className="h-3 w-3" /> +{boostPercent}% projected growth
            </Badge>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">Toggle strategies you plan to implement — projections update in real time based on your current views.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {STRATEGIES.map((s) => {
            const active = enabledStrategies.has(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggleStrategy(s.id)}
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all ${
                  active
                    ? "bg-primary/10 border-primary/30 shadow-[0_0_8px_-2px_hsl(var(--primary)/0.2)]"
                    : "bg-secondary/30 border-border/40 hover:border-border/60"
                }`}
              >
                <div className={`mt-0.5 w-4 h-4 rounded-sm border-2 flex items-center justify-center shrink-0 transition-colors ${
                  active ? "bg-primary border-primary" : "border-muted-foreground/30"
                }`}>
                  {active && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-[11px] font-semibold ${active ? "text-primary" : "text-foreground/80"}`}>{s.label}</span>
                    <span className="text-[9px] font-display font-bold text-success">+{Math.round(s.boost * 100)}%</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">{s.description}</p>
                </div>
              </button>
            );
          })}
        </div>
        {enabledStrategies.size === 0 && (
          <p className="text-[10px] text-muted-foreground/60 text-center py-1">Select strategies above to see projected impact on your views</p>
        )}

        {/* Total Projected Output */}
        {enabledStrategies.size > 0 && videos && videos.length > 0 && (() => {
          const totalCurrentViews = videos.reduce((s, v) => s + v.viewCount, 0);
          const avgCurrent = Math.round(totalCurrentViews / videos.length);
          const projectedAvg = Math.round(avgCurrent * (1 + totalBoost));
          const projectedTotalMonthly = Math.round(projectedAvg * videosPerWeekEstimate * 4.33);
          const currentTotalMonthly = Math.round(avgCurrent * videosPerWeekEstimate * 4.33);
          const gainMonthly = projectedTotalMonthly - currentTotalMonthly;
          return (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h4 className="font-display font-semibold text-sm">Total Projected Impact</h4>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-background/50 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Current Avg/Video</p>
                  <p className="font-display font-bold text-foreground">{formatViews(avgCurrent)}</p>
                </div>
                <div className="bg-background/50 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Projected Avg/Video</p>
                  <p className="font-display font-bold text-primary">{formatViews(projectedAvg)}</p>
                </div>
                <div className="bg-background/50 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Projected Monthly Views</p>
                  <p className="font-display font-bold text-accent">{formatViews(projectedTotalMonthly)}</p>
                </div>
                <div className="bg-success/10 border border-success/20 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Monthly View Gain</p>
                  <p className="font-display font-bold text-success">+{formatViews(gainMonthly)}</p>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground">Based on {enabledStrategies.size} active strategies (+{boostPercent}%) applied to your current {formatViews(avgCurrent)} avg views across ~{videosPerWeekEstimate.toFixed(1)} videos/week.</p>
            </div>
          );
        })()}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-secondary/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1"><BarChart3 className="h-4 w-4 text-primary" /><h4 className="font-display font-semibold text-sm">Avg Views by Day</h4></div>
          <p className="text-[10px] text-muted-foreground mb-3">
            Baseline (current) vs projected {boostPercent > 0 ? `(+${boostPercent}% from ${enabledStrategies.size} strategies)` : "(toggle strategies above)"}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dayData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tickFormatter={formatViews} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={45} />
              <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} formatter={(value: number, name: string) => [formatViews(value), name === "current" ? "Current Avg" : `Projected (+${boostPercent}%)`]} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="current" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Current Avg" />
              {enabledStrategies.size > 0 && <Bar dataKey="projected" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} opacity={0.7} name="Projected" />}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-secondary/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1"><Clock className="h-4 w-4 text-primary" /><h4 className="font-display font-semibold text-sm">Avg Views by Hour</h4></div>
          <p className="text-[10px] text-muted-foreground mb-3">
            {boostPercent > 0 ? `Peak windows boosted with ${enabledStrategies.size} active strategies` : "Select strategies to see projections"}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={hourData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} interval={2} />
              <YAxis tickFormatter={formatViews} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={45} />
              <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} formatter={(value: number, name: string) => [formatViews(value), name === "current" ? "Current Avg" : `Projected (+${boostPercent}%)`]} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Area type="monotone" dataKey="current" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} name="Current Avg" />
              {enabledStrategies.size > 0 && <Area type="monotone" dataKey="projected" stroke="hsl(var(--accent))" fill="hsl(var(--accent))" fillOpacity={0.1} strokeDasharray="5 5" name="Projected" />}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

// ── Main AuditTab ──
const AuditTab = ({ channelData, audit, videos }: AuditTabProps) => {
  const channelId = channelData.id;
  const normalizeTitle = (value: string) => value.trim().toLowerCase();

  // Compute channel-level averages for accurate per-video rating
  const channelAvgViews = (videos?.length ?? 0) > 0
    ? videos!.reduce((s, v) => s + v.viewCount, 0) / videos!.length
    : 0;
  const channelAvgEngagement = (videos?.length ?? 0) > 0
    ? videos!.reduce((s, v) => s + (v.viewCount > 0 ? (v.likeCount + v.commentCount) / v.viewCount : 0), 0) / videos!.length
    : 0;

  // Compute a data-driven performance rating for each video
  const computeRating = (v: VideoData): string => {
    if (channelAvgViews === 0) return "Good";
    const viewRatio = v.viewCount / channelAvgViews;
    const eng = v.viewCount > 0 ? (v.likeCount + v.commentCount) / v.viewCount : 0;
    const engRatio = channelAvgEngagement > 0 ? eng / channelAvgEngagement : 1;
    const composite = viewRatio * 0.6 + engRatio * 0.4;
    if (composite >= 1.5) return "Excellent";
    if (composite >= 0.8) return "Good";
    if (composite >= 0.4) return "Average";
    return "Below Average";
  };

  const topVideosToRender: VideoFeedback[] = (videos?.length ?? 0) > 0
    ? [...(videos || [])]
        .sort((a, b) => b.viewCount - a.viewCount)
        .slice(0, 10)
        .map((sourceVideo, index) => {
          const aiMatch =
            audit.topVideos?.find((v) => v.videoId === sourceVideo.id) ||
            audit.topVideos?.find((v) => normalizeTitle(v.videoTitle || "") === normalizeTitle(sourceVideo.title)) ||
            audit.topVideos?.[index];
          return {
            videoTitle: sourceVideo.title,
            videoId: sourceVideo.id,
            views: sourceVideo.viewCount,
            likes: sourceVideo.likeCount,
            comments: sourceVideo.commentCount,
            publishedAt: sourceVideo.publishedAt,
            performanceRating: computeRating(sourceVideo),
            thumbnailFeedback: aiMatch?.thumbnailFeedback || "Current thumbnail can be strengthened with clearer focal point and higher contrast.",
            thumbnailSuggestion: aiMatch?.thumbnailSuggestion || `Use 3-5 bold words with a strong emotional hook for "${sourceVideo.title.slice(0, 45)}".`,
            titleFeedback: aiMatch?.titleFeedback || "Title can be improved with clearer outcome and curiosity hook.",
            titleSuggestion: aiMatch?.titleSuggestion || sourceVideo.title,
            descriptionFeedback: aiMatch?.descriptionFeedback || "Description should start with keywords, then key points, links, and CTA.",
            descriptionSuggestion: aiMatch?.descriptionSuggestion || "Add a keyword-first opening line, timestamps, relevant links, and a clear CTA.",
            hashtagFeedback: aiMatch?.hashtagFeedback || "Use 3-5 niche hashtags and avoid generic/redundant tags.",
            suggestedHashtags: aiMatch?.suggestedHashtags?.length ? aiMatch.suggestedHashtags : [`#${audit.niche?.replace(/\s+/g, "").toLowerCase() || "content"}`, "#youtube", "#growth"],
            mentionsSuggestion: aiMatch?.mentionsSuggestion || "@relevantcreator @nichepage",
            postingTimeFeedback: aiMatch?.postingTimeFeedback || "Posting schedule can be optimized around audience peak activity.",
            bestPostingTime: aiMatch?.bestPostingTime || "Tue-Thu, 6-9 PM (local audience time)",
          };
        })
    : (audit.topVideos || []).slice(0, 10);

  const bottomVideosToRender: VideoFeedback[] = (videos?.length ?? 0) > 10
    ? [...(videos || [])]
        .sort((a, b) => a.viewCount - b.viewCount)
        .slice(0, 10)
        .map((sourceVideo, index) => {
          const aiMatch =
            audit.bottomVideos?.find((v) => v.videoId === sourceVideo.id) ||
            audit.bottomVideos?.find((v) => normalizeTitle(v.videoTitle || "") === normalizeTitle(sourceVideo.title)) ||
            audit.bottomVideos?.[index];
          return {
            videoTitle: sourceVideo.title,
            videoId: sourceVideo.id,
            views: sourceVideo.viewCount,
            likes: sourceVideo.likeCount,
            comments: sourceVideo.commentCount,
            publishedAt: sourceVideo.publishedAt,
            performanceRating: computeRating(sourceVideo),
            thumbnailFeedback: aiMatch?.thumbnailFeedback || "This video underperformed. Consider a more eye-catching thumbnail with bold colors, clear text, and an emotional hook.",
            thumbnailSuggestion: aiMatch?.thumbnailSuggestion || `Create a high-contrast thumbnail with 3-5 bold words for "${sourceVideo.title.slice(0, 40)}".`,
            titleFeedback: aiMatch?.titleFeedback || "The title may lack curiosity hooks or emotional triggers that drive clicks.",
            titleSuggestion: aiMatch?.titleSuggestion || `Reframe with a stronger hook: add numbers, questions, or emotional words to "${sourceVideo.title.slice(0, 40)}".`,
            descriptionFeedback: aiMatch?.descriptionFeedback || "Description optimization could help this video get discovered through search.",
            descriptionSuggestion: aiMatch?.descriptionSuggestion || "Add keyword-rich opening, timestamps, relevant links, and a clear CTA.",
            hashtagFeedback: aiMatch?.hashtagFeedback || "Review hashtag strategy — use niche-specific tags to improve discoverability.",
            suggestedHashtags: aiMatch?.suggestedHashtags?.length ? aiMatch.suggestedHashtags : [`#${audit.niche?.replace(/\s+/g, "").toLowerCase() || "content"}`, "#youtube", "#growth", "#strategy", "#creator"],
            mentionsSuggestion: aiMatch?.mentionsSuggestion || "@relevantcreator @nichepage",
            postingTimeFeedback: aiMatch?.postingTimeFeedback || "Consider whether this was posted during peak audience hours.",
            bestPostingTime: aiMatch?.bestPostingTime || "Tue-Thu, 6-9 PM (local audience time)",
          };
        })
    : [];

  return (
    <div className="space-y-8">
      {/* Channel Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-lg">Channel Overview</h3>
            <SectionRating sectionName="Channel Overview" compact />
          </div>
          <div className="flex items-start gap-6">
            {channelData.avatar ? (
              <img src={channelData.avatar} alt={channelData.name} className="w-20 h-20 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-20 h-20 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-display font-bold text-2xl flex-shrink-0">{channelData.name.slice(0, 2)}</div>
            )}
            <div className="flex-1 space-y-3">
              <div>
                <h4 className="font-display font-bold text-xl">{channelData.name}</h4>
                <p className="text-muted-foreground">{channelData.handle} · {audit.niche}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { icon: Users, label: "Subscribers", value: formatNumber(channelData.subscribers) },
                  { icon: Eye, label: "Total Views", value: formatNumber(channelData.totalViews) },
                  { icon: Video, label: "Videos", value: channelData.videoCount.toString() },
                  { icon: BarChart3, label: "Engagement Rate", value: audit.engagementRate },
                ].map((stat) => (
                  <div key={stat.label} className="bg-secondary/50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1"><stat.icon className="h-3.5 w-3.5" />{stat.label}</div>
                    <p className="font-display font-semibold text-foreground">{stat.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <div className="bg-secondary/50 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1"><TrendingUp className="h-3.5 w-3.5" />Growth</div>
                  <p className="font-display font-semibold text-foreground">{audit.subscriberGrowth}</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6 flex items-center justify-center">
          <HealthScore score={audit.healthScore} />
        </motion.div>
      </div>

      {/* Channel Summary */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /><h3 className="font-display font-semibold text-lg">Channel Content Summary</h3></div>
          <SectionRating sectionName="Channel Summary" compact />
        </div>
        <p className="text-muted-foreground leading-relaxed">{audit.channelSummary}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
          {[
            { label: "Avg Views", value: audit.avgViews },
            { label: "Median Views", value: audit.medianViews || "N/A" },
            { label: "Engagement", value: audit.engagementRate },
            { label: "Like/View", value: audit.likeViewRatio || "N/A" },
            { label: "Posting Freq", value: audit.postingFrequency },
            { label: "Views/Sub", value: audit.viewsSubRatio || "N/A" },
          ].map((item) => (
            <div key={item.label} className="bg-secondary/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
              <p className="font-display font-semibold text-sm text-foreground">{item.value}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Posting Time Analysis */}
      {audit.postingTimeAnalysis && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-6 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" /><h3 className="font-display font-semibold text-lg">Optimal Posting Times</h3></div>
            <SectionRating sectionName="Posting Times" compact />
          </div>
          <p className="text-muted-foreground text-sm">{audit.postingTimeAnalysis.currentPattern}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-success/5 border border-success/20 rounded-lg p-4">
              <p className="text-xs font-display font-semibold text-success mb-2">Best Days</p>
              <div className="flex flex-wrap gap-1.5">{audit.postingTimeAnalysis.bestDays?.map((d: string) => <Badge key={d} className="bg-success/20 text-success border-success/30 text-xs">{d}</Badge>)}</div>
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <p className="text-xs font-display font-semibold text-primary mb-2">Best Times</p>
              <div className="flex flex-wrap gap-1.5">{audit.postingTimeAnalysis.bestTimes?.map((t: string) => <Badge key={t} className="bg-primary/20 text-primary border-primary/30 text-xs">{t}</Badge>)}</div>
            </div>
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
              <p className="text-xs font-display font-semibold text-destructive mb-2">Avoid</p>
              <div className="flex flex-wrap gap-1.5">{audit.postingTimeAnalysis.worstTimes?.map((t: string) => <Badge key={t} className="bg-destructive/20 text-destructive border-destructive/30 text-xs">{t}</Badge>)}</div>
            </div>
          </div>
          <PostingTimeCharts videos={videos} postingTimeAnalysis={audit.postingTimeAnalysis} />
          <div className="bg-secondary/30 rounded-lg p-4 space-y-2">
            <p className="text-xs text-muted-foreground">{audit.postingTimeAnalysis.reasoning}</p>
            <p className="text-xs font-semibold text-primary">{audit.postingTimeAnalysis.nicheSpecificTips}</p>
          </div>
        </motion.div>
      )}

      {/* Top Videos */}
      {topVideosToRender.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2"><Star className="h-5 w-5 text-primary" /><h3 className="font-display font-semibold text-lg">Top {topVideosToRender.length} Best Performing Videos</h3></div>
            <SectionRating sectionName="Top Videos" compact />
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            {topVideosToRender.map((video, i) => (
              <VideoFeedbackCard key={`${channelId}-${video.videoId || "no-id"}-${i}`} itemKey={`${channelId}-${video.videoId || "no-id"}-${i}`} video={video} index={i} isTop7={true} niche={audit.niche} sourceVideos={videos} />
            ))}
          </Accordion>
        </div>
      )}

      {/* Bottom 10 Videos */}
      {bottomVideosToRender.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4"><TrendingDown className="h-5 w-5 text-destructive" /><h3 className="font-display font-semibold text-lg">Bottom {bottomVideosToRender.length} Performing Videos</h3></div>
          <p className="text-muted-foreground text-sm mb-4">These videos have the lowest views. Apply suggestions and optimize thumbnails to improve performance.</p>
          <Accordion type="single" collapsible className="space-y-3">
            {bottomVideosToRender.map((video, i) => (
              <VideoFeedbackCard key={`${channelId}-bottom-${video.videoId || "no-id"}-${i}`} itemKey={`${channelId}-bottom-${video.videoId || "no-id"}-${i}`} video={video} index={i} isTop7={true} niche={audit.niche} sourceVideos={videos} />
            ))}
          </Accordion>
        </div>
      )}

      {/* Detailed Audit */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-lg">Detailed Audit</h3>
          <SectionRating sectionName="Detailed Audit" compact />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {audit.auditMetrics.map((metric, i) => <MetricCard key={metric.label} metric={metric} index={i} />)}
        </div>
      </div>
    </div>
  );
};

export default AuditTab;
