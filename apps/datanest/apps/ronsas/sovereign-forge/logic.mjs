const list=v=>[...new Set(String(v||"").split(/[,\n]/).map(x=>x.trim()).filter(Boolean))];
export function buildManifest(input={}){
 const name=String(input.name||"").trim();if(!name)throw new Error("Project name is required.");
 const type=String(input.type||"web-app").trim(),capabilities=list(input.capabilities),entrypoint=String(input.entrypoint||"").trim()||"src/main";
 return {schema:"datanest.sovereign-forge.v1",repository:"DataNest-Supository/DataNest",authority:{source:"DataNest",promotion:"DataNest",standaloneRepositories:"evidence-only"},project:{name,type,entrypoint,capabilities},controls:{localFirst:true,securityGates:true,billingState:"free-promotion",paidCheckoutActive:false},generatedAt:new Date().toISOString()};
}
