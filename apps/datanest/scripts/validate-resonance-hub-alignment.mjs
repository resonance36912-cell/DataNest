import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function loadJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

export function validateResonanceHubAlignment(
  integrationPath = "config/resonance-hub-integration.json",
  productionPath = "config/production-contract.json",
  catalogPath = "config/supository.catalog.json",
  wellKnownPath = "public/.well-known/reson8-app.json"
) {
  const integration = loadJson(integrationPath);
  const production = loadJson(productionPath);
  const catalog = loadJson(catalogPath);
  const wellKnown = loadJson(wellKnownPath);

  const hub = integration.hub;
  const datanest = integration.datanest;
  const boundaries = integration.authorityBoundaries;

  const exact = (actual, expected, label) => {
    if (actual !== expected) {
      throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
    }
  };

  exact(hub.repository, "Resonance-AppDev/resonance-hub", "Hub repository");
  exact(hub.branch, "main", "Hub branch");
  exact(hub.publicOrigin, "https://reson8.life/", "Hub public origin");
  exact(datanest.repository, "DataNest-Supository/DataNest", "DataNest repository");
  exact(datanest.branch, "main", "DataNest branch");
  exact(datanest.publicOrigin, "https://datanest-supository.github.io/DataNest/", "DataNest public origin");

  exact(hub.authorities.billing, true, "Hub billing authority");
  exact(hub.authorities.entitlements, true, "Hub entitlement authority");
  exact(hub.authorities.checkoutVerification, true, "Hub checkout verification authority");
  exact(hub.authorities.ropTelemetry, true, "Hub ROP telemetry authority");
  exact(hub.authorities.rONSASApplicationSource, false, "Hub RONSAS source authority");

  exact(datanest.authorities.portfolioRegistry, true, "DataNest portfolio registry authority");
  exact(datanest.authorities.appDevGovernance, true, "DataNest governance authority");
  exact(datanest.authorities.sourceHistoryCiEvidence, true, "DataNest source/CI/evidence authority");
  exact(datanest.authorities.productionPromotion, true, "DataNest production promotion authority");
  exact(datanest.authorities.ronsasApplicationSource, true, "DataNest RONSAS source authority");
  exact(datanest.authorities.billing, false, "DataNest billing authority");
  exact(datanest.authorities.checkoutAuthority, false, "DataNest checkout authority");

  for (const [key, value] of Object.entries(boundaries)) {
    if (value !== false) {
      throw new Error(`Authority boundary must remain false: ${key}`);
    }
  }

  exact(production.repository, datanest.repository, "Production contract repository");
  exact(production.branch, datanest.branch, "Production contract branch");
  exact(production.authority.publicDelivery, "GitHub Pages", "Production delivery");
  exact(production.authority.backend, "Supabase", "Production backend");
  exact(production.authority.railwayRequired, false, "Railway dependency");
  exact(production.authority.vercelRequired, false, "Vercel dependency");
  exact(production.publicDelivery.basePath, "/DataNest/", "DataNest base path");

  exact(catalog.canonicalRepository, datanest.repository, "Catalog canonical repository");
  exact(catalog.canonicalPublicUrl, datanest.publicOrigin, "Catalog canonical public URL");
  exact(catalog.authority.backend, datanest.backend, "Catalog backend authority");

  exact(wellKnown.hubUrl, hub.publicOrigin, "well-known Hub URL");
  exact(wellKnown.sourceRepository, datanest.repository, "well-known source repository");
  exact(wellKnown.sourceBranch, datanest.branch, "well-known source branch");
  exact(wellKnown.publicUrl, datanest.publicOrigin, "well-known public URL");
  exact(wellKnown.billing, "none", "well-known billing state");

  if (!existsSync(resolve(integrationPath))) throw new Error("Integration contract is missing.");
  if (integration.sharedIdentity.technicalIdentifier !== "RONSAS") {
    throw new Error("Shared technical identifier must remain RONSAS.");
  }

  return { integration, production, catalog, wellKnown };
}

const directInvocation =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (directInvocation) {
  validateResonanceHubAlignment();
  console.log("Validated Resonance Hub ↔ DataNest authority alignment.");
}
