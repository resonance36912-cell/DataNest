export const workflowPhases = [
  { id:"discover", destination:"thinktank", label:"Discover", verb:"Make room for perspectives.", description:"Bring your intent to Think Tanks. Compare ideas, gather evidence, and invite human review before deciding what to carry forward.", outcome:"Ideas with evidence you can inspect.", action:"Explore Think Tanks", glyph:"◈" },
  { id:"govern", destination:"governance", label:"Govern", verb:"Choose with shared understanding.", description:"Read the protocol, consider proposals, and trace decisions. Your project role determines which actions are available.", outcome:"A decision with its reasoning and review history.", action:"Review governance", glyph:"◆" },
  { id:"build", destination:"products", label:"Build", verb:"Turn direction into a shared product.", description:"Explore Resonance products, their architecture, and the evidence behind them. Use Product Lab to inspect a surface before release.", outcome:"A product direction connected to its controls and evidence.", action:"Explore products", glyph:"◉" },
  { id:"execute", destination:"unifi", label:"Execute", verb:"Give the next step a shape.", description:"Use UNIFI Planner to define work and acceptance criteria, then follow its progress in TranScheduler.", outcome:"A plan with a clear definition of done.", action:"Open UNIFI Planner", glyph:"◇" },
  { id:"verify", destination:"transparency", label:"Verify", verb:"Understand the evidence behind progress.", description:"Review published audits, methods, and findings in Transparency. Follow the evidence and its stated limits before drawing a conclusion.", outcome:"An informed view of what has and has not been verified.", action:"Review transparency", glyph:"◎" }
] as const;

export type WorkflowPhaseId = typeof workflowPhases[number]["id"];
export type WorkflowDestination = typeof workflowPhases[number]["destination"] | "ai";

export function workflowPhaseForView(view:string):WorkflowPhaseId|null {
  if(["stakeholder","sparks","thinktank"].includes(view))return "discover";
  if(view==="governance")return "govern";
  if(["products","productlab"].includes(view))return "build";
  if(["unifi","scheduler","runs"].includes(view))return "execute";
  if(["checkpoints","audit","transparency"].includes(view))return "verify";
  return null;
}
