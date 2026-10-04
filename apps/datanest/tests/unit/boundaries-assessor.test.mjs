import assert from "node:assert/strict";
import test from "node:test";
import { assessPolicy, globToRegExp } from "../../scripts/boundaries-assessor.mjs";

test("glob matcher supports recursive and single-segment patterns",()=>{
  assert.equal(globToRegExp("knowledge/**").test("knowledge/feeds/a.json"),true);
  assert.equal(globToRegExp(".github/workflows/*.yml").test(".github/workflows/pages.yml"),true);
  assert.equal(globToRegExp(".github/workflows/*.yml").test(".github/workflows/x/pages.yml"),false);
});

test("touching a governed scope requires review without implying authorization",()=>{
  const policy={
    scopes:[{id:"knowledge",tolerance:"provisional",patterns:["knowledge/**"],acceptance:["review"]}],
    hardRules:[]
  };
  const result=assessPolicy(policy,["knowledge/README.md"],{"knowledge/README.md":"ok"});
  assert.equal(result.status,"review");
  assert.equal(result.touchedScopes[0].id,"knowledge");
});

test("hard boundary violations block",()=>{
  const policy={
    scopes:[],
    hardRules:[{
      id:"isolation",
      files:["sync.yml"],
      forbiddenText:["FREETREE"],
      message:"isolated"
    }]
  };
  const result=assessPolicy(policy,["sync.yml"],{"sync.yml":"sync FREETREE"});
  assert.equal(result.status,"block");
  assert.equal(result.blockers[0].rule,"isolation");
});
