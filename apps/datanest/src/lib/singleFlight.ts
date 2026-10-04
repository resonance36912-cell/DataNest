"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SingleFlightResult<T>={
  started:boolean;
  value?:T;
};

export function useSingleFlight(){
  const mountedRef=useRef(true);
  const activeRef=useRef<string|null>(null);
  const [activeAction,setActiveAction]=useState<string|null>(null);

  useEffect(()=>{
    mountedRef.current=true;
    return()=>{mountedRef.current=false;};
  },[]);

  const run=useCallback(async<T>(key:string,action:()=>Promise<T>):Promise<SingleFlightResult<T>>=>{
    if(activeRef.current!==null)return {started:false};
    activeRef.current=key;
    if(mountedRef.current)setActiveAction(key);

    const protectInFlightRequest=(event:BeforeUnloadEvent)=>{
      event.preventDefault();
      event.returnValue="";
    };
    window.addEventListener("beforeunload",protectInFlightRequest);

    try{
      return {started:true,value:await action()};
    }finally{
      activeRef.current=null;
      window.removeEventListener("beforeunload",protectInFlightRequest);
      if(mountedRef.current)setActiveAction(null);
    }
  },[]);

  return {
    activeAction,
    busy:activeAction!==null,
    run
  };
}
