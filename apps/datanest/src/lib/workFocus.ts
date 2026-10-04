export const WORK_FOCUS_AREAS = [
  {key:"ui_ux",label:"UI/UX",description:"Usability, accessibility, interaction design and visual consistency."},
  {key:"database_architecture",label:"Database & Architecture",description:"Data integrity, migrations, performance and maintainable architecture."},
  {key:"workflow_functionality",label:"Workflow & Functionality",description:"User journeys, product behavior, reliability and task completion."},
  {key:"cost_saving",label:"Cost Saving & Efficiency",description:"Validated efficiency, automation and resource savings without quality loss."},
  {key:"brand_promotion",label:"Brand & Promotion",description:"Brand quality, campaigns, qualified reach and promotion."},
  {key:"user_acquisition",label:"User Acquisition & Growth",description:"Acquisition, activation, adoption and retention."},
  {key:"datanest_ai_learning",label:"AI & DataNest Learning",description:"Reusable AI knowledge, evaluation improvement and governed learning."},
  {key:"governance_process",label:"Governance & Process",description:"Auditability, accountability, legal/process controls and dispute resolution."},
  {key:"security_testing",label:"Security & Testing",description:"Risk reduction, testing, defect reproduction and effective fixes."},
  {key:"documentation_mentoring",label:"Documentation & Mentoring",description:"Reusable guidance, enablement, training and transferred capability."}
] as const;

export type WorkFocusKey = typeof WORK_FOCUS_AREAS[number]["key"];

const workFocusKeySet = new Set<string>(WORK_FOCUS_AREAS.map(item=>item.key));
const workFocusLabelMap = new Map<string,string>(WORK_FOCUS_AREAS.map(item=>[item.key,item.label]));

export function normalizeWorkFocusKeys(value:unknown):WorkFocusKey[] {
  if(!Array.isArray(value))return [];
  const selected=new Set(
    value
      .filter(item=>typeof item==="string")
      .map(item=>item.trim().toLowerCase())
      .filter(item=>workFocusKeySet.has(item))
  );
  return WORK_FOCUS_AREAS.filter(item=>selected.has(item.key)).map(item=>item.key);
}

export function workFocusLabel(key:string){
  return workFocusLabelMap.get(key)||key.replaceAll("_"," ");
}

export function workFocusKeysFromRequirements(requirements:unknown):WorkFocusKey[] {
  if(!requirements||typeof requirements!=="object"||Array.isArray(requirements))return [];
  return normalizeWorkFocusKeys((requirements as Record<string,unknown>).focus_areas);
}

export function workInterestOverlapKeys(requirements:unknown,interests:unknown):WorkFocusKey[] {
  const selected=new Set(normalizeWorkFocusKeys(interests));
  if(selected.size===0)return [];
  return workFocusKeysFromRequirements(requirements).filter(key=>selected.has(key));
}

export function workInterestGapKeys(requirements:unknown,interests:unknown):WorkFocusKey[] {
  const selected=new Set(normalizeWorkFocusKeys(interests));
  return workFocusKeysFromRequirements(requirements).filter(key=>!selected.has(key));
}

export function workInterestOverlapCount(requirements:unknown,interests:unknown){
  return workInterestOverlapKeys(requirements,interests).length;
}

export function workMatchesInterests(requirements:unknown,interests:unknown){
  return workInterestOverlapKeys(requirements,interests).length>0;
}

export function workInterestCoverage(requirementsList:unknown[],interests:unknown){
  const selected=normalizeWorkFocusKeys(interests);
  const coveredSet=new Set<WorkFocusKey>();
  for(const requirements of requirementsList){
    for(const key of workInterestOverlapKeys(requirements,selected))coveredSet.add(key);
  }
  return {
    covered:selected.filter(key=>coveredSet.has(key)),
    gaps:selected.filter(key=>!coveredSet.has(key))
  };
}
