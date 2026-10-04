import test from "node:test";
import assert from "node:assert/strict";
import { assessEnvironment } from "../../scripts/environment-assessor.mjs";

const config={
  expected:{
    canonicalRepository:"DataNest-Supository/DataNest",
    canonicalDelivery:"GitHub Pages",
    backendAuthority:"Supabase",
    forgeMode:"governed-mirror"
  },
  adaptationPolicy:{}
};

test("ENVIRONMENT reports a compatible baseline without changing authority",()=>{
  const result=assessEnvironment(config,{
    canonicalRepository:"DataNest-Supository/DataNest",
    node22Configured:true,
    ubuntu2404:true,
    deliveryProvider:"GitHub Pages",
    backendAuthority:"Supabase",
    aiArchitecturePresent:true,
    forgeMode:"governed-mirror",
    backupConfigured:true,
    lockfilePresent:true,
    botsquadProtected:true,
    environmentProtected:true,
    requiredTreeConfigs:[{}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}]
  });
  assert.equal(result.compatible,true);
  assert.equal(result.productionAuthorization,false);
  assert.equal(result.reviewRequired.length,0);
  assert.equal(result.findings.length,11);
});

test("ENVIRONMENT requires review for material drift",()=>{
  const result=assessEnvironment(config,{
    canonicalRepository:"other/repo",
    node22Configured:false,
    ubuntu2404:false,
    deliveryProvider:"Other",
    backendAuthority:"Other",
    aiArchitecturePresent:false,
    forgeMode:"authority",
    backupConfigured:false,
    lockfilePresent:false,
    botsquadProtected:false,
    environmentProtected:false,
    requiredTreeConfigs:[{}, null, {}, {}, {}, {}, {}, {}, {}, {}, {}]
  });
  assert.equal(result.compatible,false);
  assert.ok(result.reviewRequired.length>=10);
  assert.equal(result.productionAuthorization,false);
});
