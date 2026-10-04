import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const appRoot=path.resolve(import.meta.dirname,"..");
const read=(relative:string)=>fs.existsSync(path.join(appRoot,relative))
  ?fs.readFileSync(path.join(appRoot,relative),"utf8")
  :"";

describe("Creative Studio Resonance DataNest contract",()=>{
  it("loads canonical fonts and a deliberate DataNest adapter after the legacy stylesheet",()=>{
    const main=read("main.tsx");
    expect(main).toContain("@fontsource-variable/inter-tight");
    expect(main).toContain("@fontsource-variable/inter");
    expect(main).toContain("@fontsource/instrument-serif");
    expect(main).toContain("@fontsource-variable/jetbrains-mono");
    expect(main).toMatch(/import "\.\/index\.css";[\s\S]*import "\.\/resonance-datanest-adapter\.css";/);
  });

  it("uses governed operator attribution and central legal destinations without paid checkout",()=>{
    const footer=read("components/brand/ResonanceFooter.tsx");
    expect(footer).toContain("Resonance Sole Proprietorship");
    expect(footer).toContain("Resonance App Development");
    expect(footer).toContain("Resonance DataNest");
    expect(footer).toContain("RSGP Governed");
    expect(footer).toContain("/DataNest/legal");
    expect(footer).toContain("/DataNest/governance");
    expect(footer).toMatch(/free promotion/i);
    expect(footer).not.toMatch(/checkout|subscribe|buy now/i);
  });

  it("keeps legal copy visibly review-gated and removes manufactured dates and unsupported guarantees",()=>{
    const terms=read("pages/Terms.tsx");
    const privacy=read("pages/Privacy.tsx");
    for(const source of [terms,privacy]){
      expect(source).toContain("Review-gated legacy draft");
      expect(source).toContain("0.1-draft");
      expect(source).not.toMatch(/new Date\s*\(|toLocaleDateString\s*\(/);
    }
    expect(privacy).not.toMatch(/industry-standard encryption/i);
    expect(privacy).not.toMatch(/not retained beyond the generation session/i);
  });

  it("provides accessible light, high-contrast and reduced-motion adapter behavior",()=>{
    const adapter=read("resonance-datanest-adapter.css");
    expect(adapter).toContain("--rdn-app-accent: #ff36d8");
    expect(adapter).toMatch(/prefers-color-scheme:\s*light/);
    expect(adapter).toMatch(/prefers-contrast:\s*more/);
    expect(adapter).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});
