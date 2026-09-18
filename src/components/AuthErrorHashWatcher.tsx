import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

/**
 * Supabase redirects failed email links back to the site root with the failure
 * details in the URL hash (e.g. `#error=access_denied&error_code=otp_expired`).
 * Without handling, the app renders a blank-looking page and the user has no
 * idea what happened. This watcher surfaces a readable message, clears the
 * hash and sends the user back to the sign-in screen.
 */
const MESSAGES: Record<string, string> = {
  otp_expired:
    "That sign-in link has already been used or expired. Email scanners often open the link first — request a new one and open it on this device.",
  access_denied: "Sign-in was not completed. Please request a new sign-in link or use your password.",
  server_error: "The sign-in service returned an error. Please try again in a moment.",
};

const AuthErrorHashWatcher = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const raw = window.location.hash?.replace(/^#/, "");
    if (!raw || !raw.includes("error")) return;

    const params = new URLSearchParams(raw);
    const error = params.get("error");
    if (!error) return;

    const code = params.get("error_code") ?? "";
    const description = params.get("error_description")?.replace(/\+/g, " ") ?? "";
    const message = MESSAGES[code] || MESSAGES[error] || description || "Sign-in failed. Please try again.";

    // Strip the hash so a refresh doesn't re-trigger the message.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    toast.error("Sign-in link could not be used", { description: message, duration: 10000 });
    navigate("/login", { replace: true, state: { authError: message } });
  }, [navigate, location.pathname]);

  return null;
};

export default AuthErrorHashWatcher;
