export const DATANEST_DISPLAY_NAME = "Resonance DataNest";
export const RSGP_GOVERNANCE_LABEL = "RSGP Governed";

export const RESONANCE_BUSINESS_IDENTITY = {
  legalOperator:"Resonance Sole Proprietorship",
  businessBrand:"Resonance App Development",
  platform:"Resonance DataNest",
  governance:"RSGP"
} as const;

export const RESONANCE_AUTHORSHIP_PUBLICATION_IDENTITY = {
  businessName:"Resonance App Development",
  ownership:"Ashley Uys",
  headquarters:"17 Simonsvlei Street, Kuilsriver, 7580, Cape Town, South Africa",
  email:"ashleyuys@medi-tech.life",
  website:"https://reson8.life",
  socialHandle:"@resonanceappdev"
} as const;

export function applicationAttribution(name:string):string {
  return `${name} — a governed Resonance DataNest application by Resonance App Development.`;
}
