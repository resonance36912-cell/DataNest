import type { AuditResponse } from "./types";
import { ronsAiChat } from "./rons-ai.server";

export async function runChannelAudit(opts: {
  channelInput: string;
  youtubeApiKey: string;
}): Promise<AuditResponse> {
  const channelId = await resolveChannelId(opts.channelInput, opts.youtubeApiKey);
  if (!channelId) throw new Error("Could not find a YouTube channel for that input. Try a channel URL or @handle.");
  const channelData = await fetchChannelDetails(channelId, opts.youtubeApiKey);
  const videos = await fetchRecentVideos(channelId, opts.youtubeApiKey, 25);
  const metrics = computeChannelMetrics(channelData, videos);
  const sorted = [...videos].sort((a: any, b: any) => b.viewCount - a.viewCount);
  const top = sorted.slice(0, 5);
  const bottom = sorted.slice(-Math.min(5, Math.max(0, videos.length - 5)));
  const selected = [...top, ...bottom.filter((v: any) => !top.some((t: any) => t.id === v.id))];
  const transcripts: Record<string, string> = {};
  await Promise.all(selected.map(async (video: any) => {
    const text = await fetchVideoTranscript(video.id);
    if (text) transcripts[video.id] = text;
  }));
  const audit: any = await generateAIAudit(channelData, videos, metrics, transcripts);
  audit.engagementRate = metrics.engagementRate;
  audit.avgViews = metrics.avgViews;
  audit.medianViews = metrics.medianViews;
  audit.postingFrequency = metrics.postingFrequency;
  audit.healthScore = metrics.healthScore;
  audit.viewsSubRatio = metrics.viewsSubRatio;
  audit.likeViewRatio = metrics.likeViewRatio;
  audit.commentViewRatio = metrics.commentViewRatio;
  return { channelData, videos, audit } as AuditResponse;
}

