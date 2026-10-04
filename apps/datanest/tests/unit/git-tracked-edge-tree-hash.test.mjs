import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { gitTrackedTreeSha256 } from "../../scripts/lib/git-tracked-tree-sha256.mjs";

function git(cwd,args){
  return execFileSync("git",args,{cwd,encoding:"utf8"});
}

test("Edge source hash uses committed Git blobs and ignores runner-generated files",()=>{
  const repo=mkdtempSync(join(tmpdir(),"datanest-edge-hash-"));
  const originalCwd=process.cwd();
  try{
    git(repo,["init","-q"]);
    git(repo,["config","user.email","test@example.invalid"]);
    git(repo,["config","user.name","DataNest Test"]);
    mkdirSync(join(repo,"supabase","functions","demo"),{recursive:true});
    writeFileSync(join(repo,"supabase","functions","demo","index.ts"),"export const value = 1;\n");
    git(repo,["add","supabase/functions/demo/index.ts"]);
    git(repo,["commit","-qm","seed"]);

    process.chdir(repo);
    const committedHash=gitTrackedTreeSha256("supabase/functions");

    writeFileSync(join(repo,"supabase","functions","demo","deno.lock"),"runner generated\n");
    assert.equal(gitTrackedTreeSha256("supabase/functions"),committedHash,"untracked runner files must not affect the hash");

    writeFileSync(join(repo,"supabase","functions","demo","index.ts"),"export const value = 2;\n");
    assert.equal(gitTrackedTreeSha256("supabase/functions"),committedHash,"working-tree mutations must not affect the committed hash");

    git(repo,["add","supabase/functions/demo/index.ts"]);
    git(repo,["commit","-qm","change tracked source"]);
    assert.notEqual(gitTrackedTreeSha256("supabase/functions"),committedHash,"committed source changes must change the hash");
  }finally{
    process.chdir(originalCwd);
    rmSync(repo,{recursive:true,force:true});
  }
});
