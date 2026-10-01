import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const app=fs.readFileSync(path.join(root,"src/components/DataNestApp.tsx"),"utf8");
const products=fs.readFileSync(path.join(root,"src/components/ProductsWorkspace.tsx"),"utf8");
const gateway=fs.readFileSync(path.join(root,"supabase/functions/datanest-ai-chat/index.ts"),"utf8");
const learningGateway=fs.readFileSync(path.join(root,"supabase/functions/_shared/datanestAiLearning.ts"),"utf8");
const productMigration=fs.readFileSync(path.join(root,"supabase/migrations/20260926055810_add_governed_product_catalog.sql"),"utf8");
const certificationMigration=fs.readFileSync(path.join(root,"supabase/migrations/20261001140000_resonance_certification_service_offering.sql"),"utf8");
const ronsasSnapshot=fs.readFileSync(path.join(root,"data/imports/ronsas-product-20260926.jsonl"),"utf8");

test("Products is a first-class DataNest workspace",()=>{
  assert.match(app,/key:"products",label:"Products"/);
  assert.match(app,/view==="products"&&<ProductsWorkspace projectId={project.id} currentUserId={session.user.id} role={membership\?\.role\|\|"viewer"}\/>/);
  assert.match(app,/Inspect governed products, linked architecture, controls, evidence and specialist experiences/);
  assert.match(app,/Inspect governed Resonance products, their architecture, controls, evidence, risks and promotion branches/);
});

test("Resonance Assistance exposes Legal Eagle as its first live governed product",()=>{
  assert.match(products,/CONCEPT 01/);
  assert.match(products,/Resonance Assistance Product Experience/);
  assert.doesNotMatch(products,/PRODUCT 01/);
  assert.match(products,/Resonance Assistance/);
  assert.match(products,/FIRST SPECIALIST · LIVE PRODUCT/);
  assert.match(products,/Legal Eagle/);
  assert.match(products,/GOVERNED ASSISTANT/);
  assert.match(products,/LIVE GOVERNED PRODUCT/);
  assert.match(products,/Open Legal Eagle/);
});

