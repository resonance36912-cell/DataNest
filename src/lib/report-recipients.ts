/**
 * Saved recipient list for exported checklist PDFs.
 * Stored on this device only — no server round-trip.
 */

const STORAGE_KEY = "syncvision.report.recipients.v1";

export const MAX_RECIPIENTS = 25;

export interface Recipient {
  id: string;
  email: string;
  label: string;
  /** Whether this address receives the exported PDF. */
  selected: boolean;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.trim().length <= 255;
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

export function loadRecipients(): Recipient[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is Recipient => !!r && typeof r.email === "string")
      .map((r) => ({
        id: typeof r.id === "string" ? r.id : crypto.randomUUID(),
        email: normalise(r.email),
        label: typeof r.label === "string" ? r.label.slice(0, 60) : "",
        selected: r.selected !== false,
      }))
      .slice(0, MAX_RECIPIENTS);
  } catch {
    return [];
  }
}

export function saveRecipients(list: Recipient[]): Recipient[] {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — keep in-memory only */
  }
  return list;
}

export interface AddResult {
  list: Recipient[];
  error: string | null;
}

export function addRecipient(list: Recipient[], email: string, label = ""): AddResult {
  const clean = normalise(email);
  if (clean === "") return { list, error: "Enter an email address." };
  if (!isValidEmail(clean)) return { list, error: "That is not a valid email address." };
  if (list.some((r) => r.email === clean)) return { list, error: "That address is already saved." };
  if (list.length >= MAX_RECIPIENTS)
    return { list, error: `You can save up to ${MAX_RECIPIENTS} addresses.` };

  const next = [
    ...list,
    { id: crypto.randomUUID(), email: clean, label: label.trim().slice(0, 60), selected: true },
  ];
  return { list: saveRecipients(next), error: null };
}

export function removeRecipient(list: Recipient[], id: string): Recipient[] {
  return saveRecipients(list.filter((r) => r.id !== id));
}

export function toggleRecipient(list: Recipient[], id: string): Recipient[] {
  return saveRecipients(list.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));
}

export function setAllSelected(list: Recipient[], selected: boolean): Recipient[] {
  return saveRecipients(list.map((r) => ({ ...r, selected })));
}

export function clearRecipients(): Recipient[] {
  return saveRecipients([]);
}

export function selectedRecipients(list: Recipient[]): Recipient[] {
  return list.filter((r) => r.selected);
}
