import LegalDocumentLayout from "@/components/legal/LegalDocumentLayout";
import LegalDraftNotice from "@/components/legal/LegalDraftNotice";
import { getLegalDocument } from "@/lib/legalRegistry";

export const metadata={title:"Privacy / POPIA · Draft · Resonance DataNest"};

export default function PrivacyPage(){
  return <LegalDocumentLayout document={getLegalDocument("privacy")}>
    <LegalDraftNotice/>
    <section><h2>Data map under review</h2><p>The production privacy record must be based on verified DataNest storage, authentication, connected-service, upload, processing, and provider flows before final privacy statements are approved.</p></section>
    <section><h2>POPIA review</h2><p>POPIA-related roles, notices, lawful-processing grounds, data-subject pathways, and incident procedures remain subject to authorized South African legal review and implementation evidence.</p></section>
    <section><h2>AI and service providers</h2><p>Provider-specific processing behavior must be documented from verified service configuration and contractual evidence rather than assumed across every provider.</p></section>
  </LegalDocumentLayout>;
}
