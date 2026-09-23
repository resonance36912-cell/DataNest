import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const launcher = readFileSync(new URL("../Start-RonsasDesktop.ps1", import.meta.url), "utf8");
const installer = readFileSync(
  new URL("../Install-RonsasSovereignShortcuts.ps1", import.meta.url),
  "utf8",
);
const cluster = readFileSync(
  new URL("../../ops/ealiophin/cluster/START-RONSAS-ECOSYSTEM.ps1", import.meta.url),
  "utf8",
);

describe("RONSAS desktop startup", () => {
  test("delegates only to the canonical cluster controls", () => {
    expect(launcher).toContain("START-RONSAS-ECOSYSTEM.ps1");
    expect(launcher).toContain("STATUS-RONSAS-ECOSYSTEM.ps1");
    expect(launcher).toContain("STOP-RONSAS-ECOSYSTEM.ps1");
    expect(launcher).not.toContain("vite preview");
    expect(launcher).not.toContain("ollama serve");
    expect(launcher).not.toContain("syncvision-local-stt.py");
  });

  test("keeps startup console-free and file-logged", () => {
    expect(launcher).toContain("-WindowStyle Hidden");
    expect(launcher).toContain("-RedirectStandardOutput");
    expect(launcher).toContain("-RedirectStandardError");
    expect(launcher).toContain("Local\\RONSAS_Desktop_Control");
    expect(launcher).toContain("last-operation.txt");
  });

  test("prefers an installed complete control bundle before live or source fallbacks", () => {
    expect(launcher).toContain("Test-CompleteControlRoot");
    expect(launcher).toContain("Control\\ops\\ealiophin\\cluster");
    expect(launcher).toContain("RONSAS-MODULES.json");
    expect(launcher).toContain("syncvision-local-stt.py");
    expect(launcher).toContain("rons-local-llm-service.py");
    expect(launcher).toContain("epublisher-premium-image-service.py");
    expect(launcher).toContain(
      "Documents\\GitHub\\rons-sovereign-codebase\\ops\\ealiophin\\cluster",
    );
    expect(launcher).toContain("No complete RONSAS control root is available.");
  });

  test("owns the RONS - ALL shortcut as a hidden canonical entry point", () => {
    expect(installer).toContain("Start-RonsasDesktop.ps1");
    expect(installer).toContain("RONS - ALL.lnk");
    expect(installer).toContain("-WindowStyle Hidden");
    expect(installer).toContain("-Action Start");
    expect(installer).toContain("-WindowStyle 7");
  });

  test("installs a topology-preserving canonical control bundle", () => {
    expect(installer).toContain("Control\\ops\\ealiophin");
    expect(installer).toContain("START-RONSAS-ECOSYSTEM.ps1");
    expect(installer).toContain("STATUS-RONSAS-ECOSYSTEM.ps1");
    expect(installer).toContain("STOP-RONSAS-ECOSYSTEM.ps1");
    expect(installer).toContain("RONSAS-MODULES.json");
    expect(installer).toContain("epublisher-premium-image-service.py");
  });

  test("uses the compatible Vite config loader for Creative Studio", () => {
    expect(cluster).toContain("[string]$ConfigLoader = '') {");
    expect(cluster).toContain("@('--configLoader', $ConfigLoader)");
    expect(cluster).toContain(
      "creative-studio-sovereign-local-v0.1') 3201 'preview' '127.0.0.1' 'runner'",
    );
  });
});
