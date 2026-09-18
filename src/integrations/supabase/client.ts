// Sovereign-local compatibility client for Resonance Creative Studio.
// No hosted Supabase endpoint is contacted in this build. The subset of the
// Supabase API used by the UI is implemented with localStorage / browser memory.

const LOCAL_USER_ID = "sovereign-local-user";
const LOCAL_USER = {
  id: LOCAL_USER_ID,
  email: "local@resonance.invalid",
  email_confirmed_at: new Date(0).toISOString(),
  confirmed_at: new Date(0).toISOString(),
  app_metadata: { provider: "local", providers: ["local"] },
  user_metadata: { name: "Sovereign Local User" },
  identities: [{ provider: "local" }],
};
const LOCAL_SESSION = {
  access_token: "sovereign-local-token",
  refresh_token: "sovereign-local-refresh",
  token_type: "bearer",
  expires_in: 315360000,
  expires_at: Math.floor(Date.now() / 1000) + 315360000,
  user: LOCAL_USER,
};

type LocalResult = { data: any; error: any; count?: number | null };
type Filter = { key: string; value: any; kind: "eq" | "in" };

function keyForTable(table: string) { return `resonance:creative-studio:table:${table}`; }
function readRows(table: string): any[] {
  try {
    const raw = localStorage.getItem(keyForTable(table));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeRows(table: string, rows: any[]) {
  try { localStorage.setItem(keyForTable(table), JSON.stringify(rows)); } catch { /* quota */ }
}
function nowIso() { return new Date().toISOString(); }
function makeId() { return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

class LocalQuery implements PromiseLike<LocalResult> {
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: any = null;
  private filters: Filter[] = [];
  private singleMode: "none" | "single" | "maybe" = "none";
  private orderSpec: { key: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;
  private onConflict: string | null = null;
  constructor(private table: string) {}
  select(_columns: string = "*") { return this; }
  insert(payload: any) { this.op = "insert"; this.payload = payload; return this; }
  upsert(payload: any, opts?: { onConflict?: string }) { this.op = "upsert"; this.payload = payload; this.onConflict = opts?.onConflict ?? null; return this; }
  update(payload: any) { this.op = "update"; this.payload = payload; return this; }
  delete() { this.op = "delete"; return this; }
  eq(key: string, value: any) { this.filters.push({ key, value, kind: "eq" }); return this; }
  in(key: string, value: any[]) { this.filters.push({ key, value, kind: "in" }); return this; }
  order(key: string, opts?: { ascending?: boolean }) { this.orderSpec = { key, ascending: opts?.ascending !== false }; return this; }
  limit(n: number) { this.limitCount = n; return this; }
  single() { this.singleMode = "single"; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }
  private matches(row: any) {
    return this.filters.every((f) => f.kind === "eq" ? row?.[f.key] === f.value : Array.isArray(f.value) && f.value.includes(row?.[f.key]));
  }
  private async resolve(): Promise<LocalResult> {
    let rows = readRows(this.table);
    const matched = rows.filter((r) => this.matches(r));
    let data: any = null;
    if (this.op === "select") {
      let out = matched;
      if (this.orderSpec) {
        const { key, ascending } = this.orderSpec;
        out = [...out].sort((a, b) => String(a?.[key] ?? "").localeCompare(String(b?.[key] ?? "")) * (ascending ? 1 : -1));
      }
      if (this.limitCount != null) out = out.slice(0, this.limitCount);
      data = this.singleMode === "none" ? out : (out[0] ?? null);
    } else if (this.op === "insert") {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload];
      const created = incoming.map((r: any) => ({ id: r?.id ?? makeId(), user_id: r?.user_id ?? LOCAL_USER_ID, created_at: r?.created_at ?? nowIso(), updated_at: nowIso(), ...r }));
      rows.push(...created); writeRows(this.table, rows);
      data = this.singleMode === "none" ? created : created[0] ?? null;
    } else if (this.op === "upsert") {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload];
      const out: any[] = [];
      for (const r of incoming) {
        const conflict = this.onConflict && r?.[this.onConflict] != null ? rows.findIndex((x) => x?.[this.onConflict!] === r[this.onConflict!]) : -1;
        if (conflict >= 0) { rows[conflict] = { ...rows[conflict], ...r, updated_at: nowIso() }; out.push(rows[conflict]); }
        else { const created = { id: r?.id ?? makeId(), user_id: r?.user_id ?? LOCAL_USER_ID, created_at: nowIso(), updated_at: nowIso(), ...r }; rows.push(created); out.push(created); }
      }
      writeRows(this.table, rows); data = this.singleMode === "none" ? out : out[0] ?? null;
    } else if (this.op === "update") {
      const out: any[] = [];
      rows = rows.map((r) => this.matches(r) ? (out.push({ ...r, ...this.payload, updated_at: nowIso() }), out[out.length - 1]) : r);
      writeRows(this.table, rows); data = this.singleMode === "none" ? out : out[0] ?? null;
    } else if (this.op === "delete") {
      rows = rows.filter((r) => !this.matches(r)); writeRows(this.table, rows); data = null;
    }
    return { data, error: null, count: Array.isArray(data) ? data.length : data ? 1 : 0 };
  }
  then<TResult1 = LocalResult, TResult2 = never>(onfulfilled?: ((value: LocalResult) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    return this.resolve().then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}

function dataUrlFromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
}
function blobFromDataUrl(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(","); const mime = /data:([^;]+)/.exec(meta)?.[1] ?? "application/octet-stream";
  const bin = atob(b64 ?? ""); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], { type: mime });
}

const authListeners = new Set<(event: string, session: any) => void>();
const auth = {
  async getSession() { return { data: { session: LOCAL_SESSION }, error: null }; },
  async getUser() { return { data: { user: LOCAL_USER }, error: null }; },
  async refreshSession() { return { data: { session: LOCAL_SESSION, user: LOCAL_USER }, error: null }; },
  onAuthStateChange(cb: (event: string, session: any) => void) { authListeners.add(cb); queueMicrotask(() => cb("INITIAL_SESSION", LOCAL_SESSION)); return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } }; },
  async signOut() { return { error: null }; },
  async signInWithPassword() { return { data: { session: LOCAL_SESSION, user: LOCAL_USER }, error: null }; },
  async signUp() { return { data: { session: LOCAL_SESSION, user: LOCAL_USER }, error: null }; },
  async setSession() { return { data: { session: LOCAL_SESSION, user: LOCAL_USER }, error: null }; },
  async exchangeCodeForSession() { return { data: { session: LOCAL_SESSION, user: LOCAL_USER }, error: null }; },
  async updateUser() { return { data: { user: LOCAL_USER }, error: null }; },
  async resend() { return { data: {}, error: null }; },
  async resetPasswordForEmail() { return { data: {}, error: null }; },
};

