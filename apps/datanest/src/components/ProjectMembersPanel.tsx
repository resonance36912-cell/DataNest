"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useSingleFlight } from "@/lib/singleFlight";

type Member={
  user_id:string;
  email:string|null;
  role:"owner"|"admin"|"operator"|"viewer";
  status:string;
  created_at:string;
  updated_at:string;
  formal_voting_eligible:boolean;
};

type Invitation={
  id:string;
  user_id:string;
  email:string;
  role:"admin"|"operator"|"viewer";
  status:string;
  invited_by:string;
  invited_at:string;
  expires_at:string;
  accepted_at:string|null;
  revoked_at:string|null;
};

type InviteState="idle"|"sending"|"sent"|"failed";

type Workspace={
  members:Member[];
  invitations:Invitation[];
  active_formal_voter_count:number;
  can_invite:boolean;
  can_invite_admin:boolean;
  caller_role:string|null;
  boundaries:Record<string,boolean>;
};

function date(value:string|null){
  if(!value)return "—";
  return new Intl.DateTimeFormat(undefined,{month:"short",day:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
}
function label(value:string){return value.replaceAll("_"," ");}
function normalizeEmail(value:string){return value.trim().toLowerCase();}
function shortId(value:string){return value.length>12?value.slice(0,8)+"…"+value.slice(-4):value;}

async function inviteErrorMessage(error:unknown){
  const fallback=error instanceof Error?error.message:"Unable to send project-member invitation.";
  if(!error||typeof error!=="object"||!("context" in error))return fallback;
  const context=(error as {context?:Response}).context;
  if(!context||typeof context.clone!=="function")return fallback;
  try{
    const payload=await context.clone().json() as {error?:unknown};
    if(payload?.error)return String(payload.error);
  }catch{
    // Fall back to the client error when the Edge response has no JSON body.
  }
  return fallback;
}

export default function ProjectMembersPanel({
  projectId,setNotice,setError
}:{
  projectId:string;
  setNotice:(value:string)=>void;
  setError:(value:string)=>void;
}){
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const {activeAction,run:runSingleFlight}=useSingleFlight();
  const [email,setEmail]=useState("");
  const [role,setRole]=useState<"admin"|"operator"|"viewer">("viewer");
  const [inviteState,setInviteState]=useState<InviteState>("idle");
  const [inviteFeedback,setInviteFeedback]=useState("");
  const [passwordTarget,setPasswordTarget]=useState<Member|null>(null);
  const [temporaryPassword,setTemporaryPassword]=useState("");
  const [confirmTemporaryPassword,setConfirmTemporaryPassword]=useState("");
  const [passwordFeedback,setPasswordFeedback]=useState("");
  const [deleteConfirmId,setDeleteConfirmId]=useState<string|null>(null);

  const load=useCallback(async()=>{
    const supabase=getSupabase();if(!supabase)return;
    setLoading(true);
    const {data,error}=await supabase.rpc("get_project_membership_workspace_v1",{target_project:projectId});
    if(error){setError(error.message);setWorkspace(null);}
    else setWorkspace((data||null) as Workspace|null);
    setLoading(false);
  },[projectId,setError]);

  useEffect(()=>{void load();},[load]);

  const normalizedEmail=normalizeEmail(email);
  const matchingMember=useMemo(
    ()=>workspace?.members.find(member=>normalizeEmail(member.email||"")===normalizedEmail)||null,
    [workspace,normalizedEmail]
  );
  const matchingPendingInvite=useMemo(
    ()=>workspace?.invitations.find(invite=>invite.status==="invited"&&normalizeEmail(invite.email)===normalizedEmail)||null,
    [workspace,normalizedEmail]
  );
  const memberAlreadyActive=matchingMember?.status==="active";

  async function deliverInvite(targetEmail:string,targetRole:"admin"|"operator"|"viewer",clearAfter:boolean){
    const supabase=getSupabase();
    if(!supabase||!workspace?.can_invite)return;

    const normalizedTarget=normalizeEmail(targetEmail);
    await runSingleFlight("invite:"+normalizedTarget,async()=>{
      setBusy(true);
      setInviteState("sending");
      setInviteFeedback("Sending invitation to "+normalizedTarget+"…");
      setNotice("Sending project invitation to "+normalizedTarget+"…");
      setError("");
      try{
        const {data,error}=await supabase.functions.invoke("send-project-member-invite",{
          body:{projectId,email:normalizedTarget,role:targetRole}
        });
        if(error)throw error;
        const payload=(data||{}) as Record<string,unknown>;
        const delivery=String(payload.delivery||"invite");
        const feedback=delivery==="recovery"
          ?"Invite sent to "+normalizedTarget+". The confirmed account will receive a secure recovery link. Voting remains disabled until that person signs in and accepts project access."
          :delivery==="reinvite"
            ?"Invitation resent to "+normalizedTarget+". The unconfirmed account will receive a fresh project invite. Voting remains disabled until that person authenticates and accepts project access."
            :"Invite sent to "+normalizedTarget+". Voting remains disabled until that person authenticates and accepts project access.";
        if(clearAfter)setEmail("");
        setInviteState("sent");
        setInviteFeedback(feedback);
        setNotice(feedback);
        await load();
      }catch(inviteError){
        const feedback=await inviteErrorMessage(inviteError);
        setInviteState("failed");
        setInviteFeedback("Invite failed. "+feedback);
        setError(feedback);
      }finally{
        setBusy(false);
      }
    });
  }

  async function sendInvite(event:FormEvent){
    event.preventDefault();
    if(!normalizedEmail||memberAlreadyActive)return;
    if(matchingPendingInvite){
      await deliverInvite(matchingPendingInvite.email,matchingPendingInvite.role,false);
      return;
    }
    await deliverInvite(normalizedEmail,role,true);
  }

  async function resendInvite(invite:Invitation){
    await deliverInvite(invite.email,invite.role,false);
  }

  function canManagePassword(member:Member){
    if(!workspace?.can_invite||member.status!=="active")return false;
    if(workspace.caller_role==="owner")return true;
    return workspace.caller_role==="admin"&&(member.role==="operator"||member.role==="viewer");
  }

  async function passwordActionErrorMessage(error:unknown){
    const fallback=error instanceof Error?error.message:"Unable to manage the member password.";
    if(!error||typeof error!=="object"||!("context" in error))return fallback;
    const context=(error as {context?:Response}).context;
    if(!context||typeof context.clone!=="function")return fallback;
    try{
      const payload=await context.clone().json() as {error?:unknown};
      if(payload?.error)return String(payload.error);
    }catch{
      // Fall back to the client error when the Edge response has no JSON body.
    }
    return fallback;
  }

  async function sendMemberPasswordReset(member:Member){
    const supabase=getSupabase();
    if(!supabase||!canManagePassword(member)||!member.email)return;
    await runSingleFlight("password-email:"+member.user_id,async()=>{
      setBusy(true);setError("");setPasswordFeedback("");
      setNotice("Sending a secure password reset email…");
      try{
        const redirectTo=window.location.href.split("#")[0].split("?")[0];
        const {error}=await supabase.functions.invoke("manage-user-password",{
          body:{projectId,userId:member.user_id,action:"email_reset",redirectTo}
        });
        if(error)throw error;
        const feedback="Password reset email sent to "+member.email+". The member chooses the new password through the secure recovery link.";
        setPasswordFeedback(feedback);
        setNotice(feedback);
      }catch(actionError){
        const feedback=await passwordActionErrorMessage(actionError);
        setError(feedback);
        setPasswordFeedback("Reset email failed. "+feedback);
      }finally{
        setBusy(false);
      }
    });
  }

  async function setMemberTemporaryPassword(event:FormEvent){
    event.preventDefault();
    const supabase=getSupabase();
    const member=passwordTarget;
    if(!supabase||!member||!canManagePassword(member))return;
    if(temporaryPassword.length<12){
      setPasswordFeedback("Temporary passwords must contain at least 12 characters.");
      return;
    }
    if(temporaryPassword.length>128){
      setPasswordFeedback("Temporary passwords must be 128 characters or fewer.");
      return;
    }
    if(temporaryPassword!==confirmTemporaryPassword){
      setPasswordFeedback("The temporary passwords do not match.");
      return;
    }
    await runSingleFlight("password-set:"+member.user_id,async()=>{
      setBusy(true);setError("");setPasswordFeedback("");
      setNotice("Updating the selected member password…");
      try{
        const {error}=await supabase.functions.invoke("manage-user-password",{
          body:{projectId,userId:member.user_id,action:"set_temporary",password:temporaryPassword}
        });
        if(error)throw error;
        const feedback="Temporary password set for "+(member.email||"the selected member")+". Share it through a secure channel and have the member replace it after sign-in.";
        setNotice(feedback);
        setPasswordFeedback(feedback);
        setTemporaryPassword("");
        setConfirmTemporaryPassword("");
        setPasswordTarget(null);
      }catch(actionError){
        const feedback=await passwordActionErrorMessage(actionError);
        setError(feedback);
        setPasswordFeedback("Password update failed. "+feedback);
      }finally{
        setBusy(false);
      }
    });
  }

  async function revokeInvite(id:string){
    const supabase=getSupabase();if(!supabase)return;
    await runSingleFlight("revoke-invite:"+id,async()=>{
      setBusy(true);setError("");setNotice("Revoking pending project invitation…");
      try{
        const {error}=await supabase.rpc("revoke_project_member_invite_v1",{
          target_invite:id,
          target_reason:"Revoked from the Governance membership workspace."
        });
        if(error)throw error;
        setNotice("Pending project invitation revoked. It remains in the audit history and is not voting-eligible.");
        await load();
      }catch(actionError){
        setError(actionError instanceof Error?actionError.message:"Unable to revoke project invitation. You can retry safely.");
      }finally{
        setBusy(false);
      }
    });
  }

  async function deleteRevokedInvite(invite:Invitation){
    const supabase=getSupabase();
    if(!supabase||invite.status!=="revoked")return;
    await runSingleFlight("delete-revoked-invite:"+invite.id,async()=>{
      setBusy(true);setError("");setNotice("Deleting revoked project invitation…");
      try{
        const {error}=await supabase.rpc("delete_revoked_project_member_invite_v1",{
          target_invite:invite.id
        });
        if(error)throw error;
        setDeleteConfirmId(null);
        setNotice("Revoked invitation deleted. The deletion remains recorded in the governance event history.");
        await load();
      }catch(actionError){
        setError(actionError instanceof Error?actionError.message:"Unable to delete the revoked project invitation. You can retry safely.");
      }finally{
        setBusy(false);
      }
    });
  }

  if(loading)return <section className="panel"><p className="muted">Loading project membership…</p></section>;
  if(!workspace)return <section className="panel"><p className="muted">Project membership workspace is unavailable.</p></section>;

  const pending=workspace.invitations.filter(item=>item.status==="invited");
  const inviteActionLabel=inviteState==="sending"
    ?"Sending invite…"
    :inviteState==="sent"
      ?"Invite sent"
      :inviteState==="failed"
        ?"Invite failed · Retry"
        :memberAlreadyActive
          ?"Already active"
          :matchingPendingInvite
            ?"Resend project invite"
            :"Send project invite";

  return <section className="panel membershipPanel">
    {activeAction&&<p className="muted" role="status">Membership action in progress · duplicate submissions are blocked until the request finishes.</p>}
    <div className="panelHead">
      <div><p className="eyebrow">FORMAL MEMBERSHIP</p><h3>Project members + governance voters</h3></div>
      <span className="countPill">{workspace.active_formal_voter_count} ACTIVE VOTER{workspace.active_formal_voter_count===1?"":"S"}</span>
    </div>

    <p className="muted">Only authenticated members with <b>active</b> project membership can cast formal governance votes. Sending an invitation never creates an independent vote by itself.</p>

    {workspace.can_invite&&<form className="projectInviteForm" onSubmit={sendInvite}>
      <div className="projectInviteFields">
        <label>Invite email
          <input
            type="email"
            required
            value={email}
            onChange={event=>{
              setEmail(event.target.value);
              if(inviteState!=="idle"){setInviteState("idle");setInviteFeedback("");}
            }}
            placeholder="reviewer@example.com"
            aria-describedby="project-invite-context project-invite-feedback"
          />
        </label>
        <label>Project role
          <select value={role} onChange={event=>{
            setRole(event.target.value as "admin"|"operator"|"viewer");
            if(inviteState!=="idle"){setInviteState("idle");setInviteFeedback("");}
          }}>
            <option value="viewer">Viewer · formal vote + read access</option>
            <option value="operator">Operator · formal vote + operational access</option>
            {workspace.can_invite_admin&&<option value="admin">Admin · formal vote + administration</option>}
          </select>
        </label>
        <div className="inviteActionCell projectInviteAction">
          <button
            className={"primaryButton inviteSubmitButton "+inviteState}
            disabled={busy||!normalizedEmail||Boolean(memberAlreadyActive)}
            aria-describedby="project-invite-context project-invite-feedback"
          >
            <span className="inviteButtonContent">
              <span className="inviteButtonIcon" aria-hidden="true">
                {inviteState==="sent"?"✓":inviteState==="failed"?"!":inviteState==="sending"?"":"↗"}
              </span>
              <span>{inviteActionLabel}</span>
            </span>
          </button>
          <div
            id="project-invite-feedback"
            className={"inviteFeedback "+inviteState}
            role={inviteState==="failed"?"alert":"status"}
            aria-live="polite"
          >{inviteFeedback}</div>
        </div>
      </div>
      <div
        id="project-invite-context"
        className={"inviteContext "+(memberAlreadyActive?"good":matchingPendingInvite?"warn":"neutral")}
        aria-live="polite"
      >
        {memberAlreadyActive
          ?<><b>Already a member.</b> {matchingMember?.email} is active as {matchingMember?.role}; DataNest will not send a duplicate invitation.</>
          :matchingPendingInvite
            ?<><b>Invitation already pending.</b> Resending replaces the pending link and refreshes its expiry. Current expiry: {date(matchingPendingInvite.expires_at)}.</>
            :<><b>Invite lifecycle.</b> For independent protocol review, Viewer is sufficient unless the person also needs operational or administrative authority. Membership becomes voting-eligible only after the matching account signs in and accepts.</>}
      </div>
    </form>}

    <div className="dataTable membershipTable memberPasswordTable">
      <div className="dataRow headerRow"><span>Member</span><span>Role</span><span>Status</span><span>Formal vote</span><span>Updated</span><span>Password</span></div>
      {workspace.members.map(member=><div className="dataRow" key={member.user_id}>
        <div className="membershipIdentity" data-label="Member"><b>{member.email||"Authenticated member"}</b><small title={member.user_id}>ID {shortId(member.user_id)}</small></div>
        <span data-label="Role">{member.role}</span>
        <span data-label="Status">{label(member.status)}</span>
        <span data-label="Formal vote">{member.formal_voting_eligible?"eligible":"not eligible"}</span>
        <span data-label="Updated">{date(member.updated_at)}</span>
        <span className="memberPasswordActions" data-label="Password">
          {canManagePassword(member)?<>
            <button className="textButton" type="button" disabled={busy||!member.email} onClick={()=>void sendMemberPasswordReset(member)}>Email reset</button>
            <button className="textButton" type="button" disabled={busy} onClick={()=>{
              setPasswordTarget(member);
              setTemporaryPassword("");
              setConfirmTemporaryPassword("");
              setPasswordFeedback("");
            }}>Set temporary</button>
          </>:<span className="muted">Protected</span>}
        </span>
      </div>)}
    </div>

    {passwordTarget&&<form className="memberPasswordForm" onSubmit={setMemberTemporaryPassword} aria-busy={busy}>
      <div className="memberPasswordHeader">
        <div><p className="eyebrow">DIRECT PASSWORD UPDATE</p><h4>{passwordTarget.email||"Selected member"}</h4><small>{passwordTarget.role} · {shortId(passwordTarget.user_id)}</small></div>
        <button className="textButton" type="button" disabled={busy} onClick={()=>{
          setPasswordTarget(null);
          setTemporaryPassword("");
          setConfirmTemporaryPassword("");
          setPasswordFeedback("");
        }}>Cancel</button>
      </div>
      <div className="memberPasswordFields">
        <label>Temporary password
          <input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={temporaryPassword} onChange={event=>setTemporaryPassword(event.target.value)} placeholder="At least 12 characters"/>
        </label>
        <label>Confirm temporary password
          <input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmTemporaryPassword} onChange={event=>setConfirmTemporaryPassword(event.target.value)} placeholder="Re-enter temporary password"/>
        </label>
        <div className="memberPasswordButtons">
          <button className="primaryButton compact" type="submit" disabled={busy}>{busy?"Saving…":"Set temporary password"}</button>
        </div>
      </div>
      <p className="muted">Email reset is preferred. A directly set password should be delivered through a secure channel and replaced by the member after sign-in.</p>
    </form>}

    {passwordFeedback&&<div className="inviteContext neutral" role="status" aria-live="polite">{passwordFeedback}</div>}

    {workspace.can_invite&&<>
      <div className="panelHead">
        <div><p className="eyebrow">INVITATIONS</p><h3>Pending + historical</h3></div>
        <span className="countPill">{pending.length} PENDING</span>
      </div>
      {workspace.invitations.length?<div className="dataTable membershipTable invitationTable">
        <div className="dataRow headerRow"><span>Invitee</span><span>Role</span><span>Status</span><span>Expiry</span><span>Action</span></div>
        {workspace.invitations.map(invite=><div className="dataRow" key={invite.id}>
          <div className="membershipIdentity" data-label="Invitee"><b>{invite.email}</b><small title={invite.id}>Invite {shortId(invite.id)}</small></div>
          <span data-label="Role">{invite.role}</span>
          <span data-label="Status">{label(invite.status)}</span>
          <span data-label="Expiry">{date(invite.expires_at)}</span>
          <span className="inviteRowActions" data-label="Action">{invite.status==="invited"
            ?<>
              <button className="textButton" type="button" disabled={busy} onClick={()=>void resendInvite(invite)}>Resend</button>
              <button className="textButton dangerTextButton" type="button" disabled={busy} onClick={()=>void revokeInvite(invite.id)}>Revoke</button>
            </>
            :invite.status==="revoked"
              ?deleteConfirmId===invite.id
                ?<>
                  <button className="textButton dangerTextButton" type="button" disabled={busy} onClick={()=>void deleteRevokedInvite(invite)}>Confirm delete</button>
                  <button className="textButton" type="button" disabled={busy} onClick={()=>setDeleteConfirmId(null)}>Cancel</button>
                </>
                :<button className="textButton dangerTextButton" type="button" disabled={busy} onClick={()=>setDeleteConfirmId(invite.id)}>Delete</button>
              :"—"}</span>
        </div>)}
      </div>:<p className="muted">No project-member invitations have been issued yet.</p>}
    </>}

    <p className="muted">Password boundaries: owners may manage active project members; admins may manage active operators and viewers only. Admin and owner accounts remain protected from admin password takeover.</p>
        <p className="muted">Invite boundaries: no self-invite, no owner invitation, admin invitations require the owner, and acceptance requires the matching authenticated account. Revoked invites may be deleted from this table only by an authorized owner/admin; DataNest writes a governance event with the deleted invite evidence first.</p>
  </section>;
}
