import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const productLab=fs.readFileSync(path.join(root,"src/components/ProductLab.tsx"),"utf8");

test("Product Lab surface model supports optional Portfolio Item linkage",()=>{
  assert.match(productLab,/portfolio_item_id:string\|null/);
  assert.match(productLab,/select\("[^"]*portfolio_item_id[^"]*"\)/);
  assert.match(productLab,/from\("portfolio_registry_view"\)/);
  assert.match(productLab,/type PortfolioItemOption=\{id:string;slug:string;name:string;item_kind:string;review_state:string;current_lifecycle:string\|null\}/);
});

test("Product Lab surface admin writes only an optional Portfolio Item reference",()=>{
  assert.match(productLab,/Portfolio item/);
  assert.match(productLab,/Unlinked \/ project-only surface/);
  assert.match(productLab,/selectedPortfolioItemId/);
  assert.match(productLab,/portfolio_item_id:selectedPortfolioItemId\|\|null/);
});

test("Product Lab displays linked portfolio context without acquiring promotion authority",()=>{
  assert.match(productLab,/linkedPortfolioItem/);
  assert.match(productLab,/item_kind/);
  assert.match(productLab,/review_state/);
  assert.match(productLab,/Production environment is runtime evidence, not product-promotion authority\./);
  assert.doesNotMatch(productLab,/promote_product_candidate_v1/);
});

test("legacy Product Lab behavior stays present",()=>{
  assert.match(productLab,/A build commit or immutable build identifier is required\./);
  assert.match(productLab,/PRODUCTION TEST/);
  assert.match(productLab,/product_test_runs/);
  assert.match(productLab,/postgres_changes/);
});
