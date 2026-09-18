import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, ExternalLink, BookOpen, Palette, BarChart3, Film, Sparkles, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Layout from "@/components/Layout";
import { SeoHead } from "@/components/SeoHead";
import { useEffect, useRef } from "react";

import publisherHero from "@/assets/resonance-publisher-hero.jpg";
import studioHero from "@/assets/resonance-studio-hero.jpg";
import optimizerHero from "@/assets/resonance-optimizer-hero.jpg";
import syncvisionHero from "@/assets/resonance-syncvision-hero.jpg";

import mainLogo from "@/assets/resonance-app-dev-logo.png";
import logoPublisher from "@/assets/logo-epublisher.png";
import logoStudio from "@/assets/logo-studio.png";
import logoOptimizer from "@/assets/logo-optimizer.png";
import logoSyncvision from "@/assets/logo-syncvision.png";

/* ─── App data ─── */
const apps = [
  {
    name: "Resonance ePublisher",
    tagline: "Turn Any Topic Into an AudioVisual eBook",
    description: "Automatically researches, verifies, and crafts stunning AudioVisual eBooks with cinematic imagery, AI narration, background music, and animation — from any topic.",
    url: "https://resonancepublisher.lovable.app",
    image: publisherHero,
    logo: logoPublisher,
    icon: BookOpen,
    color: "from-purple-500 to-cyan-400",
    glowColor: "hsl(270 80% 55% / 0.25)",
    features: ["Internet Research", "AI Voice Narration", "Cinematic Visuals", "Multi-Format Export"],
    status: "Coming Soon",
  },
  {
    name: "Resonance Creative Studio",
    tagline: "Transform Ideas Into Stunning Visual Content",
    description: "Turn any URL, image, or document into professional posters, brochures, advertisements, social media posts, and cinematic videos — powered by AI.",
    url: "https://resonancestudio.lovable.app",
    image: studioHero,
    logo: logoStudio,
    icon: Palette,
    color: "from-pink-500 to-purple-500",
    glowColor: "hsl(310 80% 55% / 0.25)",
    features: ["AI Poster Generation", "Cinematic Video", "Social Media Hub", "Smart Advertisements"],
    status: "Coming Soon",
  },
  {
    name: "Resonance YouTube Optimizer",
    tagline: "Revolutionizing YouTube Channel Growth",
    description: "Discover what drives results and what doesn't — AI-powered audits, content strategy, thumbnail optimization, and performance analytics.",
    url: "https://resonanceoptimizer.lovable.app",
    image: optimizerHero,
    logo: logoOptimizer,
    icon: BarChart3,
    color: "from-magenta-500 to-violet-500",
    glowColor: "hsl(290 80% 55% / 0.25)",
    features: ["AI Thumbnail Optimization", "Channel Audits", "Performance Analytics", "Strategy Deployment"],
    status: "Coming Soon",
  },
  {
    name: "Resonance SyncVision",
    tagline: "AI-Powered Music Video Storyboards",
    description: "Upload a track, let AI analyze every beat and lyric, design your character, and generate production-ready cinematic scene storyboards — all in one workflow.",
    url: "/project/new",
    image: syncvisionHero,
    logo: logoSyncvision,
    icon: Film,
    color: "from-primary to-accent",
    glowColor: "hsl(270 70% 55% / 0.3)",
    features: ["Lyric Analysis", "Character Design", "Scene Storyboard", "Video Assembly"],
    status: "Live",
    isInternal: true,
  },
];

/* ─── Floating particle ─── */
function FloatingParticle({ delay, x, y, size }: { delay: number; x: number; y: number; size: number }) {
  return (
    <motion.div
      className="absolute rounded-full bg-primary/20"
      style={{ width: size, height: size, left: `${x}%`, top: `${y}%` }}
      animate={{
        y: [0, -40, 0],
        x: [0, 15, -10, 0],
        opacity: [0.15, 0.5, 0.15],
        scale: [1, 1.3, 1],
      }}
      transition={{ duration: 6 + delay, repeat: Infinity, ease: "easeInOut", delay }}
    />
  );
}

