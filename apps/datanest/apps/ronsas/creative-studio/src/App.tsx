import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import { HubEntitlementBanner } from "@/components/brand/HubEntitlementBanner";
import { EntitlementUpgradeWatcher } from "@/components/brand/EntitlementUpgradeWatcher";
import AdminRoute from "@/components/AdminRoute";
import AuthRoute from "@/components/AuthRoute";
import PreviewDiagnostics from "@/components/PreviewDiagnostics";
import DiagnosticsErrorBoundary from "@/components/DiagnosticsErrorBoundary";
import { lazyWithReload } from "@/lib/lazyWithRetry";
import HubLayout from "@/layouts/HubLayout";

const Home = lazyWithReload(() => import("./pages/Home"));
const Login = lazyWithReload(() => import("./pages/Login"));
const SignUp = lazyWithReload(() => import("./pages/SignUp"));
const AdminLogin = lazyWithReload(() => import("./pages/AdminLogin"));
const AdminDashboard = lazyWithReload(() => import("./pages/AdminDashboard"));
const AdminSeo = lazyWithReload(() => import("./pages/AdminSeo"));
const AdminSharePreview = lazyWithReload(() => import("./pages/AdminSharePreview"));
const AdminVisualThresholds = lazyWithReload(() => import("./pages/AdminVisualThresholds"));
const AdminPerformance = lazyWithReload(() => import("./pages/AdminPerformance"));
const AdminPerfDashboard = lazyWithReload(() => import("./pages/AdminPerfDashboard"));
const AdminCircuitBreakers = lazyWithReload(() => import("./pages/AdminCircuitBreakers"));
const AdminErrors = lazyWithReload(() => import("./pages/AdminErrors"));
const About = lazyWithReload(() => import("./pages/About"));
const Studio = lazyWithReload(() => import("./pages/Studio"));
const StudioDna = lazyWithReload(() => import("./pages/StudioDna"));
const StudioProducts = lazyWithReload(() => import("./pages/StudioProducts"));
const StudioMoodboards = lazyWithReload(() => import("./pages/StudioMoodboards"));
const Library = lazyWithReload(() => import("./pages/Library"));
const LogoDesigner = lazyWithReload(() => import("./pages/LogoDesigner"));
const AccountEntitlementHistory = lazyWithReload(() => import("./pages/AccountEntitlementHistory"));
const Terms = lazyWithReload(() => import("./pages/Terms"));
const Privacy = lazyWithReload(() => import("./pages/Privacy"));
const Contact = lazyWithReload(() => import("./pages/Contact"));
const Pricing = lazyWithReload(() => import("./pages/Pricing"));
const UrlToPosterGuide = lazyWithReload(() => import("./pages/guides/UrlToPoster"));
const BriefToCreativeGuide = lazyWithReload(() => import("./pages/guides/BriefToCreative"));
const NotFound = lazyWithReload(() => import("./pages/NotFound"));
const AuthCallback = lazyWithReload(() => import("./pages/AuthCallback"));
const ResetPassword = lazyWithReload(() => import("./pages/ResetPassword"));

const PageLoader = () => (
  <div className="h-screen flex items-center justify-center bg-background">
    <Loader2 className="w-6 h-6 animate-spin text-primary" />
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || undefined}>
        <DiagnosticsErrorBoundary label="PreviewDiagnostics">
          <PreviewDiagnostics />
        </DiagnosticsErrorBoundary>
        <DiagnosticsErrorBoundary label="HubEntitlementBanner">
          <HubEntitlementBanner />
        </DiagnosticsErrorBoundary>
        <DiagnosticsErrorBoundary label="EntitlementUpgradeWatcher">
          <EntitlementUpgradeWatcher />
        </DiagnosticsErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route element={<HubLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/index" element={<Home />} />
              <Route path="/index.html" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/login" element={<Login />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/sign-up" element={<SignUp />} />
              <Route path="/register" element={<SignUp />} />
              <Route path="/admin" element={<AdminLogin />} />
              <Route path="/admin/dashboard" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
              <Route path="/admin/seo" element={<AdminRoute><AdminSeo /></AdminRoute>} />
              <Route path="/admin/share-preview" element={<AdminRoute><AdminSharePreview /></AdminRoute>} />
              <Route path="/admin/visual-thresholds" element={<AdminRoute><AdminVisualThresholds /></AdminRoute>} />
              <Route path="/admin/performance" element={<AdminRoute><AdminPerformance /></AdminRoute>} />
              <Route path="/admin/perf-dashboard" element={<AdminRoute><AdminPerfDashboard /></AdminRoute>} />
              <Route path="/admin/circuit-breakers" element={<AdminRoute><AdminCircuitBreakers /></AdminRoute>} />
              <Route path="/admin/errors" element={<AdminRoute><AdminErrors /></AdminRoute>} />
              <Route path="/studio" element={<AuthRoute><Studio /></AuthRoute>} />
              <Route path="/studio/dna" element={<AuthRoute><StudioDna /></AuthRoute>} />
              <Route path="/studio/products" element={<AuthRoute><StudioProducts /></AuthRoute>} />
              <Route path="/studio/moodboards" element={<AuthRoute><StudioMoodboards /></AuthRoute>} />
              <Route path="/library" element={<AuthRoute><Library /></AuthRoute>} />
              <Route path="/logo-designer" element={<AuthRoute><LogoDesigner /></AuthRoute>} />
              <Route path="/account/entitlement-history" element={<AuthRoute><AccountEntitlementHistory /></AuthRoute>} />

              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/guides/brief-to-creative" element={<BriefToCreativeGuide />} />
              {/* Legacy URL — kept for backlinks; renders the same content as the new guide. */}
              <Route path="/guides/url-to-poster" element={<UrlToPosterGuide />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
