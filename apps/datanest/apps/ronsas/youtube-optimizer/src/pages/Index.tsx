import { useState, useRef, useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { AnimatePresence, LazyMotionProvider, m as motion } from "@/lib/lazy-motion";
import { BarChart3, Lightbulb, TrendingUp, Handshake, DollarSign, Calendar, AlertCircle, PlayCircle, Printer, Image, Activity, Lock, Zap, LogIn, User, LogOut, Menu, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import ChannelInput from "@/components/ChannelInput";
import AuditTab from "@/components/tabs/AuditTab";
import ContentIdeasTab from "@/components/tabs/ContentIdeasTab";
import TrendsTab from "@/components/tabs/TrendsTab";
import ConnectionsTab from "@/components/tabs/ConnectionsTab";
import MonetizationTab from "@/components/tabs/MonetizationTab";
import ScheduleTab from "@/components/tabs/ScheduleTab";
import EpisodeAnalysis from "@/components/EpisodeAnalysis";
import PrintableReport from "@/components/PrintableReport";
import LockedSection from "@/components/LockedSection";
import VideoScoreAnalyzer from "@/components/VideoScoreAnalyzer";
import TabLoading from "@/components/ui/tab-loading";
import { useAudit } from "@/hooks/useAudit";
import { usePageTracking, trackFeature } from "@/hooks/useTracking";
import BrandLogo from "@/components/BrandLogo";
import SEO from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { HUB_URL, HUB_DOCS_URL } from "@/lib/entitlement";
import { ExternalLink } from "lucide-react";

const tabs = [
  { value: "audit", label: "Audit", icon: BarChart3 },
  { value: "resonance", label: "Resonance", icon: Zap },
  { value: "episode", label: "Episode", icon: PlayCircle },
  { value: "content", label: "Ideas", icon: Lightbulb },
  { value: "trends", label: "Trends", icon: TrendingUp },
  { value: "connections", label: "Network", icon: Handshake },
  { value: "monetization", label: "Revenue", icon: DollarSign },
  { value: "schedule", label: "Schedule", icon: Calendar },
];

/**
 * Primary nav. The Resonance Hub (reson8.life) is the source of truth for
 * pricing, docs and updates, so those entries link out to the hub rather than
 * to spoke URLs.
 */
type TopNavLink =
  | { key: string; kind: "internal"; path: string }
  | { key: string; kind: "hub"; href: string };

const NAV_LINKS: readonly TopNavLink[] = [
  { key: "Features", kind: "internal", path: "/features" },
  { key: "Free Access", kind: "internal", path: "/pricing" },
  { key: "Docs", kind: "hub", href: HUB_DOCS_URL },
  { key: "About", kind: "internal", path: "/about" },
  { key: "Contact", kind: "internal", path: "/contact" },
];

const Index = () => {
  const { isLoading, error, data, analyze } = useAudit();
  const navigate = useNavigate();
  usePageTracking("/");
  const [showReport, setShowReport] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const checkAdmin = async (userId: string) => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      if (session?.user) checkAdmin(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
      if (session?.user) {
        checkAdmin(session.user.id);
      } else {
        setIsAdmin(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleAnalyze = (url: string) => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    analyze(url);
  };

  const handlePrint = () => {
    setShowReport(true);
    setTimeout(() => {
      window.print();
    }, 300);
  };

  return (
    <LazyMotionProvider>
    <div className="min-h-screen bg-background grid-bg">
      <SEO
        title="Creator Growth — Tools in tune with you · The Resonance"
        description="AI-powered YouTube channel audits, titles, thumbnails and growth analytics. Full access is temporarily free while Resonance measures real usage costs and establishes sustainable pricing."
        path="/"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Resonance Creator Growth",
            url: "https://youtubeoptimizer.life/",
            parentOrganization: {
              "@type": "Organization",
              name: "The Resonance",
              url: "https://reson8.life",
            },
            sameAs: [
              "https://reson8.life",
              "https://www.youtube.com/@resonance36912",
              "https://www.facebook.com/people/The-Resonance-Podcast/61574983737484/",
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "@id": "https://youtubeoptimizer.life/#website",
            url: "https://youtubeoptimizer.life/",
            name: "Resonance Creator Growth",
            description:
              "AI-powered YouTube channel audits, titles, thumbnails and growth analytics — part of The Resonance Hub.",
            inLanguage: "en",
            publisher: { "@id": "https://reson8.life/#organization" },
          },
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "@id": "https://youtubeoptimizer.life/#software",
            name: "Resonance Creator Growth",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            url: "https://youtubeoptimizer.life/",
            offers: {
              "@type": "Offer",
              priceCurrency: "ZAR",
              price: "0",
            },
          },
        ]}
      />

      {/* Header */}
      <header className="border-b border-border/30 bg-background/60 backdrop-blur-2xl sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <BrandLogo size="sm" />

          <nav className="hidden md:flex items-center gap-7">
            {NAV_LINKS.map((link) =>
              link.kind === "hub" ? (
                <a key={link.key} href={link.href} target="_blank" rel="noopener" className="text-[11px] font-mono font-semibold uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                  {link.key}
                  <ExternalLink className="h-3 w-3 opacity-70" aria-hidden="true" />
                </a>
              ) : (
                <button key={link.key} onClick={() => navigate(link.path)} className="text-[11px] font-mono font-semibold uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground transition-colors">
                  {link.key}
                </button>
              ),
            )}
          </nav>

          <div className="flex items-center gap-3">
            {data && (
              <Button variant="outline" size="sm" className="hidden sm:flex text-xs gap-1.5 h-9 neon-border rounded-full" onClick={handlePrint}>
                <Printer className="h-3.5 w-3.5" />
                Export Report
              </Button>
            )}
            {isAuthenticated ? (
              <div className="hidden md:flex items-center gap-2">
                {isAdmin && (
                  <Button variant="pillOutline" size="pill" className="gap-1.5" onClick={() => navigate("/admin")}>
                    <User className="h-3.5 w-3.5" />
                    Dashboard
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-9 rounded-full text-xs gap-1.5 text-muted-foreground hover:text-foreground" onClick={async () => { await supabase.auth.signOut(); setIsAuthenticated(false); setIsAdmin(false); }}>
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </Button>
              </div>
            ) : (
              <Button variant="pill" size="pill" className="hidden md:flex gap-1.5" onClick={() => navigate("/login")}>
                <LogIn className="h-3.5 w-3.5" />
                Sign In
              </Button>
            )}
            {/* Mobile menu toggle */}
            <Button size="sm" variant="ghost" className="md:hidden h-9 w-9 p-0" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-border/30 bg-background/95 backdrop-blur-xl overflow-hidden"
            >
              <div className="container mx-auto px-6 py-4 space-y-3">
                {NAV_LINKS.map((link) =>
                  link.kind === "hub" ? (
                    <a key={link.key} href={link.href} target="_blank" rel="noopener" onClick={() => setMobileMenuOpen(false)} className="flex w-full items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors py-2">
                      <span>{link.key}</span>
                      <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
                    </a>
                  ) : (
                    <button key={link.key} onClick={() => { navigate(link.path); setMobileMenuOpen(false); }} className="block w-full text-left text-sm text-muted-foreground hover:text-foreground transition-colors py-2">
                      {link.key}
                    </button>
                  ),
                )}
                <div className="border-t border-border/30 pt-3">
                  {isAuthenticated ? (
                    <div className="space-y-2">
                      {isAdmin && (
                        <Button variant="pillOutline" size="pill" className="w-full gap-1.5" onClick={() => { navigate("/admin"); setMobileMenuOpen(false); }}>
                          <User className="h-3.5 w-3.5" />
                          Dashboard
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="w-full rounded-full text-xs gap-1.5 text-muted-foreground" onClick={async () => { await supabase.auth.signOut(); setIsAuthenticated(false); setIsAdmin(false); setMobileMenuOpen(false); }}>
                        <LogOut className="h-3.5 w-3.5" />
                        Sign Out
                      </Button>
                    </div>
                  ) : (
                    <Button variant="pill" size="pill" className="w-full gap-1.5" onClick={() => { navigate("/login"); setMobileMenuOpen(false); }}>
                      <LogIn className="h-3.5 w-3.5" />
                      Sign In
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main>
        <AnimatePresence mode="wait">
          {!data ? (
            <motion.div
              key="hero"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -10 }}
              className="hero-glow"
            >
              {/* Hero Section — Asymmetric Depth */}
              <section className="relative overflow-x-clip">
                {/* Ambient background glows */}
                <div className="pointer-events-none absolute top-1/4 -left-20 w-[28rem] h-[28rem] rounded-full blur-[120px] opacity-40" style={{ background: "hsl(var(--resonance-violet) / 0.35)" }} />
                <div className="pointer-events-none absolute bottom-1/4 -right-20 w-[28rem] h-[28rem] rounded-full blur-[120px] opacity-30" style={{ background: "hsl(var(--resonance-magenta) / 0.30)" }} />

                <div className="container mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-10 relative z-10">
                  <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
                    {/* Left — Content 7/12 */}
                    <div className="lg:col-span-7 space-y-8 relative">
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-card/40 backdrop-blur px-3 py-1.5"
                      >
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-70 animate-ping" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                        </span>
                        <span className="text-[10px] sm:text-[11px] font-mono font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          Resonance governed · Growth intelligence
                        </span>
                      </motion.div>

                      <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15, duration: 0.6 }}
                        className="font-display font-bold text-4xl sm:text-6xl lg:text-7xl xl:text-8xl tracking-tighter leading-[0.92]"
                      >
                        Amplify Your{" "}
                        <br className="hidden sm:block" />
                        <span className="gradient-resonance-text">Digital Echo.</span>
                      </motion.h1>

                      <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25, duration: 0.6 }}
                        className="max-w-xl text-base sm:text-lg lg:text-xl text-muted-foreground leading-relaxed"
                      >
                        Master the algorithm with data-driven audits and{" "}
                        <span className="font-serif italic text-foreground">resonant strategies</span>{" "}
                        designed for the modern creator ecosystem. Part of{" "}
                        <a href="https://reson8.life" className="text-foreground underline-offset-4 hover:underline" rel="noopener">
                          The Resonance
                        </a>.
                      </motion.p>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.35, duration: 0.5 }}
                        className="space-y-4"
                      >
                        <ChannelInput onAnalyze={handleAnalyze} isLoading={isLoading} />
                        <div className="flex flex-wrap items-center gap-3">
                          <Button asChild variant="pillOutline" size="pill">
                            <a href="/pricing" target="_blank" rel="noopener">
                              Free access promotion <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            </a>
                          </Button>
                          <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground/60">
                            Free audit · no card required
                          </span>
                        </div>
                      </motion.div>

                      {isLoading && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                          className="flex items-center gap-3 rounded-full border border-border/40 bg-card/40 backdrop-blur-xl px-4 py-2 max-w-fit shadow-[0_10px_30px_-15px_hsl(var(--resonance-magenta)/0.4)]"
                          aria-live="polite"
                        >
                          <div className="flex gap-1">
                            {[0, 1, 2].map((i) => (
                              <motion.div
                                key={i}
                                className="w-2 h-2 rounded-full bg-gradient-to-br from-[hsl(var(--resonance-violet))] to-[hsl(var(--resonance-magenta))]"
                                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                                transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
                              />
                            ))}
                          </div>
                          <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground/80">
                            Analyzing channel…
                          </p>
                        </motion.div>
                      )}

                      {error && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex items-center gap-2 text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2.5 max-w-lg text-sm"
                        >
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <p>{error}</p>
                        </motion.div>
                      )}
                    </div>

                    {/* Right — Visual 5/12 */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4, duration: 0.7, ease: "easeOut" }}
                      className="lg:col-span-5 relative hidden md:block"
                    >
                      <motion.div
                        animate={{ y: [0, -14, 0] }}
                        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                        className="relative"
                      >
                        {/* Main glass card */}
                        <div className="relative z-20 rounded-2xl border border-border/40 bg-card/40 backdrop-blur-xl p-6 shadow-[0_30px_80px_-20px_hsl(var(--resonance-magenta)/0.35)]">
                          <div className="flex items-center justify-between mb-6">
                            <div className="flex gap-1.5">
                              <span className="h-2.5 w-2.5 rounded-full border border-destructive/40 bg-destructive/20" />
                              <span className="h-2.5 w-2.5 rounded-full border border-resonance-gold/40 bg-resonance-gold/20" />
                              <span className="h-2.5 w-2.5 rounded-full border border-success/40 bg-success/20" />
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                              illustrative_demo
                            </div>
                          </div>

                          <div className="space-y-5">
                            <div className="h-3 w-3/4 rounded-full bg-muted/40 overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: "68%" }}
                                transition={{ delay: 0.9, duration: 1.2, ease: "easeOut" }}
                                className="h-full rounded-full"
                                style={{ background: "linear-gradient(90deg, hsl(var(--resonance-violet)), hsl(var(--resonance-magenta)))" }}
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="rounded-xl border border-border/30 bg-secondary/30 p-4">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">Example velocity</p>
                                <p className="font-display font-bold text-2xl mt-1">+84%</p>
                              </div>
                              <div className="rounded-xl border border-border/30 bg-secondary/30 p-4">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">Example score</p>
                                <p className="font-display font-bold text-2xl mt-1 gradient-resonance-text">9.2/10</p>
                              </div>
                            </div>
                            <p className="text-[10px] font-mono text-muted-foreground/60 leading-relaxed">
                              Illustrative example — not your channel results.
                            </p>
                          </div>
                        </div>

                        {/* Floating accent — top right */}
                        <div className="absolute -top-6 -right-4 lg:-right-8 z-30 rounded-2xl border border-primary/30 bg-card/60 backdrop-blur-2xl p-3.5 w-40 shadow-xl">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                            <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Example feed</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted/40 mb-1.5" />
                          <div className="h-1.5 w-2/3 rounded-full bg-muted/40" />
                        </div>

                        {/* Floating accent — bottom left */}
                        <div className="absolute -bottom-5 -left-4 lg:-left-6 z-10 rounded-2xl border border-border/30 bg-card/40 backdrop-blur-xl p-3.5 w-48">
                          <p className="text-[10px] font-mono italic text-muted-foreground/70 mb-2 tracking-tight">
                            optimization_lock
                          </p>
                          <div className="h-1 w-full rounded-full bg-muted/40 overflow-hidden">
                            <motion.div
                              animate={{ x: ["-100%", "100%"] }}
                              transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
                              className="h-full w-1/3 rounded-full"
                              style={{ background: "hsl(var(--resonance-violet))" }}
                            />
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  </div>

                  {/* Trust strip — Resonance Hub network */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6, duration: 0.6 }}
                    className="mt-20 pt-8 border-t border-border/20"
                  >
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                      <div className="text-center md:text-left">
                        <p className="font-display font-medium text-sm text-foreground tracking-wide">
                          Part of The Resonance Hub
                        </p>
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                          One account · Multiple tools · Endless possibilities
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2">
                        {[
                          { label: "reson8.life", href: "https://reson8.life" },
                          { label: "Resonance Publish", href: "https://epublisher.reson8.life/" },
                          { label: "Resonance Creator Studio", href: "https://creative.reson8.life/" },
                          { label: "Podcast", href: "https://www.resonance-podcast.com/" },
                        ].map((l) => (
                          <a
                            key={l.href}
                            href={l.href}
                            rel="noopener"
                            className="px-4 py-2 rounded-full border border-border/40 bg-card/30 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all"
                          >
                            {l.label} ↗
                          </a>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                </div>
              </section>
            </motion.div>
          ) : (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8 container mx-auto px-6 py-10"
            >
              <ChannelInput onAnalyze={handleAnalyze} isLoading={isLoading} />

              <Tabs defaultValue="audit" className="w-full">
                <div className="sticky top-2 z-30">
                  <TabsList aria-label="Dashboard sections" className="relative bg-card/50 border border-border/40 p-1.5 rounded-2xl w-full flex overflow-x-auto gap-1 backdrop-blur-xl shadow-[0_20px_60px_-30px_hsl(var(--resonance-magenta)/0.35)]">
                    {/* Ambient inner glow */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-2xl opacity-60"
                      style={{
                        background:
                          "linear-gradient(135deg, hsl(var(--resonance-violet) / 0.06), transparent 40%, hsl(var(--resonance-magenta) / 0.08))",
                      }}
                    />
                    {tabs.map((tab) => {
                      const isLocked = !isAuthenticated && !["audit", "resonance"].includes(tab.value);
                      return (
                        <TabsTrigger
                          key={tab.value}
                          value={tab.value}
                          aria-label={isLocked ? `${tab.label} (locked — sign in to unlock)` : tab.label}
                          className="relative z-10 flex-1 font-display text-xs gap-1.5 rounded-xl py-2.5 text-muted-foreground transition-all data-[state=active]:text-primary-foreground data-[state=active]:bg-gradient-to-br data-[state=active]:from-[hsl(var(--resonance-violet))] data-[state=active]:to-[hsl(var(--resonance-magenta))] data-[state=active]:shadow-[0_8px_24px_-8px_hsl(var(--resonance-magenta)/0.6)] hover:text-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          <tab.icon className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="hidden sm:inline">{tab.label}</span>
                          {isLocked && <Lock className="h-3 w-3 opacity-60 ml-0.5" aria-hidden="true" />}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </div>

                <div className="mt-6">
                  {[
                    { value: "audit", node: <AuditTab channelData={data.channelData} audit={data.audit} videos={data.videos} /> },
                    { value: "resonance", node: <VideoScoreAnalyzer /> },
                    {
                      value: "episode",
                      node: isAuthenticated ? (
                        <EpisodeAnalysis />
                      ) : (
                        <LockedSection
                          title="Episode Analysis"
                          description="Unlock detailed per-video performance insights, audience retention patterns, and optimization suggestions."
                          showThumbnailHint
                        />
                      ),
                    },
                    {
                      value: "content",
                      node: isAuthenticated ? (
                        <ContentIdeasTab contentIdeas={data.audit.contentIdeas} titleTemplates={data.audit.titleTemplates} />
                      ) : (
                        <LockedSection
                          title="AI Content Ideas"
                          description="Get AI-generated content ideas, title templates, and hook suggestions tailored to your niche and audience."
                        />
                      ),
                    },
                    {
                      value: "trends",
                      node: isAuthenticated ? (
                        <TrendsTab trendTopics={data.audit.trendTopics} competitors={data.audit.competitors} />
                      ) : (
                        <LockedSection
                          title="Trends & Competitor Analysis"
                          description="Discover trending topics in your niche and see how your channel compares to similar creators."
                        />
                      ),
                    },
                    {
                      value: "connections",
                      node: isAuthenticated ? (
                        <ConnectionsTab collaborations={data.audit.collaborations} />
                      ) : (
                        <LockedSection
                          title="Collaboration Network"
                          description="Find creators in adjacent niches with audience overlap potential for collaboration opportunities."
                        />
                      ),
                    },
                    {
                      value: "monetization",
                      node: isAuthenticated ? (
                        <MonetizationTab monetizationOpportunities={data.audit.monetizationOpportunities} actionPlan={data.audit.actionPlan} />
                      ) : (
                        <LockedSection
                          title="Revenue & Monetization"
                          description="Unlock revenue stream analysis, monetization readiness scores, and a personalized 30-day action plan."
                        />
                      ),
                    },
                    {
                      value: "schedule",
                      node: isAuthenticated ? (
                        <ScheduleTab weeklySchedule={data.audit.weeklySchedule} thumbnailConcepts={data.audit.thumbnailConcepts} />
                      ) : (
                        <LockedSection
                          title="Schedule & Thumbnails"
                          description="Get an optimized posting schedule and AI thumbnail concepts designed for maximum CTR."
                          showThumbnailHint
                        />
                      ),
                    },
                  ].map(({ value, node }) => (
                    <TabsContent key={value} value={value} className="focus-visible:outline-hidden">
                      <AnimatePresence mode="wait" initial={false}>
                        {isLoading ? (
                          <motion.div
                            key="loading"
                            initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
                            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                            exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                          >
                            <TabLoading label={`Analyzing · ${value}`} />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="content"
                            initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
                            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                            exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                          >
                            {node}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </TabsContent>
                  ))}
                </div>
              </Tabs>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="border-t border-border/20 py-10 mt-16 print:hidden">
        <div className="container mx-auto px-6 space-y-8">
          {/* Ecosystem strip — mirrors reson8.life network band */}
          <div>
            <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.25em] text-muted-foreground/60 mb-3">
              ✦ Explore the wider Resonance network
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "🧠 Hub · reson8.life", href: "https://reson8.life" },
                { label: "📚 Resonance Publish", href: "https://epublisher.reson8.life/" },
                { label: "🎨 Resonance Creator Studio", href: "https://creative.reson8.life/" },
                { label: "🎙️ Podcast", href: "https://www.resonance-podcast.com/" },
                { label: "▶ @resonance36912", href: "https://www.youtube.com/@resonance36912" },
              ].map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  rel="noopener"
                  className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground/70 hover:text-foreground border border-border/40 hover:border-primary/40 rounded-full px-3 py-1.5 transition-colors"
                >
                  {l.label} ↗
                </a>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-border/20">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <BrandLogo size="sm" />
              <a
                href="https://reson8.life"
                className="text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground/70 hover:text-foreground transition-colors"
                rel="noopener"
              >
                Part of The Resonance →
              </a>
            </div>
            <p className="text-[11px] text-muted-foreground/50">
              © 2026 The Resonance · ZAR · POPIA-conscious · Once-off packs via reson8.life
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <a
                href="/pricing"
                target="_blank"
                rel="noopener"
                className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                Free access promotion <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
              <a
                href={HUB_URL}
                target="_blank"
                rel="noopener"
                className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                Back to hub <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
              {[
                { label: "Privacy", path: "/privacy" },
                { label: "Terms", path: "/terms" },
                { label: "Support", path: "/contact" },
              ].map((link) => (
                <button key={link.label} onClick={() => navigate(link.path)} className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                  {link.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </footer>


      {data && (
        <div className="hidden print:block">
          <PrintableReport ref={reportRef} data={data} />
        </div>
      )}
    </div>
    </LazyMotionProvider>
  );
};

export default Index;
