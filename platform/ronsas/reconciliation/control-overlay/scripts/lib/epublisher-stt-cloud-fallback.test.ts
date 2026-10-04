import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const runtime = readFileSync("ops/ealiophin/runtime/syncvision-local-stt.py", "utf8");
const dockerfile = readFileSync("ops/railway/epublisher-stt/Dockerfile", "utf8");
const requirements = readFileSync("ops/railway/epublisher-stt/requirements.txt", "utf8");

describe("ePublisher blackout-ready STT", () => {
  test("preserves sovereign loopback defaults", () => {
    expect(runtime).toContain("RONS_STT_HOST', '127.0.0.1'");
    expect(runtime).toContain("RONS_STT_PROVIDER', 'rons-local-faster-whisper'");
    expect(runtime).toContain("RONS_YTDLP_JS_RUNTIME', 'node'");
  });

  test("supports an explicit hosted bind, origin allowlist, and provider identity", () => {
    expect(runtime).toContain("RONS_STT_ALLOWED_ORIGINS");
    expect(runtime).toContain("RONS_STT_REQUIRE_ORIGIN");
    expect(runtime).toContain("RonsThreadingHTTPServer((HOST, PORT)");
    expect(runtime).toContain("self.path == '/health/ready'");
    expect(runtime).toContain("200 if payload.get('ok') else 503");
    expect(runtime).toContain("'provider': PROVIDER_NAME");
    expect(runtime).toContain("'js_runtimes': {YTDLP_JS_RUNTIME: {}}");
  });

  test("builds a CPU Railway image with a baked Whisper model and supported JS runtime", () => {
    expect(dockerfile).toContain("FROM python:3.12-slim");
    expect(dockerfile).toContain("https://deno.land/install.sh");
    expect(dockerfile).toContain('repo_id="Systran/faster-whisper-small"');
    expect(dockerfile).toContain("RONS_STT_HOST=0.0.0.0");
    expect(dockerfile).toContain("RONS_STT_PROVIDER=rons-cloud-faster-whisper");
    expect(dockerfile).toContain("RONS_STT_ALLOWED_ORIGINS=https://epublisher.reson8.life");
    expect(dockerfile).toContain("RONS_STT_REQUIRE_ORIGIN=1");
    expect(dockerfile).toContain("useradd --system");
    expect(dockerfile).toContain("USER rons-stt");
    expect(requirements).toContain("yt-dlp-ejs==0.8.0");
  });
});
