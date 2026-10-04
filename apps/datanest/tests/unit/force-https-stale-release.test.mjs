import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync("public/force-https.js","utf8");

function runGuard({
  search,
  now,
  protocol="https:"
}){
  let replacement=null;
  const location={
    protocol,
    hostname:"datanest-supository.github.io",
    host:"datanest-supository.github.io",
    pathname:"/DataNest/",
    search,
    hash:"",
    replace(value){ replacement=value; }
  };
  vm.runInNewContext(source,{
    window:{location},
    URLSearchParams,
    Date:{now:()=>now}
  });
  return replacement;
}

test("stale release URLs refresh before DataNest client chunks load",()=>{
  const staleReload=Date.UTC(2026,8,28,18,9,32);
  const now=Date.UTC(2026,8,29,6,50,0);
  const replacement=runGuard({
    search:`?view=ai&release=12172732cbfefbb4&_reload=${staleReload}`,
    now
  });

  assert.ok(replacement,"expected stale release URL to be replaced");
  const url=new URL(replacement);
  assert.equal(url.protocol,"https:");
  assert.equal(url.pathname,"/DataNest/");
  assert.equal(url.searchParams.get("view"),"ai");
  assert.equal(url.searchParams.has("release"),false);
  assert.equal(url.searchParams.get("_reload"),String(now));
});

test("fresh release URLs are not replaced",()=>{
  const now=Date.UTC(2026,8,29,6,50,0);
  const replacement=runGuard({
    search:`?view=ai&release=current&_reload=${now-60_000}`,
    now
  });
  assert.equal(replacement,null);
});

test("http GitHub Pages URLs still upgrade to https",()=>{
  const now=Date.UTC(2026,8,29,6,50,0);
  const replacement=runGuard({
    search:"?view=ai",
    now,
    protocol:"http:"
  });
  assert.equal(replacement,"https://datanest-supository.github.io/DataNest/?view=ai");
});
