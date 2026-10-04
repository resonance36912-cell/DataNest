#!/usr/bin/env node

import { readFileSync } from "node:fs";

const packageJson=JSON.parse(readFileSync("package.json","utf8"));
const lock=JSON.parse(readFileSync("package-lock.json","utf8"));

const findings=[];
const direct={
  ...(packageJson.dependencies||{}),
  ...(packageJson.devDependencies||{})
};
const lockRoot=lock.packages?.[""]||{};

if(lock.lockfileVersion!==3){
  findings.push(`Expected npm lockfileVersion 3, found ${lock.lockfileVersion}.`);
}

const exactSemver=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

for(const [name,spec] of Object.entries(direct)){
  if(typeof spec!=="string"||!exactSemver.test(spec)){
    findings.push(`Direct dependency ${name} is not pinned to an exact semver: ${spec}.`);
  }

  const rootSpec=(lockRoot.dependencies||{})[name] ?? (lockRoot.devDependencies||{})[name];
  if(rootSpec!==spec){
    findings.push(`package.json and package-lock.json disagree for ${name}: ${spec} vs ${rootSpec}.`);
  }

  const locked=lock.packages?.[`node_modules/${name}`];
  if(!locked){
    findings.push(`Missing node_modules/${name} entry in package-lock.json.`);
    continue;
  }
  if(locked.version!==spec){
    findings.push(`Locked version mismatch for ${name}: expected ${spec}, found ${locked.version}.`);
  }
  if(!locked.integrity && !locked.link){
    findings.push(`Missing integrity metadata for ${name} in package-lock.json.`);
  }
}

if(findings.length){
  console.error(`Supply-chain policy failed with ${findings.length} finding(s).`);
  for(const finding of findings)console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Supply-chain policy passed: ${Object.keys(direct).length} direct dependencies are exact-pinned and lockfile-aligned.`);
