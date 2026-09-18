/**
 * Deploy-notes archive: keeps every exported verification PDF on the ops
 * machine so a prior report can be re-downloaded byte-for-byte without
 * re-running the checks.
 *
 * Blobs live in IndexedDB (localStorage cannot hold PDFs); each entry also
 * records the branding + run context so the list is readable at a glance.
 */

const DB_NAME = "seo-deploy-notes";
const DB_VERSION = 1;
const STORE = "pdfs";
export const MAX_ARCHIVE_ENTRIES = 30;

export interface ArchivedPdfMeta {
  id: string;
  filename: string;
  createdAt: string;
  size: number;
  title: string;
  company: string;
  /** Checklist completion at export time, e.g. "12/15". */
  progress: string;
  /** Automated-check summary at export time, e.g. "6/6 passing" or "not run". */
  checks: string;
  ranAt: string | null;
  /** Commit SHA (short) of the build that produced the report. */
  commit?: string;
  /** ISO build timestamp of that bundle. */
  builtAt?: string;
  branch?: string;

}

interface ArchivedPdfRecord extends ArchivedPdfMeta {
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open deploy-notes archive"));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Archive request failed"));
        t.oncomplete = () => db.close();
      }),
  );
}

function stripBlob({ blob: _blob, ...meta }: ArchivedPdfRecord): ArchivedPdfMeta {
  return meta;
}

/** Newest first. */
export async function listArchivedPdfs(): Promise<ArchivedPdfMeta[]> {
  try {
    const all = await tx<ArchivedPdfRecord[]>("readonly", (s) => s.getAll() as IDBRequest<ArchivedPdfRecord[]>);
    return all
      .map(stripBlob)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}

export async function saveArchivedPdf(
  blob: Blob,
  meta: Omit<ArchivedPdfMeta, "id" | "size" | "createdAt"> & { createdAt?: string },
): Promise<ArchivedPdfMeta> {
  const record: ArchivedPdfRecord = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: meta.createdAt ?? new Date().toISOString(),
    size: blob.size,
    filename: meta.filename,
    title: meta.title,
    company: meta.company,
    progress: meta.progress,
    checks: meta.checks,
    ranAt: meta.ranAt,
    commit: meta.commit,
    builtAt: meta.builtAt,
    branch: meta.branch,

    blob,
  };
  await tx("readwrite", (s) => s.put(record));
  await pruneArchive();
  return stripBlob(record);
}

/** Drops the oldest entries beyond MAX_ARCHIVE_ENTRIES so storage stays bounded. */
async function pruneArchive() {
  const all = await listArchivedPdfs();
  const stale = all.slice(MAX_ARCHIVE_ENTRIES);
  for (const entry of stale) {
    await tx("readwrite", (s) => s.delete(entry.id));
  }
}

export async function getArchivedPdfBlob(id: string): Promise<Blob | null> {
  try {
    const rec = await tx<ArchivedPdfRecord | undefined>(
      "readonly",
      (s) => s.get(id) as IDBRequest<ArchivedPdfRecord | undefined>,
    );
    return rec?.blob ?? null;
  } catch {
    return null;
  }
}

export async function deleteArchivedPdf(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

export async function clearArchivedPdfs(): Promise<void> {
  await tx("readwrite", (s) => s.clear());
}

/** Re-downloads a stored report without regenerating it. */
export async function downloadArchivedPdf(meta: ArchivedPdfMeta): Promise<boolean> {
  const blob = await getArchivedPdfBlob(meta.id);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = meta.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
