import TransparencyWorkspace from "@/components/TransparencyWorkspace";

export const metadata={
  title:"DataNest Public Audit Library",
  description:"Public DataNest architecture, audit, stress-test and transparency evidence."
};

export default function PublicTransparencyPage(){
  return <main className="publicEvidenceShell">
    <header className="publicEvidenceHeader">
      <a href="./" aria-label="Back to DataNest">← DataNest</a>
      <span>PUBLIC EVIDENCE</span>
    </header>
    <TransparencyWorkspace/>
    <footer className="publicEvidenceFooter">
      <span>Public evidence is read-only and does not grant project access.</span>
      <a href="/DataNest/assurance/">Independent assurance services ↗</a>
      <a href="https://github.com/DataNest-Supository/DataNest">Repository source ↗</a>
    </footer>
  </main>
}
