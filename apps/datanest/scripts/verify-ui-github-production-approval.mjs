import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA_RE=/^[0-9a-f]{40}$/i;
const DECISIVE_REVIEW_STATES=new Set(["APPROVED","CHANGES_REQUESTED","DISMISSED"]);

function clean(value){
  return typeof value==="string" ? value.trim() : "";
}

function requireValue(condition,message){
  if(!condition) throw new Error(message);
}

function parsePositiveInteger(value,label){
  const raw=clean(value);
  requireValue(/^\d+$/.test(raw),`${label} must be a positive integer`);
  const parsed=Number(raw);
  requireValue(Number.isSafeInteger(parsed) && parsed>0,`${label} must be a positive integer`);
  return parsed;
}

function latestDecisiveReview(reviews){
  return [...reviews]
    .filter(review=>DECISIVE_REVIEW_STATES.has(String(review?.state||"").toUpperCase()))
    .sort((a,b)=>Number(a?.id||0)-Number(b?.id||0))
    .at(-1) || null;
}

function normalizeFixture(env){
  if(clean(env.DATANEST_UI_TEST_FIXTURES)!=="1") return null;
  if(clean(env.GITHUB_ACTIONS).toLowerCase()==="true") {
    throw new Error("DATANEST_UI_TEST_FIXTURES is forbidden in GitHub Actions");
  }
  const raw=clean(env.DATANEST_UI_GITHUB_APPROVAL_FIXTURE);
  if(!raw) throw new Error("DATANEST_UI_GITHUB_APPROVAL_FIXTURE is required when test fixtures are enabled");
  try{
    return JSON.parse(raw);
  }catch{
    throw new Error("DATANEST_UI_GITHUB_APPROVAL_FIXTURE must be valid JSON");
  }
}

async function githubJson(path,env,fetchImpl){
  const token=clean(env.GITHUB_TOKEN)||clean(env.GH_TOKEN);
  requireValue(token,"GITHUB_TOKEN or GH_TOKEN is required to verify production authorization");
  requireValue(typeof fetchImpl==="function","A fetch implementation is required to verify GitHub review evidence");
  const apiBase=(clean(env.GITHUB_API_URL)||"https://api.github.com").replace(/\/$/,"");
  const response=await fetchImpl(`${apiBase}${path}`,{
    headers:{
      Accept:"application/vnd.github+json",
      Authorization:`Bearer ${token}`,
      "X-GitHub-Api-Version":"2022-11-28"
    }
  });
  if(!response.ok){
    throw new Error(`GitHub evidence lookup failed (${response.status}) for ${path}`);
  }
  return response.json();
}

