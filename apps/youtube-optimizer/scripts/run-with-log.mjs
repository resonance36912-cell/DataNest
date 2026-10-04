#!/usr/bin/env node
/**
 * Tee wrapper: runs a command, streams its stdout/stderr to the console, and
 * mirrors both into a log file under TEST_LOG_DIR (default test-results/logs).
 *
 * CI uploads that directory as an artifact when the test steps fail, so a red
 * run keeps the full console output — not just the truncated step log.
 *
 * Usage: node scripts/run-with-log.mjs <log-name> <cmd> [args...]
 */
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const [logName, cmd, ...args] = process.argv.slice(2);

if (!logName || !cmd) {
  console.error(
    "usage: node scripts/run-with-log.mjs <log-name> <cmd> [args...]",
  );
  process.exit(2);
}

const logDir = process.env["TEST_LOG_DIR"] ?? "test-results/logs";
mkdirSync(logDir, { recursive: true });

const sink = createWriteStream(join(logDir, logName), { flags: "w" });
const stamp = () => new Date().toISOString();
sink.write(`${stamp()} $ ${cmd} ${args.join(" ")}\n`);

const windowsBunx = process.platform === "win32" && cmd === "bunx";
const executable = windowsBunx ? "bun" : cmd;
const spawnArgs = windowsBunx ? ["x", ...args] : args;

const child = spawn(executable, spawnArgs, {
  stdio: ["inherit", "pipe", "pipe"],
  env: process.env,
});

child.stdout.on("data", (d) => {
  process.stdout.write(d);
  sink.write(d);
});
child.stderr.on("data", (d) => {
  process.stderr.write(d);
  sink.write(d);
});

child.on("error", (err) => {
  process.stderr.write(`${err.message}\n`);
  sink.end(`${stamp()} spawn error: ${err.message}\n`, () => process.exit(1));
});

child.on("exit", (code, signal) => {
  const exitCode = code ?? (signal ? 1 : 0);
  sink.end(`${stamp()} exit ${exitCode}${signal ? ` (${signal})` : ""}\n`, () =>
    process.exit(exitCode),
  );
});
