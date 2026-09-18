// Brand DNA template data + saved-template CRUD.
// Built-ins are shipped with the app; saved templates are per-user in Supabase.

import { Leaf, Cpu, Brush, BookmarkPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface DnaTemplateData {
  brand_name: string;
  website_url: string;
  tagline: string;
  mission: string;
  voice_tone: string;
  audience: string;
  competitors: string;
  extra_guidelines: string;
  value_props: string[];
  voice_words_use: string[];
  voice_words_avoid: string[];
}

export interface BuiltInTemplate {
  id: string;
  label: string;
  blurb: string;
  icon: typeof Leaf;
  accent: string;
  data: DnaTemplateData;
  builtIn: true;
}

export interface SavedTemplate {
  id: string;
  label: string;
  blurb: string;
  icon: typeof BookmarkPlus;
  accent: string;
  data: DnaTemplateData;
  builtIn: false;
  updated_at: string;
}

export type DnaTemplate = BuiltInTemplate | SavedTemplate;

export const EMPTY_TEMPLATE_DATA: DnaTemplateData = {
  brand_name: "",
  website_url: "",
  tagline: "",
  mission: "",
  voice_tone: "",
  audience: "",
  competitors: "",
  extra_guidelines: "",
  value_props: [],
  voice_words_use: [],
  voice_words_avoid: [],
};

export const BUILTIN_TEMPLATES: BuiltInTemplate[] = [
  {
    id: "wellness",
    label: "Wellness & natural goods",
    blurb: "Calm, rooted, conscious — for skincare, supplements, herbal, slow-living brands.",
    icon: Leaf,
    accent: "from-emerald-500/20 to-transparent ring-emerald-400/30",
    builtIn: true,
    data: {
      brand_name: "Aurum Naturals",
      website_url: "https://aurumnaturals.co.za",
      tagline: "Slow-crafted skincare, rooted in the Karoo.",
      mission:
        "We craft small-batch botanical skincare from indigenous South African plants, so your daily ritual reconnects you to land and self.",
      voice_tone: "calm, confident, conscious, warm",
      audience: "SA wellness-conscious women 28–45 who read ingredient labels and value provenance over hype.",
      competitors: "Africology, Esse Skincare — we differ in single-origin Karoo sourcing and refillable glass.",
      extra_guidelines: "Always name the plant + region. Never claim 'cures' or 'miracle'. POPIA-conscious — no medical claims.",
      value_props: [
        "Single-origin Karoo botanicals",
        "Refillable amber glass — zero plastic",
        "POPIA-friendly, no email harvesting",
        "ZAR-priced, shipped from Cape Town",
      ],
      voice_words_use: ["rooted", "crafted", "conscious", "ritual", "indigenous", "small-batch"],
      voice_words_avoid: ["amazing", "revolutionary", "game-changing", "miracle", "anti-aging"],
    },
  },
  {
    id: "saas",
    label: "B2B SaaS / fintech",
    blurb: "Precise, useful, no fluff — for tools, dashboards, fintech, productivity products.",
    icon: Cpu,
    accent: "from-cyan-500/20 to-transparent ring-cyan-400/30",
    builtIn: true,
    data: {
      brand_name: "Ledgerly",
      website_url: "https://ledgerly.app",
      tagline: "Bookkeeping that closes itself.",
      mission:
        "We give SA small businesses the same automated finance ops that startups in Cape Town's V&A enjoy — without the seat-based pricing.",
      voice_tone: "clear, precise, helpful, dry-witted",
      audience:
        "Owner-operators of SA businesses doing R2m–R50m/year who currently waste 6 hours a month on Xero reconciliations.",
      competitors: "Xero, Sage One — we differ in same-day SARS-ready exports and a flat ZAR price.",
      extra_guidelines: "Quote real numbers. Never 'AI-powered' as a sentence. Always end CTAs with a verb. POPIA-aligned data residency.",
      value_props: [
        "Auto-reconciles 95% of transactions",
        "SARS VAT201 in one click",
        "Flat R349/month, no per-seat fees",
        "Data hosted in Johannesburg",
      ],
      voice_words_use: ["close", "reconcile", "ship", "clear", "ready", "calm"],
      voice_words_avoid: ["leverage", "synergy", "revolutionary", "AI-powered", "best-in-class", "world-class"],
    },
  },
  {
    id: "creative",
    label: "Creative studio / agency",
    blurb: "Distinct, curated, opinionated — for design studios, photographers, makers.",
    icon: Brush,
    accent: "from-fuchsia-500/20 to-transparent ring-fuchsia-400/30",
    builtIn: true,
    data: {
      brand_name: "Field & Form",
      website_url: "https://fieldandform.studio",
      tagline: "A studio for brands with a point of view.",
      mission:
        "We partner with founders who'd rather be remembered than agreed with — building identity systems that survive their first hire.",
      voice_tone: "considered, direct, playful, refined",
      audience: "Founders of values-led SA brands raising their seed or first growth round, ready to retire their Canva era.",
      competitors: "Generic Fiverr designers and full-service agencies — we sit between, owner-led with senior-only work.",
      extra_guidelines: "Show, don't tell. Lead with the work. Never call ourselves 'passionate'. No stock-photo people on landing pages.",
      value_props: [
        "Senior designers only — no juniors hidden behind a PM",
        "Identity systems delivered in 4 weeks",
        "Fixed ZAR project pricing",
        "Cape Town based, working SAST hours",
      ],
      voice_words_use: ["considered", "crafted", "deliberate", "distinct", "refined", "shift"],
      voice_words_avoid: ["passionate", "amazing", "world-class", "synergy", "disruptive", "game-changer"],
    },
  },
];

// Coerce arbitrary stored JSON back into the strict DnaTemplateData shape.
export function normalizeTemplateData(raw: unknown): DnaTemplateData {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
  const arr = (k: string) =>
    Array.isArray(r[k]) ? (r[k] as unknown[]).map((x) => String(x).trim()).filter(Boolean) : [];
  return {
    brand_name: str("brand_name"),
    website_url: str("website_url"),
    tagline: str("tagline"),
    mission: str("mission"),
    voice_tone: str("voice_tone"),
    audience: str("audience"),
    competitors: str("competitors"),
    extra_guidelines: str("extra_guidelines"),
    value_props: arr("value_props"),
    voice_words_use: arr("voice_words_use"),
    voice_words_avoid: arr("voice_words_avoid"),
  };
}

export async function listSavedTemplates(): Promise<SavedTemplate[]> {
  const { data, error } = await supabase
    .from("brand_dna_templates")
    .select("id, name, data, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.name,
    blurb: "Your saved template",
    icon: BookmarkPlus,
    accent: "from-primary/15 to-transparent ring-primary/30",
    data: normalizeTemplateData(row.data),
    builtIn: false as const,
    updated_at: row.updated_at,
  }));
}

