import http from "k6/http";
import { check, fail, sleep } from "k6";

const baseUrl = (__ENV.RONSAS_TEST_BASE_URL || "").replace(/\/$/, "");
const allow = __ENV.RONSAS_ALLOW_LOAD_TEST === "1";
const profile = __ENV.RONSAS_LOAD_PROFILE || "smoke";
const productionHosts = new Set([
  "reson8.life",
  "www.reson8.life",
  "epublisher.reson8.life",
  "creative.reson8.life",
  "sync.reson8.life",
  "youtube.reson8.life",
  "career-compass.org",
  "www.career-compass.org",
  "career-compass-admin.org",
  "www.career-compass-admin.org",
  "resonance-podcast.com",
  "www.resonance-podcast.com",
]);

if (!allow) {
  throw new Error("Load traffic is disabled. Set RONSAS_ALLOW_LOAD_TEST=1 only after explicit staging approval.");
}
if (!baseUrl) {
  throw new Error("RONSAS_TEST_BASE_URL is required.");
}

let target;
try {
  target = new URL(baseUrl);
} catch {
  throw new Error("RONSAS_TEST_BASE_URL must be an absolute http/https URL.");
}
if (!["http:", "https:"].includes(target.protocol)) {
  throw new Error("Only http/https staging targets are permitted.");
}
const host = target.hostname.toLowerCase();
if (productionHosts.has(host) || host.endsWith(".reson8.life")) {
  throw new Error(`Refusing load traffic to protected production host: ${host}`);
}

function requirePositiveInt(name) {
  const value = Number.parseInt(__ENV[name] || "", 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be an explicitly approved positive integer for profile '${profile}'.`);
  }
  return value;
}

function selectedProfileOptions() {
  switch (profile) {
    case "smoke":
      return { vus: 1, iterations: 1, maxDuration: "2m" };
    case "baseline":
      return {
        vus: requirePositiveInt("RONSAS_BASELINE_VUS"),
        duration: __ENV.RONSAS_BASELINE_DURATION || "30m",
      };
    case "peak":
      return {
        vus: requirePositiveInt("RONSAS_PEAK_VUS"),
        duration: __ENV.RONSAS_PEAK_DURATION || "60m",
      };
    case "spike": {
      const spikeVus = requirePositiveInt("RONSAS_SPIKE_VUS");
      return {
        scenarios: {
          spike: {
            executor: "ramping-vus",
            startVUs: 0,
            stages: [
              { duration: "30s", target: spikeVus },
              { duration: "60s", target: spikeVus },
              { duration: "30s", target: 0 },
            ],
            gracefulRampDown: "30s",
          },
        },
      };
    }
    case "soak":
      return {
        vus: requirePositiveInt("RONSAS_SOAK_VUS"),
        duration: __ENV.RONSAS_SOAK_DURATION || "4h",
      };
    case "stress":
      return {
        scenarios: {
          stress: {
            executor: "ramping-vus",
            startVUs: 1,
            stages: [
              { duration: "5m", target: requirePositiveInt("RONSAS_STRESS_STEP1_VUS") },
              { duration: "5m", target: requirePositiveInt("RONSAS_STRESS_STEP2_VUS") },
              { duration: "5m", target: requirePositiveInt("RONSAS_STRESS_STEP3_VUS") },
              { duration: "5m", target: 0 },
            ],
            gracefulRampDown: "30s",
          },
        },
      };
    default:
      throw new Error(`Unknown RONSAS_LOAD_PROFILE '${profile}'.`);
  }
}

export const options = {
  ...selectedProfileOptions(),
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<750"],
    checks: ["rate>0.99"],
  },
};

const paths = (__ENV.RONSAS_SMOKE_PATHS || "/,/pricing")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export default function () {
  for (const path of paths) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const response = http.get(`${baseUrl}${normalizedPath}`, {
      tags: { journey: "public-readiness-probe", path: normalizedPath },
      timeout: "15s",
    });
    const ok = check(response, {
      [`${normalizedPath} returns 2xx`]: (res) => res.status >= 200 && res.status < 300,
    });
    if (!ok && __ENV.RONSAS_ABORT_ON_SMOKE_FAILURE === "1") {
      fail(`Staging readiness probe failed for ${normalizedPath}: HTTP ${response.status}`);
    }
    sleep(1);
  }
}
