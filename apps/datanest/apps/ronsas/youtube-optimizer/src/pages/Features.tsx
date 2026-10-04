import { m as motion } from "@/lib/lazy-motion";
import { BarChart3, Lightbulb, TrendingUp, Handshake, DollarSign, Calendar, PlayCircle, Image, Sparkles, Target } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import SEO from "@/components/SEO";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

const features = [
  {
    icon: BarChart3,
    title: "AI Channel Audit",
    description: "Get a comprehensive AI-powered analysis of your YouTube channel including health score, SEO review, content strategy evaluation, and actionable recommendations.",
    color: "text-resonance-cyan",
    bg: "bg-resonance-cyan/10",
  },
  {
    icon: PlayCircle,
    title: "Episode Analysis",
    description: "Analyze individual videos with AI to get detailed performance insights, audience retention patterns, and optimization suggestions for titles, descriptions, and tags.",
    color: "text-resonance-violet",
    bg: "bg-resonance-violet/10",
  },
  {
    icon: Image,
    title: "AI Thumbnail Generator",
    description: "Generate optimized thumbnails with AI — both general and niche-specific. Includes text overlay suggestions with copy-paste recommended text for maximum CTR.",
    color: "text-resonance-magenta",
    bg: "bg-resonance-magenta/10",
  },
  {
    icon: Lightbulb,
    title: "Content Ideas Engine",
    description: "AI-generated content ideas and title templates tailored to your channel's niche, audience, and trending topics to keep your content pipeline flowing.",
    color: "text-resonance-gold",
    bg: "bg-resonance-gold/10",
  },
  {
    icon: TrendingUp,
    title: "Trend Analysis",
    description: "Stay ahead of the curve with real-time trend topic detection and competitor analysis. See what's working in your niche and capitalize on emerging opportunities.",
    color: "text-resonance-teal",
    bg: "bg-resonance-teal/10",
  },
  {
    icon: Handshake,
    title: "Collaboration Network",
    description: "Discover potential collaboration partners and networking opportunities based on your channel's content, audience overlap, and growth potential.",
    color: "text-resonance-indigo",
    bg: "bg-resonance-indigo/10",
  },
  {
    icon: DollarSign,
    title: "Revenue Optimization",
    description: "Unlock monetization opportunities with AI-powered revenue strategies, sponsorship recommendations, and a step-by-step action plan for growing your income.",
    color: "text-resonance-cyan",
    bg: "bg-resonance-cyan/10",
  },
  {
    icon: Calendar,
    title: "Smart Scheduling",
    description: "Get an AI-generated weekly content schedule optimized for your audience's viewing habits, plus thumbnail concept ideas for upcoming content.",
    color: "text-resonance-violet",
    bg: "bg-resonance-violet/10",
  },
  {
    icon: Target,
    title: "Strategy Impact Simulator",
    description: "Toggle different growth strategies and see projected view increases in real-time. Visualize the impact of SEO, thumbnails, consistency, and more on your channel's growth.",
    color: "text-resonance-magenta",
    bg: "bg-resonance-magenta/10",
  },
  {
    icon: Sparkles,
    title: "Printable Reports",
    description: "Export comprehensive PDF reports of your channel audit with all metrics, recommendations, and strategies — perfect for team reviews or client presentations.",
    color: "text-resonance-gold",
    bg: "bg-resonance-gold/10",
  },
];

const Features = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Features – Resonance YouTube Optimizer"
        description="Explore AI channel audits, episode analysis, content ideas, monetization, scheduling and thumbnail tools built for YouTube creators."
        path="/features"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "@id": "https://youtubeoptimizer.life/features#software",
          name: "Resonance YouTube Optimizer",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          url: "https://youtubeoptimizer.life/features",
          description:
            "AI channel audits, episode analysis, content ideas, monetization, scheduling and thumbnail tools for YouTube creators.",
          featureList: features.map((f) => f.title),
          publisher: { "@id": "https://reson8.life/#organization" },
          offers: { "@type": "Offer", priceCurrency: "ZAR", price: "0" },
        }}
      />
      <SiteHeader active="Features" />

      <main className="container mx-auto px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <h1 className="font-display font-bold text-4xl md:text-5xl tracking-tight mb-4">
            Powerful <span className="gradient-resonance-text">Features</span> for YouTube Growth
          </h1>
          <p className="text-muted-foreground text-lg">
            Everything you need to analyze, optimize, and grow your YouTube channel — powered by AI.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="group bg-card/60 border border-border/40 rounded-2xl p-6 backdrop-blur-xl hover:border-primary/30 transition-all hover:shadow-[0_0_30px_-10px_hsl(var(--primary)/0.2)]"
            >
              <div className={`w-12 h-12 rounded-xl ${feature.bg} flex items-center justify-center mb-4`}>
                <feature.icon className={`h-6 w-6 ${feature.color}`} />
              </div>
              <h3 className="font-display font-semibold text-lg mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-16"
        >
          <Button variant="pill" size="pillLg" onClick={() => navigate("/login")}>
            Get Started
          </Button>
        </motion.div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Features;
