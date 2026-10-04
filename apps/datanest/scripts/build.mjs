import { spawn } from "node:child_process";
import { access, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const staticExport = process.env.DATANEST_STATIC_EXPORT === "true";
const apiSource = path.join(root, "src", "app", "api", "aipi");
const excludedRoot = path.join(root, ".next-static-export");
const excludedApi = path.join(excludedRoot, "aipi");

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function runNextBuild() {
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, "build"], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}

let moved = false;
let exitCode = 1;

try {
  if (staticExport && await exists(apiSource)) {
    await rm(excludedRoot, { recursive: true, force: true });
    await mkdir(excludedRoot, { recursive: true });
    await rename(apiSource, excludedApi);
    moved = true;
  }

  if (staticExport && moved) {
    console.log("Static export: excluding server-only AiPI route handlers from the Pages build.");
  }

  exitCode = await runNextBuild();
} finally {
  if (moved) {
    await mkdir(path.dirname(apiSource), { recursive: true });
    await rename(excludedApi, apiSource);
    await rm(excludedRoot, { recursive: true, force: true });
  }
}

process.exitCode = exitCode;