test("Legal Eagle calls the governed AI gateway with matter and jurisdiction scope",()=>{
  assert.match(products,/functions\.invoke\("datanest-ai-chat"/);
  assert.match(products,/productMode:"legal_eagle"/);
  assert.match(products,/jurisdiction:cleanJurisdiction/);
  assert.match(products,/legalTask:selectedTask\.key/);
  assert.match(products,/jobId:selectedJob\.id/);
  assert.match(products,/datanest\.legalEagle\.session/);
});

test("Legal Eagle keeps legal decisions and representation with humans",()=>{
  assert.match(products,/does not create an attorney-client relationship/);
  assert.match(products,/not be relied on as a substitute for advice from a\s+qualified lawyer/);
  assert.match(products,/No fabricated authority/);
  assert.match(products,/No autonomous deadlines/);
  assert.match(products,/No representation/);
  assert.match(products,/Human escalation/);
});

test("Legal Eagle backend requires jurisdiction and blocks automatic learning",()=>{
  assert.match(gateway,/productMode==="legal_eagle"/);
  assert.match(gateway,/Legal Eagle requires a jurisdiction before substantive assistance/);
  assert.match(gateway,/do not create an attorney-client relationship or legal privilege/);
  assert.match(gateway,/Do not fabricate statutes, cases, citations, court rules, filing requirements or deadlines/);
  assert.match(gateway,/const learningEligible=!legalMode&&!developmentMode&&reuseState==="project_learning_eligible"/);
  assert.match(gateway,/requested_learning_eligible:learningEligible/);
  assert.match(gateway,/learning_eligible:finalLearningEligible/);
  assert.match(learningGateway,/filter\(\(item:any\)=>item\.metadata\.learning_eligible===true\)/);
  assert.match(gateway,/if\(legalMode\)\{\s*trendAnalysis=\{status:"not_applicable"\};\s*return;/);
  assert.match(gateway,/target_hard_learning_exclusion:!learningEligible/);
});


test("Products reads the governed product catalog from Supabase",()=>{
  assert.match(products,/from\("products"\)/);
  assert.match(products,/from\("product_records"\)/);
  assert.match(products,/GOVERNED PRODUCT CATALOG/);
  assert.match(products,/FREE_PROMOTION_LABEL|FREE PROMOTION · BILLING OFF/);
  assert.match(products,/PARENT PLATFORM/);
  assert.match(products,/RESON8\.DATANEST\.LIFE/);
  assert.match(products,/EXECUTION AUTHORITY/);
  assert.match(products,/\["intake","staging","audit","main"\]/);
  assert.match(products,/className="catalogNavigator"/);
  assert.match(products,/selectedProductId/);
  assert.match(products,/Search governed product records/);
  assert.match(products,/Filter governed record type/);
  assert.match(products,/visibleRecords/);
  assert.match(products,/No governed records match this view/);
  assert.match(products,/catalogDetailsOpen/);
  assert.match(products,/setCatalogDetailsOpen\(Boolean\(requestedQuery\)\|\|nextType!=="all"\)/);
  assert.match(products,/copyCatalogViewLink/);
  assert.match(products,/navigator\.clipboard\?\.writeText/);
  assert.match(products,/Copy view link/);
  assert.match(products,/View link copied\./);
  assert.match(products,/searchParams\.set\("product",nextProduct\)/);
  assert.match(products,/searchParams\.set\("recordType",recordTypeFilter\)/);
  assert.match(products,/searchParams\.set\("q",query\)/);
  assert.match(products,/SHAREABLE VIEW · URL SYNCED/);
});

test("governed product catalog schema is versioned with project-scoped RLS",()=>{
  assert.match(productMigration,/create table public\.products/);
  assert.match(productMigration,/create table public\.product_records/);
  assert.match(productMigration,/alter table public\.products enable row level security/);
  assert.match(productMigration,/private\.has_project_role\(project_id/);
  assert.match(productMigration,/private\.is_project_member\(project_id\)/);
});

test("RONSAS import snapshot remains complete and preserves commercial governance",()=>{
  const rows=ronsasSnapshot.trim().split("\n").map(line=>JSON.parse(line));
  assert.equal(rows.length,73);
  const product=rows.find(row=>row.record_type==="product");
  assert.ok(product);
  assert.equal(product.slug,"ronsas");
  assert.equal(product.full_name,"Resonance Open Nova Sovereign Application Suite");
  assert.equal(product.billing_enabled,false);
  assert.equal(product.commercial_mode,"free promotion / no billing until pricing is established");
  assert.equal(product.parent_platform,"Resonance DataNest");
  assert.equal(product.product_role,"governed_product");
  assert.equal(product.execution_authority,"DataNest");
  assert.equal(product.promotion_authority,"DataNest");
  assert.equal(product.hosting_model,"replaceable_delivery_infrastructure");
  assert.equal(product.primary_runtime,"DataNest repository source with Windows local runtime");
  assert.equal(product.source_repository,"DataNest-Supository/DataNest");

  const children=rows.filter(row=>row.record_type!=="product");
  assert.equal(children.length,72);
  assert.equal(children.filter(row=>row.record_type==="application").length,10);
  assert.equal(children.filter(row=>row.record_type==="governance_control").length,8);
  assert.equal(children.filter(row=>row.record_type==="risk").length,6);
  assert.equal(children.filter(row=>row.record_type==="roadmap_item").length,7);
  assert.deepEqual(
    children.filter(row=>row.record_type==="datanest_branch").map(row=>row.name).sort(),
    ["audit","intake","main","staging"]
  );
});


test("Products preserves governed catalog semantics while adding Portfolio Registry",()=>{
  assert.match(products,/Governed Products/);
  assert.match(products,/Portfolio Registry/);
  assert.match(products,/PortfolioRegistryPanel/);
  assert.match(products,/ResonancePortfolioPulse products=\{catalogProductsForPulse\}/);
  assert.match(products,/searchParams\.get\("product"\)/);
  assert.match(products,/searchParams\.get\("recordType"\)/);
  assert.match(products,/searchParams\.get\("q"\)/);
  assert.match(products,/FREE_PROMOTION_LABEL/);
});


test("Governed Products render Portfolio Registry lifecycle when a product is linked",()=>{
  assert.match(products,/function governedProductLifecycle/);
  assert.match(products,/linked_product_id===product\.id/);
  assert.match(products,/current_lifecycle/);
  assert.match(products,/governedProductLifecycle\(product,portfolioItems\)/);
});


test("Portfolio Pulse receives governed products with Portfolio Registry lifecycle applied",()=>{
  assert.match(products,/catalogProductsForPulse/);
  assert.match(products,/governedProductLifecycle\(product,portfolioItems\)/);
  assert.match(products,/ResonancePortfolioPulse products=\{catalogProductsForPulse\}/);
});

test("Resonance Certification & Assurance is a governed market service offering",()=>{
  assert.match(products,/Resonance Certification & Assurance/);
  assert.match(products,/certification|assurance/i);
  assert.match(certificationMigration,/RCS-SVC-01/);
  assert.match(certificationMigration,/billing_enabled,false/);
  assert.match(certificationMigration,/external_accreditation_claim/);
  assert.match(certificationMigration,/external_accreditation_claim',false/);
});

const certificationPanel=fs.readFileSync(path.join(root,"src/components/CertificationServicesPanel.tsx"),"utf8");

test("Certification services are customer-facing with pricing and governed intake",()=>{
  assert.match(certificationPanel,/Resonance Certification & Assurance/);
  assert.match(certificationPanel,/USD 750/);
  assert.match(certificationPanel,/From USD 3,500/);
  assert.match(certificationPanel,/From USD 1,500/);
  assert.match(certificationPanel,/From USD 1,250/);
  assert.match(certificationPanel,/Submit service request/);
  assert.match(certificationPanel,/create_certification_service_request_v1/);
  assert.match(certificationPanel,/external accreditation/i);
  assert.match(products,/CertificationServicesPanel/);
});


const certificationLaunchMigration=fs.readFileSync(path.join(root,"supabase/migrations/20261001170000_certification_business_bank_settlement_launch.sql"),"utf8");
const bankPaymentMigration=fs.readFileSync(path.join(root,"supabase/migrations/20261001162000_certification_bank_transfer_business_payments.sql"),"utf8");
const bankPanel=fs.readFileSync(path.join(root,"src/components/CertificationServicesPanel.tsx"),"utf8");

test("bank-transfer payment intake is a governed commercial path",()=>{
  assert.equal(bankPaymentMigration.includes("settlement_currency text not null default 'ZAR'"),true);
  assert.equal(bankPaymentMigration.includes("payment_method text not null default 'bank_transfer'"),true);
  assert.equal(bankPaymentMigration.includes("issued invoices are denominated in ZAR"),true);
  assert.equal(certificationLaunchMigration.includes("published_pricing_bank_transfer"),true);
  assert.equal(bankPanel.includes("Bank transfer / EFT"),true);
  assert.equal(bankPanel.includes("target_requested_currency:requestedCurrency"),true);
  assert.equal(bankPanel.includes("create_certification_service_request_v2"),true);
});
