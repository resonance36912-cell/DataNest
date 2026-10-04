import fs from "node:fs";

export function buildEvidence({ repository, ref, sha, prs }) {
  const canonicalRef = String(ref ?? "").replace(/^refs\/heads\//, "");
  const merged = prs.filter(
    (pr) => Boolean(pr?.merged_at) && pr?.base?.ref === canonicalRef
  );
  return {
    schemaVersion: "datanest-canonical-write-watchdog-v3",
    repository,
    ref,
    sha,
    associatedPullRequests: prs.map((pr) => ({
      number: pr?.number ?? null,
      state: pr?.state ?? null,
      merged_at: pr?.merged_at ?? null,
      base_ref: pr?.base?.ref ?? null
    })),
    mergedPullRequests: merged.map((pr) => ({
      number: pr?.number ?? null,
      merged_at: pr?.merged_at ?? null,
      base_ref: pr?.base?.ref ?? null
    })),
    result: merged.length > 0 ? "authorized-merge-provenance" : "canonical-write-anomaly"
  };
}

export function isAuthorized(evidence) {
  return evidence.result === "authorized-merge-provenance";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("Usage: node canonical-write-watchdog.mjs <associated-prs.json>");

  const prs = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const evidence = buildEvidence({
    repository: process.env.REPO,
    ref: process.env.REF,
    sha: process.env.SHA,
    prs: Array.isArray(prs) ? prs : []
  });

  const output = process.env.OUTPUT_PATH ?? "canonical-write/state/result.json";
  fs.mkdirSync(output.substring(0, output.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));

  if (!isAuthorized(evidence)) {
    console.error("No associated merged pull request was found for this canonical push.");
    process.exitCode = 1;
  }
}
