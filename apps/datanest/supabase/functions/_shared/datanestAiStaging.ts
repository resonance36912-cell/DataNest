const dedicatedStagingOrigin="https://qchttpcyqlqnhvahprhz.supabase.co";

type StagingConfiguration={
  supabaseUrl:string;
  serviceKey:string;
  configuredUrl?:string;
  configuredKey?:string;
};

function isDedicatedStagingUrl(value:string):boolean{
  // Deliberately accept only the canonical origin, optionally with its root
  // slash. Do not normalize credentials, ports, paths, queries or lookalikes.
  return value===dedicatedStagingOrigin||value===dedicatedStagingOrigin+"/";
}

export function resolveDataNestAiStaging({
  supabaseUrl,
  serviceKey,
  configuredUrl,
  configuredKey
}:StagingConfiguration):{url:string;key:string}{
  const hasUrl=configuredUrl!==undefined;
  const hasKey=configuredKey!==undefined;

  // An explicitly incomplete or empty configuration must not silently use
  // local credentials, even when the executing project is dedicated staging.
  if(hasUrl||hasKey){
    if(
      !hasUrl||!hasKey||
      !isDedicatedStagingUrl(configuredUrl!)||
      !configuredKey?.trim()
    ){
      throw new Error("Valid dedicated DataNest AI staging URL and credentials are required.");
    }
    return {url:dedicatedStagingOrigin,key:configuredKey};
  }

  // Local service credentials may be reused only inside the exact dedicated
  // staging project. Production never falls back to its own database.
  if(isDedicatedStagingUrl(supabaseUrl)&&serviceKey.trim()){
    return {url:dedicatedStagingOrigin,key:serviceKey};
  }
  throw new Error("Dedicated DataNest AI staging credentials are required in production.");
}
