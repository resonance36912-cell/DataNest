export type ResonanceAppFamily = "career" | "create" | "grow" | "professional";
export type ResonanceAppRole = "primary" | "module" | "acquisition" | "service";

export type ResonanceAppDefinition = {
  slug: string;
  catalogId: string;
  name: string;
  aliases: readonly string[];
  family: ResonanceAppFamily;
  role: ResonanceAppRole;
  parentSlug?: string;
  launchKind: "datanest-pages" | "external-ssr";
  href?: string;
  functions: readonly string[];
};

export const RESONANCE_APP_REGISTRY: readonly ResonanceAppDefinition[] = [
  {slug:"career-compass",catalogId:"ronsas-career-compass",name:"Resonance Career Compass",aliases:["Career Compass"],family:"career",role:"primary",launchKind:"datanest-pages",functions:["career-discovery","career-assessment","career-guidance","action-planning","subscription-entry"]},
  {slug:"creative-studio",catalogId:"ronsas-creative-studio",name:"Resonance Creator Studio",aliases:["Creative Studio","RONSAS Creator Studio"],family:"create",role:"primary",launchKind:"datanest-pages",functions:["creative-workspace","project-management","creative-generation","asset-management","preview","export","entitlement"]},
  {slug:"lyricsync-studio",catalogId:"ronsas-lyricsync-studio",name:"Resonance Lyrics & Sync",aliases:["LyricSync Studio","Lyric Sync Studio","Lyrics & Sync"],family:"create",role:"module",parentSlug:"creative-studio",launchKind:"datanest-pages",functions:["lyrics-authoring","timing","synchronization","preview","export"]},
  {slug:"syncvision",catalogId:"ronsas-syncvision",name:"Resonance Media Sync",aliases:["Sync Vision","SyncVision","Media Sync"],family:"create",role:"module",parentSlug:"creative-studio",launchKind:"datanest-pages",functions:["media-synchronization","timeline-preview","media-export"]},
  {slug:"epublisher",catalogId:"ronsas-epublisher",name:"Resonance Publish",aliases:["ePublisher","Epublisher","e Publisher","Publish"],family:"create",role:"module",parentSlug:"creative-studio",launchKind:"datanest-pages",functions:["publishing","metadata-packaging","distribution-preparation","export"]},
  {slug:"scene-song-spark",catalogId:"ronsas-scene-song-spark",name:"SongSpark",aliases:["Scene Song Spark","SceneSongSpark"],family:"grow",role:"acquisition",launchKind:"datanest-pages",functions:["creative-spark","discovery","lead-capture","creator-studio-routing"]},
  {slug:"youtube-optimizer",catalogId:"ronsas-youtube-optimizer",name:"Resonance Creator Growth",aliases:["YouTube Optimizer","YouTubeOptimizer","Creator Growth"],family:"grow",role:"module",parentSlug:"creative-studio",launchKind:"external-ssr",href:"https://youtubeoptimizer.life",functions:["channel-audit","content-insights","optimization","thumbnail-analysis","scheduling","growth-guidance"]},
  {slug:"sovereign-forge",catalogId:"ronsas-sovereign-forge",name:"Sovereign Forge",aliases:["SovereignForge"],family:"professional",role:"primary",launchKind:"datanest-pages",functions:["professional-intake","engineering-scoping","delivery","evidence","client-readiness"]},
  {slug:"assurance-services",catalogId:"datanest-assurance",name:"Resonance AppDev Assurance Services",aliases:["Assurance Services","DataNest Assurance"],family:"professional",role:"service",launchKind:"datanest-pages",functions:["readiness","assurance","evidence-review","audit-support","release-readiness"]}
];

const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
const lookup = new Map<string, ResonanceAppDefinition>();
for (const app of RESONANCE_APP_REGISTRY) for (const candidate of [app.name, ...app.aliases]) lookup.set(normalize(candidate), app);

export const getResonanceApp = (value?: string | null) => value ? lookup.get(normalize(value)) ?? null : null;
export const getResonanceAppLaunch = (value?: string | null) => {
  const app = getResonanceApp(value);
  if (!app) return null;
  if (app.launchKind === "external-ssr") return {...app, href: app.href!};
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");
  return {...app, href: `${basePath}/apps/${app.slug}/`};
};
