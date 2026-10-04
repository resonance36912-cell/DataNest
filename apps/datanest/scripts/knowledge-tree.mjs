#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const API="https://api.github.com";

const clean=(value)=>String(value||"").replace(/\s+/g," ").trim();
const digest=(value)=>createHash("sha256").update(value).digest("hex");

export function categorize(text,categories){
  const haystack=clean(text).toLowerCase();
  const matched=[];
  for(const [category,keywords] of Object.entries(categories||{})){
    if((keywords||[]).some((keyword)=>haystack.includes(String(keyword).toLowerCase()))) matched.push(category);
  }
  return matched.length?matched:["other"];
}

export function buildOptimizationCandidates(items){
  const counts=new Map();
  for(const item of items){
    for(const category of item.categories||[]) counts.set(category,(counts.get(category)||0)+1);
  }
  return [...counts.entries()]
    .filter(([category,count])=>category!=="other"&&count>=2)
    .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))
    .map(([category,count])=>({
      category,
      evidenceCount:count,
      recommendation:`Review repeated ${category} changes for a reusable check, shared component, documented pattern, or automated verification before adopting another one-off fix.`,
      authority:"review_required"
    }));
}

export function buildFeed({target,items,categories,generatedAt}){
  const allowed=new Set(categories||[]);
  const selected=items.filter((item)=>(item.categories||[]).some((category)=>allowed.has(category)));
  return {
    schemaVersion:"datanest-knowledge-feed-v1",
    target,
    generatedAt,
    authority:"provisional_repository_learning",
    productionAuthorization:false,
    certifiedMemory:false,
    itemCount:selected.length,
    items:selected,
    optimizationCandidates:buildOptimizationCandidates(selected)
  };
}

async function githubJson(repository,endpoint,token){
  const response=await fetch(`${API}/repos/${repository}${endpoint}`,{
    headers:{
      Accept:"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28",
      ...(token?{Authorization:`Bearer ${token}`}:{})
    }
  });
  if(!response.ok) throw new Error(`${repository}${endpoint}: ${response.status} ${await response.text()}`);
  return response.json();
}

function commitItem(repository,role,commit,categories){
  const message=clean(commit?.commit?.message);
  return {
    id:`commit:${repository}@${commit.sha}`,
    repository,
    sourceRole:role,
    sourceType:"commit",
    sourceSha:String(commit.sha||""),
    sourceUrl:String(commit.html_url||""),
    observedAt:String(commit?.commit?.committer?.date||commit?.commit?.author?.date||""),
    summary:message.split("\n")[0],
    categories:categorize(message,categories),
    evidenceHash:"sha256:"+digest(repository+"|"+String(commit.sha||"")+"|"+message)
  };
}

function pullItem(repository,role,pull,categories){
  const text=clean([pull?.title,pull?.body].filter(Boolean).join(" "));
  return {
    id:`pull:${repository}#${pull.number}`,
    repository,
    sourceRole:role,
    sourceType:"merged_pull_request",
    sourceNumber:Number(pull.number),
    sourceSha:String(pull?.merge_commit_sha||""),
    sourceUrl:String(pull?.html_url||""),
    observedAt:String(pull?.merged_at||pull?.updated_at||""),
    summary:clean(pull?.title),
    categories:categorize(text,categories),
    evidenceHash:"sha256:"+digest(repository+"|"+String(pull.number||"")+"|"+text)
  };
}

function gitCommitItem(repository,role,{sha,date,message},categories){
  const summary=clean(message);
  return {
    id:`commit:${repository}@${sha}`,
    repository,
    sourceRole:role,
    sourceType:"commit",
    sourceSha:sha,
    sourceUrl:`https://github.com/${repository}/commit/${sha}`,
    observedAt:date,
    summary,
    categories:categorize(summary,categories),
    evidenceHash:"sha256:"+digest(repository+"|"+sha+"|"+summary)
  };
}

function gitLogItems(repository,role,categories,cwd,maxCommits){
  const format="%H%x1f%cI%x1f%s%x1e";
  const output=execFileSync("git",["-C",cwd,"log",`-n${maxCommits}`,`--format=${format}`],{
    encoding:"utf8",
    stdio:["ignore","pipe","pipe"]
  });
  return output.split("\x1e").map(record=>record.trim()).filter(Boolean).map(record=>{
    const [sha,date,...messageParts]=record.split("\x1f");
    return gitCommitItem(repository,role,{sha,date,message:messageParts.join("\x1f")},categories);
  });
}

