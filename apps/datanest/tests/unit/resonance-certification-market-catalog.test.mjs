import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("public certification market catalog matches governed ZAR commercial state",()=>{
  const catalog=JSON.parse(fs.readFileSync("public/market/resonance-certification-services.json","utf8"));
  assert.equal(catalog.commercialState,"published_pricing_bank_transfer");
  assert.equal(catalog.settlementCurrency,"ZAR");
  assert.equal(catalog.paymentMethod,"bank_transfer");
  assert.equal(catalog.automatedCheckout,"disabled");
  assert.deepEqual(
    catalog.services.map(item=>[item.code,item.displayPrice]),
    [
      ["RCS-SVC-01","ZAR 12,500"],
      ["RCS-SVC-02","From ZAR 58,500"],
      ["RCS-SVC-03","ZAR 12,500"],
      ["RCS-SVC-04","From ZAR 25,000"],
      ["RCS-SVC-05","From ZAR 21,000"]
    ]
  );
  assert.equal(catalog.intake.includes("human-review-gated"),true);
  assert.ok(catalog.services.every(item=>!item.displayPrice.includes("USD")));
});
