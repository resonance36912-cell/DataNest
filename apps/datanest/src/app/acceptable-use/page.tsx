import LegalDocumentLayout from "@/components/legal/LegalDocumentLayout";
import LegalDraftNotice from "@/components/legal/LegalDraftNotice";
import { getLegalDocument } from "@/lib/legalRegistry";

export const metadata={title:"Acceptable Use · Draft · Resonance DataNest"};

export default function AcceptableUsePage(){
  return <LegalDocumentLayout document={getLegalDocument("acceptable-use")}>
    <LegalDraftNotice/>
    <section><h2>Review categories</h2><p>The final acceptable-use policy is expected to address unlawful misuse, unauthorized access, credential abuse, attempts to bypass governance controls, and misuse of automation that creates material harm.</p></section>
    <section><h2>Enforcement under review</h2><p>Restriction, suspension, evidence retention, appeal, and escalation procedures remain draft topics until they are reviewed against the actual platform controls and applicable law.</p></section>
  </LegalDocumentLayout>;
}
