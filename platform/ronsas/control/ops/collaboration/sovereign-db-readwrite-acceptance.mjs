import { fromCrossJSON, toJSONAsync } from "seroval";
import crypto from "node:crypto";

const base = process.env.RONS_ACCEPTANCE_BASE ?? "http://127.0.0.1:4186";
const token = process.env.RONS_ACCEPTANCE_TOKEN;
const expectedUserId = process.env.RONS_ACCEPTANCE_USER_ID;
if (!token || !expectedUserId) throw new Error("acceptance bearer identity is missing");

function fnId(file, exportName) {
  const relativeFilename = file.replace(/^\/+/, "");
  const functionName = `${exportName}_createServerFn_handler`;
  const entryId = `${relativeFilename}--${functionName}`;
  return crypto.createHash("sha256").update(entryId).digest("hex");
}

async function callServerFn(file, exportName, payload, method = "POST") {
  const serialized = await toJSONAsync(payload);
  const id = fnId(file, exportName);
  const endpoint = new URL(`${base}/_serverFn/${id}`);
  if (method === "GET") {
    endpoint.searchParams.set("payload", JSON.stringify(serialized));
  }
  const response = await fetch(endpoint, {
    method,
    headers: {
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      "x-tsr-serverFn": "true",
      Authorization: `Bearer ${token}`,
    },
    ...(method === "POST" ? { body: JSON.stringify(serialized) } : {}),
  });
  const body = await response.text();
  if (response.status !== 200 || !body.startsWith("{")) {
    throw new Error(`${exportName} returned HTTP ${response.status}: ${body.slice(0, 500)}`);
  }
  const envelope = fromCrossJSON(JSON.parse(body), { plugins: [] });
  if (envelope?.error) {
    const message =
      typeof envelope.error === "string"
        ? envelope.error
        : envelope.error?.message ?? JSON.stringify(envelope.error);
    throw new Error(`${exportName} failed: ${message}`);
  }
  return envelope?.result;
}

const suffix = crypto.randomUUID();
const projectName = `RONSAS sovereign acceptance ${suffix.slice(0, 8)}`;

const created = await callServerFn(
  "/src/lib/nova/functions.ts",
  "createNovaProject",
  { data: { name: projectName, mode: "builder" } },
);
const project = created?.project;
if (!project?.id || project.name !== projectName || project.owner_user_id !== expectedUserId) {
  throw new Error("Nova create result did not preserve authenticated owner identity");
}
console.log(`RONSAS_NOVA_PROJECT_ID=${project.id}`);

const readBack = await callServerFn(
  "/src/lib/nova/functions.ts",
  "getNovaProject",
  { data: { project_id: project.id } },
  "GET",
);
if (readBack?.project?.id !== project.id || readBack.project.name !== projectName) {
  throw new Error("Nova project read-back mismatch");
}
if (
  !Array.isArray(readBack.members) ||
  !readBack.members.some(
    (member) => member.user_id === expectedUserId && member.role === "owner",
  )
) {
  throw new Error("Nova owner membership was not persisted");
}
console.log("RONSAS_AUTHENTICATED_NOVA_WRITE_READ_PASS=1");

const sourceKey = `ronsas-acceptance-${suffix.slice(0, 12)}`;
const ingestPayload = {
  source_key: sourceKey,
  source_kind: "validation",
  display_name: "RONSAS isolated acceptance",
  external_id: `artifact-${suffix}`,
  content_type: "text/plain",
  visibility: "private",
  content: `Isolated sovereign DataNest acceptance artifact ${suffix}`,
  metadata: { validation: true, run: suffix },
};

const firstIngest = await callServerFn(
  "/src/lib/datanest/functions.ts",
  "ingestDataNestArtifact",
  { data: ingestPayload },
);
if (!firstIngest?.artifact_id || firstIngest.duplicate !== false) {
  throw new Error("DataNest first ingestion was not persisted as a new artifact");
}

const secondIngest = await callServerFn(
  "/src/lib/datanest/functions.ts",
  "ingestDataNestArtifact",
  { data: ingestPayload },
);
if (secondIngest?.artifact_id !== firstIngest.artifact_id || secondIngest.duplicate !== true) {
  throw new Error("DataNest idempotent duplicate read/write contract failed");
}

const coverage = await callServerFn(
  "/src/lib/datanest/functions.ts",
  "getDataNestCoverage",
  {},
  "GET",
);
const row = coverage?.coverage?.find((entry) => entry.source_key === sourceKey);
if (!row || Number(row.ingested) < 1 || Number(row.duplicates) < 1 || Number(row.indexed) < 1) {
  throw new Error("DataNest coverage did not reflect authenticated ingestion");
}
console.log(`RONSAS_DATANEST_ARTIFACT_ID=${firstIngest.artifact_id}`);
console.log("RONSAS_AUTHENTICATED_DATANEST_WRITE_READ_PASS=1");
console.log("RONSAS_SOVEREIGN_DB_AUTHENTICATED_ACCEPTANCE_PASS=1");
