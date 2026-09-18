import { createFileRoute } from "@tanstack/react-router";
import Login from "@/pages/Login";

export const Route = createFileRoute("/login")({
  component: Login,
  // Auth surface: keep it out of the index but let crawlers follow its links.
  head: () => ({
    meta: [
      { title: "Sign in – Resonance YouTube Optimizer" },
      {
        name: "description",
        content:
          "Sign in to Resonance YouTube Optimizer to run channel audits, generate content ideas and track growth.",
      },
      { name: "robots", content: "noindex, follow" },
      { property: "og:title", content: "Sign in – Resonance YouTube Optimizer" },
      { property: "og:url", content: "https://youtubeoptimizer.life/login" },
      // Root no longer emits og:image (leaf routes own it), so this auth route
      // declares the brand lockup itself for shared sign-in links.
      { property: "og:image", content: "https://youtubeoptimizer.life/og-image.png" },
      { property: "og:image:secure_url", content: "https://youtubeoptimizer.life/og-image.png" },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "Resonance YouTube Optimizer — Tools in tune with you",
      },
      { name: "twitter:image", content: "https://youtubeoptimizer.life/og-image.png" },
      {
        name: "twitter:image:alt",
        content: "Resonance YouTube Optimizer — Tools in tune with you",
      },
    ],
    links: [{ rel: "canonical", href: "https://youtubeoptimizer.life/login" }],
  }),
});
