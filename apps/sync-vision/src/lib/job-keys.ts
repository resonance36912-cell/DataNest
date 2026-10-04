/**
 * Idempotency Key Generation — Phase 2
 *
 * Creates deterministic keys to prevent duplicate provider submissions.
 */

export interface IdempotencyKeyParams {
  projectId: string;
  sceneNumber: number;
  provider: string;
  providerMode: string;
  sourceAssetVersion: string;
  transcriptVersionId?: string;
}

/**
 * Generate a deterministic idempotency key from job parameters.
 * Two calls with identical params MUST produce the same key.
 */
export function generateIdempotencyKey(params: IdempotencyKeyParams): string {
  const parts = [
    params.projectId,
    `s${params.sceneNumber}`,
    params.provider,
    params.providerMode,
    params.sourceAssetVersion,
    params.transcriptVersionId ?? "no-tv",
  ];
  return parts.join("::");
}

/**
 * Parse an idempotency key back into its components.
 */
export function parseIdempotencyKey(key: string): Partial<IdempotencyKeyParams> {
  const parts = key.split("::");
  return {
    projectId: parts[0],
    sceneNumber: parts[1] ? parseInt(parts[1].replace("s", ""), 10) : undefined,
    provider: parts[2],
    providerMode: parts[3],
    sourceAssetVersion: parts[4],
    transcriptVersionId: parts[5] === "no-tv" ? undefined : parts[5],
  };
}
