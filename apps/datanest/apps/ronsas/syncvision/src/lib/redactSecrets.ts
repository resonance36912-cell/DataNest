/**
 * Redacts credentials and user-sensitive values from crash reports before
 * copying, downloading, or sharing them.
 *
 * The redactor is deliberately conservative: it never throws and every
 * removed value is replaced with a labelled placeholder so reports remain
 * useful for debugging.
 */

export interface RedactionOptions {
  /** Extra exact file names (basename) to strip from the report. */
  fileNames?: string[];
  /** Set false to keep full URLs (query strings will still be stripped). */
  redactUrls?: boolean;
  /** Set false to keep file names. */
  redactFileNames?: boolean;
}

const FILE_EXT_RE =
  /\b([\w.\-]{1,180})\.(mp3|wav|m4a|flac|ogg|aac|mp4|mov|webm|mkv|avi|png|jpe?g|webp|gif|svg|pdf|docx?|xlsx?|pptx?|zip|rar|7z|txt|csv|json|srt|vtt)\b/gi;

const URL_RE = /\bhttps?:\/\/[^\s"'<>()]+/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const SUPABASE_KEY_RE = /\b(sbp_[A-Za-z0-9]{20,}|sb_[A-Za-z0-9_-]{20,})\b/g;
const BEARER_RE = /\b(Bearer|Basic)\s+([A-Za-z0-9._\-+/=]{8,})/gi;
const COOKIE_HEADER_RE = /\b(Cookie|Set-Cookie)\s*:\s*([^\r\n]+)/gi;

const SENSITIVE_KEYS =
  "(authorization|auth|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|id[_-]?token|session|secret|password|passwd|pwd|client[_-]?secret|signature|sig|x-[a-z0-9-]*key)";
const KV_JSON_RE = new RegExp(`"(${SENSITIVE_KEYS})"\\s*:\\s*"([^"]+)"`, "gi");
const KV_PLAIN_RE = new RegExp(`\\b(${SENSITIVE_KEYS})\\s*[=:]\\s*([^\\s&,;"']+)`, "gi");

const SIGNED_PARAMS = new Set([
  "token", "signature", "sig", "x-amz-signature", "x-goog-signature",
  "x-ms-signature", "access_token", "auth", "key", "apikey", "api_key",
  "jwt", "se", "sv", "sp", "sr", "st", "skoid", "sktid", "skt", "ske",
  "sks", "skv", "spr",
]);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of Array.from(u.searchParams.keys())) {
      if (SIGNED_PARAMS.has(key.toLowerCase())) {
        u.searchParams.delete(key);
      }
    }
    const search = u.searchParams.toString();
    const truncatedSearch = search.length > 80 ? "?[QUERY_REDACTED]" : search ? `?${search}` : "";
    return `${u.origin}${u.pathname}${truncatedSearch}`;
  } catch {
    return "[URL_REDACTED]";
  }
}

export function redactSecrets(input: string, opts: RedactionOptions = {}): string {
  if (!input) return input;
  const { redactUrls = true, redactFileNames = true, fileNames = [] } = opts;
  let out = input;

  out = out.replace(COOKIE_HEADER_RE, (_m, name) => `${name}: [COOKIE_REDACTED]`);
  out = out.replace(BEARER_RE, (_m, scheme) => `${scheme} [TOKEN_REDACTED]`);
  out = out.replace(KV_JSON_RE, (_m, key) => `"${key}":"[REDACTED]"`);
  out = out.replace(KV_PLAIN_RE, (_m, key) => `${key}=[REDACTED]`);
  out = out.replace(JWT_RE, "[JWT_REDACTED]");
  out = out.replace(SUPABASE_KEY_RE, "[SUPABASE_KEY_REDACTED]");

  if (redactUrls) {
    out = out.replace(URL_RE, (m) => (m.length > 60 || /[?&]/.test(m) ? redactUrl(m) : m));
  }

  if (redactFileNames) {
    for (const name of fileNames) {
      if (!name) continue;
      out = out.replace(new RegExp(escapeRegex(name), "g"), "[FILENAME_REDACTED]");
    }
    out = out.replace(FILE_EXT_RE, (_m, _base, ext) => `[FILENAME_REDACTED].${ext.toLowerCase()}`);
  }

  return out;
}

/** Recursively redact strings inside a JSON-serialisable value. */
export function redactValue<T>(value: T, opts: RedactionOptions = {}): T {
  if (value == null) return value;
  if (typeof value === "string") return redactSecrets(value, opts) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactValue(v, opts)) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/^(authorization|cookie|set-cookie|password|secret|access[_-]?token|refresh[_-]?token|api[_-]?key|apikey)$/i.test(k)) {
        out[k] = "[REDACTED]";
        continue;
      }
      out[k] = redactValue(v, opts);
    }
    return out as unknown as T;
  }
  return value;
}
