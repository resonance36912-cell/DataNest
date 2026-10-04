import crypto from "node:crypto";
import { isSha } from "./resonance-forge-phase-a.mjs";

export const EVENT_SCHEMA_VERSION = 1;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

export function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

export function createEventEnvelope(eventName, payload, observedAt) {
  const repository = payload?.repository?.full_name ?? null;
  const commitSha = payload?.after ?? payload?.pull_request?.head?.sha ?? payload?.workflow_run?.head_sha ?? null;
  if (!repository || !isSha(commitSha)) throw new Error("repository and exact commit SHA are required");

  const identity = {
    schemaVersion: EVENT_SCHEMA_VERSION,
    eventName,
    repository,
    commitSha,
    action: payload?.action ?? null,
    ref: payload?.ref ?? payload?.pull_request?.head?.ref ?? null,
    observedAt: observedAt ?? payload?.repository?.updated_at ?? null
  };

  return {
    ...identity,
    eventId: sha256(identity),
    payloadDigest: sha256(payload)
  };
}

export function ingestEvents(events = []) {
  const accepted = [];
  const rejected = [];
  const seen = new Set();

  for (const item of events) {
    try {
      const envelope = createEventEnvelope(item.eventName, item.payload, item.observedAt);
      if (seen.has(envelope.eventId)) continue;
      seen.add(envelope.eventId);
      accepted.push(envelope);
    } catch (error) {
      rejected.push({
        reason: error.message,
        eventName: item?.eventName ?? null
      });
    }
  }

  accepted.sort((a, b) => a.eventId.localeCompare(b.eventId));
  return { accepted, rejected };
}
