import fs from "node:fs";
import path from "node:path";
import Link from "next/link";

export const metadata={
  title:"DataNest System Charter · Mission, Governance, Architecture & Assurance",
  description:"Public DataNest system charter covering mission, vision, governance, architecture, products, services, assurance, standards alignment and market-growth controls.",
  alternates:{canonical:"https://datanest-supository.github.io/DataNest/system-charter/"}
};

const report=fs.readFileSync(path.join(process.cwd(),"docs/DATANEST_SYSTEM_CHARTER.md"),"utf8");

export default function SystemCharterPage(){
  return <main className="publicReportPage">
    <header>
      <Link href="/transparency">← Public Transparency</Link>
      <a href="https://github.com/DataNest-Supository/DataNest/blob/main/docs/DATANEST_SYSTEM_CHARTER.md">Source ↗</a>
    </header>
    <article>
      <p className="eyebrow">PUBLIC SYSTEM CHARTER · VERSION 1.0</p>
      <h1>DataNest — Scope, Mission, Governance, Architecture &amp; Assurance</h1>
      <p className="muted">
        Source-controlled system charter. Standards references describe alignment targets and management-system design; they are not claims of external ISO certification or guaranteed business outcomes.
      </p>
      <div className="publicReportFrame"><pre>{report}</pre></div>
    </article>
  </main>
}
