import fs from "node:fs";
import path from "node:path";
import Link from "next/link";

export const metadata={title:"DataNest Architecture & Infrastructure"};

const report=fs.readFileSync(path.join(process.cwd(),"docs/ARCHITECTURE.md"),"utf8");

export default function ArchitecturePage(){
  return <main className="publicReportPage">
    <header><Link href="./transparency">← Public Audit Library</Link><a href="https://github.com/DataNest-Supository/DataNest/blob/main/docs/ARCHITECTURE.md">Source ↗</a></header>
    <article>
      <p className="eyebrow">PUBLISHED ARCHITECTURE</p>
      <h1>Resonance DataNest — Architecture &amp; Infrastructure</h1>
      <p className="muted">The source-controlled architecture document is rendered directly in this public DataNest page; no external iframe is required.</p>
      <div className="publicReportFrame"><pre>{report}</pre></div>
    </article>
  </main>
}
