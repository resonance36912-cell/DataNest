import { ReactNode, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  LayoutDashboard, HardDrive, Activity, Database, LogOut, Shield, RefreshCw, Wrench, ShieldCheck, Ticket, ShieldAlert, LineChart, Sparkles, Wallet, FileText, BadgeCheck, ScrollText, Mail,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { usePendingOptimizationCount } from "@/hooks/usePendingOptimizationCount";

export type AdminSectionKey = "overview" | "storage" | "ops" | "jobs" | "tables" | "entitlements" | "coupons" | "security" | "perf" | "optimization" | "credits" | "transcription" | "quality" | "qa_audit" | "payload_flags" | "emails";

export interface AdminNavItem {
  key: AdminSectionKey;
  label: string;
  icon: typeof LayoutDashboard;
  description?: string;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { key: "overview",     label: "Overview",     icon: LayoutDashboard, description: "Stats & recent projects" },
  { key: "credits",      label: "API Credits",  icon: Wallet,          description: "Provider balances & top-ups" },
  { key: "storage",      label: "Storage",      icon: HardDrive,       description: "Buckets & cleanup" },
  { key: "ops",          label: "Ops Cockpit",  icon: Activity,        description: "Provider health & alerts" },
  { key: "jobs",         label: "Jobs",         icon: Wrench,          description: "Render jobs diagnostics" },
  { key: "perf",         label: "Performance",  icon: LineChart,       description: "Step timings & error rates" },
  { key: "transcription",label: "Transcription",icon: FileText,        description: "Lyric QA: coverage, words, errors" },
  { key: "quality",      label: "Scene Quality",icon: BadgeCheck,      description: "Postprocess & QA reports per scene" },
  { key: "qa_audit",     label: "QA Audit Log", icon: ScrollText,      description: "Who re-ran QA / normalize and the outcome" },
  { key: "payload_flags",label: "Payload Flags",icon: ShieldAlert,     description: "Provider payloads & lip-sync QA warnings" },
  { key: "emails",       label: "Email Delivery",icon: Mail,           description: "Auth & app email sends, failures, bounces" },
  { key: "optimization", label: "Optimization", icon: Sparkles,        description: "Tuning suggestions & approvals" },
  { key: "security",     label: "Security",     icon: ShieldAlert,     description: "Scanner findings & remediation" },
  { key: "entitlements", label: "Entitlements", icon: ShieldCheck,     description: "Hub packs & feature gates" },
  { key: "coupons",      label: "Coupons",      icon: Ticket,          description: "Hub coupon redemptions" },
  { key: "tables",       label: "Tables",       icon: Database,        description: "Quick DB inspection" },
];

interface AdminLayoutProps {
  /** Map of section key → rendered node */
  sections: Partial<Record<AdminSectionKey, ReactNode>>;
  /** Optional extra header action (e.g. global refresh) */
  headerAction?: ReactNode;
  /** Initial section if no `?section=` param present */
  defaultSection?: AdminSectionKey;
}

/**
 * Reusable admin shell — collapsible sidebar nav + sticky header.
 * Section state is mirrored to the `?section=` query param so deep-links
 * and refreshes preserve the active panel.
 */
export function AdminLayout({ sections, headerAction, defaultSection = "overview" }: AdminLayoutProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = (searchParams.get("section") as AdminSectionKey) || defaultSection;
  const [active, setActive] = useState<AdminSectionKey>(
    ADMIN_NAV.some((n) => n.key === initial) ? initial : defaultSection
  );

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (active === defaultSection) next.delete("section");
    else next.set("section", active);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AdminSidebar active={active} onSelect={setActive} />

        <div className="flex-1 flex min-w-0 flex-col">
          <AdminHeader
            title={ADMIN_NAV.find((n) => n.key === active)?.label ?? "Admin"}
            description={ADMIN_NAV.find((n) => n.key === active)?.description}
            extra={headerAction}
          />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl space-y-6">
              {sections[active] ?? (
                <div className="glass-card p-10 text-center text-sm text-muted-foreground">
                  No content for "{active}" yet.
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

// ─── Sidebar ───
function AdminSidebar({
  active, onSelect,
}: { active: AdminSectionKey; onSelect: (k: AdminSectionKey) => void }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pendingOpt = usePendingOptimizationCount();

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60">
      <SidebarContent>
        <div className="flex items-center gap-2 px-3 pt-4 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/10 text-accent">
            <Shield className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Admin Portal</p>
              <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">SyncVision</p>
            </div>
          )}
        </div>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Sections</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {ADMIN_NAV.map((item) => {
                const badge = item.key === "optimization" && pendingOpt > 0 ? pendingOpt : null;
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      isActive={active === item.key}
                      onClick={() => onSelect(item.key)}
                      tooltip={badge ? `${item.label} (${badge} pending)` : item.label}
                      className="hover:bg-muted/50"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span className="flex-1">{item.label}</span>}
                      {badge !== null && (
                        <span
                          className={
                            collapsed
                              ? "absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary"
                              : "ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground"
                          }
                          aria-label={`${badge} pending`}
                        >
                          {collapsed ? "" : badge}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

// ─── Header ───
function AdminHeader({
  title, description, extra,
}: { title: string; description?: string; extra?: ReactNode }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login?admin=true");
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur sm:px-6">
      <SidebarTrigger />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold leading-tight">{title}</h1>
        {description && (
          <p className="truncate text-[11px] text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {extra}
        <Button
          variant="outline"
          size="sm"
          onClick={handleSignOut}
          className="gap-1.5 border-border text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sign Out</span>
        </Button>
      </div>
    </header>
  );
}

// Re-export for caller convenience
export { RefreshCw };