export async function saveTemplate(name: string, data: DnaTemplateData): Promise<SavedTemplate> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Not signed in");
  const { data: row, error } = await supabase
    .from("brand_dna_templates")
    .insert({ user_id: uid, name, data: data as unknown as never })
    .select("id, name, data, updated_at")
    .single();
  if (error) throw error;
  return {
    id: row.id,
    label: row.name,
    blurb: "Your saved template",
    icon: BookmarkPlus,
    accent: "from-primary/15 to-transparent ring-primary/30",
    data: normalizeTemplateData(row.data),
    builtIn: false as const,
    updated_at: row.updated_at,
  };
}

export class TemplateConflictError extends Error {
  current: SavedTemplate;
  constructor(current: SavedTemplate) {
    super("Template was modified by another edit");
    this.name = "TemplateConflictError";
    this.current = current;
  }
}

export async function fetchSavedTemplate(id: string): Promise<SavedTemplate | null> {
  const { data, error } = await supabase
    .from("brand_dna_templates")
    .select("id, name, data, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    label: data.name,
    blurb: "Your saved template",
    icon: BookmarkPlus,
    accent: "from-primary/15 to-transparent ring-primary/30",
    data: normalizeTemplateData(data.data),
    builtIn: false as const,
    updated_at: data.updated_at,
  };
}

/**
 * Optimistic update. When `expectedUpdatedAt` is provided, the row is only
 * written if its `updated_at` still matches. On mismatch, throws
 * TemplateConflictError carrying the latest server state so the caller can
 * prompt the user (keep mine / merge / restore).
 *
 * Returns the new `updated_at` so the caller can refresh its base version.
 */
