import { Link } from "react-router-dom";
import { ResonanceLogo } from "@/components/brand/ResonanceLogo";
import { useAuth } from "@/contexts/AuthContext";
import { FREE_PROMOTION_ACTIVE, FREE_PROMOTION } from "@/lib/promotion";

export default function Footer() {
  const { user } = useAuth();
  return (
    <footer className="border-t border-white/5 bg-background/60 backdrop-blur-xl">
      <div className="container py-12">
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col items-center gap-3 md:items-start">
            <div className="flex items-center gap-2.5">
              <ResonanceLogo height={24} />
              <span className="font-display text-sm font-bold uppercase tracking-[0.15em]">
                <span className="gradient-text">Sync Vision</span>
                <span className="text-muted-foreground ml-2 text-[10px] font-medium tracking-widest normal-case">by The Resonance</span>
              </span>
            </div>
            <p className="max-w-sm text-center text-[11px] text-muted-foreground md:text-left">
              🇿🇦 Built in South Africa · POPIA-conscious.{" "}
              {FREE_PROMOTION_ACTIVE
                ? `${FREE_PROMOTION.shortLabel}: full access is temporarily free while usage and provider costs are measured.`
                : "Pricing, updates, support, and ecosystem information are managed by The Resonance Hub."}{" "}
              <a href="https://reson8.life" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">The Resonance Hub</a>.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link to="/about" className="hover:text-foreground transition-colors">About</Link>
            <Link to="/ecosystem" className="hover:text-foreground transition-colors">Ecosystem</Link>
            <Link to="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
            <Link to={user ? "/account" : "/login"} className="hover:text-foreground transition-colors">{user ? "Account" : "Sign In"}</Link>
            <a href="https://reson8.life/pricing" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              {FREE_PROMOTION_ACTIVE ? "Free Access" : "Pricing"}
            </a>
            <a href="https://reson8.life/support" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Support</a>
            <a href="https://reson8.life/updates" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Updates</a>
            <a
              href="https://reson8.life"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 transition-colors font-medium"
            >
              Part of The Resonance ↗
            </a>
          </div>

          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} The Resonance.</p>
        </div>
      </div>
    </footer>
  );
}
