export const dynamic = "force-static";

export async function GET() {
  return Response.json({
    ok: true,
    project: "Resonance DataNest",
    tools: ["UNIFI", "TranScheduler"],
    deployment: "provider-agnostic",
    build: process.env.GITHUB_SHA || "local"
  });
}
