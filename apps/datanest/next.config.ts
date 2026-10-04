import type { NextConfig } from "next";

const pages = process.env.DATANEST_STATIC_EXPORT === "true";
const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH;
const basePath = configuredBasePath !== undefined
  ? configuredBasePath
  : pages
    ? "/DataNest"
    : "";

const nextConfig: NextConfig = {
  output: pages ? "export" : "standalone",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: pages,
  poweredByHeader: false,
  reactStrictMode: true,
  images: { unoptimized: true }
};

export default nextConfig;
