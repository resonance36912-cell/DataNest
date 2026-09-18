export const demoChannel = {
  name: "TechVision Pro",
  handle: "@techvisionpro",
  subscribers: "284K",
  totalViews: "18.2M",
  videos: 342,
  joinedDate: "Mar 2019",
  avatar: "",
  healthScore: 72,
  niche: "Technology Reviews & Tutorials",
  postingFrequency: "2.3 videos/week",
  avgViews: "53.2K",
  engagementRate: "6.8%",
  subscriberGrowth: "+4.2%/month",
};

export const auditMetrics = [
  { label: "Branding Consistency", score: 78, status: "good" as const, detail: "Logo and color scheme are consistent. Banner could be updated to reflect current content focus." },
  { label: "Niche Alignment", score: 85, status: "great" as const, detail: "Strong focus on tech reviews. Some off-topic vlogs may dilute algorithmic positioning." },
  { label: "Thumbnail Quality", score: 62, status: "needs-work" as const, detail: "Inconsistent thumbnail style. Low contrast text. Missing emotional triggers on 40% of thumbnails." },
  { label: "Title Optimization", score: 70, status: "good" as const, detail: "Good keyword usage. Could benefit from more curiosity-driven hooks and power words." },
  { label: "Description SEO", score: 55, status: "needs-work" as const, detail: "Descriptions are too short. Missing timestamps, links, and keyword-rich summaries." },
  { label: "Hashtag Strategy", score: 45, status: "poor" as const, detail: "Inconsistent hashtag usage. Missing niche-specific tags. Over-reliance on generic tags." },
  { label: "Posting Consistency", score: 80, status: "great" as const, detail: "Regular uploads 2-3x/week. Minor gaps during holiday periods." },
  { label: "Audience Targeting", score: 73, status: "good" as const, detail: "Clear target demographic. Could improve content for returning vs new viewers." },
  { label: "Monetization Readiness", score: 68, status: "good" as const, detail: "Meets YPP requirements. Opportunities in sponsorships and affiliate marketing." },
];

export const contentIdeas = [
  { title: "Best Budget Laptops Under $500 — 2025 Edition", hook: "Open with a shocking price-to-performance comparison", type: "Listicle", potential: "High", keywords: ["budget laptops", "best laptops 2025", "cheap laptops"] },
  { title: "I Used AI to Edit My Videos for 30 Days — Here's What Happened", hook: "Show a dramatic before/after in the first 5 seconds", type: "Challenge", potential: "Very High", keywords: ["AI video editing", "AI tools", "content creation"] },
  { title: "Why Everyone Is Switching to This Phone", hook: "Start with a bold claim backed by sales data", type: "Opinion", potential: "High", keywords: ["best phone 2025", "phone review", "smartphone comparison"] },
  { title: "The Tech Setup That Makes You 10x More Productive", hook: "Show your messy desk vs optimized setup transformation", type: "Tutorial", potential: "Medium", keywords: ["desk setup", "productivity", "tech setup"] },
  { title: "5 Gadgets That Are Actually Worth the Hype", hook: "Start by debunking one overhyped gadget, then reveal the winners", type: "Listicle", potential: "High", keywords: ["best gadgets", "tech gadgets", "worth buying"] },
];

export const trendTopics = [
  { topic: "AI-Powered Creative Tools", growth: "+340%", relevance: "Very High", timeframe: "Trending now" },
  { topic: "Foldable Phone Comparisons", growth: "+180%", relevance: "High", timeframe: "Next 2 months" },
  { topic: "Smart Home 2025 Setups", growth: "+120%", relevance: "High", timeframe: "Evergreen" },
  { topic: "Budget vs Premium Tech", growth: "+95%", relevance: "Medium", timeframe: "Seasonal (Q4)" },
  { topic: "Sustainable Tech & E-Waste", growth: "+210%", relevance: "Medium", timeframe: "Growing" },
];

