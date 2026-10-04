export const dynamic = "force-static";

import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://datanest-supository.github.io/DataNest";
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/assurance/`, changeFrequency: "weekly", priority: 0.95 },
    { url: `${base}/transparency/`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/system-charter/`, changeFrequency: "monthly", priority: 0.85 },
    { url: `${base}/governance/`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/privacy/`, changeFrequency: "monthly", priority: 0.7 }
  ];
}
