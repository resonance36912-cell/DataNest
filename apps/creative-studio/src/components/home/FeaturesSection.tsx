import { motion } from "framer-motion";
import { Image, Video, Sparkles, Palette, Share2, Megaphone } from "lucide-react";

const features = [
  { icon: Image, title: "AI Poster Generation", description: "Create stunning posters from any URL, image, or text — 2 unique variants per generation.", stat: "8.4K+", statLabel: "Designs Created" },
  { icon: Video, title: "Cinematic Video", description: "10-second promotional videos with camera motion, effects, and optional text overlays.", stat: "3.2K+", statLabel: "Videos Generated" },
  { icon: Share2, title: "Social Media Hub", description: "Cross-post content with AI-generated hashtags & mentions. Upload or reuse designs, share to Instagram, Facebook, X, LinkedIn & YouTube.", stat: "5", statLabel: "Platforms" },
  { icon: Sparkles, title: "AI Content Analysis", description: "Paste any URL and our AI scrapes, analyzes, and generates a creative brief automatically.", stat: "1.8K+", statLabel: "Brands Served" },
  { icon: Palette, title: "Style Library", description: "Professional, cinematic, playful, minimalist — 8 curated styles to match any brand.", stat: "8", statLabel: "Curated Styles" },
  { icon: Megaphone, title: "Smart Advertisements", description: "High-converting ad creatives with strong CTAs, brand consistency, and visual hierarchy.", stat: "85%", statLabel: "Time Saved" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
  }),
};

const FeaturesSection = () => (
  <section id="features" className="px-6 py-20 border-t border-border/50">
    <div className="max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center mb-16"
      >
        <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
          Everything You Need to{" "}
          <span className="studio-gradient-text">Create & Convert</span>
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          From URL scraping to cinematic video generation — one platform for all your visual marketing content.
        </p>
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
      >
        {features.map((feature, i) => {
          const Icon = feature.icon;
          return (
            <motion.div
              key={feature.title}
              custom={i}
              variants={fadeUp}
              className="studio-card p-6 group hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div className="text-right">
                  <p className="font-display text-xl font-bold text-foreground leading-none">{feature.stat}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{feature.statLabel}</p>
                </div>
              </div>
              <h3 className="font-display text-base font-semibold text-foreground mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  </section>
);

export default FeaturesSection;
