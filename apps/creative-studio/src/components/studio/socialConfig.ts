// Extracted so Studio.tsx can import the default config without pulling in
// the full SocialMediaEditor component tree. Enables lazy-loading SocialTab.

export interface SocialMediaConfig {
  platforms: string[];
  handle: string;
  hashtags: string[];
  mentions: string[];
  postType: "post" | "reel" | "story" | "carousel";
  caption: string;
}

export const DEFAULT_SOCIAL_CONFIG: SocialMediaConfig = {
  platforms: ["instagram"],
  handle: "",
  hashtags: [],
  mentions: [],
  postType: "post",
  caption: "",
};
