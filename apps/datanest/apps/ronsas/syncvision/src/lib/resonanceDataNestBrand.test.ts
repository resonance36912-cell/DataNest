import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const appRoot=path.resolve(import.meta.dirname,"..");
const read=(relative:string)=>fs.existsSync(path.join(appRoot,relative))
  ?fs.readFileSync(path.join(appRoot,relative),"utf8")
  :"";

describe("SyncVision Resonance DataNest contract",()=>{
  it("loads canonical fonts and adapter without moving the sovereign guard behind React mount",()=>{
    const main=read("main.tsx");
    for(const token of [
      "@fontsource-variable/inter-tight",
      "@fontsource-variable/inter",
      "@fontsource/instrument-serif",
      "@fontsource-variable/jetbrains-mono",
      "./resonance-datanest-adapter.css"
    ]) expect(main).toContain(token);

    const guardIndex=main.indexOf("installSovereignNetworkGuard();");
    const mountIndex=main.indexOf("createRoot(");
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(mountIndex).toBeGreaterThan(guardIndex);
    expect(main).toContain("installCrashLogger();");
    expect(main).toContain("installGlobalErrorListeners();");
  });

  it("uses governed DataNest attribution and central legal routes without paid access links",()=>{
    const footer=read("components/brand/ResonanceFooter.tsx");
    for(const token of [
      "Resonance Sole Proprietorship",
      "Resonance App Development",
      "Resonance DataNest",
      "RSGP Governed",
      "/DataNest/legal",
      "/DataNest/governance"
    ]) expect(footer).toContain(token);
    expect(footer).toMatch(/free promotion/i);
    expect(footer).not.toMatch(/pricing|checkout|subscribe|buy now/i);
  });

  it("keeps the SyncVision accent accessibility modes and sovereign FFmpeg pins",()=>{
    const adapter=read("resonance-datanest-adapter.css");
    const pkg=JSON.parse(read("../package.json"));
    expect(adapter).toContain("--rdn-app-accent: #42e7ff");
    expect(adapter).toMatch(/prefers-color-scheme:\s*light/);
    expect(adapter).toMatch(/prefers-contrast:\s*more/);
    expect(adapter).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(pkg.dependencies?.["@ffmpeg/ffmpeg"]).toBe("0.12.10");
    expect(pkg.dependencies?.["@ffmpeg/util"]).toBe("0.12.1");
    expect(pkg.dependencies?.["@ffmpeg/core"]).toBe("0.12.10");
  });
});
