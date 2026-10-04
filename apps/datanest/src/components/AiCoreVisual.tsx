"use client";

import { useEffect, useRef } from "react";

type Props = { state: "syncing" | "ready" | "attention" | "standby"; status: string };

/** Decorative geometry. All state labels come from the real context request. */
export default function AiCoreVisual({ state, status }: Props) {
  const core = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = core.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) { node.dataset.inView = "true"; return; }
    const observer = new IntersectionObserver(([entry]) => {
      node.dataset.inView = String(entry.isIntersecting);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={core} className="aiReactor" data-core-state={state} aria-hidden="true">
    <svg viewBox="0 0 320 320" className="aiReactorDial" fill="none" focusable="false">
      <g className="aiReactorGrid"><path d="M160 0v320 M0 160h320 M47 47l226 226 M47 273L273 47"/><circle cx="160" cy="160" r="151"/><circle cx="160" cy="160" r="113"/></g>
      <g className="aiReactorTicks">{Array.from({length:60}, (_,i) => <path key={i} d={i%5===0?"M160 12v12":"M160 14v5"} transform={`rotate(${i*6} 160 160)`}/>)}</g>
      <g className="aiReactorOuter"><circle cx="160" cy="160" r="133" strokeDasharray="180 18 28 18 90 18 180 18 28 18 90 150"/><circle cx="160" cy="160" r="139" strokeDasharray="3 26"/></g>
      <g className="aiReactorInner"><circle cx="160" cy="160" r="104" strokeDasharray="140 28 72 87"/><circle cx="160" cy="160" r="97" strokeDasharray="2 12"/></g>
      <path className="aiReactorHex" d="M160 75l74 42v86l-74 42-74-42v-86z"/>
      <path className="aiReactorBrackets" d="M36 103V76h27 M257 76h27v27 M36 217v27h27 M257 244h27v-27"/>
      <g className="aiReactorNodes"><circle cx="160" cy="27" r="3"/><circle cx="293" cy="160" r="3"/><circle cx="160" cy="293" r="3"/><circle cx="27" cy="160" r="3"/></g>
    </svg>
    <div className="aiReactorCenter"><span>RESONANCE</span><strong>AI</strong><small>{status}</small></div>
  </div>;
}
