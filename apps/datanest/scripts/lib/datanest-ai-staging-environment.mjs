export const DATANEST_AI_STAGING_PROJECT_REF="qchttpcyqlqnhvahprhz";
export const DATANEST_AI_STAGING_URL="https://qchttpcyqlqnhvahprhz.supabase.co";
export const DATANEST_PRODUCTION_PROJECT_REF="sgqdmfgjbprsoqsmgigi";

export function assertDedicatedDataNestAiStaging({
  url,
  projectRef,
  productionRef=DATANEST_PRODUCTION_PROJECT_REF
}){
  const normalizedUrl=typeof url==="string"?url.trim():"";
  const normalizedProjectRef=typeof projectRef==="string"?projectRef.trim():"";
  const normalizedProductionRef=typeof productionRef==="string"?productionRef.trim():"";

  if(!normalizedUrl||!normalizedProjectRef){
    throw new Error("Dedicated DataNest AI staging URL and project ref are required.");
  }
  if(normalizedProjectRef===normalizedProductionRef){
    throw new Error("DataNest AI staging configuration must not target the production project.");
  }
  if(normalizedProjectRef!==DATANEST_AI_STAGING_PROJECT_REF){
    throw new Error("DataNest AI staging project ref must be the dedicated staging project.");
  }
  if(normalizedUrl!==DATANEST_AI_STAGING_URL&&normalizedUrl!==DATANEST_AI_STAGING_URL+"/"){
    throw new Error("DataNest AI staging URL must be the canonical dedicated staging origin.");
  }
  return {url:DATANEST_AI_STAGING_URL,projectRef:DATANEST_AI_STAGING_PROJECT_REF};
}
