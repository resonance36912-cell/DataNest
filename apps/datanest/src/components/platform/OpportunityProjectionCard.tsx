type OpportunityProjection = {
  id:string;
  title:string;
  estimatedValue?:string;
  confidence?:string;
  assumptions?:readonly string[];
  dependencies?:readonly string[];
  governanceImpact?:string;
  nextAction?:string;
};

export default function OpportunityProjectionCard({opportunity}:{opportunity:OpportunityProjection|null}) {
  if(!opportunity){
    return <section className="panel" aria-label="Business opportunity signal" data-opportunity-state="empty">
      <p className="eyebrow">BUSINESS OPPORTUNITY</p>
      <h3>No governed opportunity signal yet</h3>
      <p className="muted">Opportunity projections appear only when DataNest has a governed evidence source, explicit assumptions, and a reviewable basis. No value is inferred from the current project snapshot.</p>
    </section>;
  }

  return <section className="panel" aria-label="Business opportunity signal" data-opportunity-state="available">
    <p className="eyebrow">BUSINESS OPPORTUNITY</p>
    <h3>{opportunity.title}</h3>
    {opportunity.estimatedValue&&<p><strong>Estimated value</strong> · {opportunity.estimatedValue}</p>}
    {opportunity.confidence&&<p><strong>Confidence</strong> · {opportunity.confidence}</p>}
    {opportunity.governanceImpact&&<p><strong>Governance impact</strong> · {opportunity.governanceImpact}</p>}
    {opportunity.nextAction&&<p><strong>Next governed action</strong> · {opportunity.nextAction}</p>}
  </section>;
}

export type {OpportunityProjection};