/* ─── Animated counter ─── */
function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v));
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const controls = animate(count, target, { duration: 2.5, ease: "easeOut" });
    return controls.stop;
  }, [target, count]);

  useEffect(() => {
    const unsubscribe = rounded.on("change", (v) => {
      if (ref.current) ref.current.textContent = `${v}${suffix}`;
    });
    return unsubscribe;
  }, [rounded, suffix]);

  return <span ref={ref}>0{suffix}</span>;
}

/* ─── App Card ─── */
function AppCard({ app, index }: { app: typeof apps[0]; index: number }) {
  const isInternal = "isInternal" in app && app.isInternal;

  return (
    <motion.div
      initial={{ opacity: 0, y: 60, rotateX: 8 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay: index * 0.15, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -8, transition: { duration: 0.3 } }}
      className="group relative"
    >
      <div
        className="absolute -inset-1 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"
        style={{ background: `radial-gradient(circle, ${app.glowColor}, transparent 70%)` }}
      />
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card backdrop-blur-sm">
        {/* Image */}
        <div className="relative aspect-[16/10] overflow-hidden">
          <motion.img
            src={app.image}
            alt={app.name}
            className="w-full h-full object-cover"
            loading="lazy"
            width={800}
            height={512}
            whileHover={{ scale: 1.05 }}
            transition={{ duration: 0.6 }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />

          {/* Status badge */}
          <motion.div
            className="absolute top-4 right-4"
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 + index * 0.1 }}
          >
            <Badge className={`${app.status === "Live"
              ? "bg-green-500/20 text-green-400 border-green-500/30"
              : "bg-primary/20 text-primary border-primary/30"
            } text-xs px-3 py-1`}>
              {app.status === "Live" && <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse inline-block" />}
              {app.status}
            </Badge>
          </motion.div>

          {/* App Logo */}
          <motion.div
            className="absolute bottom-4 left-5"
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: index * 0.5 }}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-card/80 backdrop-blur-sm border border-border/50 shadow-lg overflow-hidden p-1">
              <img src={app.logo} alt={`${app.name} logo`} className="h-full w-full object-contain" loading="lazy" width={56} height={56} />
            </div>
          </motion.div>
        </div>

        {/* Content */}
        <div className="p-6 pt-3 space-y-4">
          <div>
            <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">{app.name}</h3>
            <p className="text-sm font-medium text-primary/80 mt-0.5">{app.tagline}</p>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{app.description}</p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-1.5">
            {app.features.map((f, i) => (
              <motion.span
                key={f}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 + i * 0.05 }}
                className="rounded-full bg-secondary/80 px-2.5 py-1 text-[10px] font-medium text-secondary-foreground border border-border/30"
              >
                {f}
              </motion.span>
            ))}
          </div>

          {/* CTA */}
          {isInternal ? (
            <Link to={app.url}>
              <Button className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 group/btn">
                Start Creating <ArrowRight className="h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
              </Button>
            </Link>
          ) : (
            <a href={app.url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="w-full gap-2 border-primary/30 hover:bg-primary/10 hover:border-primary/50 group/btn">
                Visit App <ExternalLink className="h-3.5 w-3.5 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
              </Button>
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Main Page ─── */
export default function Ecosystem() {
  return (
    <Layout>
      <SeoHead
        title="Resonance Ecosystem — AI-Powered Creative Tools"
        description="Discover the Resonance suite: ePublisher, Creative Studio, YouTube Optimizer, and Sync Vision. AI-powered tools for creators."
        path="/ecosystem"
      />


      {/* Hero */}
      <section className="relative overflow-hidden min-h-[70vh] flex items-center">
        {/* Animated background */}
        <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(12)].map((_, i) => (
            <FloatingParticle
              key={i}
              delay={i * 0.7}
              x={8 + (i * 7.5) % 85}
              y={10 + (i * 13) % 80}
              size={4 + (i % 4) * 3}
            />
          ))}
        </div>

        {/* Glow orbs */}
        <motion.div
          className="absolute top-1/4 left-1/4 h-[400px] w-[400px] rounded-full blur-[180px]"
          style={{ background: "hsl(var(--primary) / 0.08)" }}
          animate={{ scale: [1, 1.2, 1], x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 h-[300px] w-[300px] rounded-full blur-[150px]"
          style={{ background: "hsl(var(--accent) / 0.06)" }}
          animate={{ scale: [1, 1.3, 1], x: [0, -20, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />

        <div className="container relative py-24 text-center">
          {/* Main Logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mb-6"
          >
            <img
              src={mainLogo}
              alt="The Resonance App Dev"
              className="mx-auto h-28 sm:h-36 lg:h-44 w-auto drop-shadow-[0_0_40px_hsl(var(--primary)/0.4)]"
              width={400}
              height={176}
            />
          </motion.div>

          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-5 py-2 text-xs font-semibold uppercase tracking-widest text-primary"
          >
            <Rocket className="h-3.5 w-3.5" />
            The Resonance Ecosystem
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-4xl sm:text-5xl lg:text-7xl font-bold leading-[1.05] tracking-tight"
          >
            <span className="text-foreground">One Vision.</span>{" "}
            <motion.span
              className="gradient-text inline-block"
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              Four Engines.
            </motion.span>
            <br />
            <motion.span
              className="gradient-accent-text inline-block mt-2"
              animate={{ scale: [1, 1.03, 1], opacity: [0.9, 1, 0.9] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            >
              Infinite Creativity.
            </motion.span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed"
          >
            Resonance is building the future of AI-powered creative tools. From eBooks to music videos,
            from visual marketing to YouTube growth — each app is a piece of a unified creative ecosystem.
          </motion.p>

          {/* Animated stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-12 flex justify-center gap-8 sm:gap-16"
          >
            {[
              { label: "Apps", value: 4, suffix: "" },
              { label: "AI Models", value: 12, suffix: "+" },
              { label: "Features", value: 50, suffix: "+" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold gradient-text">
                  <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </motion.div>

          {/* Scroll hint */}
          <motion.div
            className="mt-16"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="mx-auto h-10 w-6 rounded-full border-2 border-primary/30 flex items-start justify-center pt-2">
              <motion.div
                className="h-2 w-1 rounded-full bg-primary/60"
                animate={{ y: [0, 12, 0], opacity: [1, 0.3, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* App Cards Grid */}
      <section className="border-t border-border/50 bg-secondary/20">
        <div className="container py-20 lg:py-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold">
              Meet the <span className="gradient-text">Resonance</span> Family
            </h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              Each app is purpose-built for a specific creative workflow, powered by cutting-edge AI.
            </p>
          </motion.div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-2 max-w-5xl mx-auto">
            {apps.map((app, i) => (
              <AppCard key={app.name} app={app} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* Ecosystem Vision */}
      <section className="border-t border-border/50">
        <div className="container py-20 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="mx-auto max-w-3xl"
          >
            <Sparkles className="mx-auto h-8 w-8 text-primary mb-6" />
            <h2 className="text-3xl font-bold">
              The Future of <span className="gradient-accent-text">Creative AI</span>
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              We're building an interconnected suite where your content flows seamlessly between tools.
              Generate an eBook, create marketing visuals, produce a music video, and optimize your
              YouTube presence — all from within the Resonance ecosystem.
            </p>
            <motion.div
              className="mt-10 flex flex-wrap justify-center gap-4"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <Link to="/project/new">
                <Button size="lg" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 px-8">
                  Try SyncVision Now <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/">
                <Button size="lg" variant="outline" className="gap-2 border-border hover:bg-secondary px-8">
                  Back to Home
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