export function validateGithubProductionApprovalEvidence({env=process.env,pr,reviews}){
  const releaseSha=clean(env.DATANEST_UI_RELEASE_SHA);
  requireValue(SHA_RE.test(releaseSha),"DATANEST_UI_RELEASE_SHA must be an exact 40-character Git commit SHA");

  const repository=clean(env.GITHUB_REPOSITORY);
  requireValue(/^[^/\s]+\/[^/\s]+$/.test(repository),"GITHUB_REPOSITORY must identify the release repository as owner/name");

  const prNumber=parsePositiveInteger(env.DATANEST_UI_AUTHORIZATION_PR_NUMBER,"DATANEST_UI_AUTHORIZATION_PR_NUMBER");
  const reviewer=clean(env.DATANEST_UI_AUTHORIZATION_REVIEWER);
  requireValue(reviewer,"DATANEST_UI_AUTHORIZATION_REVIEWER is required");

  requireValue(pr && typeof pr==="object","GitHub production-authorization PR evidence is missing");
  requireValue(Number(pr.number)===prNumber,"Production authorization PR number does not match the requested PR");
  requireValue(pr.base?.ref==="main","Production authorization PR must target main");
  if(pr.base?.repo?.full_name){
    requireValue(
      String(pr.base.repo.full_name).toLowerCase()===repository.toLowerCase(),
      "Production authorization PR belongs to a different repository"
    );
  }
  requireValue(Boolean(pr.merged_at),"Production authorization PR must be merged before release authorization");
  requireValue(
    clean(pr.merge_commit_sha).toLowerCase()===releaseSha.toLowerCase(),
    "Production authorization PR merge commit does not match DATANEST_UI_RELEASE_SHA"
  );

  const candidateSha=clean(pr.head?.sha);
  requireValue(SHA_RE.test(candidateSha),"Production authorization PR head SHA is unavailable");
  requireValue(Array.isArray(reviews),"GitHub production-authorization review evidence is missing");

  const currentHeadReviews=reviews.filter(review=>clean(review?.commit_id).toLowerCase()===candidateSha.toLowerCase());
  const reviewerReviews=currentHeadReviews.filter(
    review=>clean(review?.user?.login).toLowerCase()===reviewer.toLowerCase()
  );
  const approval=latestDecisiveReview(reviewerReviews);
  requireValue(approval,"No commit-bound review decision was found for the required production reviewer");
  requireValue(
    String(approval.state||"").toUpperCase()==="APPROVED",
    "The required production reviewer has not approved the current PR head commit"
  );

  const latestByReviewer=new Map();
  for(const review of currentHeadReviews){
    const login=clean(review?.user?.login).toLowerCase();
    if(!login || !DECISIVE_REVIEW_STATES.has(String(review?.state||"").toUpperCase())) continue;
    const previous=latestByReviewer.get(login);
    if(!previous || Number(review?.id||0)>Number(previous?.id||0)) latestByReviewer.set(login,review);
  }
  for(const review of latestByReviewer.values()){
    if(String(review.state||"").toUpperCase()==="CHANGES_REQUESTED"){
      throw new Error(`Production authorization is blocked by changes requested from ${clean(review?.user?.login)||"a reviewer"}`);
    }
  }

  const reviewId=Number(approval.id);
  requireValue(Number.isSafeInteger(reviewId) && reviewId>0,"Verified production approval review ID is invalid");

  return {
    verified:true,
    source:"github_pull_request_review",
    repository,
    prNumber,
    reviewer:clean(approval.user?.login),
    reviewId,
    reviewCommitSha:candidateSha,
    releaseSha,
    mergedAt:clean(pr.merged_at),
    reference:`github:${repository}#${prNumber}:review:${reviewId}@${candidateSha}`
  };
}

export async function verifyGithubProductionApproval(env=process.env,{fetchImpl=globalThis.fetch}={}){
  if(clean(env.DATANEST_UI_RELEASE_STATE)!=="authorized") return null;

  const fixture=normalizeFixture(env);
  if(fixture){
    return validateGithubProductionApprovalEvidence({env,pr:fixture.pr,reviews:fixture.reviews});
  }

  const repository=clean(env.GITHUB_REPOSITORY);
  requireValue(/^[^/\s]+\/[^/\s]+$/.test(repository),"GITHUB_REPOSITORY must identify the release repository as owner/name");
  const prNumber=parsePositiveInteger(env.DATANEST_UI_AUTHORIZATION_PR_NUMBER,"DATANEST_UI_AUTHORIZATION_PR_NUMBER");
  const pr=await githubJson(`/repos/${repository}/pulls/${prNumber}`,env,fetchImpl);
  const reviews=await githubJson(`/repos/${repository}/pulls/${prNumber}/reviews?per_page=100`,env,fetchImpl);
  return validateGithubProductionApprovalEvidence({env,pr,reviews});
}

const directInvocation=
  process.argv[1] &&
  import.meta.url===pathToFileURL(resolve(process.argv[1])).href;

if(directInvocation){
  const evidence=await verifyGithubProductionApproval();
  if(evidence) console.log(JSON.stringify(evidence));
}
