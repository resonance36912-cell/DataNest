export const dynamic = "force-static";

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/DataNest/"
    },
    sitemap: "https://datanest-supository.github.io/DataNest/sitemap.xml"
  };
}
