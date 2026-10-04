import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function loadJson(path){
  return JSON.parse(readFileSync(resolve(path),"utf8"));
}

export function validateProductionContract(
  contractPath="config/production-contract.json",
  catalogPath=null
){
  const contract=loadJson(contractPath);
  const resolvedCatalogPath=catalogPath || contract.productionCatalog;
  const catalog=loadJson(resolvedCatalogPath);

  const expected=contract.supabase?.expectedMigration;
  if(!expected?.head || !expected?.name){
    throw new Error("Production contract must declare a Supabase expected migration head and name.");
  }
  if(!/^[0-9]{14}$/.test(String(expected.head))){
    throw new Error("Production contract migration head must be a 14-digit timestamp.");
  }
  const sourceFile=String(expected.sourceFile||"").trim();
  if(!sourceFile.startsWith("supabase/migrations/") || !sourceFile.endsWith(".sql")){
    throw new Error("Production contract must declare a repository migration sourceFile under supabase/migrations.");
  }
  const sourcePath=resolve(sourceFile);
  if(!existsSync(sourcePath)){
    throw new Error("Production contract migration sourceFile does not exist: "+sourceFile);
  }
  const sourceBasename=sourceFile.slice(sourceFile.lastIndexOf("/")+1,-4);
  const sourceName=sourceBasename.replace(/^\d{14}_/,"");
  if(sourceName!==String(expected.name)){
    throw new Error("Production migration sourceFile name does not match expected migration name.");
  }
  if(contract.repository!=="DataNest-Supository/DataNest"){
    throw new Error("Production contract repository does not match the canonical repository.");
  }
  if(contract.branch!=="main"){
    throw new Error("Production contract branch must remain main.");
  }
  if(contract.authority?.publicDelivery!=="GitHub Pages"){
    throw new Error("Production contract public delivery authority must be GitHub Pages.");
  }
  if(contract.authority?.backend!=="Supabase"){
    throw new Error("Production contract backend authority must be Supabase.");
  }
  if(contract.authority?.railwayRequired!==false || contract.authority?.vercelRequired!==false){
    throw new Error("Production contract must keep Railway and Vercel non-required.");
  }
  if(contract.publicDelivery?.basePath!=="/DataNest/" || contract.publicDelivery?.provider!=="GitHub Pages"){
    throw new Error("Production contract public delivery route is invalid.");
  }
  if(contract.deployment?.defaultMode!=="authorized"){
    throw new Error("Production deployment default mode must be authorized.");
  }
  if(!Array.isArray(contract.deployment?.exceptionModes) ||
     !contract.deployment.exceptionModes.includes("progressive_live") ||
     !contract.deployment.exceptionModes.includes("owner_test_mode")){
    throw new Error("Production deployment exceptions must explicitly include progressive_live and owner_test_mode.");
  }
  if(catalog.canonicalRepository!==contract.repository){
    throw new Error("Production catalog and production contract disagree on the canonical repository.");
  }
  if(catalog.canonicalPublicUrl!=="https://datanest-supository.github.io/DataNest/"){
    throw new Error("Production catalog canonical public URL drifted from the production contract.");
  }
  if(catalog.authority?.backend!=="Supabase:sgqdmfgjbprsoqsmgigi"){
    throw new Error("Production catalog backend authority drifted from the production contract.");
  }

  return {contract,catalog};
}

function writeGithubOutput(contract, outputPath){
  const reference=JSON.stringify(contract.supabase.expectedMigration);
  writeFileSync(outputPath, `database_migration_reference=${reference}\n`, {flag:"a"});
}

const directInvocation=
  process.argv[1] &&
  import.meta.url===pathToFileURL(resolve(process.argv[1])).href;

if(directInvocation){
  const args=process.argv.slice(2);
  const outputIndex=args.indexOf("--github-output");
  const outputPath=outputIndex>=0 ? args[outputIndex+1] : null;
  const contractPath=args[0] && !args[0].startsWith("--")
    ? args[0]
    : "config/production-contract.json";
  const {contract}=validateProductionContract(contractPath);
  if(outputPath){
    if(!existsSync(outputPath)) writeFileSync(outputPath,"","utf8");
    writeGithubOutput(contract,outputPath);
  }
  console.log(
    `Validated canonical production contract: DB ${contract.supabase.expectedMigration.head} · ${contract.supabase.expectedMigration.name}`
  );
}
