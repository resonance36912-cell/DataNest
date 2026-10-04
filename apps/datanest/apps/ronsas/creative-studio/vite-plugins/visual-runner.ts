import type { Plugin, ViteDevServer } from "vite";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";

/**
 * Dev-only endpoint that runs the provider-card visual suite with ad-hoc
 * `VISUAL_*` overrides and streams stdout/stderr back as Server-Sent Events.
 *
 * Used by /admin/visual-thresholds ("Run locally"). It never ships to
 * production — the plugin is only registered when mode === "development", so
 * the endpoint simply 404s in a built app and the UI degrades to "copy the
 * command" mode.
 */

const ROUTE = "/__visual-run";
const ENGINES = ["chromium", "firefox", "webkit"] as const;

/** Only forward env keys we control, with numeric-safe values. */
function collectOverrides(url: URL): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (!/^VISUAL_[A-Z0-9_]+$/.test(key)) continue;
    if (!/^[0-9]*\.?[0-9]+$/.test(value)) continue;
    env[key] = value;
  }
  return env;
}

function pickEngines(url: URL): string[] {
  const raw = (url.searchParams.get("engines") ?? "").split(",").map((e) => e.trim());
  const picked = ENGINES.filter((e) => raw.includes(e));
  return picked.length ? picked : ["chromium"];
}

export function visualRunnerPlugin(): Plugin {
  let running: ChildProcessWithoutNullStreams | null = null;

  return {
    name: "resonance-visual-runner",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(ROUTE, (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");

        if (url.pathname === "/status") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ available: true, running: running !== null }));
          return;
        }

        if (url.pathname === "/cancel") {
          running?.kill("SIGTERM");
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ cancelled: true }));
          return;
        }

        if (running) {
          res.statusCode = 409;
          res.end("A visual run is already in progress");
          return;
        }

        const overrides = collectOverrides(url);
        const engines = pickEngines(url);
        const update = url.searchParams.get("update") === "1";

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });

        const send = (event: string, data: unknown) => {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        const args = [
          "playwright",
          "test",
          "e2e/provider-card-visual.spec.ts",
          ...engines.map((e) => `--project=${e}`),
          "--reporter=list",
          ...(update ? ["--update-snapshots"] : []),
        ];

        const envPairs = Object.entries(overrides).map(([k, v]) => `${k}=${v}`);
        send("start", {
          command: [...envPairs, "bunx", ...args].join(" "),
          engines,
          overrides,
          update,
        });

        const child = spawn("bunx", args, {
          cwd: path.resolve(server.config.root),
          env: { ...process.env, ...overrides, FORCE_COLOR: "0", CI: "1" },
        }) as ChildProcessWithoutNullStreams;
        running = child;

        const pipe = (stream: NodeJS.ReadableStream, channel: "stdout" | "stderr") => {
          let buffer = "";
          stream.setEncoding("utf8");
          stream.on("data", (chunk: string) => {
            buffer += chunk;
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) send("log", { channel, line });
          });
          stream.on("end", () => {
            if (buffer.trim()) send("log", { channel, line: buffer });
          });
        };

        pipe(child.stdout, "stdout");
        pipe(child.stderr, "stderr");

        // Keep proxies from closing an idle stream during long Playwright runs.
        const ping = setInterval(() => res.write(": ping\n\n"), 15_000);

        const finish = (code: number | null, signal: NodeJS.Signals | null) => {
          clearInterval(ping);
          running = null;
          send("done", { exitCode: code, signal, ok: code === 0 });
          res.end();
        };

        child.on("error", (err) => {
          send("log", { channel: "stderr", line: `Failed to start Playwright: ${err.message}` });
          finish(1, null);
        });
        child.on("close", finish);

        req.on("close", () => {
          if (running === child) child.kill("SIGTERM");
          clearInterval(ping);
        });
      });
    },
  };
}
