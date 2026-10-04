export type AdtCapability =
  | "repository"
  | "command_runner"
  | "browser_runtime"
  | "desktop_connection"
  | "ai_chatbot"
  | "codex_functions";

export type AdtAction = "observe" | "prepare" | "execute";

export type AdtCapabilityDefinition = {
  key: AdtCapability;
  label: string;
  freeBaseline: boolean;
  action: AdtAction;
  authority: "local" | "external" | "governed";
  notes: string;
};

export const reson8AdtCapabilities: AdtCapabilityDefinition[] = [
  { key: "repository", label: "Repository", freeBaseline: true, action: "prepare", authority: "governed", notes: "GitHub remains the source, history and CI/evidence authority." },
  { key: "command_runner", label: "CMD / PowerShell runner", freeBaseline: true, action: "execute", authority: "local", notes: "Runs explicit developer commands on the user's machine; DataNest does not silently execute arbitrary commands." },
  { key: "browser_runtime", label: "Cloud/browser runtime", freeBaseline: true, action: "execute", authority: "external", notes: "Use an approved browser automation/runtime adapter; credentials and provider limits remain outside DataNest." },
  { key: "desktop_connection", label: "Remote desktop connection", freeBaseline: false, action: "prepare", authority: "governed", notes: "DataNest may prepare a connection descriptor/launch handoff. Interactive remote control is not autonomous and requires an explicitly governed execution surface." },
  { key: "ai_chatbot", label: "External AI chatbot", freeBaseline: true, action: "execute", authority: "external", notes: "Use the user's own provider account where available. Returned material is staged as UNCERTIFIED evidence." },
  { key: "codex_functions", label: "Codex/development functions", freeBaseline: true, action: "prepare", authority: "governed", notes: "Expose development tasks as bounded repository operations rather than an unrestricted command shell." }
];

export const adtActionOrder: AdtAction[] = ["observe", "prepare", "execute"];

export function getAdtCapability(key: AdtCapability) {
  return reson8AdtCapabilities.find(item => item.key === key) ?? null;
}

export function canExecuteAdtCapability(key: AdtCapability) {
  const capability = getAdtCapability(key);
  return capability?.action === "execute" && key !== "desktop_connection";
}

export function adtCapabilityLabel(key: AdtCapability) {
  return getAdtCapability(key)?.label ?? key;
}

export function buildAdtLaunchDescriptor(input: {
  jobId: string;
  traceKey: string;
  capability: AdtCapability;
  target?: string;
}) {
  const capability = getAdtCapability(input.capability);
  if (!capability) throw new Error("Unknown Reson8 ADT capability.");
  if (!input.jobId || !input.traceKey) throw new Error("Job ID and trace key are required.");

  return {
    jobId: input.jobId,
    traceKey: input.traceKey,
    capability: input.capability,
    target: input.target ?? null,
    mode: capability.action,
    governed: capability.authority === "governed",
    autonomousExecutionAllowed: canExecuteAdtCapability(input.capability)
  };
}
