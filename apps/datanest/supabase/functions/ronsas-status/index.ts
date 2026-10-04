// @ts-ignore -- Deno resolves the pinned npm: import; repository Node tsc does not.
import { withSupabase } from "npm:@supabase/server@1.8.0";

const CONTRACT = "ronsas-status@1";
const HUB_ORIGIN = "https://reson8.life/";
const HUB_STATUS_PATH = "/api/public/app-status/health";
const DATANEST_CANONICAL_NAME = "reson8.datanest.life";
const DATANEST_BRANDED_URL = "https://reson8.datanest.life/";
const DATANEST_WIRE_TARGET = HUB_ORIGIN;
const DATANEST_PUBLIC_ORIGIN = "https://datanest-supository.github.io/DataNest/";
const DATANEST_HEALTH_PATH = "/DataNest/health.json";
const DATANEST_BACKUP_PROVIDER = "Dropbox";
const DATANEST_BACKUP_PATH = "/DataNest-AI-Backups";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function assertHttpsHost(value: string, allowedHosts: string[], label: string) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();

  if (url.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS.`);
  }

  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local")
  ) {
    throw new Error(`Local ${label} origins are not permitted.`);
  }

  if (!allowedHosts.includes(host)) {
    throw new Error(`${label} origin is outside the AppDev authority allowlist.`);
  }

  return url;
}

async function probe(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        "User-Agent": "Resonance-DataNest-RONSAS/1",
      },
      signal: controller.signal,
    });

    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      origin: url.origin,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      latencyMs: Date.now() - startedAt,
      origin: url.origin,
      error: error instanceof Error ? error.message : "Cloud probe failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeHubRegistration(hubUrl: URL) {
  const url = new URL(HUB_STATUS_PATH, hubUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "application/json",
        "User-Agent": "Resonance-DataNest-RONSAS/1",
      },
      signal: controller.signal,
    });

    let listed = false;
    if (response.ok) {
      const payload = (await response.json()) as { ecosystem?: unknown };
      if (Array.isArray(payload.ecosystem)) {
        listed = payload.ecosystem.some((entry) => {
          if (!entry || typeof entry !== "object") return false;
          return (entry as { key?: unknown }).key === "datanest";
        });
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      endpoint: url.toString(),
      listed,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      latencyMs: Date.now() - startedAt,
      endpoint: url.toString(),
      listed: false,
      error: error instanceof Error ? error.message : "RONSAS Hub registry probe failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  fetch: withSupabase({ auth: "user" }, async () => {
    try {
      const hubUrl = assertHttpsHost(
        HUB_ORIGIN,
        ["reson8.life", "www.reson8.life"],
        "RONSAS Hub",
      );
      const publicUrl = assertHttpsHost(
        DATANEST_PUBLIC_ORIGIN,
        ["datanest-supository.github.io"],
        "DataNest public delivery",
      );

      const [hub, hubRegistration, publicDelivery] = await Promise.all([
        probe(hubUrl),
        probeHubRegistration(hubUrl),
        probe(new URL(DATANEST_HEALTH_PATH, publicUrl.origin)),
      ]);

      return json({
        contract: CONTRACT,
        checkedAt: new Date().toISOString(),
        mode: "cloud",
        runtimeMode: "local-first",
        managedByDataNest: true,
        billingState: "free-promotion",
        independent: false,
        localInteractionRequired: false,
        authority: {
          owner: "DataNest-Supository",
          controlRepository: "DataNest-Supository/DataNest",
          hubRepository: "DataNest-Supository/DataNest",
          publicHub: HUB_ORIGIN,
        },
        hub,
        delivery: {
          canonicalName: DATANEST_CANONICAL_NAME,
          brandedUrl: DATANEST_BRANDED_URL,
          brandedState: "wire-ready",
          wire: {
            source: DATANEST_BRANDED_URL,
            target: DATANEST_WIRE_TARGET,
            mode: "redirect",
            applicationLayer: "ready",
            networkState: "dns-pending",
          },
          provider: "GitHub Pages",
          operationalUrl: publicUrl.toString(),
          publicDelivery,
          railwayRequired: false,
          hubRegistration,
          backupHost: {
            provider: DATANEST_BACKUP_PROVIDER,
            path: DATANEST_BACKUP_PATH,
            role: "artifact-recovery",
            status: "active",
            servesApplication: false,
            localPcBackupHosting: false,
          },
        },
      });
    } catch (error) {
      return json(
        {
          contract: CONTRACT,
          checkedAt: new Date().toISOString(),
          mode: "cloud",
          runtimeMode: "local-first",
          managedByDataNest: true,
          billingState: "free-promotion",
          independent: false,
          localInteractionRequired: false,
          error: error instanceof Error ? error.message : "RONSAS integration failed.",
        },
        500,
      );
    }
  }),
};
