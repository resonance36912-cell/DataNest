import fs from "node:fs";
import path from "node:path";

export const metadata = { title: "Resonance Forge · DataNest" };

type ForgePolicy = {
  mode: string;
  canonicalProductionAuthority: boolean;
  forgeProductionAuthority: boolean;
  forgeSourceOfTruth: boolean;
  exactShaPromotionRequired: boolean;
  immutableEvidenceRequired: boolean;
  humanProductionAuthorizationRequired: boolean;
  authorityCutoverApproved: boolean;
  requiredEvidenceReferences: string[];
};

type ReleaseExample = {
  candidateId: string;
  repository: string;
  commitSha: string;
  canonicalBaseSha: string;
  environment: string;
  authorizationState: string;
};

function readJson<T>(file: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), file), "utf8"),
  ) as T;
}

const policy = readJson<ForgePolicy>(
  "config/resonance-forge-v1.policy.json",
);
const release = readJson<ReleaseExample>(
  "config/forge-phase-a.example.json",
);

const checks = [
  ["GitHub remains canonical", policy.canonicalProductionAuthority],
  ["Forge production authority disabled", !policy.forgeProductionAuthority],
  ["Forge source-of-truth disabled", !policy.forgeSourceOfTruth],
  ["Exact-SHA promotion required", policy.exactShaPromotionRequired],
  ["Immutable evidence required", policy.immutableEvidenceRequired],
  [
    "Human production authorization required",
    policy.humanProductionAuthorizationRequired,
  ],
  ["Authority cutover approved", policy.authorityCutoverApproved],
] as const;

export default function ForgePage() {
  const passing = checks.filter(([, value]) => value).length;

  return (
    <main style={{ minHeight: "100vh", padding: "48px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <p style={{ letterSpacing: "0.12em", fontSize: 12, opacity: 0.7 }}>
        READ-ONLY CONTROL PLANE
      </p>
      <h1 style={{ fontSize: 42, margin: "8px 0 12px" }}>Resonance Forge</h1>
      <p style={{ maxWidth: 760, lineHeight: 1.6, opacity: 0.82 }}>
        Phase A exposes the Forge control contracts without granting production
        authority. This view is a projection of source-controlled fixtures and
        policy; it performs no deployment, mutation, authorization, or backend write.
      </p>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, marginTop: 28 }}>
        <article style={{ padding: 20, border: "1px solid currentColor", borderRadius: 12 }}>
          <strong>Policy mode</strong>
          <div style={{ fontSize: 24, marginTop: 8 }}>{policy.mode}</div>
        </article>
        <article style={{ padding: 20, border: "1px solid currentColor", borderRadius: 12 }}>
          <strong>Control checks</strong>
          <div style={{ fontSize: 24, marginTop: 8 }}>{passing}/{checks.length}</div>
        </article>
        <article style={{ padding: 20, border: "1px solid currentColor", borderRadius: 12 }}>
          <strong>Candidate authorization</strong>
          <div style={{ fontSize: 24, marginTop: 8 }}>{release.authorizationState}</div>
        </article>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Governance controls</h2>
        <ul style={{ padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
          {checks.map(([label, value]) => (
            <li key={label} style={{ display: "flex", justifyContent: "space-between", gap: 20, padding: "12px 14px", borderBottom: "1px solid currentColor" }}>
              <span>{label}</span>
              <strong>{value ? "ENABLED" : "DISABLED"}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Candidate identity</h2>
        <dl style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "10px 20px" }}>
          <dt>Candidate</dt><dd>{release.candidateId}</dd>
          <dt>Repository</dt><dd>{release.repository}</dd>
          <dt>Commit SHA</dt><dd><code>{release.commitSha}</code></dd>
          <dt>Canonical base SHA</dt><dd><code>{release.canonicalBaseSha}</code></dd>
          <dt>Environment</dt><dd>{release.environment}</dd>
        </dl>
      </section>

      <section style={{ marginTop: 32, padding: 20, border: "1px solid currentColor", borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Production posture</h2>
        <p style={{ marginBottom: 0, lineHeight: 1.6 }}>
          Production remains under the canonical DataNest/GitHub authority.
          Forge cannot self-authorize, deploy production, replace the canonical
          source, or infer human approval from automated evidence.
        </p>
      </section>

      <footer style={{ marginTop: 40, opacity: 0.7, fontSize: 13 }}>
        Source: <code>config/resonance-forge-v1.policy.json</code> and{" "}
        <code>config/forge-phase-a.example.json</code>. Phase A is read-only.
      </footer>
    </main>
  );
}
