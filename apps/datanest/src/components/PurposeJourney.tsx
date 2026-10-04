"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import styles from "./PurposeJourney.module.css";
import { workflowPhases, type WorkflowDestination } from "@/lib/workflowPhases";


export default function PurposeJourney({ onNavigate }: { onNavigate: (view: WorkflowDestination) => void }) {
  const [selected, setSelected] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const step = workflowPhases[selected];

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % workflowPhases.length;
    else if (event.key === "ArrowLeft") next = (index + workflowPhases.length - 1) % workflowPhases.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = workflowPhases.length - 1;
    else return;
    event.preventDefault();
    setSelected(next);
    tabs.current[next]?.focus();
    tabs.current[next]?.scrollIntoView({block:"nearest",inline:"nearest",behavior:"instant"});
  }

  return <section className={styles.journey} aria-labelledby="purpose-journey-title">
    <div className={styles.intro}>
      <div><p className="eyebrow">YOUR PURPOSE, IN PRACTICE</p><h3 id="purpose-journey-title">Find your next meaningful step.</h3></div>
      <p>Explore the path at your own pace. Start wherever you need.</p>
    </div>
    <div className={styles.tabs} role="tablist" aria-label="From discovery to verification">
      {workflowPhases.map((item, index) => <button
        key={item.destination}
        ref={element => { tabs.current[index] = element; }}
        id={"purpose-tab-" + item.destination}
        type="button"
        role="tab"
        aria-selected={selected === index}
        aria-controls={"purpose-panel-" + item.destination}
        tabIndex={selected === index ? 0 : -1}
        onClick={() => setSelected(index)}
        onKeyDown={event => move(event, index)}
      ><span className={styles.number} aria-hidden="true">0{index + 1}</span><b>{item.label}</b><span className={styles.glyph} aria-hidden="true">{item.glyph}</span></button>)}
    </div>
    {workflowPhases.map((item, index) => <div
      key={item.destination}
      id={"purpose-panel-" + item.destination}
      role="tabpanel"
      aria-labelledby={"purpose-tab-" + item.destination}
      hidden={selected !== index}
      className={styles.panel}
      tabIndex={0}
    >
      <div className={styles.copy}><h4>{item.verb}</h4><p>{item.description}</p><small><span aria-hidden="true">↳ </span>{item.outcome}</small></div>
      <button className={styles.open} type="button" onClick={() => onNavigate(item.destination)}>{item.action}<span aria-hidden="true"> →</span></button>
    </div>)}
    <div className={styles.footer}><span>Human direction · AI collaboration · Traceable decisions</span><span aria-hidden="true">{selected + 1} / {workflowPhases.length} · {step.label}</span></div>
  </section>;
}
