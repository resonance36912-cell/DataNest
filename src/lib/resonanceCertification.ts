export type ResonanceCertificationClass={
  code:string;
  name:string;
  domain:string;
  description:string;
};

export type ResonanceCertificationPricing={
  serviceCode:string;
  currency:"USD";
  priceModel:"fixed_introductory"|"starting_at";
  amount:number;
  displayPrice:string;
  scopeNote:string;
};

export type ResonanceCertificationService={
  code:string;
  name:string;
  description:string;
  output:string;
  billingEnabled:boolean;
  commercialState:"free_promotion";
};

export const RESONANCE_CERTIFICATION_PRICING=[
  {serviceCode:"RCS-SVC-01",currency:"USD",priceModel:"fixed_introductory",amount:750,displayPrice:"USD 750",scopeNote:"Fixed introductory scope."},
  {serviceCode:"RCS-SVC-02",currency:"USD",priceModel:"starting_at",amount:3500,displayPrice:"From USD 3,500",scopeNote:"Final quote depends on scope and evidence complexity."},
  {serviceCode:"RCS-SVC-03",currency:"USD",priceModel:"fixed_introductory",amount:750,displayPrice:"USD 750",scopeNote:"Standalone; may be included in a full certification engagement."},
  {serviceCode:"RCS-SVC-04",currency:"USD",priceModel:"starting_at",amount:1500,displayPrice:"From USD 1,500",scopeNote:"Based on prior scope and evidence refresh."},
  {serviceCode:"RCS-SVC-05",currency:"USD",priceModel:"starting_at",amount:1250,displayPrice:"From USD 1,250",scopeNote:"Alignment review; not external accreditation."}
] satisfies readonly ResonanceCertificationPricing[];

export const RESONANCE_CERTIFICATION_STANDARD={
  id:"RCS",
  version:"1.0",
  name:"Resonance Certification Standard",
  effective:"2026-10-01",
  authority:"Resonance DataNest",
  externalAccreditationClaim:false,
  certificationClasses:[
    {code:"RCS-GOV-01",name:"Governance & Control Assurance",domain:"governance",description:"Identity, authority, accountability, human oversight and control traceability."},
    {code:"RCS-PROD-01",name:"Product & Software Assurance",domain:"product",description:"Product quality, accessibility, reliability, usability and release discipline."},
    {code:"RCS-AI-01",name:"AI Governance Assurance",domain:"ai",description:"AI purpose, authority boundaries, evaluation, memory/data controls and human oversight."},
    {code:"RCS-DATA-01",name:"Data & Privacy Assurance",domain:"data_privacy",description:"Data governance, access, minimization, disclosure and privacy controls."},
    {code:"RCS-OPS-01",name:"Operational & Release Assurance",domain:"operations",description:"Change, deployment, monitoring, recovery and post-release verification."},
    {code:"RCS-MKT-01",name:"Transparency & Market Integrity Assurance",domain:"market_integrity",description:"Truthful market claims, certification disclosure, evidence references and commercial-state transparency."}
  ] satisfies readonly ResonanceCertificationClass[],
  services:[
    {code:"RCS-SVC-01",name:"Certification Readiness Assessment",description:"Scoped readiness and evidence-gap assessment before certification.",output:"Readiness report, applicability profile, evidence plan and remediation register.",billingEnabled:false,commercialState:"free_promotion"},
    {code:"RCS-SVC-02",name:"Resonance Certification Assessment",description:"Formal evidence-led assessment against one or more RCS certification classes.",output:"Assessment record, findings/actions, review record and certification decision.",billingEnabled:false,commercialState:"free_promotion"},
    {code:"RCS-SVC-03",name:"Certification & Evidence Pack",description:"Governed certificate plus scope, criteria, validity and evidence references.",output:"Certificate record plus human/machine-readable evidence pack.",billingEnabled:false,commercialState:"free_promotion"},
    {code:"RCS-SVC-04",name:"Surveillance & Renewal",description:"Periodic re-assessment of certification basis, material changes and evidence.",output:"Surveillance record and renewal, suspension, revocation or expiry decision.",billingEnabled:false,commercialState:"free_promotion"},
    {code:"RCS-SVC-05",name:"Standards Alignment Review",description:"Applicability and evidence review against selected external standards.",output:"Alignment report and trace matrix; no external accreditation claim.",billingEnabled:false,commercialState:"free_promotion"}
  ] satisfies readonly ResonanceCertificationService[]
} as const;
