import "./assurance.css";
import Link from "next/link";

export const metadata = {
  title: "Independent Regulatory Assurance, Audit & Digital Oversight",
  description:
    "Evidence-first governance reviews, technical audits, compliance-readiness assessments, authorized digital monitoring and implementation support from DataNest.",
  keywords: [
    "independent audit South Africa",
    "POPIA readiness",
    "AI governance audit",
    "technical audit",
    "compliance monitoring",
    "digital oversight",
    "control verification",
    "regulatory readiness"
  ],
  alternates: {
    canonical: "https://datanest-supository.github.io/DataNest/assurance/"
  },
  openGraph: {
    type: "website",
    title: "DataNest Independent Regulatory Assurance & Audit Services",
    description:
      "Governance, technical audit, compliance-readiness, evidence and authorized digital oversight services."
  }
};

const packages = [
  ["Regulatory & Controls Baseline", "R7,500", "once-off", "Control inventory, priority findings and executive brief for one environment."],
  ["Compliance Readiness Review", "R15,000", "once-off", "POPIA/PAIA and standards-aligned readiness mapping, evidence gaps and remediation plan."],
  ["Technical Audit & Evidence Pack", "R25,000", "once-off", "Application, cloud or repository control review with risk-ranked evidence and implementation backlog."],
  ["Continuous Digital Oversight", "R6,500", "per month", "Authorized drift/change monitoring, monthly control review and escalation register."],
  ["Enterprise Oversight", "R15,000", "per month", "Multi-system governance dashboard, supplier evidence tracking and quarterly deep review."],
  ["Specialist Advisory", "R1,850", "per hour", "Architecture, governance, security, evidence, remediation and implementation advisory."]
] as const;

const issueUrl =
  "https://github.com/DataNest-Supository/DataNest/issues/new?template=trade-implementation-interest.yml";

const serviceSchema = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "DataNest Independent Regulatory Assurance & Audit Services",
  provider: {
    "@type": "Organization",
    name: "DataNest · Resonance AppDev"
  },
  areaServed: {
    "@type": "Country",
    name: "South Africa"
  },
  serviceType: [
    "Regulatory readiness assessment",
    "Technical audit support",
    "Compliance readiness",
    "Governance and controls review",
    "Authorized digital oversight",
    "Implementation and remediation support"
  ],
  url: "https://datanest-supository.github.io/DataNest/assurance/"
};

export default function AssurancePage() {
  return (
    <main className="publicReportPage">
      <script type="application/ld+json">{JSON.stringify(serviceSchema)}</script>
      <header>
        <Link href="/transparency">← Public Transparency</Link>
        <a href="https://github.com/DataNest-Supository/DataNest/blob/main/docs/INDEPENDENT_REGULATORY_ASSURANCE_SERVICES.md">
          Service charter ↗
        </a>
      </header>

      <article>
        <p className="eyebrow">DATANEST · INDEPENDENT OVERSIGHT SERVICES</p>
        <h1>Regulatory readiness, technical audit &amp; authorized digital oversight</h1>
        <p className="muted">
          Evidence-first reviews and continuous monitoring for software, AI, data, cloud and governance environments.
          DataNest is a private independent service and does not claim statutory government-regulator, IRBA audit-firm,
          or accredited certification-body status.
        </p>

        <section>
          <h2>Launch pricing</h2>
          <div className="assurancePricingGrid">
            {packages.map(([name, price, cadence, summary]) => (
              <article className="assurancePriceCard" key={name}>
                <p className="eyebrow">{cadence}</p>
                <h3>{name}</h3>
                <p className="assurancePrice">{price}</p>
                <p>{summary}</p>
              </article>
            ))}
          </div>
          <p className="muted">
            Specialist day rate: R12,500. Taxes, travel, external certification/registration fees and specialist third-party
            tools are excluded unless quoted. Final scope and authorization are agreed in writing before work starts.
          </p>
          <p>
            <strong>Founding-client offer:</strong> the first three qualified implementations may receive a 20% launch
            discount in exchange for permission to publish a sanitized case study and outcome metrics. Confidential and
            personal information is never published without written authorization.
          </p>
        </section>

        <section>
          <h2>What we can assess and monitor</h2>
          <ul>
            <li>Governance, policy, evidence and control design.</li>
            <li>Repositories, software-delivery workflows, cloud and AI operating environments.</li>
            <li>POPIA/PAIA readiness and security-safeguard evidence.</li>
            <li>Change, drift, control failures and implementation progress.</li>
            <li>Supplier, platform and operational evidence for management, procurement and due diligence.</li>
          </ul>
        </section>

        <section>
          <h2>Surveillance boundary</h2>
          <p>
            Monitoring is limited to systems, repositories, logs, workflows, public sources and assets the client owns or is
            authorized to monitor. This offer excludes covert interception, spyware, unlawful person tracking, unauthorized
            third-party access and physical/private-security services.
          </p>
        </section>

        <section>
          <h2>Trade &amp; implementation</h2>
          <p>
            Submit a non-confidential scope note for partnership, procurement, implementation, reseller, integration or
            enterprise-assessment discussions. A fit/scope screen is offered at no charge.
          </p>
          <p>
            <a className="primaryAction" href={issueUrl}>Open a Trade &amp; Implementation Interest request ↗</a>
          </p>
        </section>

        <section>
          <h2>Regulatory status</h2>
          <p>
            Statutory audit opinions, regulated assurance, accredited certification and private-security activities are only
            accepted when the required registration/accreditation is independently verified or an appropriately qualified
            partner is engaged. DataNest assessments are evidence and readiness services unless the written engagement says
            otherwise.
          </p>
        </section>
      </article>
    </main>
  );
}
