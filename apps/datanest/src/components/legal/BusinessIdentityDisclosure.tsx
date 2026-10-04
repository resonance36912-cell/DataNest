import { LEGAL_IDENTITY } from "@/lib/legalRegistry";

export default function BusinessIdentityDisclosure(){
  return <section className="legalBusinessIdentityDisclosure">
    <p className="eyebrow">ACCOUNTABILITY</p>
    <h2>Operator and business identity</h2>
    <dl className="legalIdentityChain">
      <div><dt>Legal operator</dt><dd>{LEGAL_IDENTITY.legalOperator}</dd></div>
      <div><dt>Business brand</dt><dd>{LEGAL_IDENTITY.businessBrand}</dd></div>
      <div><dt>Platform</dt><dd>{LEGAL_IDENTITY.platform}</dd></div>
      <div><dt>Governance label</dt><dd>{LEGAL_IDENTITY.governanceLabel}</dd></div>
    </dl>
    <p>Legal, financial, ownership, and other consequential authority remains with authorized humans or entities rather than participation or AI output alone.</p>
  </section>;
}
