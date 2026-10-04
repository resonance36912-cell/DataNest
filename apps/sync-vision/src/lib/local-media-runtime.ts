export type LocalFfmpegCoreUrls = { coreURL: string; wasmURL: string };

export function resolveLocalFfmpegCoreUrls(
  baseUrl = import.meta.env.BASE_URL || "/",
): LocalFfmpegCoreUrls {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return {
    coreURL: `${normalizedBase}ffmpeg-core/ffmpeg-core.js`,
    wasmURL: `${normalizedBase}ffmpeg-core/ffmpeg-core.wasm`,
  };
}
