import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "..");
export function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
export function assert(condition, message) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exit(1);
  }
}
export function ok(message) {
  console.log("OK:", message);
}
