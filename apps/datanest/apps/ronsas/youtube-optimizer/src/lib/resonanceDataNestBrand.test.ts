import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const appRoot=path.resolve(import.meta.dirname,"..");
const read=(relative:string)=>fs.existsSync(path.join(appRoot,relative))
  ?fs.readFileSync(path.join(appRoot,relative),"utf8")
  :"";

describe("YouTube Optimizer Resonance DataNest contract",()=>{
  it("loads canonical fonts and SSR adapter from the real TanStack root route",()=>{
    const root=read("routes/__root.tsx");
    for(const token of [
      "@fontsource-variable/inter-tight",
      "@fontsource-variable/inter",
      "@fontsource/instrument-serif",
      "@fontsource-variable/jetbrains-mono",
      "resonance-datanest-adapter.css?url"
    ]) expect(root).toContain(token);
    expect(root).toMatch(/href:\s*appCss[\s\S]*href:\s*resonanceDataNestCss/);
  });

  it("uses governed DataNest attribution and free-promotion legal destinations",()=>{
    const footer=read("components/SiteFooter.tsx");
    for(const token of [
      "Resonance Sole Proprietorship",
      "Resonance App Development",
      "Resonance DataNest",
      "RSGP Governed",
      "/DataNest/legal",
      "/DataNest/governance"
    ]) expect(footer).toContain(token);
    expect(footer).toMatch(/free (?:access )?promotion/i);
    expect(footer).not.toMatch(/checkout|subscribe|paid plan/i);
  });

  it("removes stale billing SEO and keeps legacy legal copy review-gated",()=>{
    const terms=read("pages/Terms.tsx");
    const privacy=read("pages/Privacy.tsx");
    for(const source of [terms,privacy]){
      expect(source).toContain("Review-gated legacy draft");
      expect(source).toContain("0.1-draft");
    }
    expect(terms).not.toMatch(/accounts, billing, acceptable use and cancellation/i);
    expect(privacy).not.toMatch(/industry-standard encryption|enterprise-grade security/i);
  });

  it("provides accessible adapter behavior with the YouTube Optimizer accent",()=>{
    const adapter=read("resonance-datanest-adapter.css");
    expect(adapter).toContain("--rdn-app-accent: #ff86ab");
    expect(adapter).toMatch(/prefers-color-scheme:\s*light/);
    expect(adapter).toMatch(/prefers-contrast:\s*more/);
    expect(adapter).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});
