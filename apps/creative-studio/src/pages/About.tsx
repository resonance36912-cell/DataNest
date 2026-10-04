import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Image, FileText, Video, Megaphone, Share2, Palette,
  Sparkles, Link as LinkIcon, PenLine, Eraser, Film, Type, Layers,
  Zap, Monitor, RefreshCw, Download, Globe,
} from "lucide-react";
import SEO from "@/components/SEO";
import { ResonanceFooter } from "@/components/brand/ResonanceFooter";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: "easeOut" as const },
  }),
};

const capabilities = [
  {
    category: "Content Types",
    items: [
      {
        icon: Image,
        title: "AI Poster Generation",
        description:
          "Generate two unique poster variants from any source material. The AI analyzes your brand, content, and style preferences to create eye-catching visual posters suitable for print or digital use. Each generation produces two distinct design directions so you can compare and choose.",
      },
      {
        icon: FileText,
        title: "Smart Brochures",
        description:
          "Create multi-page marketing brochures with intelligent layout, consistent typography, and brand-aligned color palettes. Ideal for product catalogs, service overviews, and informational materials that need professional formatting.",
      },
      {
        icon: Megaphone,
        title: "Advertisements",
        description:
          "Design digital and print-ready advertisements optimized for attention and conversion. The AI considers your target audience, call-to-action, and brand tone to produce compelling ad creatives across multiple formats.",
      },
      {
        icon: Video,
        title: "Promotional Videos",
        description:
          "Generate 10-second promotional videos with programmatic camera motion, cinematic effects (vignette, light sweeps, film grain, letterbox), and alternating camera modes including Dolly Orbit, Parallax Drift, and Ken Burns. Two video variants are created per generation.",
      },
      {
        icon: Share2,
        title: "Social Media Hub",
        description:
          "A dedicated social media workspace for cross-posting and sharing. Upload content or reuse designs from other tabs (posters, brochures, ads, videos). Select target platforms (Instagram, Facebook, X/Twitter, LinkedIn, YouTube), choose post type (Post, Reel, Story, Carousel), and add your handle. AI auto-generates relevant hashtags and @mentions based on your caption, uploaded files, and an optional reference URL that gets scraped for context. All tags are fully editable — delete any you don't want and manually add more. Copy the formatted caption or share directly to each platform with one click.",
      },
    ],
  },
  {
    category: "AI-Powered Workflows",
    items: [
      {
        icon: Globe,
        title: "URL Scraping & Analysis",
        description:
          "Paste any website URL and the system automatically scrapes the page content using Firecrawl, captures a screenshot, and sends the extracted markdown to an AI content analyzer. The result is a structured creative brief containing brand name, headline, subheadline, key points, target audience, call-to-action, color suggestions, and tone — all auto-populated into the studio.",
      },
      {
        icon: Sparkles,
        title: "Creative Brief Generation",
        description:
          "The AI analyzes your source content (URL, uploaded files, or manual text) and generates a comprehensive creative brief. This brief drives all subsequent design decisions including typography, color palette, layout, and messaging hierarchy.",
      },
      {
        icon: LinkIcon,
        title: "Multi-Source Input",
        description:
          "Combine multiple input sources in a single generation: upload images, videos, PDFs, DOCX, PPTX, spreadsheets, or plain text files alongside a URL and custom instructions. The AI synthesizes all inputs into cohesive visual output.",
      },
    ],
  },
  {
    category: "Design Customization",
    items: [
      {
        icon: Palette,
        title: "8 Curated Style Presets",
        description:
          "Choose from Professional, Cinematic, Playful, Scientific, Animated, Realistic, Minimalist, or Retro styles. Each preset influences the AI's design decisions around color grading, typography weight, layout density, and visual effects.",
      },
      {
        icon: Monitor,
        title: "5 Aspect Ratio Formats",
        description:
          "Export in 1:1 (Square), 16:9 (Landscape), 9:16 (Portrait/Stories), 4:5 (Instagram), or 21:9 (Cinematic Ultra-wide). Each format is optimized for its target platform's display requirements.",
      },
      {
        icon: PenLine,
        title: "AI-Powered Editing",
        description:
          "After generation, use natural language to edit any design. Type instructions like \"change the background to blue\", \"make the text larger\", or \"add a gradient overlay\" and the AI applies your changes to the current variant while preserving the overall composition.",
      },
      {
        icon: Eraser,
        title: "Object Removal",
        description:
          "Select any region of a generated design by drawing a bounding box, then describe what should be removed. The AI intelligently removes the selected object and reconstructs the background naturally — no Photoshop required.",
      },
    ],
  },
  {
    category: "Video Features",
    items: [
      {
        icon: Film,
        title: "Cinematic Mode (Kling 2.1)",
        description:
          "Transform any generated poster into a realistic cinematic video using Kling 2.1 via FAL.ai. Choose from three intensity presets: Subtle (elegant dolly push-in with bokeh), Dramatic (orbit with volumetric fog), or Blockbuster (whip-pan with god rays and sparks). Supports Standard and Master quality tiers.",
      },
      {
        icon: Layers,
        title: "Scene Extension",
        description:
          "Extend cinematic videos by adding additional 5-second scenes with varied camera angles. Each extension generates a new scene with a different camera variation (push-in, lateral dolly, top-down reveal, tracking shot) to create longer, more dynamic video content.",
      },
      {
        icon: Type,
        title: "Text Overlay System",
        description:
          "Add optional text overlays to video variants with full control over headline, subheadline, and call-to-action text. Edit formatting, layout, and positioning in real-time via an inline editor. Text overlays are disabled by default and respect empty fields for selective display.",
      },
      {
        icon: RefreshCw,
        title: "Programmatic Animation Engine",
        description:
          "Videos use a custom animation engine with direct DOM mutations for 60fps playback, bypassing React reconciliation. Features include a 3-phase camera system (reveal, pan, pull-back), throttled state updates for overlays, and pre-generated static SVG grain textures.",
      },
    ],
  },
  {
    category: "Output & Export",
    items: [
      {
        icon: Download,
        title: "Instant Download",
        description:
          "Download any generated poster, brochure, or video frame as a high-resolution PNG. Cinematic video scenes can be downloaded individually as MP4 files. All outputs are production-ready with no watermarks.",
      },
      {
        icon: Zap,
        title: "Regeneration & Iteration",
        description:
          "Not satisfied with a result? Hit Regenerate to create entirely new variants, or use the AI edit bar to iteratively refine the current design. The system supports unlimited regeneration cycles with each attempt producing fresh design directions.",
      },
    ],
  },
];

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="About — Resonance Creative Studio"
        description="Learn how Resonance Creative Studio turns URLs, images, and prompts into AI-generated posters, brochures, ads, social posts, and cinematic videos."
        path="/about"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Service",
          name: "Resonance Creative Studio",
          serviceType: "AI Visual Content Generation",
          provider: { "@type": "Organization", name: "Resonance Creative Studio", url: "https://resonancestudio.lovable.app/" },
          description: "AI-powered generation of posters, brochures, advertisements, social media posts, and cinematic videos.",
        }}
      />
      <main className="max-w-4xl mx-auto px-6 py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-10 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-16"
        >
          <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4">
            About <span className="studio-gradient-text">Resonance</span>
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed max-w-3xl">
            Resonance Creative Studio is an AI-powered platform that transforms any URL, image, document, or text prompt into professional marketing content — posters, brochures, advertisements, social media posts, and cinematic videos — in seconds.
          </p>
          <p className="text-base text-secondary-foreground leading-relaxed max-w-3xl mt-4">
            Built for marketers, designers, and brands who need high-quality visual content without the overhead of traditional design tools. Simply provide your source material, choose a style and format, and let the AI handle the rest.
          </p>
        </motion.div>

        {/* How it works */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-20"
        >
          <h2 className="font-display text-2xl font-bold text-foreground mb-6">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { step: "1", title: "Provide Source Material", desc: "Upload a product image, paste product details, or complete a guided brief. A reference URL is optional." },
              { step: "2", title: "Configure & Generate", desc: "Select content type, style preset, and aspect ratio. Hit Generate to create 2 unique variants." },
              { step: "3", title: "Refine & Export", desc: "Edit with natural language, add cinematic effects to videos, then download production-ready files." },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                custom={i}
                initial="hidden"
                animate="visible"
                variants={fadeUp}
                className="studio-card p-5"
              >
                <div className="w-8 h-8 rounded-lg studio-gradient-bg flex items-center justify-center text-primary-foreground font-display font-bold text-sm mb-3">
                  {item.step}
                </div>
                <h3 className="font-display text-sm font-semibold text-foreground mb-1.5">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Full capability breakdown */}
        {capabilities.map((section, sectionIdx) => (
          <motion.section
            key={section.category}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className="mb-16"
          >
            <h2 className="font-display text-xl font-bold text-foreground mb-6 flex items-center gap-2">
              <span className="w-1.5 h-6 studio-gradient-bg rounded-full inline-block" />
              {section.category}
            </h2>
            <div className="space-y-4">
              {section.items.map((item, i) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.title}
                    custom={i + sectionIdx * 0.5}
                    variants={fadeUp}
                    className="studio-card p-5 group hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors mt-0.5">
                        <Icon className="w-4.5 h-4.5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-display text-sm font-semibold text-foreground mb-1.5">
                          {item.title}
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.section>
        ))}

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center py-12 border-t border-border/50"
        >
          <h2 className="font-display text-2xl font-bold text-foreground mb-3">
            Ready to start creating?
          </h2>
          <p className="text-muted-foreground mb-6">
            Start free and generate your first design in under a minute. Buy a project pack or credits through The Resonance Hub when you're ready to publish.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 studio-gradient-bg text-primary-foreground font-display font-semibold px-8 py-3 rounded-xl hover:opacity-90 transition-opacity"
          >
            <Zap className="w-4 h-4" />
            Start free
          </Link>
        </motion.div>
      </main>
      <ResonanceFooter currentApp="Creative Studio" />
    </div>
  );
};

export default About;
