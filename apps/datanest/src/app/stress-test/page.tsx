import fs from "node:fs";
import path from "node:path";
import Link from "next/link";

export const metadata={title:"DataNest AI Adversarial Stress Test"};

const report=fs.readFileSync(path.join(process.cwd(),"docs/ADVERSARIAL_STRESS_TEST_2026-09-28.md"),"utf8");

export default function StressTestPage(){
  return <main className="publicReportPage">
    <header><Link href="./transparency">← Public Audit Library</Link><a href="https://github.com/DataNest-Supository/DataNest/blob/main/docs/ADVERSARIAL_STRESS_TEST_2026-09-28.md">Source ↗</a></header>
    <article>
      <p className="eyebrow">PUBLISHED VALIDATION</p>
      <h1>DataNest AI Adversarial Stress-Test Evidence</h1>
      <p className="muted">Database-level validation record. This is not a full penetration test. The source-controlled report is rendered directly in this public DataNest page.</p>
      <div className="publicReportFrame"><pre>{report}</pre></div>
    </article>
  </main>
}
