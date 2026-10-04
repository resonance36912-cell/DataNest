import LegalDocumentLayout from "@/components/legal/LegalDocumentLayout";
import { getLegalDocument } from "@/lib/legalRegistry";

const controls=[
  ["Keyboard operation","Primary navigation and interactive controls are designed to remain operable without a pointer."],
  ["Visible focus","Interactive elements expose a visible focus treatment through the shared design system."],
  ["Reduced motion","System reduced-motion preferences and the platform pause-animation control reduce non-essential motion."],
  ["Theme preference","Dark, light, and system theme preferences are supported on migrated DataNest surfaces."],
  ["Skip navigation","Public and root surfaces retain a skip-navigation path where applicable."]
] as const;

export const metadata={title:"Accessibility · Resonance DataNest"};

export default function AccessibilityPage(){
  return <LegalDocumentLayout document={getLegalDocument("accessibility")}>
    <section className="legalAccessibilityDisclosure">
      <p className="eyebrow">ACCESSIBILITY</p>
      <h2>Accessibility in Resonance DataNest</h2>
      <p>Accessibility is an implementation and verification target. This page describes current platform behavior and does not declare external conformance certification.</p>
      <div className="legalPolicyGrid">{controls.map(([title,description])=><article className="legalPolicyCard" key={title}><h3>{title}</h3><p>{description}</p></article>)}</div>
    </section>
  </LegalDocumentLayout>;
}
