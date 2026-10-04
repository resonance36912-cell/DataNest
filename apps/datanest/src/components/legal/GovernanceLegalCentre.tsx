import Link from "next/link";
import { LEGAL_DOCUMENTS, LEGAL_IDENTITY, legalApprovalLabel } from "@/lib/legalRegistry";
import GovernanceTrustMark from "@/components/platform/GovernanceTrustMark";
import ThemeControl from "@/components/platform/ThemeControl";
import AuthorshipPublicationsDisclosure from "@/components/legal/AuthorshipPublicationsDisclosure";

const LEGAL_IDS=new Set(["terms","privacy","disclaimers","acceptable-use","intellectual-property"]);

export default function GovernanceLegalCentre(){
  const legalDocuments=LEGAL_DOCUMENTS.filter(item=>LEGAL_IDS.has(item.id));
  return <main className="legalCentreShell" id="main-content">
    <header className="legalCentreHero">
      <div>
        <p className="eyebrow">RESONANCE DATANEST · GOVERNED PUBLIC RECORD</p>
        <h1>Governance &amp; Legal Centre</h1>
        <p>Operator identity, governance context, public policy status, accessibility, and traceability in one reviewable surface.</p>
      </div>
      <div className="legalCentreHeroActions">
        <ThemeControl compact />
        <GovernanceTrustMark/>
      </div>
    </header>

    <div className="legalCentreGrid">
      <section className="legalCentreSection" aria-labelledby="legal-governance-heading">
        <p className="eyebrow">CONTROL CONTEXT</p>
        <h2 id="legal-governance-heading">Platform Governance</h2>
        <p>RSGP is the governance structure applied across DataNest. Governance documentation remains evidence-bound and subject to applicable human review and authorization controls.</p>
        <Link href="/governance" className="legalCentreLink">Review governance context →</Link>
      </section>

      <section className="legalCentreSection legalCentreSectionWide" aria-labelledby="legal-policy-heading">
        <p className="eyebrow">POLICY STATUS</p>
        <h2 id="legal-policy-heading">Legal</h2>
        <div className="legalPolicyGrid">
          {legalDocuments.map(document=><Link className="legalPolicyCard" href={"/"+document.id} key={document.id}>
            <span>{document.title}</span>
            <strong>{legalApprovalLabel(document.status)}</strong>
            <code>{document.version}</code>
          </Link>)}
        </div>
      </section>

      <section className="legalCentreSection" aria-labelledby="legal-transparency-heading">
        <p className="eyebrow">EVIDENCE</p>
        <h2 id="legal-transparency-heading">Transparency</h2>
        <p>Audit, traceability, verification evidence, and published source artifacts remain available through the public transparency surfaces.</p>
        <Link href="/transparency" className="legalCentreLink">Open transparency →</Link>
      </section>

      <section className="legalCentreSection" aria-labelledby="legal-accessibility-heading">
        <p className="eyebrow">ACCESS</p>
        <h2 id="legal-accessibility-heading">Accessibility</h2>
        <p>Keyboard operation, visible focus, motion controls, contrast behavior, and theme preferences are documented separately.</p>
        <Link href="/accessibility" className="legalCentreLink">Open accessibility →</Link>
      </section>

      <AuthorshipPublicationsDisclosure/>

      <section className="legalCentreSection legalCentreSectionWide" aria-labelledby="legal-identity-heading">
        <p className="eyebrow">OPERATOR HIERARCHY</p>
        <h2 id="legal-identity-heading">Business Identity</h2>
        <dl className="legalIdentityChain">
          <div><dt>Legal operator</dt><dd>{LEGAL_IDENTITY.legalOperator}</dd></div>
          <div><dt>Business brand</dt><dd>{LEGAL_IDENTITY.businessBrand}</dd></div>
          <div><dt>Platform</dt><dd>{LEGAL_IDENTITY.platform}</dd></div>
          <div><dt>Governance</dt><dd>{LEGAL_IDENTITY.governanceLabel}</dd></div>
        </dl>
      </section>
    </div>
  </main>;
}
