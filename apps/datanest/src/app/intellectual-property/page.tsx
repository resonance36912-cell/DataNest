import LegalDocumentLayout from "@/components/legal/LegalDocumentLayout";
import LegalDraftNotice from "@/components/legal/LegalDraftNotice";
import { getLegalDocument } from "@/lib/legalRegistry";

export const metadata={title:"Intellectual Property · Draft · Resonance DataNest"};

export default function IntellectualPropertyPage(){
  return <LegalDocumentLayout document={getLegalDocument("intellectual-property")}>
    <LegalDraftNotice/>
    <section><h2>Ownership and licensing under review</h2><p>Final terms for user inputs, generated outputs, platform software, brand assets, and licensed materials require authorized legal review before becoming production policy.</p></section>
    <section><h2>No implied transfer from participation</h2><p>Participation, contribution, reputation, or AI-assisted creation does not by itself transfer company ownership, financial authority, voting rights, or intellectual-property ownership where an explicit legal agreement is required.</p></section>
  </LegalDocumentLayout>;
}
