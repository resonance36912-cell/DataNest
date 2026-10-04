/**
 * Branding applied to the exported deploy-verification PDF so the file matches
 * the team's standard document format. Stored locally on the ops machine — the
 * logo is kept as a data URL because jsPDF needs the raw bytes at render time.
 */

export interface ChecklistBranding {
  /** Document heading. Falls back to the built-in title when blank. */
  title: string;
  /** Company / team name shown under the heading and in the page footer. */
  company: string;
  /** Optional logo as a data URL (PNG or JPEG). */
  logoDataUrl: string | null;
  /** Rendered logo width in points; height is derived from the aspect ratio. */
  logoWidth: number;
}

const KEY = "seo-deploy-checklist:branding:v1";

export const DEFAULT_BRANDING: ChecklistBranding = {
  title: "Sitemap & canonicalization verification",
  company: "",
  logoDataUrl: null,
  logoWidth: 90,
};

/** Keeps the stored payload comfortably under the localStorage quota. */
export const MAX_LOGO_BYTES = 400_000;

export function loadBranding(): ChecklistBranding {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_BRANDING;
    const parsed = JSON.parse(raw) as Partial<ChecklistBranding>;
    return { ...DEFAULT_BRANDING, ...parsed };
  } catch {
    return DEFAULT_BRANDING;
  }
}

export function saveBranding(next: ChecklistBranding): ChecklistBranding {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota or storage unavailable — branding stays in-memory this session */
  }
  return next;
}

export function clearBranding(): ChecklistBranding {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return DEFAULT_BRANDING;
}

/** Reads an image File into a data URL, rejecting non-images and oversized files. */
export function readLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|jpg)$/i.test(file.type)) {
      reject(new Error("Logo must be a PNG or JPEG image"));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      reject(new Error(`Logo must be under ${Math.round(MAX_LOGO_BYTES / 1000)} KB`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the logo file"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

/** jsPDF needs the format name; derive it from the data URL prefix. */
export function logoFormat(dataUrl: string): "PNG" | "JPEG" {
  return /^data:image\/png/i.test(dataUrl) ? "PNG" : "JPEG";
}
