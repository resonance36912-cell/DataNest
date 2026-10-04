import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import EmailVerificationGate from "@/components/auth/EmailVerificationGate";
import { isEmailVerified } from "@/lib/email-verification";

type Require = "user" | "admin" | "guest";

const Spinner = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

/**
 * Single role-aware route guard.
 *
 * - `user`  : requires a signed-in session (spoke mirror ready).
 * - `admin` : requires a signed-in session with the `admin` role.
 * - `guest` : login pages — signed-in sessions are bounced to their portal.
 *
 * Role resolution is authoritative server-side (user_roles + RLS); the client
 * check only decides which screen to render.
 */
export default function RoleRoute({
  children,
  require: required,
}: {
  children: React.ReactNode;
  require: Require;
}) {
  const { user, spokeReady, loading } = useAuth();
  const location = useLocation();
  const isAdmin = useIsAdmin();

  const needsRole = required === "admin" || (required === "guest" && !!user);

  if (loading || (user && required !== "guest" && !spokeReady)) return <Spinner />;
  if (needsRole && user && isAdmin === null) return <Spinner />;

  if (required === "guest") {
    if (!user) return <>{children}</>;
    // Already signed in: send to the portal that matches the session's role.
    const isAdminLogin = location.pathname.startsWith("/admin");
    if (isAdminLogin && !isAdmin) return <Navigate to="/dashboard" replace />;
    return <Navigate to={isAdmin && isAdminLogin ? "/admin" : "/dashboard"} replace />;
  }

  if (!user) {
    const to = required === "admin" ? "/admin/login" : "/login";
    return <Navigate to={to} replace state={{ from: location.pathname + location.search }} />;
  }

  if (required === "admin" && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Admin surfaces require a confirmed mailbox (server-set `email_confirmed_at`).
  if (required === "admin" && !isEmailVerified(user)) {
    return <EmailVerificationGate email={user.email ?? ""} />;
  }


  return <>{children}</>;
}
