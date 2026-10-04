function list(value){return [...new Set(String(value||"").split(/[,\n]/).map(x=>x.trim()).filter(Boolean))];}
export function buildCareerPlan(input={}){
  const targetRole=String(input.targetRole||"").trim();
  if(!targetRole) throw new Error("Target role is required.");
  const skills=list(input.skills), interests=list(input.interests), goal=String(input.goal||"").trim();
  const focus=[...new Set([...interests,skills.length?"portfolio evidence":"foundational role skills","networking","interview narrative"])];
  return {
    targetRole,goal:goal||`Build credible readiness for ${targetRole}`,strengths:skills,
    phases:[
      {window:"30 days",actions:[`Map the core capabilities expected for ${targetRole}.`,`Create one evidence-backed project aligned to ${focus[0]||"the role"}.`,"Identify five people or teams to learn from."]},
      {window:"60 days",actions:["Complete a second portfolio proof point.","Request structured feedback from at least three reviewers.","Practice a concise role-transition narrative."]},
      {window:"90 days",actions:[`Target opportunities explicitly matching ${targetRole}.`,"Track applications, conversations and skill gaps weekly.","Refine portfolio evidence using outcome metrics."]}
    ],focusAreas:focus
  };
}
