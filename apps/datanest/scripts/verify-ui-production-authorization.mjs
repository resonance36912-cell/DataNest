import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildUiGovernanceEvidence } from "./write-ui-governance-evidence.mjs";

export const REQUIRED_CONFIRMATION="AUTHORIZE PRODUCTION";
export const REQUIRED_OWNER_TEST_MODE_CONFIRMATION="AUTHORIZE OWNER TEST MODE";

export function verifyUiProductionAuthorization(env=process.env){
  const releaseSha=(env.DATANEST_UI_RELEASE_SHA || "").trim();
  if (!/^[0-9a-f]{40}$/i.test(releaseSha)) {
    throw new Error("DATANEST_UI_RELEASE_SHA must be an exact 40-character Git commit SHA");
  }

  const releaseState=(env.DATANEST_UI_RELEASE_STATE || "authorized").trim();
  const expectedConfirmation=releaseState==="owner_test_mode"
    ? REQUIRED_OWNER_TEST_MODE_CONFIRMATION
    : REQUIRED_CONFIRMATION;

  if (releaseState!=="progressive_live" &&
      (env.DATANEST_UI_PRODUCTION_CONFIRMATION || "").trim()!==expectedConfirmation) {
    throw new Error(`DATANEST_UI_PRODUCTION_CONFIRMATION must equal ${expectedConfirmation}`);
  }

  const evidence=buildUiGovernanceEvidence({
    ...env,
    DATANEST_UI_RELEASE_SHA:releaseSha,
    DATANEST_UI_RELEASE_STATE:releaseState
  });

  if (!evidence.productionDeploymentAllowed) {
    throw new Error("Production authorization payload did not allow production deployment");
  }

  if (releaseState==="authorized" && !evidence.authorized) {
    throw new Error("Production authorization payload did not resolve to fully authorized state");
  }

  if (releaseState==="progressive_live" && !evidence.productionDeploymentAllowed) {
    throw new Error("Progressive-live payload did not permit deployment");
  }

  if (releaseState==="owner_test_mode") {
    if (!evidence.ownerTestMode?.active || evidence.authorized) {
      throw new Error("Owner Test Mode payload did not resolve to a temporary production exception");
    }
  }

  return evidence;
}

const directInvocation=
  process.argv[1] &&
  import.meta.url===pathToFileURL(resolve(process.argv[1])).href;

if (directInvocation) {
  const evidence=verifyUiProductionAuthorization();
  console.log("Validated UI production authorization payload for",evidence.releaseSha,evidence.releaseState);
}
