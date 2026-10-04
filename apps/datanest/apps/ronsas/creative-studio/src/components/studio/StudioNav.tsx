import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Home, Loader2, LogOut, User, BookmarkPlus, Wand2, RefreshCw, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { signOutAndRedirect } from "@/lib/signOut";
import { clearDraft } from "@/lib/studioDraft";
import { HUB_URL, MANAGE_BILLING_URL } from "@/lib/entitlement";
import { useEffect, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


interface StudioNavProps {
  isAnalyzing: boolean;
  isAuthenticated: boolean;
}

const StudioNav = ({ isAnalyzing, isAuthenticated }: StudioNavProps) => {
  const navigate = useNavigate();
  const [avatar, setAvatar] = useState<string | null>(null);
  const [initial, setInitial] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const meta = (u.user_metadata || {}) as Record<string, unknown>;
      const pic = (meta.avatar_url || meta.picture) as string | undefined;
      setAvatar(pic ?? null);
      const name = (meta.full_name || meta.name) as string | undefined;
      setInitial(((name || u.email || "?").trim()[0] || "?").toUpperCase());
    });
  }, [isAuthenticated]);

  // Autosave indicator — listens for resonance:draft-saved events from studioDraft.saveDraft
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [savedLabel, setSavedLabel] = useState<string>("");
  useEffect(() => {
    const onSaved = (e: Event) => {
      const detail = (e as CustomEvent).detail as { savedAt?: string } | undefined;
      setSavedAt(detail?.savedAt ? new Date(detail.savedAt).getTime() : Date.now());
    };
    window.addEventListener("resonance:draft-saved", onSaved as EventListener);
    return () => window.removeEventListener("resonance:draft-saved", onSaved as EventListener);
  }, []);
  useEffect(() => {
    if (!savedAt) return;
    const tick = () => {
      const s = Math.max(0, Math.floor((Date.now() - savedAt) / 1000));
      setSavedLabel(s < 5 ? "just now" : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [savedAt]);


  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="sticky top-0 shrink-0 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl px-4 sm:px-6 z-30"
    >
      <div className="h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-3 group min-w-0">
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-lg studio-gradient-bg opacity-50 blur-md group-hover:opacity-80 transition-opacity" />
            <img
              src="/logo-icon.jpg"
              alt="Resonance Creative Studio logo"
              className="relative h-9 w-9 rounded-lg object-cover ring-1 ring-white/10"
              width={36}
              height={36}
              decoding="async"
            />
          </div>
          <div className="min-w-0 hidden sm:block">
            <div className="font-display text-sm font-bold studio-gradient-text leading-tight truncate">
              Resonance Creative Studio
            </div>
            <div className="text-[10.5px] text-muted-foreground leading-tight">
              AI-powered design generator
            </div>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-0.5 text-sm">
          {[
            { to: "/", label: "Home", icon: Home, always: true },
            ...(isAuthenticated ? [
              { to: "/logo-designer", label: "Logo Designer", icon: Wand2, always: true },
              { to: "/library", label: "Library", icon: BookmarkPlus, always: true },
            ] : []),
            { to: "/about", label: "About", always: false },
            { to: "/contact", label: "Contact", always: false },
          ].map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className={`px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors flex items-center gap-1.5 whitespace-nowrap ${item.always ? "" : "hidden xl:flex"}`}
            >
              {item.icon && <item.icon className="w-3.5 h-3.5" />}
              {item.label}
            </Link>
          ))}
          <a
            href={HUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors whitespace-nowrap"
            title="The Resonance Hub — your home for all Resonance tools"
          >
            Part of The Resonance Hub <span className="opacity-60">↗</span>
          </a>
          {isAuthenticated && (
            <a
              href={MANAGE_BILLING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden xl:inline-block px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors whitespace-nowrap"
              title="Manage your packs & credits on The Resonance Hub"
            >
              Hub billing <span className="opacity-60">↗</span>
            </a>
          )}

        </div>

        <div className="flex items-center gap-3">
          <AnimatePresence>
            {isAnalyzing && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="hidden sm:flex items-center gap-2 text-xs text-primary"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Analysing…
              </motion.div>
            )}
          </AnimatePresence>

          {isAuthenticated && savedAt && !isAnalyzing && (
            <div
              className="hidden lg:flex items-center gap-1.5 text-[11px] text-muted-foreground whitespace-nowrap"
              title={`Autosaved at ${new Date(savedAt).toLocaleTimeString()} · ${savedLabel}`}
            >
              <Check className="w-3 h-3 text-emerald-400" />
              Saved
            </div>
          )}


          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                title="Refresh Studio session"
                aria-label="Refresh Studio session"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md hover:bg-white/[0.04] whitespace-nowrap"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden xl:inline">Refresh</span>
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Refresh Studio?</AlertDialogTitle>
                <AlertDialogDescription>
                  This clears your current session (uploaded source, brief, and unsaved variants) and reloads. Saved Library items are kept.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    try {
                      const { data } = await supabase.auth.getUser();
                      if (data.user?.id) clearDraft(data.user.id);
                    } catch { /* ignore */ }
                    window.location.reload();
                  }}
                >
                  Refresh
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {isAuthenticated ? (
            <>
              <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-white/10 bg-secondary/60 overflow-hidden">
                {avatar ? (
                  <img src={avatar} alt="Profile" className="h-full w-full object-cover" />
                ) : initial ? (
                  <span className="text-xs font-semibold text-foreground">{initial}</span>
                ) : (
                  <User className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <button
                data-testid="studio-sign-out"
                onClick={() => signOutAndRedirect("/")}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md hover:bg-white/[0.04] whitespace-nowrap"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden xl:inline">Sign Out</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className="studio-gradient-bg text-primary-foreground text-sm font-semibold px-5 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
            >
              Sign Up &amp; Sign In
            </button>
          )}
        </div>
      </div>
    </motion.nav>
  );
};

export default StudioNav;
