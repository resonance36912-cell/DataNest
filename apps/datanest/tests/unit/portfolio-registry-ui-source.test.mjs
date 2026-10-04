import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const libPath=path.join(root,"src/lib/portfolioRegistry.ts");
const panelPath=path.join(root,"src/components/PortfolioRegistryPanel.tsx");
const productsPath=path.join(root,"src/components/ProductsWorkspace.tsx");
const appPath=path.join(root,"src/components/DataNestApp.tsx");

test("portfolio registry shared types and labels match the approved domain",()=>{
  assert.equal(fs.existsSync(libPath),true,"src/lib/portfolioRegistry.ts must exist");
  const source=fs.readFileSync(libPath,"utf8");
  for(const token of [
    "PortfolioRole","PortfolioItemKind","PortfolioReviewState","PortfolioClassification",
    "PortfolioLifecycle","PortfolioRelationshipType","PortfolioRegistryRow",
    "portfolioKindLabel","portfolioClassificationLabel","portfolioLifecycleLabel",
    "canProposePortfolio","canApprovePortfolio",
    "Pending Review","Owned","Shared DataNest","Independent Product","External"
  ]){
    assert.equal(source.includes(token),true,"missing "+token);
  }
});

test("portfolio registry panel is project scoped and all mutations use governed RPCs",()=>{
  assert.equal(fs.existsSync(panelPath),true,"src/components/PortfolioRegistryPanel.tsx must exist");
  const source=fs.readFileSync(panelPath,"utf8");
  assert.match(source,/from\("portfolio_registry_view"\)/);
  assert.match(source,/from\("portfolio_classifications"\)/);
  assert.match(source,/from\("portfolio_relationships"\)/);
  assert.match(source,/eq\("project_id",projectId\)/);
  assert.match(source,/Architectural ownership has not yet been approved\./);
  assert.match(source,/Provenance/);
  assert.match(source,/Product Lab evidence/);
  assert.match(source,/Relationships/);
  assert.match(source,/non-authoritative/i);
  assert.match(source,/supabase\.rpc\(name,args\)/);
  assert.match(source,/promote_product_candidate_v1/);
  assert.match(source,/approve_portfolio_classification_v1/);
  assert.match(source,/reject_portfolio_classification_v1/);
  assert.doesNotMatch(source,/from\("portfolio_(?:items|classifications|relationships|lifecycle_events)"\)\.insert/);
  assert.doesNotMatch(source,/from\("portfolio_(?:items|classifications|relationships|lifecycle_events)"\)\.update/);
  assert.doesNotMatch(source,/from\("portfolio_(?:items|classifications|relationships|lifecycle_events)"\)\.delete/);
});

test("Products exposes governed product and portfolio registry modes without redefining products",()=>{
  const products=fs.readFileSync(productsPath,"utf8");
  const app=fs.readFileSync(appPath,"utf8");
  assert.match(products,/Governed Products/);
  assert.match(products,/Portfolio Registry/);
  assert.match(products,/searchParams\.get\("section"\)/);
  const panel=fs.readFileSync(panelPath,"utf8");
  assert.match(panel,/searchParams\.get\("item"\)/);
  assert.match(products,/PortfolioRegistryPanel/);
  assert.match(products,/ResonancePortfolioPulse products=\{catalogProductsForPulse\}/);
  assert.match(products,/FREE_PROMOTION_LABEL/);
  assert.match(app,/ProductsWorkspace projectId=\{project\.id\} currentUserId=\{session\.user\.id\} role=\{membership\?\.role\|\|"viewer"\}/);
});

test("RONSAS composition keeps pending historical applications separate from ownership",()=>{
  const products=fs.readFileSync(productsPath,"utf8");
  assert.match(products,/Resonance Product Structure/);
  assert.match(products,/Career/);
  assert.match(products,/Create/);
  assert.match(products,/Grow/);
  assert.match(products,/Build/);
  assert.match(products,/Governed but not customer-facing/);
});
