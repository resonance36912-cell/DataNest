import LegalDocumentLayout from "@/components/legal/LegalDocumentLayout";
import LegalDraftNotice from "@/components/legal/LegalDraftNotice";
import { getLegalDocument } from "@/lib/legalRegistry";

export const metadata={title:"Terms & Conditions · Draft · Resonance DataNest"};

export default function TermsPage(){
  return <LegalDocumentLayout document={getLegalDocument("terms")}>
    <LegalDraftNotice/>
    <section><h2>Scope under review</h2><p>This draft is organizing the intended relationship between Resonance DataNest, its operator, its applications, and users. Final rights, obligations, remedies, and jurisdictional terms require authorized legal review.</p></section>
    <section><h2>AI-assisted work</h2><p>DataNest AI can assist with analysis, drafting, and recommendations. Consequential decisions and approvals remain subject to the applicable human authority and governance controls.</p></section>
    <section><h2>Current promotion state</h2><p>The platform currently operates under a free-promotion direction. No paid transaction is required by this draft, and any future commercial terms require a separately approved change.</p></section>
  </LegalDocumentLayout>;
}
