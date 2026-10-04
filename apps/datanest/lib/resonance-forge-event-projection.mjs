import { isSha } from "./resonance-forge-phase-a.mjs";

const ALLOWED_EVENTS = new Set(["push","pull_request","workflow_run","deployment_status"]);

export function normalizeGitHubEvent(eventName, payload) {
  if (!ALLOWED_EVENTS.has(eventName)) {
    return { accepted: false, reason: "unsupported event", eventName };
  }
  const repository = payload?.repository?.full_name ?? null;
  const ref = payload?.ref ?? payload?.pull_request?.head?.ref ?? null;
  const commitSha =
    payload?.after ??
    payload?.pull_request?.head?.sha ??
    payload?.workflow_run?.head_sha ??
    null;

  if (!repository || !isSha(commitSha)) {
    return { accepted: false, reason: "repository and exact commit SHA are required", eventName };
  }

  return {
    accepted: true,
    eventName,
    repository,
    ref,
    commitSha,
    action: payload?.action ?? null,
    observedAt: payload?.repository?.updated_at ?? null
  };
}

export function projectRepositoryRegistry(registry, event) {
  if (!event?.accepted) return { changed: false, registry };
  const existing = registry?.repositories?.[event.repository] ?? {
    fullName: event.repository,
    defaultBranch: "main",
    authority: "governed-mirror",
    observedRefs: {}
  };
  const observedRefs = {
    ...(existing.observedRefs ?? {}),
    ...(event.ref ? { [event.ref]: event.commitSha } : {})
  };
  return {
    changed: observedRefs[event.ref] !== (existing.observedRefs ?? {})[event.ref],
    registry: {
      schemaVersion: 1,
      repositories: {
        ...(registry?.repositories ?? {}),
        [event.repository]: { ...existing, observedRefs }
      }
    }
  };
}

export function projectCandidateFromEvent(event, options = {}) {
  if (!event?.accepted) return { accepted: false, reason: "event rejected" };
  const environment = options.environment ?? "rd";
  return {
    accepted: true,
    candidate: {
      candidateId: options.candidateId ?? `${event.repository}@${event.commitSha}`,
      repository: event.repository,
      commitSha: event.commitSha,
      canonicalBaseSha: options.canonicalBaseSha ?? null,
      environment,
      source: "github-event",
      sourceEvent: event.eventName,
      authorizationState: "unauthorized"
    }
  };
}
