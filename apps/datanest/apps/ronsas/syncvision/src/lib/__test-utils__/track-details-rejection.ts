import { expect } from "vitest";
import { parseTrackDetailsRejection } from "@/lib/track-details";

/**
 * Shared assertion for the `{ error: "invalid_track_details", fieldErrors }`
 * payload returned by the generate-storylines / generate-scene-image edge
 * functions when strict Zod validation rejects Track Details input.
 *
 * Verifies both the raw wire shape AND that `parseTrackDetailsRejection`
 * extracts the expected per-field messages so client + server stay in sync.
 */
export function expectInvalidTrackDetailsPayload(
  payload: unknown,
  expected: { aspect_ratio?: string | RegExp; visual_style?: string | RegExp } = {},
): void {
  expect(payload, "payload must be an object").toBeTypeOf("object");
  expect(payload).not.toBeNull();
  const p = payload as Record<string, unknown>;

  expect(p.error, "error tag").toBe("invalid_track_details");
  expect(p.fieldErrors, "fieldErrors object").toBeTypeOf("object");
  expect(p.fieldErrors).not.toBeNull();

  const parsed = parseTrackDetailsRejection(p);
  expect(parsed, "parseTrackDetailsRejection must recognise the payload").not.toBeNull();
  if (!parsed) return;

  expect(parsed.message).toBeTypeOf("string");
  expect(parsed.message.length).toBeGreaterThan(0);

  for (const key of ["aspect_ratio", "visual_style"] as const) {
    const matcher = expected[key];
    if (matcher === undefined) continue;
    const actual = parsed.fieldErrors[key];
    expect(actual, `fieldErrors.${key}`).toBeTypeOf("string");
    if (matcher instanceof RegExp) expect(actual).toMatch(matcher);
    else expect(actual).toBe(matcher);
  }
}