// ── Real Metrics Computation (industry-standard formulas) ──
function computeChannelMetrics(channelData: any, videos: any[]) {
  const subs = channelData.subscribers || 1;

  const totalViews = videos.reduce((sum: number, v: any) => sum + v.viewCount, 0);
  const avgViewCount = videos.length > 0 ? Math.round(totalViews / videos.length) : 0;

  const sortedViews = videos.map((v: any) => v.viewCount).sort((a: number, b: number) => a - b);
  const medianViewCount = sortedViews.length > 0
    ? (sortedViews.length % 2 === 0
      ? Math.round((sortedViews[sortedViews.length / 2 - 1] + sortedViews[sortedViews.length / 2]) / 2)
      : sortedViews[Math.floor(sortedViews.length / 2)])
    : 0;

  const totalLikes = videos.reduce((sum: number, v: any) => sum + v.likeCount, 0);
  const totalComments = videos.reduce((sum: number, v: any) => sum + v.commentCount, 0);
  const engagementRateNum = totalViews > 0 ? (totalLikes + totalComments) / totalViews * 100 : 0;
  const engagementRate = engagementRateNum.toFixed(2) + "%";

  const viewsSubRatioNum = subs > 0 ? avgViewCount / subs * 100 : 0;
  const viewsSubRatio = subs > 0 ? viewsSubRatioNum.toFixed(1) + "%" : "N/A";

  let postingFrequency = "Unknown";
  let videosPerWeek = 0;
  if (videos.length >= 2) {
    const dates = videos.map((v: any) => new Date(v.publishedAt).getTime()).sort((a: number, b: number) => b - a);
    const newest = dates[0] ?? 0;
    const oldest = dates.at(-1) ?? newest;
    const spanDays = (newest - oldest) / (1000 * 60 * 60 * 24);
    if (spanDays > 0) {
      videosPerWeek = (videos.length / spanDays) * 7;
      if (videosPerWeek >= 5) postingFrequency = `${videosPerWeek.toFixed(1)} videos/week (Daily)`;
      else if (videosPerWeek >= 2) postingFrequency = `${videosPerWeek.toFixed(1)} videos/week`;
      else if (videosPerWeek >= 1) postingFrequency = `${videosPerWeek.toFixed(1)} video/week`;
      else {
        const videosPerMonth = videosPerWeek * 4.33;
        postingFrequency = `~${Math.round(videosPerMonth)} videos/month`;
      }
    }
  }

  let avgViews: string;
  if (avgViewCount >= 1_000_000) avgViews = `${(avgViewCount / 1_000_000).toFixed(1)}M per video`;
  else if (avgViewCount >= 1_000) avgViews = `${(avgViewCount / 1_000).toFixed(1)}K per video`;
  else avgViews = `${avgViewCount} per video`;

  let medianViews: string;
  if (medianViewCount >= 1_000_000) medianViews = `${(medianViewCount / 1_000_000).toFixed(1)}M per video`;
  else if (medianViewCount >= 1_000) medianViews = `${(medianViewCount / 1_000).toFixed(1)}K per video`;
  else medianViews = `${medianViewCount} per video`;

  const likeViewRatioNum = totalViews > 0 ? totalLikes / totalViews * 100 : 0;
  const likeViewRatio = likeViewRatioNum.toFixed(2);

  const commentViewRatioNum = totalViews > 0 ? totalComments / totalViews * 100 : 0;
  const commentViewRatio = commentViewRatioNum.toFixed(3);

  const engScore = engagementRateNum >= 5 ? 100 : engagementRateNum >= 3 ? 75 : engagementRateNum >= 1 ? 50 : 25;
  const likeScore = likeViewRatioNum >= 4 ? 100 : likeViewRatioNum >= 2 ? 75 : likeViewRatioNum >= 1 ? 50 : 25;
  const viewSubScore = viewsSubRatioNum >= 30 ? 100 : viewsSubRatioNum >= 15 ? 75 : viewsSubRatioNum >= 5 ? 50 : 25;
  const postScore = videosPerWeek >= 3 ? 100 : videosPerWeek >= 2 ? 80 : videosPerWeek >= 1 ? 60 : 30;
  const commentScore = commentViewRatioNum >= 0.5 ? 100 : commentViewRatioNum >= 0.1 ? 70 : commentViewRatioNum >= 0.05 ? 40 : 20;

  const healthScore = Math.round(
    engScore * 0.30 +
    likeScore * 0.15 +
    viewSubScore * 0.20 +
    postScore * 0.20 +
    commentScore * 0.15
  );

  return {
    engagementRate,
    avgViews,
    avgViewCount,
    medianViews,
    medianViewCount,
    postingFrequency,
    viewsSubRatio,
    likeViewRatio: likeViewRatio + "%",
    commentViewRatio: commentViewRatio + "%",
    totalVideosAnalyzed: videos.length,
    healthScore,
    videosPerWeek,
  };
}

