import {
  DEFAULT_TEMPLATE,
  type ReportEmailTemplate,
} from "@/lib/report-email-template";

/**
 * Library of named report email templates so several message styles can be
 * kept side by side and swapped into the active editor.
 */

const STORAGE_KEY = "syncvision.report.email.templates.v1";
const ACTIVE_KEY = "syncvision.report.email.templates.active.v1";
const MAX_TEMPLATES = 20;

export interface SavedEmailTemplate {
  id: string;
  name: string;
  template: ReportEmailTemplate;
  updatedAt: string;
}

function newId(): string {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalise(tpl: Partial<ReportEmailTemplate> | undefined): ReportEmailTemplate {
  return {
    subject:
      typeof tpl?.subject === "string" ? tpl.subject : DEFAULT_TEMPLATE.subject,
    body: typeof tpl?.body === "string" ? tpl.body : DEFAULT_TEMPLATE.body,
    htmlBody:
      typeof tpl?.htmlBody === "string"
        ? tpl.htmlBody
        : DEFAULT_TEMPLATE.htmlBody,
    format: tpl?.format === "html" ? "html" : "text",
  };
}

export function listTemplates(): SavedEmailTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.id === "string" && typeof e.name === "string")
      .map((e) => ({
        id: e.id as string,
        name: (e.name as string).slice(0, 60),
        template: normalise(e.template),
        updatedAt:
          typeof e.updatedAt === "string" ? e.updatedAt : new Date().toISOString(),
      }))
      .slice(0, MAX_TEMPLATES);
  } catch {
    return [];
  }
}

function persist(list: SavedEmailTemplate[]): SavedEmailTemplate[] {
  const trimmed = list.slice(0, MAX_TEMPLATES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore quota */
  }
  return trimmed;
}

export function getActiveTemplateId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveTemplateId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

/** Creates a new named template and marks it active. */
export function createTemplate(
  name: string,
  template: ReportEmailTemplate,
): { list: SavedEmailTemplate[]; entry: SavedEmailTemplate } {
  const entry: SavedEmailTemplate = {
    id: newId(),
    name: (name.trim() || "Untitled template").slice(0, 60),
    template: normalise(template),
    updatedAt: new Date().toISOString(),
  };
  const list = persist([entry, ...listTemplates()]);
  setActiveTemplateId(entry.id);
  return { list, entry };
}

/** Overwrites the stored content of an existing template. */
export function updateTemplate(
  id: string,
  template: ReportEmailTemplate,
): SavedEmailTemplate[] {
  return persist(
    listTemplates().map((e) =>
      e.id === id
        ? { ...e, template: normalise(template), updatedAt: new Date().toISOString() }
        : e,
    ),
  );
}

export function renameTemplate(id: string, name: string): SavedEmailTemplate[] {
  const clean = (name.trim() || "Untitled template").slice(0, 60);
  return persist(
    listTemplates().map((e) => (e.id === id ? { ...e, name: clean } : e)),
  );
}

export function deleteTemplate(id: string): SavedEmailTemplate[] {
  const list = persist(listTemplates().filter((e) => e.id !== id));
  if (getActiveTemplateId() === id) setActiveTemplateId(list[0]?.id ?? null);
  return list;
}
