import type { AuditResponse, VideoData, VideoFeedback } from "./types";

const videos: VideoData[] = [
  {
    id: "fixture-video-001",
    title: "Build a Sovereign Creative Workflow",
    description: "Deterministic premium-readiness fixture video.",
    publishedAt: "2026-09-01T08:00:00.000Z",
    thumbnailUrl: "https://example.invalid/fixture-001.jpg",
    tags: ["sovereign-ai", "workflow", "creator"],
    viewCount: 12_400,
    likeCount: 620,
    commentCount: 94,
    duration: "PT8M30S",
    categoryId: "27",
  },
  {
    id: "fixture-video-002",
    title: "Five Ways to Improve a Creator Pipeline",
    description: "Second deterministic premium-readiness fixture video.",
    publishedAt: "2026-09-08T08:00:00.000Z",
    thumbnailUrl: "https://example.invalid/fixture-002.jpg",
    tags: ["creator", "pipeline", "optimization"],
    viewCount: 7_800,
    likeCount: 351,
    commentCount: 52,
    duration: "PT6M10S",
    categoryId: "27",
  },
  {
    id: "fixture-video-003",
    title: "What We Learned From Local-First AI",
    description: "Boundary fixture with lower performance for comparison.",
    publishedAt: "2026-09-15T08:00:00.000Z",
    thumbnailUrl: "https://example.invalid/fixture-003.jpg",
    tags: ["local-ai", "lessons"],
    viewCount: 2_100,
    likeCount: 72,
    commentCount: 11,
    duration: "PT10M05S",
    categoryId: "27",
  },
];

function feedback(video: VideoData, rating: string): VideoFeedback {
  return {
    videoTitle: video.title,
    videoId: video.id,
    views: video.viewCount,
    likes: video.likeCount,
    comments: video.commentCount,
    publishedAt: video.publishedAt,
    performanceRating: rating,
    thumbnailFeedback:
      "Fixture-only feedback for deterministic staging validation.",
    thumbnailSuggestion:
      "Keep the subject clear and test one concise text variant.",
    titleFeedback:
      "Fixture-only title assessment using public fixture metrics.",
    titleSuggestion: `${video.title} — Practical Guide`,
    descriptionFeedback: "Fixture-only description assessment.",
    descriptionSuggestion:
      "Deterministic staging description with a clear summary and CTA.",
    hashtagFeedback:
      "Use a small relevant set and avoid fabricated trend claims.",
    suggestedHashtags: ["#CreatorWorkflow", "#SovereignAI", "#LocalFirst"],
    mentionsSuggestion:
      "No external creator mention is asserted in fixture mode.",
    postingTimeFeedback:
      "Fixture mode does not claim private audience timing data.",
    bestPostingTime: "Not asserted in deterministic fixture mode.",
  };
}

export function buildPremiumReadinessChannelAuditFixture(): AuditResponse {
  return {
    channelData: {
      id: "UC_RONSAS_FIXTURE_000001",
      name: "RONSAS Premium Readiness Fixture Channel",
      handle: "@ronsas-fixture",
      description:
        "Synthetic, deterministic channel data used only for zero-external-call premium-readiness tests.",
      avatar: "https://example.invalid/avatar.jpg",
      banner: "https://example.invalid/banner.jpg",
      subscribers: 24_000,
      totalViews: 1_250_000,
      videoCount: 96,
      joinedDate: "2024-01-01T00:00:00.000Z",
      country: "ZA",
      keywords: "creator workflow, sovereign AI, local-first tools",
    },
    videos: structuredClone(videos),
    audit: {
      channelSummary:
        "Deterministic staging fixture. No private analytics, external API data, or live AI output is used.",
      niche: "Creator workflow education",
      healthScore: 72,
      subscriberGrowth: "Not asserted in fixture mode",
      avgViews: "7.4K per video",
      medianViews: "7.8K per video",
      engagementRate: "5.4%",
      postingFrequency: "1.0 video/week",
      viewsSubRatio: "30.9%",
      likeViewRatio: "4.70%",
      commentViewRatio: "0.71%",
      auditMetrics: [
        {
          label: "Branding Consistency",
          score: 75,
          status: "good",
          detail:
            "Deterministic fixture score for UI and workflow validation only.",
          suggestions: [
            "Keep thumbnail composition consistent.",
            "Use one repeatable title pattern.",
          ],
          examples: ["Fixture example only"],
        },
        {
          label: "Title Optimization",
          score: 70,
          status: "good",
          detail:
            "Fixture score derived only from the checked-in staging dataset.",
          suggestions: [
            "Lead with the audience outcome.",
            "Keep the primary idea concise.",
          ],
          examples: [videos[0]!.title],
        },
        {
          label: "Posting Consistency",
          score: 60,
          status: "good",
          detail: "Fixture dates are exactly seven days apart.",
          suggestions: ["Maintain a repeatable publishing cadence."],
          examples: ["Three weekly fixture uploads"],
        },
      ],
      topVideos: [
        feedback(videos[0]!, "Excellent"),
        feedback(videos[1]!, "Good"),
      ],
      bottomVideos: [feedback(videos[2]!, "Below Average")],
      postingTimeAnalysis: {
        currentPattern: "Weekly fixture cadence",
        bestDays: [],
        bestTimes: [],
        worstTimes: [],
        reasoning: "Fixture mode does not infer private audience timing.",
        nicheSpecificTips:
          "Validate timing claims only when traceable public or authorized data exists.",
      },
      contentIdeas: [
        {
          title: "How to Validate a Local-First Creator Pipeline",
          hook: "Show the exact checkpoints before scaling.",
          type: "Tutorial",
          potential: "High",
          keywords: ["local-first", "creator workflow", "validation"],
        },
      ],
      trendTopics: [],
      competitors: [],
      collaborations: [],
      monetizationOpportunities: [],
      weeklySchedule: [],
      actionPlan: [
        {
          week: "Week 1",
          tasks: [
            "Validate public metrics",
            "Test title variants",
            "Review thumbnail consistency",
          ],
        },
      ],
      titleTemplates: [
        {
          title: "How to [Outcome] Without [Common Constraint]",
          desc: "Deterministic template for staging UI validation.",
        },
      ],
      thumbnailConcepts: [
        {
          style: "Single subject + concise text",
          desc: "Deterministic fixture concept; not a live CTR prediction.",
          ctr: "Not predicted in fixture mode",
        },
      ],
    },
  };
}
