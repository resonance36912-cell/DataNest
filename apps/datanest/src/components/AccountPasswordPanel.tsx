"use client";

import { FormEvent, useState } from "react";
import AccountPasswordForm from "@/components/AccountPasswordForm";
import { validatePasswordChange } from "@/lib/accountPasswordValidation";
import { getSupabase } from "@/lib/supabase";

async function actionErrorMessage(error:unknown){
  const fallback=error instanceof Error?error.message:"Unable to complete the password action.";
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

type MessageTone = "neutral"|"good"|"error";
type PasswordActionState = {
  setBusy: (value:boolean)=>void;
  setMessage: (value:string)=>void;
  setMessageTone: (value:MessageTone)=>void;
};

async function runPasswordChange({
  event,projectId,currentPassword,newPassword,confirmPassword,
  setBusy,setMessage,setMessageTone,onSuccess
}:{
  event:FormEvent;projectId:string;currentPassword:string;newPassword:string;confirmPassword:string;
  onSuccess:()=>void;
}&PasswordActionState){
  event.preventDefault();
  const supabase=getSupabase();
  if(!supabase)return;

  const validationError=validatePasswordChange({currentPassword,newPassword,confirmPassword});
  if(validationError){
    setMessageTone("error");
    setMessage(validationError);
    return;
  }

  setBusy(true);
  setMessage("");
  setMessageTone("neutral");
  try{
    const {data,error}=await supabase.functions.invoke("manage-own-password",{
      body:{projectId,action:"change",currentPassword,newPassword}
    });
    if(error)throw error;
    const payload=(data||{}) as {auditRecorded?:boolean};
    onSuccess();
    setMessageTone("good");
    setMessage(payload.auditRecorded===false
      ?"Password changed successfully. The security event could not be recorded; an owner can review the service logs."
      :"Password changed successfully and recorded in the security audit trail."
    );
  }catch(error){
    setMessageTone("error");
    setMessage(await actionErrorMessage(error));
  }finally{
    setBusy(false);
  }
}

async function runRecoveryEmail({projectId,setBusy,setMessage,setMessageTone}:{
  projectId:string;
}&PasswordActionState){
  const supabase=getSupabase();
  if(!supabase)return;

  setBusy(true);
  setMessage("");
  setMessageTone("neutral");
  try{
    const redirectTo=window.location.href.split("#")[0].split("?")[0];
    const {data,error}=await supabase.functions.invoke("manage-own-password",{
      body:{projectId,action:"email_reset",redirectTo}
    });
    if(error)throw error;
    const payload=(data||{}) as {auditRecorded?:boolean};
    setMessageTone("good");
    setMessage(payload.auditRecorded===false
      ?"Password reset email requested. The security event could not be recorded; an owner can review the service logs."
      :"Password reset email requested and recorded. Follow the secure link in your inbox to choose a new password."
    );
  }catch(error){
    setMessageTone("error");
    setMessage(await actionErrorMessage(error));
  }finally{
    setBusy(false);
  }
}

export default function AccountPasswordPanel({projectId}:{projectId:string}) {
  const [currentPassword,setCurrentPassword]=useState("");
  const [newPassword,setNewPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [messageTone,setMessageTone]=useState<MessageTone>("neutral");
  const actionState={setBusy,setMessage,setMessageTone};

  function clearPasswords(){
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return <section className="panel accountSecurityPanel">
    <div className="panelHead">
      <div><p className="eyebrow">ACCOUNT SECURITY</p><h3>Change my password</h3></div>
      <span className="countPill">AUDITED</span>
    </div>
    <p className="muted">Confirm your current password before replacing it. Password material is processed only by Supabase Auth and is never written to DataNest project data or the security audit trail.</p>

    <form className="accountSecurityForm" onSubmit={event=>void runPasswordChange({
      event,projectId,currentPassword,newPassword,confirmPassword,...actionState,onSuccess:clearPasswords
    })} aria-busy={busy}>
      <AccountPasswordForm
        busy={busy}
        currentPassword={currentPassword}
        newPassword={newPassword}
        confirmPassword={confirmPassword}
        onCurrentPasswordChange={setCurrentPassword}
        onNewPasswordChange={setNewPassword}
        onConfirmPasswordChange={setConfirmPassword}
        onRecovery={()=>void runRecoveryEmail({projectId,...actionState})}
      />
    </form>

    {message&&<div className={"accountSecurityMessage "+messageTone} role={messageTone==="error"?"alert":"status"} aria-live="polite">{message}</div>}
  </section>;
}
