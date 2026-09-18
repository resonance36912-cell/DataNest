#!/usr/bin/env node
/**
 * CI gate: production SSR serve check + crawler meta/redirect assertions.
 *
 * 1. builds the app (skip with SKIP_BUILD=1)
 * 2. serves the built Nitro Node server
 * 3. serve check — every public route must answer with the expected status
 * 4. Playwright HTTP assertions (canonical / robots / og:url / real 301s)
 *
 * Exits non-zero on the first regression so CI fails loudly.
 */
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

/**
 * Run logs. Everything this gate prints, plus the raw stdout/stderr of the
 * wrangler worker and the Playwright run, is mirrored to files here so CI can
 * upload them as artifacts when the e2e step fails.
 */
const LOG_DIR = process.env["TEST_LOG_DIR"] ?? "test-results/logs";
mkdirSync(LOG_DIR, { recursive: true });

const logFile = (name) =>
  createWriteStream(join(LOG_DIR, name), { flags: "w" });

const gateLog = logFile("ssr-gate.log");
const stamp = () => new Date().toISOString();

const PORT = Number(process.env["SSR_PORT"] ?? 8788);
const BASE = `http://127.0.0.1:${PORT}`;
const SERVER_ENTRY = join(".output", "server", "index.mjs");
const PUBLIC_DIR = join(".output", "public");

/** path → expected HTTP status in the production build. */
const SERVE_CHECK = {
  "/": 200,
  "/about": 200,
  "/contact": 200,
  "/features": 200,
  "/pricing": 200,
  "/privacy": 200,
  "/terms": 200,
  "/login": 200,
  "/robots.txt": 200,
  "/sitemap.xml": 200,
  "/upgrade": 301,
  "/checkout": 301,
  "/docs": 301,
  "/updates": 301,
  "/support": 301,
  "/this-route-does-not-exist": 404,
};

const log = (msg) => {
  console.log(`[ssr-gate] ${msg}`);
  gateLog.write(`${stamp()} [ssr-gate] ${msg}\n`);
};

const logError = (msg) => {
  console.error(`[ssr-gate] ${msg}`);
  gateLog.write(`${stamp()} [ssr-gate] ERROR ${msg}\n`);
};

function run(cmd, args, opts = {}) {
  const { logTo, ...spawnOpts } = opts;
  return new Promise((resolve, reject) => {
    // With logTo we pipe so output can be teed to both the console and the log
    // file; without it the child keeps inheriting the gate's streams.
    const child = spawn(cmd, args, {
      stdio: logTo ? ["ignore", "pipe", "pipe"] : "inherit",
      ...spawnOpts,
    });
    if (logTo) {
      const sink = logFile(logTo);
      sink.write(`${stamp()} $ ${cmd} ${args.join(" ")}\n`);
      child.stdout?.on("data", (d) => {
        process.stdout.write(d);
        sink.write(d);
      });
      child.stderr?.on("data", (d) => {
        process.stderr.write(d);
        sink.write(d);
      });
      child.on("exit", (code) => sink.end(`${stamp()} exit ${code}\n`));
    }
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)),
    );
  });
}

async function waitForServer(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/`, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not answer on ${BASE} in time`);
}

async function serveCheck() {
  const failures = [];
  for (const [path, expected] of Object.entries(SERVE_CHECK)) {
    let status = 0;
    try {
      status = (await fetch(`${BASE}${path}`, { redirect: "manual" })).status;
    } catch (err) {
      failures.push(`${path}: request failed (${err.message})`);
      continue;
    }
    if (status !== expected) {
      failures.push(`${path}: got ${status}, expected ${expected}`);
    } else {
      log(`ok  ${path} → ${status}`);
    }
  }
  if (failures.length) {
    throw new Error(`serve check failed:\n  ${failures.join("\n  ")}`);
  }
}

async function main() {
  if (process.env["SKIP_BUILD"] !== "1") {
    log("building production bundle…");
    await run("bun", ["run", "build"], { logTo: "build.log" });
  }

  if (!existsSync(SERVER_ENTRY)) {
    throw new Error(`${SERVER_ENTRY} missing - run bun run build first`);
  }

  // Crawler files must be emitted into the production public bundle.
  for (const artifact of [join(PUBLIC_DIR, "robots.txt"), join(PUBLIC_DIR, "sitemap.xml")]) {
    if (!existsSync(artifact)) {
      throw new Error(`${artifact} missing from the production build`);
    }
    log(`ok  built ${artifact}`);
  }


  log(`starting production Nitro server on ${BASE}...`);
  const server = spawn(process.execPath, [SERVER_ENTRY], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(PORT) },
  });

  // Server stdout/stderr (SSR runtime errors, request logs) -> artifact file.
  const serverLog = logFile("ssr-server.log");
  server.stdout?.on("data", (d) => {
    process.stdout.write(d);
    serverLog.write(d);
  });
  server.stderr?.on("data", (d) => {
    process.stderr.write(d);
    serverLog.write(d);
  });

  let exitCode = 0;
  try {
    await waitForServer();
    log("production server is up - running serve check");
    await serveCheck();

    log("running Playwright crawler assertions");
    await run(
      process.execPath,
      [join("node_modules", "@playwright", "test", "cli.js"), "test", "--config", "playwright.ssr.config.ts"],
      {
        env: { ...process.env, SSR_BASE_URL: BASE },
        logTo: "playwright.log",
      },
    );

    log("PASS — SSR routes, metadata and redirects are intact");
  } catch (err) {
    logError(`FAIL — ${err.message}`);
    if (err.stack) gateLog.write(`${err.stack}\n`);
    exitCode = 1;
  } finally {
    server.kill("SIGTERM");
    serverLog.end();
    log(`run logs written to ${LOG_DIR}/`);
    gateLog.end();
  }
  // Give the log streams a tick to flush before the process goes away.
  await new Promise((r) => setTimeout(r, 50));
  process.exit(exitCode);
}

main().catch((err) => {
  logError(`FAIL — ${err.message}`);
  gateLog.end();
  process.exit(1);
});
