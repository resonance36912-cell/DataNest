"use client";
import { useEffect } from "react";

/** Suspend decorative work when the browser tab is not visible. */
export default function CinematicRuntime() {
  useEffect(() => {
    const update = () => { document.documentElement.dataset.pageHidden = String(document.hidden); };
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return null;
}
