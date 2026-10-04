"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import styles from "./AdminRndModeToggle.module.css";

export const MIRROR_DATANEST_REPOSITORY_URL = "https://github.com/DataNest-Supository/Mirror-DataNest";
export const MIRROR_DATANEST_PREVIEW_URL = "https://datanest-supository.github.io/Mirror-DataNest/";
export const MIRROR_DATANEST_RELEASE_MANIFEST_URL = MIRROR_DATANEST_PREVIEW_URL + "mirror-release.json";
const STORAGE_KEY = "datanest:admin-rd-test-mode";
const MIRROR_SURFACE_NAME = "Mirror-DataNest Production Candidate";

type MirrorRelease = {
  schemaVersion:string;
  mode:string;
  repository:string;
  commit:string;
  releaseId:string;
  publicUrl:string;
  canonicalRepository:string;
  canonicalPublicUrl:string;
  backend?:{project?:string;mode?:string};
  observations?:Record<string,string>;
  workflowRun:string;
  authority?:Record<string,boolean>;
  evidencePurpose?:string;
  generatedAt:string;
};

function shortCommit(value:string){
  return value.length>12?value.slice(0,12):value;
}

export default function AdminRndModeToggle({
  role,projectId,currentUserId,onOpenProductLab
}:{
  role:"owner"|"admin";
  projectId:string;
  currentUserId:string;
  onOpenProductLab:()=>void;
}) {
  const [enabled,setEnabled]=useState(false);
  const [release,setRelease]=useState<MirrorRelease|null>(null);
  const [syncState,setSyncState]=useState<"idle"|"syncing"|"ready"|"error">("idle");
  const [message,setMessage]=useState("");

  useEffect(()=>{
    try {
      setEnabled(window.localStorage.getItem(STORAGE_KEY)==="enabled");
    } catch {
      setEnabled(false);
    }
  },[]);

  async function loadAndSynchronizeMirror(){
    const supabase=getSupabase();
    if(!supabase){
      setSyncState("error");
      setMessage("DataNest backend is unavailable; Mirror evidence could not be synchronized.");
      return;
    }

    setSyncState("syncing");
    setMessage("Synchronizing Mirror release evidence…");

    try{
      const response=await fetch(MIRROR_DATANEST_RELEASE_MANIFEST_URL,{
        cache:"no-store",
        headers:{"Cache-Control":"no-cache"}
      });
      if(!response.ok)throw new Error("Live Mirror release manifest is not available yet.");

      const manifest=await response.json() as MirrorRelease;
      if(!/^[0-9a-f]{40}$/i.test(manifest.commit||""))throw new Error("Mirror release manifest has an invalid commit identity.");
      if(!manifest.releaseId||manifest.repository!=="DataNest-Supository/Mirror-DataNest"){
        throw new Error("Mirror release manifest identity is incomplete.");
      }

      const surfacePayload={
        name:MIRROR_SURFACE_NAME,
        url:manifest.publicUrl||MIRROR_DATANEST_PREVIEW_URL,
        environment:"staging",
        status:"active",
        description:"Production-parity Mirror deployment used for governed visual and functional testing before canonical DataNest certification.",
        build_commit:manifest.commit,
        release_id:manifest.releaseId,
        build_label:"Mirror "+manifest.releaseId,
        updated_by:currentUserId
      };

      const {data:existing,error:lookupError}=await supabase
        .from("product_surfaces")
        .select("id")
        .eq("project_id",projectId)
        .eq("name",MIRROR_SURFACE_NAME)
        .eq("build_commit",manifest.commit)
        .eq("release_id",manifest.releaseId)
        .limit(1)
        .maybeSingle();
      if(lookupError)throw lookupError;

      let surfaceId=existing?.id||"";
      if(!surfaceId){
        const {data:inserted,error:insertError}=await supabase.from("product_surfaces").insert({
          project_id:projectId,
          ...surfacePayload,
          created_by:currentUserId
        }).select("id").single();
        if(insertError){
          // The unique release/build identity is append-only. A concurrent
          // synchronization may have created the same immutable surface.
          if(insertError.code==="23505"){
            const {data:recovered,error:recoveryError}=await supabase
              .from("product_surfaces")
              .select("id")
              .eq("project_id",projectId)
              .eq("name",MIRROR_SURFACE_NAME)
              .eq("build_commit",manifest.commit)
              .eq("release_id",manifest.releaseId)
              .limit(1)
              .maybeSingle();
            if(recoveryError||!recovered?.id)throw insertError;
            surfaceId=String(recovered.id);
          }else{
            throw insertError;
          }
        }else{
          surfaceId=String(inserted?.id||"");
        }
      }

      if(surfaceId){
        const certificationCases=[
          {
            title:"Mirror visual shell and navigation",
            description:"Review the production-parity Mirror shell, responsive navigation, layout, visual regressions and primary workspace rendering.",
            expected_result:"The Mirror UI renders correctly at the tested viewport with no material visual regression or broken primary navigation."
          },
          {
            title:"Mirror authenticated functional flow",
            description:"Exercise authenticated DataNest workspace behavior against the isolated DataNest AI Staging backend.",
            expected_result:"Authentication and the reviewed functional workflow complete against staging without unintended canonical production writes."
          },
          {
            title:"Mirror governed routes and hosted applications",
            description:"Review governance/legal routes and applicable DataNest-hosted RONSAS application pages from the live Mirror build.",
            expected_result:"Required governance/legal routes and applicable hosted application pages render and function for the exact Mirror release."
          }
        ];

        const {data:existingCases,error:caseLookupError}=await supabase
          .from("product_test_cases")
          .select("id,title")
          .eq("project_id",projectId)
          .eq("surface_id",surfaceId)
          .eq("status","active");
        if(caseLookupError)throw caseLookupError;

        const existingTitles=new Set((existingCases||[]).map(item=>String(item.title)));
        const missingCases=certificationCases
          .filter(item=>!existingTitles.has(item.title))
          .map(item=>({
            project_id:projectId,
            surface_id:surfaceId,
            title:item.title,
            description:item.description,
            expected_result:item.expected_result,
            status:"active",
            created_by:currentUserId
          }));

        if(missingCases.length){
          const {error:caseInsertError}=await supabase.from("product_test_cases").insert(missingCases);
          if(caseInsertError)throw caseInsertError;
        }
      }

      const sourceRef=(manifest.workflowRun||MIRROR_DATANEST_RELEASE_MANIFEST_URL)+"#"+manifest.commit;
      const {data:observation,error:observationLookupError}=await supabase
        .from("governance_observations")
        .select("id")
        .eq("project_id",projectId)
        .eq("source_ref",sourceRef)
        .limit(1)
        .maybeSingle();
      if(observationLookupError)throw observationLookupError;

      if(!observation){
        const {error:observationError}=await supabase.rpc("record_governance_observation_v1",{
          target_project:projectId,
          target_source_kind:"metric",
          target_summary:"Mirror production-parity candidate "+manifest.releaseId+" is available for visual and functional governance testing.",
          target_severity:"info",
          target_confidence:1,
          target_source_ref:sourceRef,
          target_evidence:{
            kind:"mirror_live_candidate",
            repository:manifest.repository,
            commit:manifest.commit,
            release_id:manifest.releaseId,
            live_url:manifest.publicUrl||MIRROR_DATANEST_PREVIEW_URL,
            workflow_run:manifest.workflowRun,
            backend:manifest.backend||{},
            observations:manifest.observations||{},
            production_authority:false,
            certification_required:true
          },
          target_observed_at:manifest.generatedAt||new Date().toISOString()
        });
        if(observationError)throw observationError;
      }

      setRelease(manifest);
      setSyncState("ready");
      setMessage("Mirror "+manifest.releaseId+" synchronized to Product Lab, certification cases and governance evidence.");
    }catch(error){
      setSyncState("error");
      setMessage(error instanceof Error?error.message:"Unable to synchronize the live Mirror release.");
    }
  }

  function setMode(next:boolean){
    setEnabled(next);
    try {
      window.localStorage.setItem(STORAGE_KEY,next?"enabled":"disabled");
    } catch {
      // Local preference storage is optional.
    }

    if(next){
      window.open(MIRROR_DATANEST_PREVIEW_URL,"_blank","noopener,noreferrer");
      void loadAndSynchronizeMirror();
    }
  }

  return <section className={styles.control} aria-label="R&D Test Mode access">
    <div className={styles.copy}>
      <span className={styles.eyebrow}>ADMIN · R&D LIVE MIRROR</span>
      <b>R&D Test Mode</b>
      <small>Open Mirror-DataNest in a new tab. Review its exact build in Product Lab using the separate Mirror environment.</small>
    </div>

    <button
      className={styles.switch}
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled?"Disable R&D Test Mode shortcut":"Enable R&D Test Mode and open live Mirror"}
      title={role.toUpperCase()+" access · Mirror-DataNest"}
      disabled={syncState==="syncing"}
      onClick={()=>setMode(!enabled)}
    >
      <span className={styles.track} data-enabled={enabled?"true":"false"}>
        <span className={styles.thumb}/>
      </span>
      <span className={styles.state}>{enabled?"ON":"OFF"}</span>
    </button>

    {enabled&&<div className={styles.actions}>
      <a className={styles.openLink} href={MIRROR_DATANEST_PREVIEW_URL} target="_blank" rel="noreferrer">
        Open live Mirror UI <span aria-hidden="true">↗</span>
      </a>
      <button className={styles.inlineButton} type="button" onClick={onOpenProductLab}>
        Review in Product Lab
      </button>
      <button className={styles.inlineButton} type="button" disabled={syncState==="syncing"} onClick={()=>void loadAndSynchronizeMirror()}>
        {syncState==="syncing"?"Synchronizing…":"Sync latest build"}
      </button>
      {release&&<small className={styles.release}>
        {release.releaseId} · {shortCommit(release.commit)} · {release.backend?.mode||"isolated-staging"}
      </small>}
      <div role="status" aria-live="polite" aria-atomic="true">
        {message&&<small className={syncState==="error"?styles.error:styles.status}>{message}</small>}
      </div>
      <small className={styles.previewNote}>Canonical production remains DataNest-Supository/DataNest; Mirror evidence supports certification but does not authorize release.</small>
      {syncState==="error"&&<a className={styles.openLink} href={MIRROR_DATANEST_REPOSITORY_URL} target="_blank" rel="noreferrer">Open Mirror repository <span aria-hidden="true">↗</span></a>}
    </div>}
  </section>;
}
