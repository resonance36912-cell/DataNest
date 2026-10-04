import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const appRoot=path.resolve(import.meta.dirname,"..");
const read=(relative:string)=>fs.existsSync(path.join(appRoot,relative))
  ?fs.readFileSync(path.join(appRoot,relative),"utf8")
  :"";

describe("ePublisher Resonance DataNest contract",()=>{
  it("loads canonical fonts and adapter after legacy styles",()=>{
    const main=read("main.tsx");
    expect(main).toContain("@fontsource-variable/inter-tight");
    expect(main).toContain("@fontsource-variable/inter");
    expect(main).toContain("@fontsource/instrument-serif");
    expect(main).toContain("@fontsource-variable/jetbrains-mono");
    expect(main).toMatch(/import "\.\/index\.css";[\s\S]*import "\.\/resonance-datanest-adapter\.css";/);
  });

  it("preserves ePublisher font variables light theme and RTL support",()=>{
    const index=read("index.css");
    const adapter=read("resonance-datanest-adapter.css");
    for(const token of ["--font-display","--font-body","--font-accent","--font-mono",".light","[dir=\"rtl\"]"]){
      expect(index).toContain(token);
    }
    expect(adapter).toContain("--rdn-app-accent: #8b5cf6");
    expect(adapter).toMatch(/prefers-contrast:\s*more/);
    expect(adapter).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it("uses governed DataNest attribution and central legal routes without paid access links",()=>{
    const footer=read("components/brand/ResonanceFooter.tsx");
    for(const token of ["Resonance Sole Proprietorship","Resonance App Development","Resonance DataNest","RSGP Governed","/DataNest/legal","/DataNest/governance"]){
      expect(footer).toContain(token);
    }
    expect(footer).toMatch(/free promotion/i);
    expect(footer).not.toMatch(/pricing|checkout|subscribe|buy now/i);
  });

  it("keeps legacy legal copy review-gated without unsupported guarantees",()=>{
    const terms=read("pages/Terms.tsx");
    const privacy=read("pages/Privacy.tsx");
    for(const source of [terms,privacy]){
      expect(source).toContain("Review-gated legacy draft");
      expect(source).toContain("0.1-draft");
      expect(source).not.toMatch(/new Date\s*\(|toLocaleDateString\s*\(/);
    }
    expect(privacy).not.toMatch(/industry-standard encryption|enterprise-grade security/i);
  });
});