async function collectGitFallback(source,config){
  const maxCommits=Math.min(100,Number(config.maxCommitsPerRepository||50));
  if(source.repository===process.env.GITHUB_REPOSITORY){
    return gitLogItems(source.repository,source.role,config.categories,process.cwd(),maxCommits);
  }

  const tmp=await mkdtemp(path.join(os.tmpdir(),"datanest-knowledge-"));
  try{
    execFileSync("git",[
      "clone","--quiet","--filter=blob:none","--no-checkout",`--depth=${maxCommits}`,
      `https://github.com/${source.repository}.git`,tmp
    ],{stdio:["ignore","pipe","pipe"]});
    return gitLogItems(source.repository,source.role,config.categories,tmp,maxCommits);
  } finally {
    await rm(tmp,{recursive:true,force:true});
  }
}

export function dedupeItems(items){
  const seen=new Set();
  return items
    .filter((item)=>{
      const key=item.evidenceHash||item.id;
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a,b)=>String(b.observedAt).localeCompare(String(a.observedAt)));
}

async function collectSource(source,config,token){
  if(source.repository===process.env.GITHUB_REPOSITORY){
    return collectGitFallback(source,config);
  }
  try{
    const commits=await githubJson(
      source.repository,
      `/commits?per_page=${Math.min(100,Number(config.maxCommitsPerRepository||50))}`,
      token
    );
    const pulls=await githubJson(
      source.repository,
      `/pulls?state=closed&sort=updated&direction=desc&per_page=${Math.min(100,Number(config.maxPullRequestsPerRepository||50))}`,
      token
    );
    return [
      ...commits.map((commit)=>commitItem(source.repository,source.role,commit,config.categories)),
      ...pulls.filter((pull)=>pull.merged_at).map((pull)=>pullItem(source.repository,source.role,pull,config.categories))
    ];
  }catch(error){
    process.stderr.write(`Knowledge REST enrichment unavailable for ${source.repository}; using Git history fallback. ${clean(error?.message)}\n`);
    return collectGitFallback(source,config);
  }
}

async function main(){
  const configPath=process.argv[2]||"config/knowledge-tree.json";
  const config=JSON.parse(await readFile(configPath,"utf8"));
  const token=process.env.GITHUB_TOKEN||process.env.GH_TOKEN||"";
  const generatedAt=new Date().toISOString();
  const collected=[];

  for(const source of config.sources||[]){
    if((config.excludedRepositories||[]).includes(source.repository)) continue;
    const sourceToken=source.repository===process.env.GITHUB_REPOSITORY?token:"";
    collected.push(...await collectSource(source,config,sourceToken));
  }

  const items=dedupeItems(collected);
  const index={
    schemaVersion:"datanest-knowledge-index-v1",
    generatedAt,
    sourceRepositories:(config.sources||[]).map((source)=>source.repository),
    excludedRepositories:config.excludedRepositories||[],
    itemCount:items.length,
    categoryCounts:Object.fromEntries(
      [...new Set(items.flatMap((item)=>item.categories||[]))].sort().map((category)=>[
        category,
        items.filter((item)=>(item.categories||[]).includes(category)).length
      ])
    ),
    controls:config.controls||{}
  };

  await mkdir("knowledge/feeds",{recursive:true});
  await writeFile("knowledge/index.json",JSON.stringify(index,null,2)+"\n");
  for(const [target,feed] of Object.entries(config.feeds||{})){
    const output=buildFeed({target,items,categories:feed.categories,generatedAt});
    await mkdir(path.dirname(feed.file),{recursive:true});
    await writeFile(feed.file,JSON.stringify(output,null,2)+"\n");
  }

  process.stdout.write(JSON.stringify({
    generatedAt,
    itemCount:items.length,
    feeds:Object.fromEntries(Object.entries(config.feeds||{}).map(([key,value])=>[key,value.file]))
  },null,2)+"\n");
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch((error)=>{
    console.error(error);
    process.exitCode=1;
  });
}
