import { getSupabase } from "@/lib/supabase";

export type RonsasStatus = {
  contract: "ronsas-status@1";
  checkedAt: string;
  mode: "cloud";
  runtimeMode: "local-first";
  managedByDataNest: true;
  billingState: "free-promotion";
  independent: boolean;
  localInteractionRequired: boolean;
  authority: {
    owner: string;
    controlRepository: string;
    hubRepository: string;
    publicHub: string;
  };
  hub: {
    ok: boolean;
    status: number | null;
    latencyMs: number;
    origin: string;
    error?: string;
  };
  delivery: {
    canonicalName: "reson8.datanest.life";
    brandedUrl: "https://reson8.datanest.life/";
    brandedState: "wire-ready";
    wire: {
      source: "https://reson8.datanest.life/";
      target: "https://reson8.life/";
      mode: "redirect";
      applicationLayer: "ready";
      networkState: "dns-pending";
    };
    provider: "GitHub Pages";
    operationalUrl: string;
    publicDelivery: {
      ok: boolean;
      status: number | null;
      latencyMs: number;
      origin: string;
      error?: string;
    };
    railwayRequired: false;
    hubRegistration: {
      ok: boolean;
      status: number | null;
      latencyMs: number;
      endpoint: string;
      listed: boolean;
      error?: string;
    };
    backupHost: {
      provider: "Dropbox";
      path: string;
      role: "artifact-recovery";
      status: "active";
      servesApplication: false;
      localPcBackupHosting: false;
    };
  };
};

export async function getRonsasStatus(): Promise<RonsasStatus> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("DataNest control plane is not configured.");
  }

  const { data, error } = await supabase.functions.invoke("ronsas-status", {
    body: {},
  });

  if (error) throw error;

  const status = data as Partial<RonsasStatus> | null;
  if (
    !status ||
    status.contract !== "ronsas-status@1" ||
    status.mode !== "cloud" ||
    status.runtimeMode !== "local-first" ||
    status.managedByDataNest !== true ||
    status.billingState !== "free-promotion" ||
    status.independent !== false ||
    status.localInteractionRequired !== false ||
    !status.authority ||
    !status.hub ||
    !status.delivery ||
    status.delivery.canonicalName !== "reson8.datanest.life" ||
    status.delivery.brandedUrl !== "https://reson8.datanest.life/" ||
    status.delivery.brandedState !== "wire-ready" ||
    !status.delivery.wire ||
    status.delivery.wire.source !== "https://reson8.datanest.life/" ||
    status.delivery.wire.target !== "https://reson8.life/" ||
    status.delivery.wire.mode !== "redirect" ||
    status.delivery.wire.applicationLayer !== "ready" ||
    status.delivery.provider !== "GitHub Pages" ||
    status.delivery.railwayRequired !== false ||
    typeof status.delivery.operationalUrl !== "string" ||
    !status.delivery.publicDelivery ||
    !status.delivery.hubRegistration ||
    typeof status.delivery.hubRegistration.listed !== "boolean" ||
    !status.delivery.backupHost ||
    status.delivery.backupHost.provider !== "Dropbox" ||
    status.delivery.backupHost.role !== "artifact-recovery" ||
    status.delivery.backupHost.status !== "active" ||
    status.delivery.backupHost.servesApplication !== false ||
    status.delivery.backupHost.localPcBackupHosting !== false
  ) {
    throw new Error("RONSAS returned an invalid integration contract.");
  }

  return status as RonsasStatus;
}
