import { m as motion } from "@/lib/lazy-motion";
import { Sparkles, Heart, Users, Zap } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import SEO from "@/components/SEO";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

const values = [
  { icon: Zap, title: "Innovation", description: "We push boundaries in content optimization, embracing new AI technologies to create unique growth experiences for creators.", color: "text-resonance-cyan" },
  { icon: Heart, title: "Authenticity", description: "Every recommendation is data-driven and genuine. We believe in honest analytics that create meaningful channel improvements.", color: "text-resonance-magenta" },
  { icon: Users, title: "Community", description: "Our users aren't just customers—they're collaborators who shape the direction of our tools and features.", color: "text-resonance-gold" },
  { icon: Sparkles, title: "Impact", description: "We create tools that don't just analyze, but inspire action and positive change in creators' growth journeys.", color: "text-resonance-teal" },
];

const About = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="About – Resonance YouTube Optimizer"
        description="Meet the team behind Resonance — a South African–built AI growth engine for YouTube creators, podcasters and brands."
        path="/about"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          "@id": "https://youtubeoptimizer.life/about#aboutpage",
          url: "https://youtubeoptimizer.life/about",
          name: "About Resonance YouTube Optimizer",
          description:
            "A South African–built AI growth engine for YouTube creators, podcasters and brands, part of The Resonance Hub.",
          about: { "@id": "https://reson8.life/#organization" },
          publisher: { "@id": "https://reson8.life/#organization" },
        }}
      />
      <SiteHeader active="About" />

      <main className="container mx-auto px-6 py-16">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <h1 className="font-display font-bold text-4xl md:text-5xl tracking-tight mb-4">
            About <span className="gradient-resonance-text">Resonance</span>
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            We're on a mission to amplify voices that matter, spark conversations that count, and create tools that help YouTube creators resonate long after the video ends.
          </p>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-6 max-w-2xl mx-auto mb-16"
        >
          {[
            { label: "Episodes", value: "15+" },
            { label: "Shares", value: "1K+" },
            { label: "Growing", value: "Daily" },
          ].map((stat) => (
            <div key={stat.label} className="text-center bg-card/60 border border-border/40 rounded-2xl p-6 backdrop-blur-xl">
              <p className="font-display font-bold text-2xl gradient-resonance-text">{stat.value}</p>
              <p className="text-muted-foreground text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </motion.div>

        {/* Mission */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="max-w-3xl mx-auto mb-16 bg-card/60 border border-border/40 rounded-2xl p-8 backdrop-blur-xl"
        >
          <h2 className="font-display font-bold text-2xl mb-4">
            Illuminating stories that <span className="text-primary">ignite change</span>
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            In a world overflowing with content, we cut through the noise to deliver tools and conversations that matter. Resonance isn't just about analytics—it's about education, inspiration, and transformation. We believe every creator has the power to change perspectives, challenge assumptions, and create positive ripples in the world.
          </p>
        </motion.div>

        {/* Values */}
        <div className="max-w-4xl mx-auto mb-16">
          <h2 className="font-display font-bold text-2xl text-center mb-8">Our Core Values</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {values.map((value, i) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="bg-card/60 border border-border/40 rounded-2xl p-6 backdrop-blur-xl"
              >
                <value.icon className={`h-6 w-6 ${value.color} mb-3`} />
                <h3 className="font-display font-semibold text-lg mb-2">{value.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{value.description}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center bg-card/60 border border-border/40 rounded-2xl p-10 backdrop-blur-xl max-w-2xl mx-auto"
        >
          <h2 className="font-display font-bold text-2xl mb-3">Join Our Community</h2>
          <p className="text-muted-foreground mb-6">Be part of a growing movement of creators who believe in the power of authentic storytelling and data-driven growth.</p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Button variant="pill" size="pill" onClick={() => window.open("https://www.youtube.com/@resonance36912", "_blank")}>
              Start Listening
            </Button>
            <Button variant="pillOutline" size="pill" onClick={() => window.open("https://www.resonance-podcast.com/blog", "_blank")}>
              Join Discussion
            </Button>
          </div>
        </motion.div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default About;