function localBrief(body: any) {
  const sb = body?.sourceBrief ?? {};
  const instructions = String(body?.userInstructions ?? "").trim();
  const brand = String(sb.brandName ?? sb.productMeta?.brand ?? "Resonance");
  const product = String(sb.productMeta?.name ?? "Creative concept");
  const headline = String(sb.heroHeadline ?? product ?? "Create with Resonance");
  return {
    brand,
    headline,
    subheadline: String(sb.description ?? (instructions || "A sovereign-local creative generated on this device.")),
    keyPoints: Array.isArray(sb.features) && sb.features.length ? sb.features.slice(0, 5) : ["Local-first workflow", "Editable creative brief", "Private on-device project data"],
    targetAudience: "Your intended audience",
    callToAction: "Discover more",
    colorSuggestions: Array.isArray(sb.colors) && sb.colors.length ? sb.colors.slice(0, 4) : ["#7c3aed", "#ec4899", "#111827"],
    instructions: instructions || "Create a polished, clear campaign asset using the supplied brief.",
    tone: String(body?.style ?? "professional"),
    pricing: String(sb.pricing ?? ""),
  };
}

const functions = {
  async invoke(name: string, opts?: { body?: any }) {
    const body = opts?.body ?? {};
    if (name === "analyze-content") return { data: { success: true, brief: localBrief(body), local: true }, error: null };
    if (name === "health-check") return { data: { success: true, mode: "sovereign-local" }, error: null };
    if (name === "edit-poster") return { data: { success: true, editedImage: body.imageUrl ?? body.posterUrl ?? body.image ?? null, local: true }, error: null };
    if (name === "build-brand-dna") return { data: { success: true, dna: { name: body?.name ?? "Local Brand", colors: ["#7c3aed", "#ec4899"] }, local: true }, error: null };
    if (name === "analyze-moodboard") return { data: { success: true, analysis: { summary: "Local moodboard stored on this device." }, local: true }, error: null };
    return { data: { success: false, error: `${name} is disabled in sovereign-local preview mode.`, local: true }, error: null };
  },
};

const storage = {
  from(bucket: string) {
    const prefix = `resonance:creative-studio:storage:${bucket}:`;
    return {
      async upload(path: string, file: Blob) { try { localStorage.setItem(prefix + path, await dataUrlFromBlob(file)); return { data: { path }, error: null }; } catch (e: any) { return { data: null, error: e }; } },
      async download(path: string) { try { const v = localStorage.getItem(prefix + path); return v ? { data: blobFromDataUrl(v), error: null } : { data: null, error: new Error("Local file not found") }; } catch (e: any) { return { data: null, error: e }; } },
      getPublicUrl(path: string) { return { data: { publicUrl: localStorage.getItem(prefix + path) ?? "" } }; },
      async createSignedUrl(path: string, _seconds: number) { return { data: { signedUrl: localStorage.getItem(prefix + path) ?? "" }, error: null }; },
      async remove(paths: string[]) { for (const p of paths) localStorage.removeItem(prefix + p); return { data: paths, error: null }; },
    };
  },
};

export const supabase: any = {
  auth,
  functions,
  storage,
  from(table: string) { return new LocalQuery(table); },
};
