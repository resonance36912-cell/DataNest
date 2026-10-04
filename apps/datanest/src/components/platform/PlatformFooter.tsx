import Link from "next/link";
import { RESON8_HUB_URL } from "@/lib/reson8";
import {
  DATANEST_DISPLAY_NAME,
  RESONANCE_BUSINESS_IDENTITY
} from "@/lib/brandIdentity";

const legalLinks=[{"href":"/legal","label":"Legal Centre"},{"href":"/governance","label":"Governance"},{"href":"/privacy","label":"Privacy"},{"href":"/terms","label":"Terms"},{"href":"/disclaimers","label":"Disclaimers"}] as const;

export default function PlatformFooter({compact=false}:{compact?:boolean}) {
  return (
    <footer className={"platformFooter"+(compact?" compact":"")} role="contentinfo" aria-label="Resonance DataNest operator and governance">
      <div className="platformFooterIdentity">
        <strong>{DATANEST_DISPLAY_NAME}</strong>
        <p>
          {DATANEST_DISPLAY_NAME} is operated by {RESONANCE_BUSINESS_IDENTITY.legalOperator} under the {RESONANCE_BUSINESS_IDENTITY.businessBrand} brand.
          {" "}Platform applications, functions, and service offerings are governed through the RSGP governance structure.
        </p>
        <p className="platformFooterPromotion">Services remain available under the current free promotion; no paid purchase flow is active.</p>
      </div>
      <nav className="platformFooterLinks" aria-label="Platform governance and ecosystem links">
        {legalLinks.map(item=><Link href={item.href} key={item.href}>{item.label}</Link>)}
        <Link href="/transparency">Public Audit Library</Link>
        <a href={RESON8_HUB_URL} target="_blank" rel="noreferrer">Reson8 ecosystem <span aria-hidden="true">↗</span></a>
      </nav>
    </footer>
  );
}
