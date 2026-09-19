import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, Sparkles, LogOut, User, ChevronDown, FolderOpen, Plus, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import logoIcon from "@/assets/logo-sync-vision-128.webp";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

// `authOnly` items are hidden from logged-out visitors so the primary
// "Start Free" CTA remains the clearest next step for new arrivals.
const navLinks = [
  { to: "/", label: "Home" },
  { to: "/ecosystem", label: "Ecosystem" },
  { to: "/about", label: "About" },
  { to: "/dashboard", label: "Dashboard", authOnly: true },
  { to: "/gallery", label: "Gallery", authOnly: true },
  { to: "/credits", label: "Credits", authOnly: true },
  { to: "/account", label: "Account", authOnly: true },
  { to: "/admin", label: "Admin", adminOnly: true },
];

// External Hub links — promotion details, updates, and support are managed
// centrally by The Resonance Hub, not by this spoke app.
const hubLinks = [
  { href: "https://reson8.life/pricing", label: "Free Access" },
  { href: "https://reson8.life/support", label: "Support" },
  { href: "https://reson8.life/updates", label: "Updates" },
];

const stepLabels = ["Upload", "Analyze", "Character", "Storyboard", "Assembly", "Export"];

interface NavProject {
  id: string;
  name: string;
  current_step: number;
  updated_at: string;
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [projects, setProjects] = useState<NavProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { resolvedTheme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin")
      .then(({ data }) => setIsAdmin(!!(data && data.length > 0)));
  }, [user]);

  const loadProjects = async () => {
    if (!user || loadingProjects) return;
    setLoadingProjects(true);
    try {
      const { data } = await supabase
        .from("projects")
        .select("id, name, current_step, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(15);
      setProjects(data || []);
    } catch {
      console.error("Failed to load projects");
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-background/60 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between gap-2">
        {/* Resonance lockup links back to the hub */}
        <a
          href="https://reson8.life"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 group shrink-0"
          aria-label="The Resonance — back to hub"
        >
          <motion.img
            src={logoIcon}
            alt="Sync Vision — by The Resonance"
            width={32}
            height={32}
            decoding="async"
            className="h-8 w-8 rounded-lg"
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="font-display text-base font-bold tracking-tight hidden sm:inline">
            <span className="gradient-text">Sync Vision</span>
            <span className="ml-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              by The Resonance
            </span>
          </span>
        </a>


        {/* Desktop */}
        <div className="hidden items-center gap-1 md:flex">
          {navLinks.filter(l => (!l.adminOnly || isAdmin) && (!l.authOnly || !!user)).map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                location.pathname === l.to
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {l.label}
            </Link>
          ))}

          {/* Projects Dropdown */}
          {user && (
            <DropdownMenu onOpenChange={(o) => o && loadProjects()}>
              <DropdownMenuTrigger asChild>
                <button
                  className={`flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    location.pathname.startsWith("/project")
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Projects
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-72">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Recent Projects</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {loadingProjects ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : projects.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">No projects yet</div>
                ) : (
                  projects.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => navigate(`/project/${p.id}`)}
                      className={`flex flex-col items-start gap-0.5 cursor-pointer ${
                        location.pathname === `/project/${p.id}` ? "bg-primary/10" : ""
                      }`}
                    >
                      <span className="font-medium text-sm truncate w-full">
                        {p.name}
                        {location.pathname === `/project/${p.id}` && (
                          <span className="ml-1.5 text-[10px] text-primary">(current)</span>
                        )}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {stepLabels[p.current_step] || "Upload"} · {new Date(p.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/project/new")} className="gap-2 cursor-pointer">
                  <Plus className="h-3.5 w-3.5" /> New Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Hub-managed links — pricing, updates, and back-to-hub live on reson8.life */}
          {hubLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              {l.label}
            </a>
          ))}
          <a
            href="https://reson8.life"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden lg:inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-primary/80 hover:text-primary hover:bg-primary/10 transition-colors"
            aria-label="Back to The Resonance Hub"
          >
            Part of The Resonance Hub ↗
          </a>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <button
            onClick={toggleTheme}
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Toggle theme"
          >
            {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          {user ? (
            <>
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                {profile?.display_name || user.email}
              </span>
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-1.5 text-muted-foreground hover:text-foreground">
                <LogOut className="h-3.5 w-3.5" /> Sign Out
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">Sign In</Button>
              </Link>
              <Link to="/login" onClick={() => { try { sessionStorage.setItem("postLoginRedirect", "/project/new"); } catch {} }}>
                <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> Start Free
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden text-foreground" onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-border/50 bg-background/95 backdrop-blur-xl md:hidden"
          >
            <div className="container flex flex-col gap-2 py-4">
              {navLinks.filter(l => (!l.adminOnly || isAdmin) && (!l.authOnly || !!user)).map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                    location.pathname === l.to ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
              {hubLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {l.label} ↗
                </a>
              ))}
              <a
                href="https://reson8.life"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Back to The Resonance Hub ↗
              </a>
              <button
                onClick={toggleTheme}
                className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {resolvedTheme === "dark" ? "Light Mode" : "Dark Mode"}
              </button>
              <div className="mt-2 flex flex-col gap-2">
                {user ? (
                  <Button variant="outline" className="w-full border-border text-foreground" onClick={() => { handleSignOut(); setOpen(false); }}>
                    Sign Out
                  </Button>
                ) : (
                  <>
                    <Link to="/login" onClick={() => setOpen(false)}>
                      <Button variant="outline" className="w-full border-border text-foreground">Sign In</Button>
                    </Link>
                    <Link to="/login" onClick={() => { try { sessionStorage.setItem("postLoginRedirect", "/project/new"); } catch {} setOpen(false); }}>
                      <Button className="w-full bg-primary text-primary-foreground">Start Free</Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
