"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

const SESSION_DRAFT_PREFIX="datanest.sessionDraft.";

export type SessionDraftMeta={
  hydrated:boolean;
  hasStoredDraft:boolean;
  discardStoredDraft:()=>void;
};

export function useSessionDraftState<T>(
  key:string,
  initialValue:T
):[T,Dispatch<SetStateAction<T>>,SessionDraftMeta]{
  const storageKey=SESSION_DRAFT_PREFIX+key;
  const initialRef=useRef(initialValue);
  const valueRef=useRef(initialValue);
  const mountedRef=useRef(true);
  const [value,setValue]=useState<T>(initialValue);
  const [hydratedKey,setHydratedKey]=useState<string|null>(null);
  const [hasStoredDraft,setHasStoredDraft]=useState(false);

  useEffect(()=>{
    initialRef.current=initialValue;
  },[initialValue]);

  useEffect(()=>{
    mountedRef.current=true;
    return()=>{mountedRef.current=false;};
  },[]);

  const persistValue=useCallback((nextValue:T)=>{
    try{
      const current=JSON.stringify(nextValue);
      const baseline=JSON.stringify(initialRef.current);
      if(current===baseline){
        window.sessionStorage.removeItem(storageKey);
        return false;
      }
      window.sessionStorage.setItem(storageKey,current);
      return true;
    }catch{
      return false;
    }
  },[storageKey]);

  const setDraftValue=useCallback<Dispatch<SetStateAction<T>>>((nextAction)=>{
    const previous=valueRef.current;
    const nextValue=typeof nextAction==="function"
      ? (nextAction as (previous:T)=>T)(previous)
      : nextAction;
    valueRef.current=nextValue;
    const stored=persistValue(nextValue);
    if(mountedRef.current){
      setValue(nextValue);
      setHasStoredDraft(stored);
    }
  },[persistValue]);

  useEffect(()=>{
    setHydratedKey(null);
    let nextValue=initialRef.current;
    let restored=false;
    try{
      const raw=window.sessionStorage.getItem(storageKey);
      if(raw!==null){
        nextValue=JSON.parse(raw) as T;
        restored=true;
      }
    }catch{
      try{window.sessionStorage.removeItem(storageKey);}catch{}
    }
    valueRef.current=nextValue;
    setValue(nextValue);
    setHasStoredDraft(restored);
    setHydratedKey(storageKey);
  },[storageKey]);

  const discardStoredDraft=useCallback(()=>{
    try{window.sessionStorage.removeItem(storageKey);}catch{}
    valueRef.current=initialRef.current;
    if(mountedRef.current){
      setValue(initialRef.current);
      setHasStoredDraft(false);
    }
  },[storageKey]);

  return [value,setDraftValue,{
    hydrated:hydratedKey===storageKey,
    hasStoredDraft,
    discardStoredDraft
  }];
}
