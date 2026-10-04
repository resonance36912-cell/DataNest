"use client";

export type MutationReconciliationState="confirmed"|"not_recorded"|"pending";

export type MutationReconciliation<T>={
  state:MutationReconciliationState;
  value:T|null;
  error:unknown|null;
};

export async function reconcileServerMutation<T>(
  verify:()=>Promise<T|null>
):Promise<MutationReconciliation<T>>{
  try{
    const value=await verify();
    if(value!==null)return {state:"confirmed",value,error:null};
    return {state:"not_recorded",value:null,error:null};
  }catch(error){
    return {state:"pending",value:null,error};
  }
}
