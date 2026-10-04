import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const pulseUrl=new URL("../../src/components/ResonancePortfolioPulse.tsx",import.meta.url);
const products=readFileSync(new URL("../../src/components/ProductsWorkspace.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../../src/app/globals.css",import.meta.url),"utf8");
const ledger=readFileSync(new URL("../../docs/RESONANCE_VALUE_CONSOLIDATION_20260926.md",import.meta.url),"utf8");

test("Products workspace exposes a governed Resonance portfolio pulse",()=>{
  assert.equal(existsSync(pulseUrl),true,"expected ResonancePortfolioPulse production component to exist");
  const pulse=readFileSync(pulseUrl,"utf8");
  assert.match(pulse,/Live ecosystem state, derived from governed DataNest records/);
  assert.match(pulse,/record_type==="evidence"/);
  assert.match(pulse,/record_type==="risk"/);
  assert.match(pulse,/record_type==="source_branch"\|\|item\.record_type==="datanest_branch"/);
  assert.match(products,/ResonancePortfolioPulse products=\{catalogProductsForPulse\}/);
  assert.match(products,/source_branch:"Source branches"/);
});

test("portfolio pulse preserves responsive and reduced-motion quality",()=>{
  assert.equal(existsSync(pulseUrl),true,"expected ResonancePortfolioPulse production component to exist");
  assert.match(css,/\.resonancePortfolioGrid\{display:grid/);
  assert.match(css,/@container datanest-main \(max-width:680px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.resonancePortfolioCard::before\{display:none\}\}/);
});

test("consolidation ledger rejects stale and local-runtime transplants",()=>{
  assert.match(ledger,/Do not migrate a branch merely because it exists/);
  assert.match(ledger,/no arbitrary shell, runner recovery, desktop control or local machine requirement/i);
  assert.match(ledger,/bridge_devices/);
  assert.match(ledger,/stale\/destructive drift/);
});
