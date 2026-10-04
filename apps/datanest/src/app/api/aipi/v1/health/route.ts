import { AIPI_POLICY_VERSION, AIPI_VERSION } from "@/lib/aipiCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      ok: true,
      service: "Resonance AiPI",
      version: AIPI_VERSION,
      policy_version: AIPI_POLICY_VERSION,
      deployment: "provider-agnostic",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
