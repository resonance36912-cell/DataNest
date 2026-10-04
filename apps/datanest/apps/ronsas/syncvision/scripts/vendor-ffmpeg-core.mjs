import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "node_modules", "@ffmpeg", "core", "dist", "esm");
const target = path.join(root, "public", "ffmpeg-core");
await mkdir(target, { recursive: true });

const expected = [
  ["ffmpeg-core.js", 100000],
  ["ffmpeg-core.wasm", 10000000],
];

for (const [name, minimumBytes] of expected) {
  const from = path.join(source, name);
  const info = await stat(from);
  if (!info.isFile() || info.size < minimumBytes) {
    throw new Error(`Invalid @ffmpeg/core asset ${name}: ${info.size} bytes`);
  }
  await copyFile(from, path.join(target, name));
  console.log(`Vendored ${name} (${info.size} bytes) from @ffmpeg/core 0.12.10.`);
}
