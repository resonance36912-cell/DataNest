import { THEME_STORAGE_KEY } from "@/lib/themePreference";

const themeStorageKey:typeof THEME_STORAGE_KEY="datanest-theme";

export default function ThemeBootstrapScript() {
  const script=`(()=>{try{document.documentElement.dataset.motionPaused=String(localStorage.getItem("datanest.motionPaused")==="true");}catch{}try{const key=${JSON.stringify(themeStorageKey)};const raw=localStorage.getItem(key);const valid=raw==="dark"||raw==="light"||raw==="system";const preference=raw===null?"dark":valid?raw:"system";if(raw!==null&&!valid)localStorage.setItem(key,"system");const prefersDark=window.matchMedia("(prefers-color-scheme: dark)").matches;const resolved=preference==="system"?(prefersDark?"dark":"light"):preference;document.documentElement.dataset.theme=resolved;document.documentElement.dataset.themePreference=preference;}catch{document.documentElement.dataset.theme="dark";document.documentElement.dataset.themePreference="dark";}})();`;

  return <script>{script}</script>;
}
