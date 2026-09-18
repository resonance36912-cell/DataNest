import { describe, expect, it } from "vitest";
import { resolveLocalFfmpegCoreUrls } from "./local-media-runtime";

describe("sovereign local FFmpeg runtime", () => {
  it("resolves local core assets", () => {
    expect(resolveLocalFfmpegCoreUrls("/sync-vision")).toEqual({
      coreURL: "/sync-vision/ffmpeg-core/ffmpeg-core.js",
      wasmURL: "/sync-vision/ffmpeg-core/ffmpeg-core.wasm",
    });
  });
  it("never creates a hosted URL", () => {
    expect(Object.values(resolveLocalFfmpegCoreUrls("/")).every((url) => !/^https?:\/\//i.test(url))).toBe(true);
  });
});