async function resolveChannelId(input: string, apiKey: string): Promise<string | null> {
  const trimmed = input.trim();
  if (/^UC[\w-]{22}$/.test(trimmed)) return trimmed;

  const handleMatch = trimmed.match(/@([\w.-]+)/);
  if (handleMatch) {
    const data = await ytApiFetch(`https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${handleMatch[1]}&key=${apiKey}`);
    if (data?.items?.length) return data.items[0].id;
  }

  const channelUrlMatch = trimmed.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  if (channelUrlMatch) return channelUrlMatch[1] ?? null;

  const handleUrlMatch = trimmed.match(/youtube\.com\/@([\w.-]+)/);
  if (handleUrlMatch) {
    const data = await ytApiFetch(`https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${handleUrlMatch[1]}&key=${apiKey}`);
    if (data?.items?.length) return data.items[0].id;
  }

  const customMatch = trimmed.match(/youtube\.com\/(?:c|user)\/([\w.-]+)/);
  if (customMatch) {
    const data = await ytApiFetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(customMatch[1] ?? "")}&maxResults=1&key=${apiKey}`);
    if (data?.items?.length) return data.items[0].snippet.channelId;
  }

  const videoMatch = trimmed.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([\w-]+)/);
  if (videoMatch) {
    const data = await ytApiFetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoMatch[1] ?? ""}&key=${apiKey}`);
    if (data?.items?.length) return data.items[0].snippet.channelId;
  }

  const data = await ytApiFetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(trimmed)}&maxResults=1&key=${apiKey}`);
  if (data?.items?.length) return data.items[0].snippet.channelId;

  return null;
}

async function ytApiFetch(url: string): Promise<any> {
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) {
    if (data.error.code === 403 && data.error.errors?.[0]?.reason === "quotaExceeded") {
      throw new Error("YouTube API quota exceeded. Please try again tomorrow or use a different API key.");
    }
    if (data.error.code === 400) {
      console.error("YouTube API bad request:", JSON.stringify(data.error));
      return { items: [] };
    }
    console.error("YouTube API error:", JSON.stringify(data.error));
  }
  return data;
}

async function fetchChannelDetails(channelId: string, apiKey: string) {
  const data = await ytApiFetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings,contentDetails&id=${channelId}&key=${apiKey}`
  );
  if (!data.items?.length) throw new Error("Channel not found");
  const ch = data.items[0];
  return {
    id: ch.id,
    name: ch.snippet.title,
    handle: ch.snippet.customUrl || "",
    description: ch.snippet.description,
    avatar: ch.snippet.thumbnails?.high?.url || ch.snippet.thumbnails?.default?.url || "",
    banner: ch.brandingSettings?.image?.bannerExternalUrl || "",
    subscribers: Number(ch.statistics.subscriberCount || 0),
    totalViews: Number(ch.statistics.viewCount || 0),
    videoCount: Number(ch.statistics.videoCount || 0),
    joinedDate: ch.snippet.publishedAt,
    country: ch.snippet.country || "Unknown",
    keywords: ch.brandingSettings?.channel?.keywords || "",
  };
}

