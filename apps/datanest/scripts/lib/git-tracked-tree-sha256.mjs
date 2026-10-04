import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export function gitTrackedTreeSha256(pathspec, ref = "HEAD") {
  const normalizedRoot = String(pathspec || "").replace(/^\.\//, "").replace(/\/$/, "");
  if (!normalizedRoot) throw new Error("A Git pathspec root is required.");

  const listing = execFileSync(
    "git",
    ["ls-tree", "-r", "-z", "--full-tree", ref, "--", normalizedRoot],
    { encoding: "utf8" },
  );

  const entries = listing
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const tab = record.indexOf("\t");
      if (tab < 0) throw new Error("Unexpected git ls-tree record.");
      const [mode, type, object] = record.slice(0, tab).split(" ");
      const path = record.slice(tab + 1);
      return { mode, type, object, path };
    })
    .filter((entry) => entry.type === "blob")
    .sort((a, b) => a.path.localeCompare(b.path));

  if (!entries.length) throw new Error(`No Git-tracked files found under ${normalizedRoot}.`);

  const hash = createHash("sha256");
  for (const entry of entries) {
    const relativePath = entry.path.startsWith(`${normalizedRoot}/`)
      ? entry.path.slice(normalizedRoot.length + 1)
      : entry.path;
    const pathBytes = Buffer.from(relativePath, "utf8");
    const fileBytes = execFileSync("git", ["cat-file", "blob", entry.object], { encoding: null });
    hash.update(Buffer.from(String(pathBytes.byteLength) + ":"));
    hash.update(pathBytes);
    hash.update(Buffer.from(":"));
    hash.update(fileBytes);
    hash.update(Buffer.from("\n"));
  }
  return hash.digest("hex");
}
