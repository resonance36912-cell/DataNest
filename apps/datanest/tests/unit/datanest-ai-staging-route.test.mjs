import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";

// Removing exact-destination validation, or silently falling back after partial
// configuration, must make the corresponding rejection tests below fail.
// Only Deno.env is replaced. These tests execute each entrypoint's real
// stagingConfig function, not a reimplementation. No service clients or network
// calls are made. They complement, not replace, authenticated acceptance.
const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const staging="https://qchttpcyqlqnhvahprhz.supabase.co";
const production="https://sgqdmfgjbprsoqsmgigi.supabase.co";
const stagingKey="synthetic-staging-key-not-a-credential";
const localKey="synthetic-local-key-not-a-credential";
const helperPath=path.join(repoRoot,"supabase/functions/_shared/datanestAiStaging.ts");
const helper=fs.existsSync(helperPath)?await import(pathToFileURL(helperPath).href):{};

function resolverFor(slug,env={}){
  const source=fs.readFileSync(path.join(repoRoot,"supabase/functions",slug,"index.ts"),"utf8");
  const definition=source.match(/^function stagingConfig\([^]*?^\}/m)?.[0];
  assert.ok(definition,`${slug}: real stagingConfig definition must exist`);
  const legacyRef=source.match(/^const dedicatedStagingRef=([^;]+);/m)?.[1];
  const code=stripTypeScriptTypes(definition,{mode:"strip"})+"\nstagingConfig;";
  return vm.runInNewContext(code,{
    Deno:{env:{get:name=>env[name]}},
    dedicatedStagingRef:legacyRef?JSON.parse(legacyRef):undefined,
    resolveDataNestAiStaging:helper.resolveDataNestAiStaging
  },{timeout:1000});
}
function configured(url,key=stagingKey){
  return {DATANEST_AI_STAGING_URL:url,DATANEST_AI_STAGING_SERVICE_ROLE_KEY:key};
}

for(const slug of ["datanest-ai-chat","datanest-ai-intake","datanest-ai-certification"]){
  for(const suffix of ["","/"]){
    test(`${slug}: configured dedicated staging${suffix?" with slash":""} remains valid`,()=>{
      const result=resolverFor(slug,configured(staging+suffix))(production,localKey);
      assert.equal(new URL(result.url).origin,staging);
      assert.equal(result.key,stagingKey);
    });
    test(`${slug}: dedicated staging self fallback${suffix?" with slash":""} remains valid`,()=>{
      const result=resolverFor(slug)(staging+suffix,localKey);
      assert.equal(new URL(result.url).origin,staging);
      assert.equal(result.key,localKey);
    });
  }
  test(`${slug}: production without staging credentials remains rejected`,()=>{
    assert.throws(()=>resolverFor(slug)(production,localKey),/staging/i);
  });
  const invalidDestinations=[
    ["production project",production],
    ["unrelated HTTPS host","https://example.invalid"],
    ["lookalike subdomain",staging+".example.invalid"],
    ["HTTP",staging.replace("https:","http:")],
    ["credentials",staging.replace("https://","https://user:password@")],
    ["non-default port",staging+":8443"],
    ["path",staging+"/rest/v1"],
    ["query",staging+"?route=production"],
    ["fragment",staging+"#production"],
    ["protocol relative",staging.replace("https:","")],
    ["whitespace prefix"," "+staging],
    ["whitespace suffix",staging+" "],
    ["empty value",""]
  ];
  for(const [label,url] of invalidDestinations){
    test(`${slug}: rejects configured ${label} before client construction`,()=>{
      assert.throws(()=>resolverFor(slug,configured(url))(production,localKey),/staging/i);
    });
  }
  for(const [label,url] of invalidDestinations.filter(([label])=>label!=="empty value")){
    test(`${slug}: rejects self fallback for ${label}`,()=>{
      assert.throws(()=>resolverFor(slug)(url,localKey),/staging/i);
    });
  }
  for(const [label,env] of [
    ["URL only",{DATANEST_AI_STAGING_URL:staging}],
    ["key only",{DATANEST_AI_STAGING_SERVICE_ROLE_KEY:stagingKey}],
    ["empty pair",configured("","")],
    ["empty key",configured(staging,"")],
    ["whitespace key",configured(staging,"   ")]
  ]){
    test(`${slug}: rejects ${label} instead of silent staging fallback`,()=>{
      assert.throws(()=>resolverFor(slug,env)(staging,localKey),/staging/i);
    });
  }
  test(`${slug}: rejects a missing self-fallback service credential`,()=>{
    assert.throws(()=>resolverFor(slug)(staging,""),/staging/i);
  });
  test(`${slug}: configuration errors do not disclose URL credentials or keys`,()=>{
    let caught;
    try{
      resolverFor(slug,configured("https://private-user:private-password@example.invalid"))(production,localKey);
    }catch(error){caught=error;}
    assert.ok(caught,"The invalid staging destination must be rejected");
    assert.doesNotMatch(String(caught),/private-user|private-password|synthetic-staging-key|synthetic-local-key/);
  });
}