export async function updateSavedTemplate(
  id: string,
  patch: { name?: string; data?: DnaTemplateData },
  expectedUpdatedAt?: string,
): Promise<string> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.data !== undefined) update.data = patch.data;

  let q = supabase.from("brand_dna_templates").update(update as never).eq("id", id);
  if (expectedUpdatedAt) q = q.eq("updated_at", expectedUpdatedAt);

  const { data: rows, error } = await q.select("id, name, data, updated_at");
  if (error) throw error;

  if (!rows || rows.length === 0) {
    const current = await fetchSavedTemplate(id);
    if (!current) throw new Error("Template no longer exists");
    if (expectedUpdatedAt && current.updated_at !== expectedUpdatedAt) {
      throw new TemplateConflictError(current);
    }
    throw new Error("Update failed — no row matched");
  }

  return rows[0].updated_at as string;
}

export async function deleteSavedTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("brand_dna_templates").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Version history ----------

export interface TemplateVersion {
  id: string;
  template_id: string;
  name: string;
  data: DnaTemplateData;
  created_at: string;
}

export async function listTemplateVersions(templateId: string): Promise<TemplateVersion[]> {
  const { data, error } = await supabase
    .from("brand_dna_template_versions")
    .select("id, template_id, name, data, created_at")
    .eq("template_id", templateId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    template_id: row.template_id,
    name: row.name,
    data: normalizeTemplateData(row.data),
    created_at: row.created_at,
  }));
}

export async function deleteTemplateVersion(id: string): Promise<void> {
  const { error } = await supabase.from("brand_dna_template_versions").delete().eq("id", id);
  if (error) throw error;
}

// Restore: write the version's name + data back onto the template.
// The BEFORE UPDATE trigger snapshots the current state as a new version automatically.
export async function restoreTemplateVersion(
  templateId: string,
  version: TemplateVersion,
): Promise<void> {
  await updateSavedTemplate(templateId, { name: version.name, data: version.data });
}

// ---------- Field-level diff helpers (for the UI) ----------

const SCALAR_FIELDS: Array<keyof DnaTemplateData> = [
  "brand_name",
  "website_url",
  "tagline",
  "mission",
  "voice_tone",
  "audience",
  "competitors",
  "extra_guidelines",
];

const ARRAY_FIELDS: Array<keyof DnaTemplateData> = [
  "value_props",
  "voice_words_use",
  "voice_words_avoid",
];

export interface FieldDiff {
  field: keyof DnaTemplateData | "__name__";
  label: string;
  changed: boolean;
  before: string;
  after: string;
}

const FIELD_LABELS: Record<string, string> = {
  __name__: "Template name",
  brand_name: "Brand name",
  website_url: "Website",
  tagline: "Tagline",
  mission: "Mission",
  voice_tone: "Voice / tone",
  audience: "Audience",
  competitors: "Competitors",
  extra_guidelines: "Extra guidelines",
  value_props: "Value propositions",
  voice_words_use: "Words to use",
  voice_words_avoid: "Words to avoid",
};

export function diffTemplate(
  a: { name: string; data: DnaTemplateData },
  b: { name: string; data: DnaTemplateData },
): FieldDiff[] {
  const out: FieldDiff[] = [];
  out.push({
    field: "__name__",
    label: FIELD_LABELS.__name__,
    changed: a.name !== b.name,
    before: a.name,
    after: b.name,
  });
  for (const f of SCALAR_FIELDS) {
    const before = (a.data[f] as string) ?? "";
    const after = (b.data[f] as string) ?? "";
    out.push({
      field: f,
      label: FIELD_LABELS[f],
      changed: before !== after,
      before,
      after,
    });
  }
  for (const f of ARRAY_FIELDS) {
    const before = ((a.data[f] as string[]) ?? []).join("\n");
    const after = ((b.data[f] as string[]) ?? []).join("\n");
    out.push({
      field: f,
      label: FIELD_LABELS[f],
      changed: before !== after,
      before,
      after,
    });
  }
  return out;
}

export function summarizeDiff(diffs: FieldDiff[]): string {
  const changed = diffs.filter((d) => d.changed);
  if (changed.length === 0) return "No changes";
  if (changed.length <= 3) return changed.map((d) => d.label).join(", ");
  return `${changed.slice(0, 3).map((d) => d.label).join(", ")} +${changed.length - 3} more`;
}
