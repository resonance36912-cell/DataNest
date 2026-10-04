import test from "node:test";
import assert from "node:assert/strict";
import { validateGithubProductionApprovalEvidence } from "../../scripts/verify-ui-github-production-approval.mjs";

const releaseSha="a".repeat(40);
const candidateSha="b".repeat(40);

function fixture(overrides={}){
  const env={
    DATANEST_UI_RELEASE_SHA:releaseSha,
    DATANEST_UI_AUTHORIZATION_PR_NUMBER:"405",
    DATANEST_UI_AUTHORIZATION_REVIEWER:"ReleaseReviewer",
    GITHUB_REPOSITORY:"DataNest-Supository/DataNest",
    ...(overrides.env||{})
  };
  const pr={
    number:405,
    base:{ref:"main",repo:{full_name:"DataNest-Supository/DataNest"}},
    head:{sha:candidateSha},
    merged_at:"2026-10-02T03:37:29Z",
    merge_commit_sha:releaseSha,
    ...(overrides.pr||{})
  };
  const reviews=overrides.reviews||[{
    id:9001,
    state:"APPROVED",
    commit_id:candidateSha,
    user:{login:"ReleaseReviewer"}
  }];
  return {env,pr,reviews};
}

test("accepts approval bound to the merged PR head and exact release SHA",()=>{
  const evidence=validateGithubProductionApprovalEvidence(fixture());
  assert.equal(evidence.verified,true);
  assert.equal(evidence.releaseSha,releaseSha);
  assert.equal(evidence.reviewCommitSha,candidateSha);
  assert.equal(evidence.reference,`github:DataNest-Supository/DataNest#405:review:9001@${candidateSha}`);
});

test("rejects a merge commit that does not equal the release SHA",()=>{
  assert.throws(
    ()=>validateGithubProductionApprovalEvidence(fixture({pr:{merge_commit_sha:"c".repeat(40)}})),
    /merge commit does not match/i
  );
});

test("rejects approval from a stale candidate commit",()=>{
  assert.throws(
    ()=>validateGithubProductionApprovalEvidence(fixture({reviews:[{
      id:9001,state:"APPROVED",commit_id:"c".repeat(40),user:{login:"ReleaseReviewer"}
    }]})),
    /No commit-bound review decision/i
  );
});

test("rejects a later changes-requested decision from the required reviewer",()=>{
  assert.throws(
    ()=>validateGithubProductionApprovalEvidence(fixture({reviews:[
      {id:9001,state:"APPROVED",commit_id:candidateSha,user:{login:"ReleaseReviewer"}},
      {id:9002,state:"CHANGES_REQUESTED",commit_id:candidateSha,user:{login:"ReleaseReviewer"}}
    ]})),
    /has not approved the current PR head commit/i
  );
});

test("rejects production authorization evidence from a different repository",()=>{
  assert.throws(
    ()=>validateGithubProductionApprovalEvidence(fixture({pr:{base:{ref:"main",repo:{full_name:"Other/Repo"}}}})),
    /different repository/i
  );
});
