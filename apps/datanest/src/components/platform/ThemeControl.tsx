"use client";

import { useEffect, useState } from "react";
import {
  THEME_STORAGE_KEY,
  normalizeThemePreference,
  resolveTheme,
  type ThemePreference
} from "@/lib/themePreference";

function systemPrefersDark():boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(preference:ThemePreference):void {
  const resolved=resolveTheme(preference,systemPrefersDark());
  document.documentElement.dataset.theme=resolved;
  document.documentElement.dataset.themePreference=preference;
}

export default function ThemeControl({compact=false}:{compact?:boolean}) {
  const [preference,setPreference]=useState<ThemePreference>("dark");

  useEffect(()=>{
    const raw=window.localStorage.getItem(THEME_STORAGE_KEY);
    const normalized=raw===null?"dark":normalizeThemePreference(raw);
    if(raw!==null&&raw!==normalized)window.localStorage.setItem(THEME_STORAGE_KEY,normalized);
    setPreference(normalized);
    applyTheme(normalized);

    const media=window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemChange=()=>{
      if((window.localStorage.getItem(THEME_STORAGE_KEY)??"dark")==="system")applyTheme("system");
    };
    media.addEventListener("change",handleSystemChange);
    return()=>media.removeEventListener("change",handleSystemChange);
  },[]);

  function chooseTheme(next:ThemePreference){
    window.localStorage.setItem(THEME_STORAGE_KEY,next);
    setPreference(next);
    applyTheme(next);
  }

  return (
    <label className={"themeControl"+(compact?" compact":"")}>
      <span>Theme</span>
      <select
        aria-label="Theme preference"
        value={preference}
        onChange={(event)=>chooseTheme(normalizeThemePreference(event.target.value))}
      >
        <option value="dark">Dark</option>
        <option value="light">Light</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
