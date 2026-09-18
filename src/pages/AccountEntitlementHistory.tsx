import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { EntitlementHistoryPanel } from "@/components/brand/EntitlementHistoryPanel";
import { ResonanceFooter } from "@/components/brand/ResonanceFooter";

export default function AccountEntitlementHistory() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Entitlement history — Resonance Creative Studio</title>
        <meta
          name="description"
          content="Review every change to your plan, status, and entitlement source during this session."
        />
      </Helmet>
      <header className="border-b border-white/10">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link to="/studio" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to Studio
          </Link>
          <Link to="/account" className="text-sm text-muted-foreground hover:text-foreground">
            Account
          </Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-10">
        <EntitlementHistoryPanel />
      </main>
      <ResonanceFooter />
    </div>
  );
}