async function fetchRecentVideos(channelId: string, apiKey: string, count: number) {
  const chData = await ytApiFetch(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`
  );
  const uploadsPlaylist = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylist) return [];

  const allVideoIds: string[] = [];
  let pageToken = "";
  const maxPages = Math.ceil(count / 50);

  for (let page = 0; page < maxPages; page++) {
    const plData = await ytApiFetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylist}&maxResults=${Math.min(50, count - allVideoIds.length)}&key=${apiKey}${pageToken ? `&pageToken=${pageToken}` : ""}`
    );
    const ids = (plData.items || []).map((i: any) => i.contentDetails.videoId);
    allVideoIds.push(...ids);
    if (!plData.nextPageToken || allVideoIds.length >= count) break;
    pageToken = plData.nextPageToken;
  }

  if (allVideoIds.length === 0) return [];

  const allVideos: any[] = [];
  for (let i = 0; i < allVideoIds.length; i += 50) {
    const batch = allVideoIds.slice(i, i + 50).join(",");
    const vData = await ytApiFetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${batch}&key=${apiKey}`
    );
    allVideos.push(...(vData.items || []));
  }

  return allVideos.map((v: any) => ({
    id: v.id,
    title: v.snippet.title,
    description: v.snippet.description,
    publishedAt: v.snippet.publishedAt,
    thumbnailUrl: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.default?.url || "",
    tags: v.snippet.tags || [],
    viewCount: Number(v.statistics.viewCount || 0),
    likeCount: Number(v.statistics.likeCount || 0),
    commentCount: Number(v.statistics.commentCount || 0),
    duration: v.contentDetails.duration,
    categoryId: v.snippet.categoryId,
  }));
}

async function fetchVideoTranscript(videoId: string): Promise<string | null> {
  const fetchWithTimeout = async (url: string, init: RequestInit = {}, ms = 6000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  };

  try {
    const pageRes = await fetchWithTimeout(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();

    const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (!captionMatch) return null;

    let captionTracks;
    try {
      captionTracks = JSON.parse(captionMatch[1] ?? "[]");
    } catch {
      return null;
    }

    if (!captionTracks?.length) return null;

    const englishTrack = captionTracks.find((t: any) => t.languageCode === "en" && t.kind !== "asr") ||
                         captionTracks.find((t: any) => t.languageCode === "en") ||
                         captionTracks[0];

    if (!englishTrack?.baseUrl) return null;

    const captionRes = await fetchWithTimeout(englishTrack.baseUrl, {}, 6000);
    if (!captionRes.ok) return null;
    const captionXml = await captionRes.text();

    const textParts: string[] = [];
    const regex = /<text[^>]*>([\s\S]*?)<\/text>/g;
    let match;
    while ((match = regex.exec(captionXml)) !== null) {
      let text = (match[1] ?? "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n/g, " ")
        .trim();
      if (text) textParts.push(text);
    }

    if (textParts.length === 0) return null;

    const fullTranscript = textParts.join(" ");
    return fullTranscript.length > 3000 ? fullTranscript.substring(0, 3000) + "..." : fullTranscript;
  } catch (e) {
    console.error(`Transcript error for ${videoId}:`, e);
    return null;
  }
}

async function generateAIAudit(channelData: any, videos: any[], metrics: any, transcripts: Record<string, string> = {}) {
  const sortedByViews = [...videos].sort((a: any, b: any) => b.viewCount - a.viewCount);
  const top10 = sortedByViews.slice(0, 10);
  const bottom10 = sortedByViews.slice(-Math.min(10, Math.max(0, videos.length - 10)));

  const mapVideoSummary = (v: any) => ({
    id: v.id,
    title: v.title,
    views: v.viewCount,
    likes: v.likeCount,
    comments: v.commentCount,
    tags: v.tags?.slice(0, 10),
    published: v.publishedAt,
    descriptionPreview: v.description?.substring(0, 200),
    duration: v.duration,
    transcript: transcripts[v.id] || null,
  });

  const top10Summaries = top10.map(mapVideoSummary);
  const bottom10Summaries = bottom10.map(mapVideoSummary);
  const allVideoSummaries = videos.map((v) => ({
    id: v.id,
    title: v.title,
    views: v.viewCount,
    likes: v.likeCount,
    comments: v.commentCount,
    published: v.publishedAt,
    duration: v.duration,
  }));

  const transcriptNote = Object.keys(transcripts).length > 0
    ? `\n\nVIDEO TRANSCRIPTS ARE PROVIDED. Use them to generate DEEPLY INFORMED suggestions:
- Description suggestions should reference actual video content, key topics discussed, and keywords from the transcript
- Title suggestions should reflect the actual content themes and hooks from the video
- SEO suggestions should leverage actual terms and phrases used in the video
- Thumbnail suggestions should reference key moments or visual concepts from the content
- Content ideas should build on gaps or topics briefly mentioned but not fully explored`
    : "";

  const prompt = `You are an elite YouTube channel growth strategist with expertise comparable to vidIQ, TubeBuddy, and Social Blade analysts.

Analyze this channel using INDUSTRY-STANDARD benchmarks and return a comprehensive audit as valid JSON.${transcriptNote}

CHANNEL DATA:
- Name: ${channelData.name}
- Handle: ${channelData.handle}
- Subscribers: ${channelData.subscribers}
- Total Views: ${channelData.totalViews}
- Videos Published: ${channelData.videoCount}
- Description: ${channelData.description?.substring(0, 500)}
- Keywords: ${channelData.keywords}
- Country: ${channelData.country}
- Joined: ${channelData.joinedDate}

COMPUTED METRICS (real data — use these as ground truth):
- Avg Views Per Video: ${metrics.avgViews}
- Engagement Rate (likes+comments/views): ${metrics.engagementRate}
- Views/Subscriber Ratio: ${metrics.viewsSubRatio}
- Like-to-View Ratio: ${metrics.likeViewRatio}
- Comment-to-View Ratio: ${metrics.commentViewRatio}
- Posting Frequency: ${metrics.postingFrequency}
- Videos Analyzed: ${metrics.totalVideosAnalyzed}

INDUSTRY BENCHMARKS TO SCORE AGAINST:
- Engagement Rate: >5% = Excellent, 3-5% = Good, 1-3% = Average, <1% = Poor
- Like-to-View Ratio: >4% = Excellent, 2-4% = Good, 1-2% = Average, <1% = Poor
- Views/Sub Ratio: >30% = Excellent, 15-30% = Good, 5-15% = Average, <5% = Poor
- Posting Frequency: 3-5/week = Optimal for growth, 1-2/week = Good, <1/week = Needs improvement
- CTR (estimated from title+thumbnail quality): >10% = Excellent, 5-10% = Good, 2-5% = Average, <2% = Poor

TOP 10 PERFORMING VIDEOS (with transcripts where available):
${JSON.stringify(top10Summaries, null, 1)}

BOTTOM 10 PERFORMING VIDEOS (with transcripts where available):
${JSON.stringify(bottom10Summaries, null, 1)}

ALL VIDEOS OVERVIEW (${videos.length} total):
${JSON.stringify(allVideoSummaries, null, 1)}

Return ONLY valid JSON with this exact structure (no markdown, no code blocks):
{
  "channelSummary": "A 2-3 sentence summary of what this channel is about, its content focus, and target audience.",
  "niche": "The channel's primary niche/category",
  "healthScore": <number 0-100 based on all metrics above>,
  "subscriberGrowth": "<estimated monthly growth rate with reasoning>",
  "avgViews": "${metrics.avgViews}",
  "engagementRate": "${metrics.engagementRate}",
  "postingFrequency": "${metrics.postingFrequency}",
  "auditMetrics": [
    {"label": "Branding Consistency", "score": <0-100>, "status": "<great|good|needs-work|poor>", "detail": "<specific observation>", "suggestions": ["<actionable suggestion 1>","<actionable suggestion 2>","<actionable suggestion 3>"], "examples": ["<specific example from the channel>"]},
    {"label": "Niche Alignment", "score": <0-100>, "status": "<great|good|needs-work|poor>", "detail": "<specific observation>", "suggestions": ["<suggestion 1>","<suggestion 2>","<suggestion 3>"], "examples": ["<example>"]},
    {"label": "Thumbnail Quality", "score": <0-100>, "status": "<great|good|needs-work|poor>", "detail": "<specific observation about thumbnail patterns, colors, text usage, faces — compare against top YouTube creators in this niche>", "suggestions": ["<specific thumbnail improvement 1>","<thumbnail improvement 2>","<thumbnail improvement 3>"], "examples": ["<best thumbnail from channel and why>","<worst thumbnail and why>"]},
    {"label": "Title Optimization", "score": <0-100>, "status": "<great|good|needs-work|poor>", "detail": "<specific observation — benchmark against proven title formulas (How-to, Listicle, Question, Controversy)>", "suggestions": ["<title improvement 1>","<title improvement 2>","<title improvement 3>"], "examples": ["<example good title>","<example that could be improved>"]},
    {"label": "Description SEO", "score": <0-100>, "status": "<great|good|needs-work|poor>", "detail": "<specific observation — check for keyword density, timestamps, links, CTAs, playlist links>", "suggestions": ["<description SEO tip 1>","<tip 2>","<tip 3>"], "examples": ["<example description structure>"]},
    {"label": "Hashtag Strategy", "score": <0-100>, "status": "<great|good|needs-work|poor>", "detail": "<specific observation — benchmark: 3-5 relevant hashtags per video is optimal>", "suggestions": ["<hashtag tip 1>","<tip 2>","<tip 3>"], "examples": ["<recommended hashtag set>"]},
    {"label": "Posting Consistency", "score": <0-100>, "status": "<great|good|needs-work|poor>", "detail": "<specific observation — based on actual posting frequency vs optimal for this niche>", "suggestions": ["<consistency tip 1>","<tip 2>","<tip 3>"], "examples": ["<posting pattern observation>"]},
    {"label": "Audience Targeting", "score": <0-100>, "status": "<great|good|needs-work|poor>", "detail": "<specific observation — analyze audience intent signals from titles, descriptions, comments>", "suggestions": ["<targeting tip 1>","<tip 2>","<tip 3>"], "examples": ["<audience insight>"]},
    {"label": "Monetization Readiness", "score": <0-100>, "status": "<great|good|needs-work|poor>", "detail": "<specific observation — check YPP eligibility (1K subs + 4K watch hours), sponsorship readiness, merch potential>", "suggestions": ["<monetization tip 1>","<tip 2>","<tip 3>"], "examples": ["<monetization opportunity>"]  }
  ],
  "topVideos": [
    {
      "videoTitle": "<exact title from data>",
      "videoId": "<video id>",
      "views": <number>,
      "likes": <number>,
      "comments": <number>,
      "publishedAt": "<date>",
      "performanceRating": "<Excellent|Good|Average|Below Average>",
      "thumbnailFeedback": "<specific feedback on thumbnail quality, colors, text, faces, composition — compare to top-performing thumbnails in this niche>",
      "thumbnailSuggestion": "<specific improvement suggestion based on what works for similar channels>",
      "titleFeedback": "<feedback on title effectiveness — check power words, numbers, curiosity gaps, length (50-60 chars optimal)>",
      "titleSuggestion": "<improved title suggestion using proven formulas>",
      "descriptionFeedback": "<based on transcript content, give specific SEO-optimized description feedback — reference actual topics, keywords, and key points from the video>",
      "descriptionSuggestion": "<write a complete, optimized description: keyword-rich opening (150 chars), key topics from transcript, timestamps, relevant links, CTA. Be specific to what was actually discussed in the video.>",
      "hashtagFeedback": "<feedback on hashtag usage — optimal is 3-5 relevant hashtags>",
      "suggestedHashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"],
      "mentionsSuggestion": "<suggested @mentions for reach>",
      "postingTimeFeedback": "<when this was posted and whether that was optimal for this niche's audience>",
      "bestPostingTime": "<recommended day and time based on niche audience behavior>"
    }
  ],
  "bottomVideos": [
    {
      "videoTitle": "<exact title from data>",
      "videoId": "<video id>",
      "views": <number>,
      "likes": <number>,
      "comments": <number>,
      "publishedAt": "<date>",
      "performanceRating": "<Below Average|Average>",
      "thumbnailFeedback": "<why this thumbnail failed — specific issues with composition, colors, text, faces. Compare to top performers on this channel.>",
      "thumbnailSuggestion": "<specific redesign suggestion that would dramatically improve CTR based on what works for top videos on this channel>",
      "titleFeedback": "<why this title underperformed — missing hooks, too generic, wrong format. Reference transcript to identify better angles.>",
      "titleSuggestion": "<rewritten title using proven formulas, leveraging actual content from transcript to find the best hook>",
      "descriptionFeedback": "<based on transcript, identify missed SEO opportunities — keywords not targeted, topics not highlighted>",
      "descriptionSuggestion": "<complete rewritten description leveraging transcript content: keyword-rich opening, key discussion points, timestamps for major topics, CTA>",
      "hashtagFeedback": "<what went wrong with discoverability>",
      "suggestedHashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"],
      "mentionsSuggestion": "<suggested @mentions for reach>",
      "postingTimeFeedback": "<was this posted at a bad time? Compare to best-performing upload times>",
      "bestPostingTime": "<optimal time this should have been posted>"
    }
  ],
  "postingTimeAnalysis": {
    "currentPattern": "<description of current posting pattern with actual data>",
    "bestDays": ["<day1>","<day2>","<day3>"],
    "bestTimes": ["<time1>","<time2>"],
    "worstTimes": ["<time1>"],
    "reasoning": "<evidence-based reasoning citing actual video performance data>",
    "nicheSpecificTips": "<tips specific to this channel's niche — cite industry research>"
  },
  "contentIdeas": [
    {"title": "<specific video idea based on gaps in their content, trending topics, AND topics briefly mentioned in transcripts but not fully explored>", "hook": "<opening hook that creates curiosity>", "type": "<Listicle|Tutorial|Challenge|Opinion|Review|Story|Comparison>", "potential": "<Very High|High|Medium>", "keywords": ["kw1","kw2","kw3"]}
  ],
  "trendTopics": [
    {"topic": "<trending topic relevant to this niche>", "growth": "<+XX%>", "relevance": "<Very High|High|Medium>", "timeframe": "<Trending now|Next 2 months|Evergreen|Seasonal>"}
  ],
  "competitors": [
    {"name": "<real channel name in same niche>", "subscribers": "<count>", "avgViews": "<count>", "strength": "<what they do well that this channel could learn from>", "opportunity": "<specific gap this channel can fill>"}
  ],
  "collaborations": [
    {"name": "<real creator name>", "subscribers": "<count>", "niche": "<their niche>", "contactType": "<Email|Twitter/X|Instagram>", "contact": "<public contact>", "compatibility": "<Very High|High|Medium>"}
  ],
  "monetizationOpportunities": [
    {"type": "<revenue stream>", "readiness": "<Ready|Eligible|Opportunity|Growing>", "estimatedRevenue": "<range based on CPM benchmarks for this niche>", "action": "<specific next step>"}
  ],
  "weeklySchedule": [
    {"day": "Monday", "type": "<content type or —>", "time": "<time or —>", "platform": "<platform or —>", "note": "<note>"}
  ],
  "actionPlan": [
    {"week": "Week 1", "tasks": ["task1","task2","task3"]},
    {"week": "Week 2", "tasks": ["task1","task2","task3"]},
    {"week": "Week 3", "tasks": ["task1","task2","task3"]},
    {"week": "Week 4", "tasks": ["task1","task2","task3"]}
  ],
  "titleTemplates": [
    {"title": "<proven title formula>", "desc": "<example applying it to this channel's content>"}
  ],
  "thumbnailConcepts": [
    {"style": "<style name — based on what works in this niche>", "desc": "<detailed description with color palette, composition, text placement>", "ctr": "<expected CTR range based on niche benchmarks>"}
  ]
}

