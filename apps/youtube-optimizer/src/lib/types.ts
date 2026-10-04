export interface ChannelData {
  id: string;
  name: string;
  handle: string;
  description: string;
  avatar: string;
  banner: string;
  subscribers: number;
  totalViews: number;
  videoCount: number;
  joinedDate: string;
  country: string;
  keywords: string;
}

export interface VideoData {
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
}

export interface AuditMetric {
  label: string;
  score: number;
  status: "great" | "good" | "needs-work" | "poor";
  detail: string;
  suggestions: string[];
  examples?: string[];
  thumbnailUrls?: string[];
}

export interface ContentIdea {
  title: string;
  hook: string;
  type: string;
  potential: string;
  keywords: string[];
}

export interface TrendTopic {
  topic: string;
  growth: string;
  relevance: string;
  timeframe: string;
}

export interface Competitor {
  name: string;
  subscribers: string;
  avgViews: string;
  strength: string;
  opportunity: string;
}

export interface Collaboration {
  name: string;
  subscribers: string;
  niche: string;
  contactType: string;
  contact: string;
  compatibility: string;
}

export interface MonetizationOpportunity {
  type: string;
  readiness: string;
  estimatedRevenue: string;
  action: string;
}

export interface ScheduleDay {
  day: string;
  type: string;
  time: string;
  platform: string;
  note: string;
}

export interface ActionWeek {
  week: string;
  tasks: string[];
}

export interface TitleTemplate {
  title: string;
  desc: string;
}

export interface ThumbnailConcept {
  style: string;
  desc: string;
  ctr: string;
}

export interface VideoFeedback {
  videoTitle: string;
  videoId: string;
  views: number;
  likes: number;
  comments: number;
  publishedAt: string;
  performanceRating: string;
  thumbnailFeedback: string;
  thumbnailSuggestion: string;
  titleFeedback: string;
  titleSuggestion: string;
  descriptionFeedback: string;
  descriptionSuggestion: string;
  hashtagFeedback: string;
  suggestedHashtags: string[];
  mentionsSuggestion: string;
  postingTimeFeedback: string;
  bestPostingTime: string;
}

export interface PostingTimeAnalysis {
  currentPattern: string;
  bestDays: string[];
  bestTimes: string[];
  worstTimes: string[];
  reasoning: string;
  nicheSpecificTips: string;
}

export interface AuditResult {
  channelSummary: string;
  niche: string;
  healthScore: number;
  subscriberGrowth: string;
  avgViews: string;
  medianViews?: string;
  engagementRate: string;
  postingFrequency: string;
  viewsSubRatio?: string;
  likeViewRatio?: string;
  commentViewRatio?: string;
  auditMetrics: AuditMetric[];
  topVideos: VideoFeedback[];
  bottomVideos?: VideoFeedback[];
  postingTimeAnalysis: PostingTimeAnalysis;
  contentIdeas: ContentIdea[];
  trendTopics: TrendTopic[];
  competitors: Competitor[];
  collaborations: Collaboration[];
  monetizationOpportunities: MonetizationOpportunity[];
  weeklySchedule: ScheduleDay[];
  actionPlan: ActionWeek[];
  titleTemplates: TitleTemplate[];
  thumbnailConcepts: ThumbnailConcept[];
}

export interface AuditResponse {
  channelData: ChannelData;
  videos: VideoData[];
  audit: AuditResult;
}
