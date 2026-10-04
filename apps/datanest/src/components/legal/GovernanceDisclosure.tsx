const reviewChain=[
  "Self-audit",
  "Automated verification",
  "Security validation",
  "Visual / UX review",
  "Governance-impact review",
  "Legal review where applicable",
  "External / human review",
  "Production authorization",
  "Deployment",
  "Post-deployment verification",
  "Dossier / evidence update"
] as const;

export default function GovernanceDisclosure(){
  return <section className="legalGovernanceDisclosure">
    <p className="eyebrow">RSGP · GOVERNANCE STRUCTURE</p>
    <h2>RSGP governance context</h2>
    <p>RSGP defines how DataNest separates AI assistance, system checks, human review, authorization, execution, and evidence.</p>
    <p><strong>Human authority remains final for consequential actions.</strong></p>
    <p>The RSGP Governed trust signal identifies the applicable internal governance context and does not represent third-party endorsement.</p>
    <h3>Production review chain</h3>
    <ol className="legalReviewChain">{reviewChain.map(step=><li key={step}>{step}</li>)}</ol>
  </section>;
}