CRITICAL INSTRUCTIONS:
- Provide feedback on the top 10 best performing AND bottom 10 worst performing videos (by views)
- USE THE TRANSCRIPTS to give deeply informed, content-specific suggestions for descriptions, titles, SEO, and thumbnails
- Description suggestions must reference ACTUAL topics, keywords, and key points from the video transcript — not generic advice
- Generate 5 content ideas (informed by transcript gaps), 5 trend topics, 3 competitors, 4 collaborations, 5 monetization opportunities
- Include a full 7-day schedule, 3 title templates, 3 thumbnail concepts, and posting time analysis
- EVERY recommendation must cite evidence from the actual data provided
- Use REAL industry benchmarks and CPM rates for this specific niche
- Competitor and collaboration names should be REAL channels (if you know them) or clearly realistic
- Health score must reflect the computed metrics against industry benchmarks above
- Ensure all video IDs match exactly from the data provided`;

  let audit: any = null;
  let lastRawText = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const rawText = await requestAIAudit(prompt, attempt);
    lastRawText = rawText;

    const parsed = tryParseAuditJson(rawText);
    if (parsed) {
      if (parsed.auditMetrics && parsed.topVideos && parsed.healthScore !== undefined) {
        audit = parsed;
        break;
      }
      console.error(`AI response missing required fields on attempt ${attempt}`);
    } else {
      console.error(`Invalid AI JSON on attempt ${attempt}:`, { preview: rawText.slice(0, 800) });
    }
  }

  if (!audit) {
    console.error("AI JSON parse failed after retries:", { preview: lastRawText.slice(0, 800) });
    throw new Error("AI returned invalid JSON. Please try again.");
  }

  if (audit.auditMetrics) {
    for (const metric of audit.auditMetrics) {
      metric.score = Math.max(0, Math.min(100, Number(metric.score) || 0));
      if (!["great", "good", "needs-work", "poor"].includes(metric.status)) {
        metric.status = metric.score >= 80 ? "great" : metric.score >= 60 ? "good" : metric.score >= 40 ? "needs-work" : "poor";
      }
      metric.suggestions = Array.isArray(metric.suggestions) ? metric.suggestions : [];
      metric.examples = Array.isArray(metric.examples) ? metric.examples : [];
    }
  }

  audit.healthScore = Math.max(0, Math.min(100, Number(audit.healthScore) || 50));

  if (audit.auditMetrics && videos.length > 0) {
    const thumbMetric = audit.auditMetrics.find((m: any) => m.label === "Thumbnail Quality");
    if (thumbMetric) {
      thumbMetric.thumbnailUrls = videos.slice(0, 6).map((v: any) => v.thumbnailUrl).filter(Boolean);
    }
  }

  return audit;
}

async function requestAIAudit(prompt: string, attempt: number): Promise<string> {
  const retry = attempt > 1
    ? [{ role: "system" as const, content: "Your previous output was invalid or truncated. Regenerate a COMPLETE valid JSON object. Keep string fields concise while preserving all required keys." }]
    : [];
  return ronsAiChat([
    {
      role: "system",
      content: "You are an elite YouTube growth strategist. You MUST respond with raw valid JSON only. Do NOT wrap it in markdown code blocks. Do NOT include text before or after the JSON. Every score must be based on real data and industry benchmarks.",
    },
    ...retry,
    { role: "user", content: prompt },
  ]);
}

function tryParseAuditJson(rawText: string): any | null {
  const candidates = buildJsonCandidates(rawText);
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch { /* continue */ }
  }
  return null;
}

function buildJsonCandidates(rawText: string): string[] {
  const normalized = String(rawText ?? "").trim();
  const withoutFences = normalized
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const candidates = new Set<string>();
  const push = (value?: string) => {
    if (!value) return;
    const trimmed = value.trim();
    if (trimmed) candidates.add(trimmed);
  };

  push(withoutFences);

  const firstBrace = withoutFences.indexOf("{");
  const lastBrace = withoutFences.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    push(withoutFences.slice(firstBrace, lastBrace + 1));
  }

  push(withoutFences.replace(/,\s*([}\]])/g, "$1"));

  if (firstBrace !== -1 && lastBrace === -1) {
    const openCurly = (withoutFences.match(/\{/g) || []).length;
    const closeCurly = (withoutFences.match(/\}/g) || []).length;
    const openSquare = (withoutFences.match(/\[/g) || []).length;
    const closeSquare = (withoutFences.match(/\]/g) || []).length;
    const repaired = `${withoutFences}${"]".repeat(Math.max(0, openSquare - closeSquare))}${"}".repeat(Math.max(0, openCurly - closeCurly))}`;
    push(repaired);
    push(repaired.replace(/,\s*([}\]])/g, "$1"));
  }

  return Array.from(candidates);
}
