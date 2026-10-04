import { MEMORY_LANGUAGE_POLICY } from "./memoryLanguagePolicy.ts";

export type DualAdvocacyResponse={
  angelsAdvocate:string;
  devilsAdvocate:string;
  synthesis:string;
};

function clean(value:unknown):string{
  return typeof value==="string"?value.trim():"";
}

export function buildDevelopmentCommandPrompt(input:{
  job:Record<string,unknown>;
  workingMemory:string[];
  userMessage:string;
}):string{
  return [
    "You are the DataNest Development Command dual-advocacy reasoning engine.",
    MEMORY_LANGUAGE_POLICY,
    "Use cumulative working memory as development context, separate from Certified Memory.",
    "Return only valid JSON with keys angelsAdvocate, devilsAdvocate, synthesis.",
    "The Angel's Advocate makes the strongest practical case for the command.",
    "The Devil's Advocate makes the strongest practical case against it, including risks, hidden assumptions, and failure modes.",
    "The synthesis reconciles both views into a concise next step.",
    "Do not claim deployments, approvals, or external actions unless they are present in context.",
    "CUMULATIVE WORKING MEMORY:",
    JSON.stringify(input.workingMemory),
    "CURRENT JOB:",
    JSON.stringify(input.job),
    "CURRENT USER COMMAND:",
    input.userMessage
  ].join("\n\n");
}

export function buildLegalEaglePrompt(input:{
  jurisdiction:string;
  legalTask:string;
  job:Record<string,unknown>;
  certifiedMemory:string[];
  matterEvidence:string[];
  userMessage:string;
}):string{
  return [
    "You are Legal Eagle, the governed Resonance legal-information and matter-preparation assistant.",
    MEMORY_LANGUAGE_POLICY,
    "You are not a lawyer or law firm, do not create an attorney-client relationship, and do not claim legal privilege.",
    "Return only valid JSON with keys angelsAdvocate, devilsAdvocate, synthesis.",
    "",
    "ANGEL'S ADVOCATE",
    "Present the strongest legally relevant interpretation, argument, or practical path that supports the user's stated objective.",
    "Separate user-supplied facts from assumptions and disputed facts.",
    "Do not invent statutes, cases, rules, filing requirements, citations, deadlines, or enforceability conclusions.",
    "",
    "DEVIL'S ADVOCATE",
    "Present the strongest opposing interpretation, counterargument, procedural risk, evidentiary weakness, hidden assumption, and failure mode.",
    "Identify facts or documents that could materially change the analysis.",
    "",
    "SYNTHESIS",
    "Reconcile both views into a neutral issue map and practical preparation plan.",
    "Do not choose a legal winner or promise an outcome.",
    "Identify what primary or official sources should be verified and what questions should go to qualified counsel.",
    "Treat deadlines, limitation periods, court dates, criminal exposure, immigration status, family safety, housing loss, eviction and similar high-impact matters as requiring prompt independent verification.",
    "",
    "JURISDICTION:",
    input.jurisdiction,
    "",
    "LEGAL WORKFLOW:",
    input.legalTask||"general",
    "",
    "CURRENT MATTER / JOB:",
    JSON.stringify(input.job),
    "",
    "APPROVED PROJECT BASELINE:",
    JSON.stringify(input.certifiedMemory),
    "",
    "CURRENT MATTER EVIDENCE (SESSION-SCOPED, NOT CERTIFIED):",
    JSON.stringify(input.matterEvidence),
    "",
    "CURRENT USER REQUEST:",
    input.userMessage
  ].join("\n");
}

export function parseCompleteDualAdvocacyResponse(raw:string):DualAdvocacyResponse|null{
  const trimmed=raw.trim();
  const unfenced=trimmed.replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"").trim();
  try{
    const value=JSON.parse(unfenced) as Record<string,unknown>;
    const angelsAdvocate=clean(value.angelsAdvocate);
    const devilsAdvocate=clean(value.devilsAdvocate);
    const synthesis=clean(value.synthesis);
    if(angelsAdvocate&&devilsAdvocate&&synthesis)return {angelsAdvocate,devilsAdvocate,synthesis};
  }catch{}
  return null;
}

export function parseDualAdvocacyResponse(raw:string):DualAdvocacyResponse{
  return parseCompleteDualAdvocacyResponse(raw)||{
    angelsAdvocate:raw.trim(),
    devilsAdvocate:"A distinct opposing analysis was not returned.",
    synthesis:"Re-run the command to obtain the complete dual-advocacy response."
  };
}

export function formatDualAdvocacyResponse(value:DualAdvocacyResponse):string{
  return [
    "ANGEL'S ADVOCATE",value.angelsAdvocate,"",
    "DEVIL'S ADVOCATE",value.devilsAdvocate,"",
    "SYNTHESIS",value.synthesis
  ].join("\n");
}
