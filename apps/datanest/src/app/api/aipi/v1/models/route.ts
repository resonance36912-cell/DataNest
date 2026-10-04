import {
  AIPI_POLICY_VERSION,
  AipiError,
  authorizeProjectBearer,
  parseAllowedModels,
  requireProject,
} from "@/lib/aipiCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: AipiError) {
  return Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  let project: string;
  try {
    project = requireProject(request.headers.get("x-resonance-project"));
  } catch (error) {
    return errorResponse(error instanceof AipiError ? error : new AipiError("invalid_project", 400));
  }

  if (!authorizeProjectBearer(request.headers.get("authorization"), process.env.AIPI_PROJECT_KEYS, project)) {
    return errorResponse(new AipiError("unauthorized", 401, "A valid project-scoped AiPI bearer token is required."));
  }

  const models = parseAllowedModels(
    process.env.AIPI_ALLOWED_MODELS,
    process.env.DATANEST_SHARED_AI_MODEL,
  );

  return Response.json(
    {
      object: "list",
      policy_version: AIPI_POLICY_VERSION,
      project,
      data: models.map((id) => ({
        id,
        object: "aipi.model",
        enabled: true,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
