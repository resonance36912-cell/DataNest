import {
  Inter,
  Inter_Tight,
  Instrument_Serif,
  JetBrains_Mono
} from "next/font/google";
import ThemeBootstrapScript from "@/components/platform/ThemeBootstrapScript";
import CinematicRuntime from "@/components/platform/CinematicRuntime";
import "./resonance-design-system.css";
import "./globals.css";
import "./external-auditor.css";
import "./entry.css";
import "./datanest-ai-optimized.css";
import "./datanest-ai-command-center.css";
import "./datanest-ai-zoom.css";
import "./datanext-next.css";
import "./cinematic-workspaces.css";
import "./supository-ux.css";
import type { ReactNode } from "react";

const interTight=Inter_Tight({
  subsets:["latin"],
  variable:"--font-inter-tight",
  display:"swap"
});

const inter=Inter({
  subsets:["latin"],
  variable:"--font-inter",
  display:"swap"
});

const instrumentSerif=Instrument_Serif({
  subsets:["latin"],
  weight:"400",
  style:"italic",
  variable:"--font-instrument-serif",
  display:"swap"
});

const jetBrainsMono=JetBrains_Mono({
  subsets:["latin"],
  variable:"--font-jetbrains-mono",
  display:"swap"
});

// Keep focused DataNest AI refinements last so UX overrides remain authoritative.
export const metadata = {
  metadataBase: new URL("https://datanest-supository.github.io"),
  applicationName: "DataNest",
  title: {
    default: "DataNest · Resonance AppDev Control Plane",
    template: "%s · DataNest"
  },
  description: "Governed Resonance AppDev planning, AI collaboration, execution, evidence, transparency, product governance and market-intelligence platform.",
  keywords: [
    "DataNest",
    "Resonance AppDev",
    "AI governance",
    "software delivery",
    "product operations",
    "project orchestration",
    "transparent AI",
    "route to market"
  ],
  alternates: {
    canonical: "https://datanest-supository.github.io/DataNest/"
  },
  openGraph: {
    type: "website",
    url: "https://datanest-supository.github.io/DataNest/",
    siteName: "DataNest",
    title: "DataNest · Resonance AppDev Control Plane",
    description: "Governed AppDev, AI collaboration, evidence, transparency and product/market intelligence."
  },
  twitter: {
    card: "summary",
    title: "DataNest · Resonance AppDev Control Plane",
    description: "Governed AppDev, AI collaboration, evidence, transparency and product/market intelligence."
  },
  robots: {
    index: true,
    follow: true
  },
  manifest: "/DataNest/site.webmanifest"
};

export default function RootLayout({children}:{children:ReactNode}) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const forceHttpsSource=basePath + "/force-https.js";
  const runtimeConfigSource=basePath + "/runtime-config.js";
  const fontVariables=[
    interTight.variable,
    inter.variable,
    instrumentSerif.variable,
    jetBrainsMono.variable
  ].join(" ");

  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeBootstrapScript />
        <script src={forceHttpsSource} />
        <script src={runtimeConfigSource} />
      </head>
      <body>
        <CinematicRuntime/>
        {children}
      </body>
    </html>
  );
}
