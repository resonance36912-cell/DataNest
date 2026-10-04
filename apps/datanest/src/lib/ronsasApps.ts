import {
  RESONANCE_APP_REGISTRY,
  getResonanceApp,
  getResonanceAppLaunch,
  type ResonanceAppDefinition,
} from "./resonanceAppRegistry";

export {
  RESONANCE_APP_REGISTRY as RONSAS_HOSTED_APPS,
  getResonanceApp as getRonsasHostedApp,
  getResonanceAppLaunch as getRonsasAppLaunch,
};
export type { ResonanceAppDefinition as RonsasHostedApp };
