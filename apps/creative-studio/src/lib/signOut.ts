// Shared, bullet-proof sign-out used by every nav.
// Flush the Studio draft first, fire-and-forget the server call,
// purge client-side caches/storage (preserving drafts), then hard-redirect.
import { supabase } from "@/integrations/supabase/client";
import { isDraftKey } from "@/lib/studioDraft";

async function clearBrowserCaches() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) {
    console.warn("Cache clear failed:", e);
  }
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (e) {
    console.warn("SW unregister failed:", e);
  }
  try {
    const anyIDB = indexedDB as unknown as {
      databases?: () => Promise<{ name?: string }[]>;
    };
    if (anyIDB.databases) {
      const dbs = await anyIDB.databases();
      await Promise.all(
        dbs
          .map((d) => d.name)
          .filter((n): n is string => !!n)
          .map(
            (name) =>
              new Promise<void>((resolve) => {
                const req = indexedDB.deleteDatabase(name);
                req.onsuccess = req.onerror = req.onblocked = () => resolve();
              })
          )
      );
    }
  } catch (e) {
    console.warn("IndexedDB clear failed:", e);
  }
}

function purgeLocalStorageExceptDrafts() {
  try {
    const keep: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && isDraftKey(key)) {
        const v = localStorage.getItem(key);
        if (v !== null) keep[key] = v;
      }
    }
    localStorage.clear();
    for (const [k, v] of Object.entries(keep)) localStorage.setItem(k, v);
  } catch {}
}

export function signOutAndRedirect(redirectTo: string = "/") {
  // 1. Flush the active Studio draft (if any) BEFORE we touch storage.
  try {
    window.__resonanceSaveDraft?.();
  } catch (e) {
    console.warn("Draft flush failed:", e);
  }

  // 2. Fire-and-forget Supabase sign-out (can hang on stale sessions).
  try {
    supabase.auth
      .signOut({ scope: "local" })
      .catch((e) => console.error("Sign out error:", e));
  } catch (e) {
    console.error("Sign out error:", e);
  }

  // 3. Purge storage but preserve per-user drafts so users can resume.
  purgeLocalStorageExceptDrafts();
  try {
    sessionStorage.clear();
  } catch {}

  // 4. Cookies (best effort, non-HttpOnly only).
  try {
    document.cookie.split(";").forEach((c) => {
      const name = c.split("=")[0].trim();
      if (!name) return;
      const base = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      document.cookie = base;
      document.cookie = `${base}; domain=${window.location.hostname}`;
      const parts = window.location.hostname.split(".");
      if (parts.length > 1) {
        document.cookie = `${base}; domain=.${parts.slice(-2).join(".")}`;
      }
    });
  } catch {}

  // 5. Async caches + SW + IDB, then hard reload to a fresh app shell.
  void clearBrowserCaches().finally(() => {
    window.location.replace(redirectTo);
  });
}
