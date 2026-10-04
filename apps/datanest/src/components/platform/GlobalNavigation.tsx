"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import WorkspaceGlyph from "./WorkspaceGlyph";
import type { NavigationItem } from "@/components/platform/navigationTypes";

const groupOrder=["HOME","THINK","GOVERN","BUILD","EXECUTE","PROVE","ADMIN"] as const;
const groupDescriptions:Record<string,string>={
  HOME:"Your workspace",
  THINK:"Ideas & research",
  GOVERN:"Decisions & review",
  BUILD:"Products & testing",
  EXECUTE:"Planning & delivery",
  PROVE:"Evidence & impact",
  ADMIN:"Project settings"
};

const legalLinks=[
  {href:"/legal",label:"Legal Centre"},
  {href:"/governance",label:"Governance"},
  {href:"/privacy",label:"Privacy"},
  {href:"/terms",label:"Terms"},
  {href:"/disclaimers",label:"Disclaimers"}
] as const;

export default function GlobalNavigation({
  items,currentView,onNavigate,onOpenQuickSwitch
}:{
  items:readonly NavigationItem[];
  currentView:string;
  onNavigate:(view:string)=>void;
  onOpenQuickSwitch:()=>void;
}) {
  const groups=Array.from(new Set(items.map(item=>item.group))).sort((a,b)=>groupOrder.indexOf(a as (typeof groupOrder)[number])-groupOrder.indexOf(b as (typeof groupOrder)[number]));
  const activeGroup=items.find(item=>item.id===currentView)?.group;
  const [openGroups,setOpenGroups]=useState<Set<string>>(
    ()=>new Set(groups.filter(group=>group==="HOME"||group===activeGroup))
  );
  const quickSwitchLauncherRef=useRef<HTMLButtonElement|null>(null);
  const restoreSidebarFocusRef=useRef(false);

  useEffect(()=>{
    if(!activeGroup)return;
    setOpenGroups(previous=>{
      if(previous.has(activeGroup))return previous;
      const next=new Set(previous);
      next.add(activeGroup);
      return next;
    });
  },[activeGroup]);

  useEffect(()=>{
    const handleFocusIn=(event:FocusEvent)=>{
      if(!restoreSidebarFocusRef.current)return;
      const target=event.target;
      if(!(target instanceof HTMLElement))return;
      if(target.closest(".commandPalette"))return;
      if(target.classList.contains("quickSwitchButton")){
        const launcher=quickSwitchLauncherRef.current;
        restoreSidebarFocusRef.current=false;
        if(launcher?.isConnected)window.requestAnimationFrame(()=>launcher.focus({preventScroll:true}));
        return;
      }
      restoreSidebarFocusRef.current=false;
    };
    document.addEventListener("focusin",handleFocusIn,true);
    return()=>document.removeEventListener("focusin",handleFocusIn,true);
  },[]);

  return <>
    <button
      ref={quickSwitchLauncherRef}
      className="navWorkspaceSearch"
      type="button"
      onClick={()=>{
        restoreSidebarFocusRef.current=true;
        onOpenQuickSwitch();
      }}
      aria-haspopup="dialog"
    >
      <span>Find a workspace</span><kbd aria-hidden="true">⌘ / Ctrl K</kbd>
    </button>
    <nav className="navStack" aria-label="Project workspaces">
      {groups.map(group=><details
        className="navGroup navDisclosure"
        key={group}
        open={group==="HOME"||items.some(item=>item.group===group&&item.id===currentView)||openGroups.has(group)}
        onToggle={event=>{
          const isOpen=event.currentTarget.open;
          setOpenGroups(previous=>{
            const next=new Set(previous);
            if(isOpen)next.add(group);
            else next.delete(group);
            return next;
          });
        }}
      >
        <summary>
          <span className="navGroupCopy"><b>{group}</b><small>{groupDescriptions[group]}</small></span>
          <span className="navGroupIndicator" aria-hidden="true">⌄</span>
        </summary>
        {items.filter(item=>item.group===group).map(item=><button
          key={item.id}
          type="button"
          className={(currentView===item.id?"active ":"")+(item.id==="ai"?"aiHeroNav":"")}
          aria-label={item.label}
          aria-current={currentView===item.id?"page":undefined}
          onClick={()=>onNavigate(item.id)}
        >
          <span aria-hidden="true"><WorkspaceGlyph view={item.id}/></span>{item.label}
        </button>)}
      </details>)}
    </nav>
    <nav className="navLegalSection" aria-label="Governance and legal links">
      <p>Governance &amp; Legal</p>
      <div className="navLegalLinks">
        {legalLinks.map(item=><Link href={item.href} key={item.href}>{item.label}</Link>)}
      </div>
    </nav>
  </>;
}