export const competitors = [
  { name: "TechZone", subscribers: "1.2M", avgViews: "230K", strength: "High production value", opportunity: "They don't cover budget options — fill that gap" },
  { name: "GadgetFlow", subscribers: "520K", avgViews: "89K", strength: "Great thumbnails", opportunity: "Slower upload schedule — outpace with consistency" },
  { name: "DigitalDive", subscribers: "190K", avgViews: "42K", strength: "Deep technical analysis", opportunity: "Similar size — collab potential for cross-audience growth" },
];

export const collaborations = [
  { name: "DigitalDive", subscribers: "190K", niche: "Tech Deep Dives", contactType: "Email", contact: "contact@digitaldive.com", compatibility: "Very High" },
  { name: "SetupWars", subscribers: "450K", niche: "Desk Setups", contactType: "Twitter/X", contact: "@setupwars", compatibility: "High" },
  { name: "CodeWithSara", subscribers: "320K", niche: "Developer Tools", contactType: "Email", contact: "collabs@codewithsara.dev", compatibility: "High" },
  { name: "MinimalTech", subscribers: "98K", niche: "Minimalist Tech", contactType: "Instagram", contact: "@minimaltech", compatibility: "Medium" },
];

export const monetizationOpportunities = [
  { type: "Sponsorships", readiness: "Ready", estimatedRevenue: "$2,000–$5,000/video", action: "Create a media kit. Reach out to tech brands with your engagement metrics." },
  { type: "Affiliate Marketing", readiness: "Ready", estimatedRevenue: "$800–$2,500/month", action: "Add Amazon affiliate links to all tech review descriptions. Create a 'recommended gear' page." },
  { type: "Channel Memberships", readiness: "Eligible", estimatedRevenue: "$500–$1,500/month", action: "Offer early access to reviews and exclusive behind-the-scenes content." },
  { type: "Digital Products", readiness: "Opportunity", estimatedRevenue: "$1,000–$4,000/month", action: "Create a 'Tech Buyer's Guide' PDF or online course on tech content creation." },
  { type: "Brand Deals", readiness: "Growing", estimatedRevenue: "$3,000–$10,000/deal", action: "Focus on reaching 300K subs to unlock higher-tier brand partnerships." },
];

export const weeklySchedule = [
  { day: "Monday", type: "Tutorial/How-To", time: "2:00 PM EST", platform: "YouTube", note: "High engagement day for educational content" },
  { day: "Tuesday", type: "Short-form Teaser", time: "11:00 AM EST", platform: "YouTube Shorts + TikTok", note: "Cross-promote upcoming review" },
  { day: "Wednesday", type: "—", time: "—", platform: "—", note: "Rest / Filming day" },
  { day: "Thursday", type: "Product Review", time: "3:00 PM EST", platform: "YouTube", note: "Peak traffic for tech reviews" },
  { day: "Friday", type: "Community Post", time: "10:00 AM EST", platform: "YouTube Community", note: "Poll or question to boost engagement" },
  { day: "Saturday", type: "Short-form Clip", time: "12:00 PM EST", platform: "YouTube Shorts + Instagram", note: "Weekend casual viewing peak" },
  { day: "Sunday", type: "—", time: "—", platform: "—", note: "Planning & batching next week" },
];

export const actionPlan = [
  { week: "Week 1", tasks: ["Audit and update all video descriptions with SEO keywords", "Create 3 new thumbnail templates with high-contrast text", "Set up consistent hashtag strategy (5 niche + 3 broad per video)"] },
  { week: "Week 2", tasks: ["Film and publish 2 trend-aligned videos", "Reach out to 3 potential collaborators", "Create a media kit for sponsorship outreach"] },
  { week: "Week 3", tasks: ["Launch channel membership with exclusive perks", "Add affiliate links to top 20 performing videos", "Create 5 YouTube Shorts from existing long-form content"] },
  { week: "Week 4", tasks: ["Analyze metrics from weeks 1–3 changes", "A/B test 2 thumbnail styles on new uploads", "Draft pitch emails for 5 brand sponsorships"] },
];
