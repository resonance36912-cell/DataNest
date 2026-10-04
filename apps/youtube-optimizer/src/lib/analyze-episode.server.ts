// Server-only logic for single-episode YouTube analysis.
// Uses the private RONS text-AI gateway on Ealiophin.
import { ronsAiChat } from "./rons-ai.server";

export function extractVideoId(input: string): string | null {
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

export interface EpisodeVideoData {
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
  categoryId: string;
  channelTitle: string;
}

export async function runEpisodeAnalysis(opts: {
  videoUrl: string;
  youtubeApiKey: string;
}): Promise<{ videoData: EpisodeVideoData; analysis: any }> {
  const { videoUrl, youtubeApiKey } = opts;

  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    throw new Error("Could not extract a valid YouTube video ID from that URL.");
  }

  // Fetch video details
  const vRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${youtubeApiKey}`,
  );
  const vData: any = await vRes.json();

  if (vData.error) {
    if (vData.error.code === 403 && vData.error.errors?.[0]?.reason === "quotaExceeded") {
      throw new Error("YouTube API quota exceeded. Please try again tomorrow.");
    }
    throw new Error(`YouTube API error: ${vData.error.message || "Unknown error"}`);
  }

  if (!vData.items?.length) {
    throw new Error("Video not found.");
  }

  const v = vData.items[0];
  const videoData: EpisodeVideoData = {
    id: v.id,
    title: v.snippet.title,
    description: v.snippet.description,
    publishedAt: v.snippet.publishedAt,
    thumbnailUrl:
      v.snippet.thumbnails?.maxres?.url ||
      v.snippet.thumbnails?.high?.url ||
      v.snippet.thumbnails?.default?.url ||
      "",
    tags: v.snippet.tags || [],
    viewCount: Number(v.statistics.viewCount || 0),
    likeCount: Number(v.statistics.likeCount || 0),
    commentCount: Number(v.statistics.commentCount || 0),
    duration: v.contentDetails.duration,
    categoryId: v.snippet.categoryId,
    channelTitle: v.snippet.channelTitle,
  };

  // Compute real engagement metrics
  const engagementRate =
    videoData.viewCount > 0
      ? (((videoData.likeCount + videoData.commentCount) / videoData.viewCount) * 100).toFixed(2)
      : "0";
  const likeViewRatio =
    videoData.viewCount > 0 ? ((videoData.likeCount / videoData.viewCount) * 100).toFixed(2) : "0";

  // Get channel info for context
  const chRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${v.snippet.channelId}&key=${youtubeApiKey}`,
  );
  const chData: any = await chRes.json();
  const channel = chData.items?.[0];
  const channelSubs = Number(channel?.statistics?.subscriberCount || 0);
  const viewsSubRatio =
    channelSubs > 0 ? ((videoData.viewCount / channelSubs) * 100).toFixed(1) : "N/A";

  const prompt = `You are an elite YouTube content strategist. Analyze this single video using INDUSTRY-STANDARD benchmarks and return a comprehensive analysis as valid JSON.

VIDEO DATA:
- Title: ${videoData.title}
- Channel: ${videoData.channelTitle}
- Views: ${videoData.viewCount}
- Likes: ${videoData.likeCount}
- Comments: ${videoData.commentCount}
- Published: ${videoData.publishedAt}
- Duration: ${videoData.duration}
- Tags: ${videoData.tags.slice(0, 15).join(", ")}
- Description (first 500 chars): ${videoData.description?.substring(0, 500)}
${channel ? `- Channel Subscribers: ${channel.statistics?.subscriberCount || "N/A"}` : ""}

COMPUTED METRICS (real data):
- Engagement Rate: ${engagementRate}%
- Like-to-View Ratio: ${likeViewRatio}%
- Views/Sub Ratio: ${viewsSubRatio}%

INDUSTRY BENCHMARKS:
- Engagement Rate: >5% = Excellent, 3-5% = Good, 1-3% = Average, <1% = Poor
- Like-to-View Ratio: >4% = Excellent, 2-4% = Good, 1-2% = Average, <1% = Poor
- Views/Sub Ratio: >30% = Excellent, 15-30% = Good, 5-15% = Average, <5% = Poor

Return ONLY valid JSON with ALL fields populated. For every "suggestion" field, provide COMPLETE, READY-TO-USE content the user can copy and paste directly into YouTube Studio — not vague advice.

{
  "performanceRating": "<Excellent|Good|Average|Below Average>",
  "overallScore": <0-100>,
  "summary": "<2-3 sentence analysis with specific metrics cited>",
  "thumbnailFeedback": "<specific feedback — compare against top creators in this niche>",
  "thumbnailSuggestion": "<specific improvement with color/composition/text recommendations>",
  "titleFeedback": "<feedback — check power words, numbers, curiosity gaps, length (50-60 chars optimal)>",
  "titleSuggestion": "<a COMPLETE optimized title ready to copy-paste, 50-60 chars, using proven formula>",
  "titleAlternatives": ["<alternative title 1>", "<alternative title 2>", "<alternative title 3>"],
  "descriptionFeedback": "<2-3 sentences analyzing the current description weaknesses: keyword density, missing CTAs, poor first-line hook, missing timestamps, etc.>",
  "descriptionSuggestion": "<A COMPLETE 300-600 word YouTube description ready to copy-paste. Structure it EXACTLY like this format with line breaks between sections:\\n\\nLine 1: Compelling keyword-rich hook (appears in search results).\\nLines 2-3: What the viewer will learn.\\n\\n🔑 Key Takeaways:\\n• Takeaway 1\\n• Takeaway 2\\n• Takeaway 3\\n• Takeaway 4\\n• Takeaway 5\\n\\n⏱️ Timestamps:\\n0:00 - Intro\\n[Fill realistic timestamps based on video duration and content]\\n\\n🔗 Resources & Links:\\n► [Relevant resource suggestions]\\n► Subscribe: [channel link placeholder]\\n\\n📱 Connect:\\n► Instagram: @[handle]\\n► Twitter/X: @[handle]\\n\\n💬 Like, comment & subscribe for more [niche] content! Hit the 🔔 bell!\\n\\n#hashtag1 #hashtag2 #hashtag3 #hashtag4 #hashtag5\\n\\nUse real topics from the video for timestamps. Make it keyword-rich and engaging.>",
  "seoKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6", "keyword7", "keyword8", "keyword9", "keyword10"],
  "seoScore": <0-100>,
  "seoTips": ["<specific SEO tip 1>", "<specific SEO tip 2>", "<specific SEO tip 3>"],
  "tagsSuggestion": "<COMPLETE comma-separated YouTube tags string ready to paste, 15-30 tags, mix of broad and long-tail keywords>",
  "hashtagFeedback": "<feedback — optimal is 3-5 relevant hashtags>",
  "suggestedHashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"],
  "mentionsSuggestion": "<suggested @mentions for reach>",
  "postingTimeFeedback": "<when this was posted and optimization based on niche>",
  "bestPostingTime": "<recommended day and time>",
  "engagementAnalysis": "<analysis citing real metrics: ${engagementRate}% engagement, ${likeViewRatio}% like rate, ${viewsSubRatio}% view/sub ratio>",
  "retentionTips": ["<tip 1>","<tip 2>","<tip 3>"],
  "viralPotential": "<Low|Medium|High|Very High>",
  "viralFactors": ["<factor 1>","<factor 2>","<factor 3>"],
  "contentStrengths": ["<strength 1>","<strength 2>","<strength 3>"],
  "improvementAreas": ["<area 1>","<area 2>","<area 3>"],
  "ctaSuggestion": "<a specific call-to-action sentence the creator should say at the end of the video>",
  "hookSuggestion": "<a specific opening hook sentence (first 5 seconds) to maximize retention>",
  "pinCommentSuggestion": "<a ready-to-paste pinned comment that drives engagement — include CTA, question, and relevant links placeholder>"
}

Score must reflect the computed metrics against industry benchmarks. Be specific and evidence-based. All suggestions must be COMPLETE and COPY-PASTE READY.`;

  let analysis: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let raw = await ronsAiChat([
      {
        role: "system",
        content: "You are an elite YouTube growth strategist. Respond with raw valid JSON only. No markdown code blocks. Every score must be based on real data and industry benchmarks.",
      },
      ...(attempt > 1
        ? [{ role: "system" as const, content: "Your previous output was invalid. Return COMPLETE valid JSON." }]
        : []),
      { role: "user", content: prompt },
    ]);
    raw = String(raw ?? "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    try {
      analysis = JSON.parse(raw);
      break;
    } catch {
      const firstBrace = raw.indexOf("{");
      const lastBrace = raw.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          analysis = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
          break;
        } catch {
          /* continue */
        }
      }
      if (attempt === 3) throw new Error("AI returned invalid JSON. Please try again.");
    }
  }

  // Validate and sanitize
  analysis.overallScore = Math.max(0, Math.min(100, Number(analysis.overallScore) || 50));
  analysis.seoScore = Math.max(0, Math.min(100, Number(analysis.seoScore) || 0));
  analysis.suggestedHashtags = Array.isArray(analysis.suggestedHashtags) ? analysis.suggestedHashtags : [];
  analysis.retentionTips = Array.isArray(analysis.retentionTips) ? analysis.retentionTips : [];
  analysis.viralFactors = Array.isArray(analysis.viralFactors) ? analysis.viralFactors : [];
  analysis.contentStrengths = Array.isArray(analysis.contentStrengths) ? analysis.contentStrengths : [];
  analysis.improvementAreas = Array.isArray(analysis.improvementAreas) ? analysis.improvementAreas : [];
  analysis.titleAlternatives = Array.isArray(analysis.titleAlternatives) ? analysis.titleAlternatives : [];
  analysis.seoKeywords = Array.isArray(analysis.seoKeywords) ? analysis.seoKeywords : [];
  analysis.seoTips = Array.isArray(analysis.seoTips) ? analysis.seoTips : [];
  analysis.tagsSuggestion = analysis.tagsSuggestion || "";
  analysis.ctaSuggestion = analysis.ctaSuggestion || "";
  analysis.hookSuggestion = analysis.hookSuggestion || "";
  analysis.pinCommentSuggestion = analysis.pinCommentSuggestion || "";

  return { videoData, analysis };
}
