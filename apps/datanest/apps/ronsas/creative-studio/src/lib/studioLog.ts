// Lightweight pub/sub log store for the Studio pipeline.
// Lives outside React so log calls work from any closure (watchdog timers,
// edge-function callbacks, retry handlers). Components subscribe via the
// useStudioLogs hook.

import { useEffect, useState } from "react";

export type StudioLogLevel = "info" | "success" | "warn" | "error";
export type StudioLogStep = "scrape" | "analyze" | "generate" | "system";

export interface StudioLogEntry {
  id: string;
  ts: number; // epoch ms
  level: StudioLogLevel;
  step: StudioLogStep;
  message: string;
  details?: string; // optional payload (stack, JSON snippet, etc)
}

const MAX_LOGS = 500;

let logs: StudioLogEntry[] = [];
const listeners = new Set<(l: StudioLogEntry[]) => void>();

const emit = () => {
  for (const fn of listeners) fn(logs);
};

const subscribe = (fn: (l: StudioLogEntry[]) => void) => {
  listeners.add(fn);
  fn(logs);
  return () => { listeners.delete(fn); };
};

const newId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as Crypto).randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

export const studioLog = {
  push(level: StudioLogLevel, step: StudioLogStep, message: string, details?: unknown) {
    const entry: StudioLogEntry = {
      id: newId(),
      ts: Date.now(),
      level,
      step,
      message,
      details:
        details === undefined
          ? undefined
          : typeof details === "string"
            ? details
            : (() => { try { return JSON.stringify(details, null, 2); } catch { return String(details); } })(),
    };
    logs = [...logs, entry].slice(-MAX_LOGS);
    emit();
  },
  info(step: StudioLogStep, message: string, details?: unknown) { this.push("info", step, message, details); },
  success(step: StudioLogStep, message: string, details?: unknown) { this.push("success", step, message, details); },
  warn(step: StudioLogStep, message: string, details?: unknown) { this.push("warn", step, message, details); },
  error(step: StudioLogStep, message: string, details?: unknown) { this.push("error", step, message, details); },
  clear() { logs = []; emit(); },
  snapshot(): StudioLogEntry[] { return logs; },
};

export function useStudioLogs(): StudioLogEntry[] {
  const [state, setState] = useState<StudioLogEntry[]>(logs);
  useEffect(() => subscribe(setState), []);
  return state;
}

// Helpers for copy/export.
export function formatLog(e: StudioLogEntry): string {
  const t = new Date(e.ts).toISOString().replace("T", " ").replace("Z", "");
  const base = `[${t}] [${e.level.toUpperCase()}] [${e.step}] ${e.message}`;
  return e.details ? `${base}\n${e.details}` : base;
}

export function formatLogs(entries: StudioLogEntry[]): string {
  return entries.map(formatLog).join("\n");
}
