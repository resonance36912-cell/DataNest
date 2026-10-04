import {
  RESONANCE_BUSINESS_IDENTITY,
  RSGP_GOVERNANCE_LABEL
} from "./brandIdentity";

export type LegalDocumentId =
  | "terms"
  | "privacy"
  | "disclaimers"
  | "acceptable-use"
  | "intellectual-property"
  | "governance"
  | "accessibility";

export type LegalApprovalStatus =
  | "draft-review-required"
  | "approved"
  | "superseded";

export function legalApprovalLabel(status:LegalApprovalStatus):string {
  if(status==="draft-review-required") return "Human / legal review required";
  if(status==="approved") return "Approved";
  return "Superseded";
}

export type LegalDocumentMeta = {
  id: LegalDocumentId;
  title: string;
  version: string;
  status: LegalApprovalStatus;
  effectiveDate: string | null;
  reviewOwner: string;
  changeSummary: string;
};

export const LEGAL_IDENTITY = {
  legalOperator: RESONANCE_BUSINESS_IDENTITY.legalOperator,
  businessBrand: RESONANCE_BUSINESS_IDENTITY.businessBrand,
  platform: RESONANCE_BUSINESS_IDENTITY.platform,
  governanceLabel: RSGP_GOVERNANCE_LABEL
} as const;

const DRAFT_REVIEW_DEFAULTS = {
  version: "0.1-draft",
  status: "draft-review-required" as const,
  effectiveDate: null,
  reviewOwner: "Authorized human/legal reviewer"
};

export const LEGAL_DOCUMENTS = [
  {
    ...DRAFT_REVIEW_DEFAULTS,
    id: "terms",
    title: "Terms & Conditions",
    changeSummary: "Initial DataNest-wide governed draft."
  },
  {
    ...DRAFT_REVIEW_DEFAULTS,
    id: "privacy",
    title: "Privacy / POPIA",
    changeSummary: "Initial DataNest-wide governed privacy draft."
  },
  {
    ...DRAFT_REVIEW_DEFAULTS,
    id: "disclaimers",
    title: "General & AI Disclaimers",
    changeSummary: "Initial governed disclaimer structure."
  },
  {
    ...DRAFT_REVIEW_DEFAULTS,
    id: "acceptable-use",
    title: "Acceptable Use",
    changeSummary: "Initial governed acceptable-use structure."
  },
  {
    ...DRAFT_REVIEW_DEFAULTS,
    id: "intellectual-property",
    title: "Intellectual Property",
    changeSummary: "Initial governed intellectual-property structure."
  },
  {
    ...DRAFT_REVIEW_DEFAULTS,
    id: "governance",
    title: "Governance / RSGP",
    changeSummary: "Initial RSGP governance disclosure structure."
  },
  {
    ...DRAFT_REVIEW_DEFAULTS,
    id: "accessibility",
    title: "Accessibility",
    changeSummary: "Initial accessibility disclosure structure."
  }
] satisfies readonly LegalDocumentMeta[];

export function getLegalDocument(id: LegalDocumentId): LegalDocumentMeta {
  const document = LEGAL_DOCUMENTS.find(item=>item.id===id);
  if(!document) throw new Error(`Unknown legal document: ${id}`);
  return document;
}
