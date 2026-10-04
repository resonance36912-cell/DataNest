import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { PageSpinner } from "@/components/ui/page-loader";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import RoleRoute from "@/components/RoleRoute";
import HubRedirect from "@/components/HubRedirect";
import AuthErrorHashWatcher from "@/components/AuthErrorHashWatcher";

// Route-level code splitting keeps the public shell small and defers page payloads
// until the user actually navigates to them.
const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const About = lazy(() => import("./pages/About"));
const Ecosystem = lazy(() => import("./pages/Ecosystem"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const NewProject = lazy(() => import("./pages/NewProject"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const VideoGallery = lazy(() => import("./pages/VideoGallery"));
const Credits = lazy(() => import("./pages/Credits"));
const AccountSettings = lazy(() => import("./pages/AccountSettings"));
const Receipt = lazy(() => import("./pages/Receipt"));
const SeoChecklist = lazy(() => import("./pages/SeoChecklist"));
const EmailSenderSetup = lazy(() => import("./pages/EmailSenderSetup"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));

const NotFound = lazy(() => import("./pages/NotFound"));




import { useEntitlementReturnRefresh } from "@/hooks/useEntitlementReturnRefresh";

const EntitlementReturnWatcher = () => {
  useEntitlementReturnRefresh();
  return null;
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || undefined}>
          <AuthProvider>
            <HubRedirect />
            <AuthErrorHashWatcher />
            <EntitlementReturnWatcher />
            <Suspense fallback={<PageSpinner message="Loading…" />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/ecosystem" element={<Ecosystem />} />
                <Route path="/about" element={<About />} />
                <Route path="/login" element={<RoleRoute require="guest"><Login /></RoleRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/project/new" element={<ProtectedRoute><NewProject /></ProtectedRoute>} />
                <Route path="/project/:id" element={<ProtectedRoute><NewProject /></ProtectedRoute>} />
                <Route path="/gallery" element={<ProtectedRoute><VideoGallery /></ProtectedRoute>} />
                <Route path="/credits" element={<ProtectedRoute><Credits /></ProtectedRoute>} />
                <Route path="/account" element={<ProtectedRoute><AccountSettings /></ProtectedRoute>} />
                <Route path="/receipt/:id" element={<ProtectedRoute><Receipt /></ProtectedRoute>} />
                <Route path="/admin/login" element={<RoleRoute require="guest"><AdminLogin /></RoleRoute>} />
                <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                <Route path="/admin/seo-checklist" element={<AdminRoute><SeoChecklist /></AdminRoute>} />
                <Route path="/admin/email-sender" element={<AdminRoute><EmailSenderSetup /></AdminRoute>} />
                <Route path="/unsubscribe" element={<Unsubscribe />} />
                <Route path="*" element={<NotFound />} />

              </Routes>
            </Suspense>

          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;