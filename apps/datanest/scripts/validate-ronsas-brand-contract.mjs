import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root=process.cwd();
const contractPath=resolve(root,"apps/ronsas/shared/resonance-brand-contract.json");
const complete=process.argv.includes("--complete");
const requestedApp=process.argv.includes("--app")
  ? process.argv[process.argv.indexOf("--app")+1]
  : null;
const failures=[];

if(!existsSync(contractPath)){
  failures.push("missing canonical RONSAS brand contract: apps/ronsas/shared/resonance-brand-contract.json");
}else{
  try{
    const raw=readFileSync(contractPath,"utf8");
    const contract=JSON.parse(raw);
    const expectedFonts=["Inter Tight","Inter","Instrument Serif","JetBrains Mono"];
    const requiredAccents=[
      "career-compass","creative-studio","epublisher","lyricsync-studio",
      "scene-song-spark","sovereign-forge","syncvision","youtube-optimizer"
    ];

    if(contract.schema!=="datanest.ronsas.brand-contract.v1") failures.push("brand contract schema mismatch");
    if(contract.operator!=="Resonance Sole Proprietorship") failures.push("brand contract operator mismatch");
    if(contract.businessBrand!=="Resonance App Development") failures.push("brand contract business brand mismatch");
    if(contract.platform!=="Resonance DataNest") failures.push("brand contract platform mismatch");
    if(contract.governanceLabel!=="RSGP Governed") failures.push("brand contract governance label mismatch");
    if(contract.governanceRoute!=="/governance") failures.push("brand contract governance route mismatch");
    if(contract.legalRoute!=="/legal") failures.push("brand contract legal route mismatch");
    if(contract.promotionState?.mode!=="free-promotion"||contract.promotionState?.paidCheckoutActive!==false){
      failures.push("brand contract must preserve free promotion with paid checkout disabled");
    }
    if(JSON.stringify(contract.fonts)!==JSON.stringify(expectedFonts)) failures.push("brand contract canonical fonts mismatch");
    for(const key of ["canvas","chrome","work","workSoft","elevated"]){
      if(typeof contract.surfaceTokens?.[key]!=="string") failures.push(`brand contract missing surface token: ${key}`);
    }
    for(const key of ["success","warning","danger","info"]){
      if(typeof contract.semanticTokens?.[key]!=="string") failures.push(`brand contract missing semantic token: ${key}`);
    }
    for(const app of requiredAccents){
      if(typeof contract.appAccents?.[app]!=="string") failures.push(`brand contract missing application accent: ${app}`);
    }
    if(/RSGP\s+(?:means|stands for|is short for)/i.test(raw)) failures.push("brand contract invents an RSGP expansion");

    if(requestedApp){
      if(!requiredAccents.includes(requestedApp)){
        failures.push(`unknown RONSAS app requested for brand validation: ${requestedApp}`);
      }else{
        const adapterCandidates=[
          resolve(root,`apps/ronsas/${requestedApp}/src/resonance-datanest-adapter.css`),
          resolve(root,`apps/ronsas/${requestedApp}/resonance-datanest-adapter.css`)
        ];
        if(!adapterCandidates.some(existsSync)){
          console.log(`RONSAS brand adapter not migrated yet: ${requestedApp}`);
        }else if(requestedApp==="creative-studio"){
          const appRoot=resolve(root,"apps/ronsas/creative-studio");
          const sources={
            main:readFileSync(resolve(appRoot,"src/main.tsx"),"utf8"),
            footer:readFileSync(resolve(appRoot,"src/components/brand/ResonanceFooter.tsx"),"utf8"),
            terms:readFileSync(resolve(appRoot,"src/pages/Terms.tsx"),"utf8"),
            privacy:readFileSync(resolve(appRoot,"src/pages/Privacy.tsx"),"utf8"),
            adapter:readFileSync(resolve(appRoot,"src/resonance-datanest-adapter.css"),"utf8"),
          };
          const pkg=JSON.parse(readFileSync(resolve(appRoot,"package.json"),"utf8"));
          const lock=JSON.parse(readFileSync(resolve(appRoot,"package-lock.json"),"utf8"));
          for(const dependency of ["@fontsource-variable/inter-tight","@fontsource-variable/inter","@fontsource/instrument-serif","@fontsource-variable/jetbrains-mono"]){
            if(pkg.dependencies?.[dependency]!=="5.3.0") failures.push(`creative-studio font dependency mismatch: ${dependency}`);
            if(lock.packages?.[""]?.dependencies?.[dependency]!=="5.3.0") failures.push(`creative-studio lock root missing font dependency: ${dependency}`);
            if(lock.packages?.["node_modules/"+dependency]?.version!=="5.3.0") failures.push(`creative-studio lock entry missing font package: ${dependency}`);
          }
          for(const token of ["Resonance Sole Proprietorship","Resonance App Development","Resonance DataNest","RSGP Governed","/DataNest/legal","/DataNest/governance"]){
            if(!sources.footer.includes(token)) failures.push(`creative-studio footer missing token: ${token}`);
          }
          if(!/free promotion/i.test(sources.footer)) failures.push("creative-studio footer must preserve free promotion");
          if(/checkout/i.test(sources.footer)) failures.push("creative-studio footer must not expose checkout language");
          if(/new Date\s*\(|toLocaleDateString\s*\(/.test(sources.terms+sources.privacy)) failures.push("creative-studio legal pages must not manufacture current effective dates");
          if(!sources.terms.includes("Review-gated legacy draft")||!sources.privacy.includes("Review-gated legacy draft")||!sources.terms.includes("0.1-draft")||!sources.privacy.includes("0.1-draft")) failures.push("creative-studio legal pages must remain review-gated at 0.1-draft");
          if(/industry-standard encryption|not retained beyond the generation session/i.test(sources.privacy)) failures.push("creative-studio privacy page contains unsupported guarantees");
          for(const token of ["@media (prefers-color-scheme: light)","@media (prefers-contrast: more)","@media (prefers-reduced-motion: reduce)","--rdn-app-accent: #ff36d8","font-family"]){
            if(!sources.adapter.includes(token)) failures.push(`creative-studio adapter missing token: ${token}`);
          }
          if(!sources.main.includes("@fontsource-variable/inter-tight")||!sources.main.includes("./resonance-datanest-adapter.css")) failures.push("creative-studio main entry does not load canonical fonts and adapter");
        }
      }
    }
  }catch(error){
    failures.push(`invalid RONSAS brand contract: ${error.message}`);
  }
}


if(complete){
  const canonicalFonts=["@fontsource-variable/inter-tight","@fontsource-variable/inter","@fontsource/instrument-serif","@fontsource-variable/jetbrains-mono"];
  const appChecks=[
    {slug:"career-compass",presentation:"index.html",style:"styles.css",accent:"#14bfff",kind:"static"},
    {slug:"creative-studio",presentation:"src/components/brand/ResonanceFooter.tsx",style:"src/resonance-datanest-adapter.css",accent:"#ff36d8",kind:"bundled"},
    {slug:"epublisher",presentation:"src/components/brand/ResonanceFooter.tsx",style:"src/resonance-datanest-adapter.css",accent:"#8b5cf6",kind:"bundled",lightTheme:"class"},
    {slug:"lyricsync-studio",presentation:"index.html",style:"styles.css",accent:"#8aa6ff",kind:"static"},
    {slug:"scene-song-spark",presentation:"index.html",style:"styles.css",accent:"#f4c66f",kind:"static"},
    {slug:"sovereign-forge",presentation:"index.html",style:"styles.css",accent:"#72e6ae",kind:"static"},
    {slug:"syncvision",presentation:"src/components/brand/ResonanceFooter.tsx",style:"src/resonance-datanest-adapter.css",accent:"#42e7ff",kind:"bundled"},
    {slug:"youtube-optimizer",presentation:"src/components/SiteFooter.tsx",style:"src/resonance-datanest-adapter.css",accent:"#ff86ab",kind:"ssr"},
  ];

  for(const app of appChecks){
    const appRoot=resolve(root,"apps/ronsas",app.slug);
    const presentationPath=resolve(appRoot,app.presentation);
    const stylePath=resolve(appRoot,app.style);
    const packagePath=resolve(appRoot,"package.json");
    if(!existsSync(presentationPath)){failures.push(`${app.slug} missing governed presentation surface: ${app.presentation}`);continue;}
    if(!existsSync(stylePath)){failures.push(`${app.slug} missing Resonance DataNest style surface: ${app.style}`);continue;}
    if(!existsSync(packagePath)){failures.push(`${app.slug} missing package.json`);continue;}
    const presentation=readFileSync(presentationPath,"utf8");
    const style=readFileSync(stylePath,"utf8");
    const pkg=JSON.parse(readFileSync(packagePath,"utf8"));
    for(const token of ["Resonance Sole Proprietorship","Resonance App Development","Resonance DataNest","RSGP Governed","/DataNest/legal","/DataNest/governance"]){
      if(!presentation.includes(token)) failures.push(`${app.slug} presentation missing token: ${token}`);
    }
    if(!/free (?:access )?promotion/i.test(presentation)) failures.push(`${app.slug} must preserve free-promotion presentation`);
    if(/checkout|subscribe|paid plan/i.test(presentation)) failures.push(`${app.slug} presentation exposes paid checkout language`);
    if(!style.toLowerCase().includes(`--rdn-app-accent:${app.accent}`)&&!style.toLowerCase().includes(`--rdn-app-accent: ${app.accent}`)) failures.push(`${app.slug} accent mismatch; expected ${app.accent}`);
    const lightSource=app.lightTheme==="class"&&existsSync(resolve(appRoot,"src/index.css"))
      ? readFileSync(resolve(appRoot,"src/index.css"),"utf8")
      : style;
    if(app.lightTheme==="class"){
      if(!/\.light\b/.test(lightSource)) failures.push(`${app.slug} missing governed class-based light theme`);
    }else if(!/prefers-color-scheme:\s*light/i.test(lightSource)){
      failures.push(`${app.slug} style surface missing light-mode contract`);
    }
    for(const media of [/prefers-contrast:\s*more/i,/prefers-reduced-motion:\s*reduce/i]){
      if(!media.test(style)) failures.push(`${app.slug} style surface missing accessibility media contract: ${media}`);
    }
    for(const dependency of canonicalFonts){
      if(pkg.dependencies?.[dependency]!=="5.3.0") failures.push(`${app.slug} canonical font dependency mismatch: ${dependency}`);
    }
    if(app.kind==="static"){
      const buildPath=resolve(appRoot,"scripts/build.mjs");
      if(!existsSync(buildPath)){failures.push(`${app.slug} missing static build script`);}
      else{
        const build=readFileSync(buildPath,"utf8");
        if(!build.includes("node_modules")||!build.includes("woff2")||!build.includes("fonts")) failures.push(`${app.slug} must vendor canonical font assets into its static build`);
      }
    }
  }

  const backendAuthorityPath=resolve(root,"apps/ronsas/sovereign-backend/RONSAS-SOURCE-AUTHORITY.json");
  if(!existsSync(backendAuthorityPath)){
    failures.push("sovereign-backend missing repository authority metadata");
  }else{
    try{
      const authority=JSON.parse(readFileSync(backendAuthorityPath,"utf8").replace(/^\uFEFF/,""));
      if(authority.repository!=="https://github.com/DataNest-Supository/DataNest") failures.push("sovereign-backend repository authority is not DataNest");
      if(authority.authority_state!=="active") failures.push("sovereign-backend authority metadata is not active");
    }catch(error){
      failures.push(`invalid sovereign-backend authority metadata: ${error.message}`);
    }
  }
}

if(failures.length){
  console.error("RONSAS brand contract validation failed:");
  for(const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("RONSAS canonical brand contract validation passed.");
