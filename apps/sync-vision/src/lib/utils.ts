import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Copy text to clipboard with a fallback for environments where
 * navigator.clipboard is unavailable or permission is denied.
 *
 * Behaviour matrix:
 *  - Modern secure-context browsers: uses async Clipboard API; on rejection
 *    silently retries via the textarea fallback.
 *  - Insecure context (http://, file://) or no Clipboard API: uses textarea
 *    + document.execCommand("copy").
 *  - iOS Safari: textarea.select() is a no-op on readonly inputs, so we
 *    use contentEditable + a Range/Selection and a 16px font-size to avoid
 *    the auto-zoom focus jump.
 *
 * Returns true if the copy was issued (async path) or succeeded (sync path),
 * false on hard failure. Callers should still surface an error toast when
 * false is returned.
 */
export function copyWithFallback(text: string): boolean {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof window !== "undefined" &&
    window.isSecureContext
  ) {
    try {
      navigator.clipboard.writeText(text).catch(() => {
        fallbackCopy(text);
      });
      return true;
    } catch {
      return fallbackCopy(text);
    }
  }
  return fallbackCopy(text);
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPadOS 13+ reports as Mac; detect via touch points.
  const iPadOS =
    ua.includes("Macintosh") &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS;
}

function fallbackCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.contentEditable = "true";
  // Position offscreen but keep it focusable; iOS won't copy hidden nodes.
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.padding = "0";
  textarea.style.border = "none";
  textarea.style.outline = "none";
  textarea.style.boxShadow = "none";
  textarea.style.background = "transparent";
  textarea.style.opacity = "0";
  // 16px prevents iOS Safari auto-zoom on focus.
  textarea.style.fontSize = "16px";

  const previouslyFocused = document.activeElement as HTMLElement | null;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  document.body.appendChild(textarea);

  try {
    if (isIOS()) {
      const range = document.createRange();
      range.selectNodeContents(textarea);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      textarea.setSelectionRange(0, text.length);
    } else {
      textarea.focus();
      textarea.select();
    }
    const success = document.execCommand("copy");
    return success;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
    try {
      window.scrollTo(scrollX, scrollY);
    } catch {
      /* jsdom and some embedded webviews don't implement scrollTo */
    }
    previouslyFocused?.focus?.();
  }
}
