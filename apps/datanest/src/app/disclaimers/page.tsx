import LegalDocumentLayout from "@/components/legal/LegalDocumentLayout";
import LegalDraftNotice from "@/components/legal/LegalDraftNotice";
import { getLegalDocument } from "@/lib/legalRegistry";

export const metadata={title:"General & AI Disclaimers · Draft · Resonance DataNest"};

export default function DisclaimersPage(){
  return <LegalDocumentLayout document={getLegalDocument("disclaimers")}>
    <LegalDraftNotice/>
    <section><h2>AI-assisted outputs</h2><p>AI-assisted outputs can be incomplete or incorrect and should be reviewed in context. DataNest governance distinguishes recommendation, review, authorization, execution, and verification.</p></section>
    <section><h2>Professional decisions</h2><p>AI-assisted platform content is not a substitute for qualified legal, financial, medical, regulatory, or other professional advice where specialist advice is required.</p></section>
    <section><h2>Projections and opportunities</h2><p>Business projections and opportunity indicators are evidence-bound estimates with assumptions and uncertainty; they do not promise a commercial outcome.</p></section>
  </LegalDocumentLayout>;
}
