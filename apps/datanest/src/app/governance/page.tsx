import BusinessIdentityDisclosure from "@/components/legal/BusinessIdentityDisclosure";
import GovernanceDisclosure from "@/components/legal/GovernanceDisclosure";
import LegalDocumentLayout from "@/components/legal/LegalDocumentLayout";
import { getLegalDocument } from "@/lib/legalRegistry";

export const metadata={title:"Governance · Resonance DataNest"};

export default function GovernancePage(){
  return <LegalDocumentLayout document={getLegalDocument("governance")}>
    <GovernanceDisclosure/>
    <BusinessIdentityDisclosure/>
  </LegalDocumentLayout>;
}
