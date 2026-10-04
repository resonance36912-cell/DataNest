import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const nextOut=path.join(repoRoot,"out");
const appsOut=path.join(nextOut,"apps");
const configuredBase=(process.env.NEXT_PUBLIC_BASE_PATH||"").replace(/\/+$/,"");
const npmCommand=process.platform==="win32"?"npm.cmd":"npm";

const apps=[
  {slug:"career-compass",source:"apps/ronsas/career-compass",output:"dist",kind:"simple"},
  {slug:"creative-studio",source:"apps/ronsas/creative-studio",output:"dist",kind:"vite"},
  {slug:"epublisher",source:"apps/ronsas/epublisher",output:"dist",kind:"vite"},
  {slug:"lyricsync-studio",source:"apps/ronsas/lyricsync-studio",output:"dist",kind:"simple"},
  {slug:"scene-song-spark",source:"apps/ronsas/scene-song-spark",output:"dist",kind:"simple"},
  {slug:"sovereign-forge",source:"apps/ronsas/sovereign-forge",output:"dist",kind:"simple"},
  {slug:"syncvision",source:"apps/ronsas/syncvision",output:"dist/client",kind:"vite"},
];

function run(command,args,cwd){
  const result=spawnSync(command,args,{
    cwd,
    stdio:"inherit",
    env:{...process.env,CI:process.env.CI||"true"}
  });
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
}

await access(nextOut);
await rm(appsOut,{recursive:true,force:true});
await mkdir(appsOut,{recursive:true});

const manifest=[];
for(const app of apps){
  const sourceDir=path.join(repoRoot,app.source);
  const appBase=`${configuredBase}/apps/${app.slug}/`;

  if(app.kind==="vite"){
    run(npmCommand,["ci","--no-audit","--no-fund"],sourceDir);
    run(npmCommand,["run","build","--",`--base=${appBase}`],sourceDir);
  }else{
    run(npmCommand,["ci","--no-audit","--no-fund"],sourceDir);
    run(process.execPath,["scripts/build.mjs"],sourceDir);
  }

  const builtDir=path.join(sourceDir,app.output);
  await access(path.join(builtDir,"index.html"));
  const targetDir=path.join(appsOut,app.slug);
  await mkdir(targetDir,{recursive:true});
  await cp(builtDir,targetDir,{recursive:true});

  manifest.push({
    slug:app.slug,
    source:app.source,
    path:`${appBase}`,
    hosting:"DataNest GitHub Pages"
  });
}

await writeFile(
  path.join(appsOut,"manifest.json"),
  JSON.stringify({
    contract:"datanest-ronsas-apps@1",
    generatedAt:new Date().toISOString(),
    apps:manifest
  },null,2)+"\n",
  "utf8"
);

console.log(`Bundled ${manifest.length} RONSAS apps into ${path.relative(repoRoot,appsOut)}.`);
