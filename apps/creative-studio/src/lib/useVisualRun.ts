import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Client for the dev-only `/__visual-run` SSE endpoint (see
 * `vite-plugins/visual-runner.ts`). Streams Playwright output for the
 * provider-card visual suite so /admin/visual-thresholds can run diffs with the
 * overrides currently typed into the page.
 *
 * In a production build the endpoint does not exist, so `available` is false
 * and the UI falls back to copying the shell command.
 */

export const VISUAL_RUN_ENGINES = ["chromium", "firefox", "webkit"] as const;
export type VisualRunEngine = (typeof VISUAL_RUN_ENGINES)[number];

export interface VisualRunLine {
  id: number;
  channel: "stdout" | "stderr" | "meta";
  line: string;
}

export interface VisualRunOptions {
  env: Record<string, string>;
  engines: VisualRunEngine[];
  update?: boolean;
}

const MAX_LINES = 800;

export function useVisualRun() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<VisualRunLine[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/__visual-run/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { available?: boolean } | null) => {
        if (!cancelled) setAvailable(Boolean(data?.available));
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
      sourceRef.current?.close();
    };
  }, []);

  const push = useCallback((channel: VisualRunLine["channel"], line: string) => {
    setLines((prev) => {
      const next = [...prev, { id: counter.current++, channel, line }];
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
  }, []);

  const stop = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
    void fetch("/__visual-run/cancel").catch(() => {});
    setRunning(false);
  }, []);

  const start = useCallback(
    ({ env, engines, update }: VisualRunOptions) => {
      if (sourceRef.current) return;
      const params = new URLSearchParams(env);
      params.set("engines", engines.join(","));
      if (update) params.set("update", "1");

      setLines([]);
      setExitCode(null);
      setRunning(true);

      const source = new EventSource(`/__visual-run?${params.toString()}`);
      sourceRef.current = source;

      source.addEventListener("start", (event) => {
        const data = JSON.parse((event as MessageEvent).data) as { command: string };
        push("meta", `$ ${data.command}`);
      });

      source.addEventListener("log", (event) => {
        const data = JSON.parse((event as MessageEvent).data) as VisualRunLine;
        push(data.channel, data.line);
      });

      source.addEventListener("done", (event) => {
        const data = JSON.parse((event as MessageEvent).data) as { exitCode: number | null };
        setExitCode(data.exitCode ?? 1);
        push("meta", data.exitCode === 0 ? "✔ Suite passed" : `✖ Exited with ${data.exitCode}`);
        source.close();
        sourceRef.current = null;
        setRunning(false);
      });

      source.onerror = () => {
        if (!sourceRef.current) return;
        push("stderr", "Connection to the local runner was lost.");
        source.close();
        sourceRef.current = null;
        setRunning(false);
      };
    },
    [push],
  );

  const clear = useCallback(() => {
    setLines([]);
    setExitCode(null);
  }, []);

  return { available, running, lines, exitCode, start, stop, clear };
}
