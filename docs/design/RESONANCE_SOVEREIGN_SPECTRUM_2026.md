# Resonance Sovereign Spectrum — UI/UX Theme 2026

**Status:** Canonical portfolio design direction  
**Applies to:** RONSAS / Resonance Hub, Resonance AppDev + DataNest, Resonance ePublisher, Creative Studio, Sync Vision, YouTube Optimizer, and future Resonance spoke applications  
**Governance basis:** RCGF — Truth · Transparency · Sovereignty · Resonance · Continuous Evolution

## 1. Strategic direction

The portfolio should feel like **one governed operating system with specialist instruments**, not a set of unrelated SaaS skins.

The shared experience is:

- dark, calm, high-legibility sovereign workspace;
- a restrained Resonance spectrum (violet → magenta → cyan);
- translucent material reserved for navigation and transient controls;
- matte work surfaces for reading, editing, review, evidence, and production;
- visible AI state, human authority, auditability, and recovery actions;
- expressive product-specific hero moments without sacrificing dense operational usability;
- responsive layouts that add value at larger breakpoints instead of merely stretching;
- motion used to explain state change, not as permanent decoration.

## 2. 2026 trend assessment

### AI-native interfaces are becoming operational, not conversational-only
Modern AI products increasingly expose plans, actions, sources, approvals, memory/data scope, and recovery. Resonance should make AI presence and limits explicit, keep humans in control, and show what is saved, certified, pending, or blocked.

Reference:
- Microsoft Fluent 2 Responsible AI: https://fluent2.microsoft.design/responsible-AI

### Expressive systems are replacing generic minimalism
Research behind Material 3 Expressive emphasizes intentional color, scale, containment, shape, and motion to improve hierarchy and make products feel more distinct. Resonance should use this selectively for hero moments, product identity, key actions, and status—not every surface.

References:
- Google Design — Expressive Design research: https://design.google/library/expressive-material-design-google-research
- Material 3 Expressive: https://developer.android.com/design/ui/wear/guides/get-started/design-language

### Layered materials are strongest when controls float above content
Apple’s current guidance treats glass-like material as a functional control/navigation layer rather than the main content surface. Resonance should therefore reduce “glass everywhere”: navigation, command bars, floating AI controls, and temporary panels can use translucent material; content/work surfaces should remain more opaque.

References:
- Apple HIG Materials: https://developer.apple.com/design/human-interface-guidelines/materials
- Apple Liquid Glass overview: https://developer.apple.com/documentation/TechnologyOverviews/liquid-glass

### Accessibility and predictable structure are baseline product quality
Clear hierarchy, logical headings, keyboard access, visible focus, readable contrast, semantic structure, and reduced-motion behavior are part of the design system, not post-processing.

Reference:
- Fluent 2 Accessibility: https://fluent2.microsoft.design/accessibility

## 3. Brand architecture

### Master brand — Resonance / RONSAS
**Role:** ecosystem identity, sovereignty, governance, trust.  
**Primary visual signal:** magenta with violet/cyan system spectrum.  
**Tone:** confident, calm, technically literate, warm, evidence-minded.

### Resonance AppDev / DataNest
**Role:** control plane for planning, orchestration, scheduling, traceability, products, audit, and governed AI.  
**Accent:** cyan.  
**Secondary:** violet.  
**UX posture:** highest information density in the portfolio; command-center clarity; progressive disclosure; shareable deep links; explicit system state.

### Resonance ePublisher
**Value proposition:** turn topics, manuscripts, PDFs, and research into polished audiovisual books.  
**Accent:** magenta.  
**Secondary:** cyan for narration/audio/system state.  
**UX posture:** editorial intelligence; structured flow; manuscript → enrich → narrate → publish.

### Creative Studio
**Value proposition:** design posters, ads, product visuals, brochures, and campaign media.  
**Accent:** violet.  
**Secondary:** magenta.  
**UX posture:** expressive canvas, bento creative tools, strong preview hierarchy, visual-first controls.

### Sync Vision
**Value proposition:** turn songs into cinematic storyboards, character concepts, captions, and video-generation prompts.  
**Accent:** pink.  
**Secondary:** cyan.  
**UX posture:** kinetic sequence, timeline/storyboard rhythm, continuity status, scene progression.

### YouTube Optimizer
**Value proposition:** audit channels, improve thumbnails/titles/content strategy, and build growth roadmaps.  
**Accent:** red with amber/gold for momentum and opportunity.  
**Secondary:** cyan for verified/system data.  
**UX posture:** analytic clarity, action prioritization, before/after evidence, performance deltas.

## 4. Shared semantic color roles

| Role | Token | Value | Meaning |
| --- | --- | --- | --- |
| Sovereign canvas | `--rs-bg-0` | `#05030d` | root background |
| Deep canvas | `--rs-bg-1` | `#090619` | secondary background |
| Work surface | `--rs-surface` | `rgba(18,10,39,.92)` | reading/editing surface |
| Control glass | `--rs-control` | `rgba(10,6,25,.72)` | nav / floating controls |
| Hairline | `--rs-line` | `rgba(103,226,255,.14)` | default separation |
| Text | `--rs-text` | `#f8f7ff` | primary |
| Muted text | `--rs-muted` | `#aaa7c7` | secondary |
| System / verified | `--rs-cyan` | `#42e7ff` | system state, traceability |
| Intelligence / brand | `--rs-magenta` | `#ff36d8` | AI/brand emphasis |
| Sovereignty / depth | `--rs-violet` | `#8b5cf6` | governance/creative depth |
| Certified / healthy | `--rs-success` | `#72e6ae` | pass/certified |
| Human review | `--rs-warning` | `#f4c66f` | attention/approval |
| Blocked / destructive | `--rs-danger` | `#ff86ab` | fail/blocked |

**Rule:** status meaning must not be communicated by color alone.

## 5. Product accent mapping

| Product | Primary accent | Secondary accent |
| --- | --- | --- |
| RONSAS / Hub | magenta | cyan |
| AppDev / DataNest | cyan | violet |
| ePublisher | magenta | cyan |
| Creative Studio | violet | magenta |
| Sync Vision | pink | cyan |
| YouTube Optimizer | red | amber |
| Career Compass | emerald | gold |
| Podcast/media | cyan | violet |

The master Resonance gradient may appear in hero/brand moments, but operational controls should use the product accent or semantic status color.

## 6. Typography

- **Display:** Space Grotesk or Sora, 700–800, tight tracking.
- **Body/UI:** Inter or Manrope, 400–700.
- **Metadata / trace IDs / system labels:** JetBrains Mono or system monospace.
- **Editorial accent:** serif italic only where content benefits from it; never for dense controls.

Use short, scannable headings. Avoid long all-caps strings except metadata labels.

## 7. Shape, surface, and depth

- Navigation/control radius: 10–14px.
- Work surface radius: 16–22px.
- Hero/special surface radius: 22–28px.
- Pills: full radius only for compact state/filter chips.
- Work surfaces: mostly opaque.
- Control/navigation layers: translucent with restrained blur.
- Maximum one dominant glow per region.
- Avoid permanent neon bloom around every component.

## 8. Motion

Use motion to explain:
- state changes;
- navigation;
- job/agent lifecycle;
- selection;
- successful completion;
- transitions between evidence layers.

Avoid:
- continuous decorative pulsing on core work surfaces;
- glitch effects in operational UI;
- large ambient motion behind text-heavy screens.

Always honor `prefers-reduced-motion`.

## 9. AI + governance UX contract

Every AI-enabled surface should make these states legible where relevant:

- **AI active** — cyan/magenta indicator + explicit label.
- **Human authority** — amber or neutral control state.
- **Pending validation** — amber.
- **Certified / verified** — green.
- **Blocked / failed** — red/pink.
- **Memory/data scope** — explain what is saved and how it is used.
- **Evidence/source state** — visible attribution or trace link.
- **Action boundary** — distinguish suggestion, queued action, executed action, and certified outcome.

No AI persona should be visually indistinguishable from a human user.

## 10. Responsive information architecture

### Desktop
Use a consistent three-zone model when the workflow needs it:
1. context/navigation rail;
2. primary work canvas;
3. AI/control/evidence dock.

### Tablet
Collapse the third zone into a drawer or stacked panel; preserve task context.

### Mobile
Prioritize:
1. current task;
2. primary action;
3. status;
4. compact navigation.

Dense desktop tables should convert to labeled cards or grouped rows rather than forcing horizontal scroll whenever practical.

## 11. Portfolio alignment rules

All applications should share:
- sovereign dark visual spine in operational/product areas;
- common focus treatment and reduced-motion behavior;
- shared semantic state colors;
- consistent system labels and traceability patterns;
- product accent mapped to active states and primary local actions;
- matte content surfaces + translucent control layers;
- consistent copy tone;
- visible “Part of Resonance / RONSAS” relationship where appropriate.

Applications should **not** share:
- identical dashboards;
- identical hero compositions;
- identical product accents;
- identical density;
- unnecessary enterprise controls in creative/editorial tools.

## 12. Implementation sequence

1. Canonical tokens and accessibility/motion baseline.
2. Navigation and control surfaces.
3. Work surfaces/cards.
4. Product-specific accent mapping.
5. AI/governance state components.
6. Responsive density.
7. Browser regression tests and visual smoke tests.
8. Iterate from usage data without breaking governance semantics.


## 13. Public surfaces outside the connected source authority

The following public products are part of the Resonance ecosystem but are not exposed as writable repositories through the current GitHub connection. They still follow this design authority.

### The Resonance Podcast

**Current public role:** media, interviews, clips, community storytelling, studio content and ecosystem thought leadership.  
**Accent:** cyan with violet depth.  
**UX posture:** cinematic media surface, not a SaaS dashboard.

Alignment target:
- preserve immersive editorial/media presentation;
- use Resonance sovereign-dark canvas and cyan/violet identity;
- identify it as **Resonance ecosystem media**, not as a paid software product;
- prioritize episodes, clips, transcripts, guests, and community pathways;
- connect clearly back to Reson8/RONSAS without adding operational controls that belong in Hub/DataNest;
- use glass only for media navigation/player controls, with opaque reading surfaces for transcripts/blogs;
- avoid product-pricing language unless an actual media/product sale is explicitly active.

Public surface: https://www.resonance-podcast.com/

### Career Compass

**Current public role:** evidence-based South African learner guidance using personality, skills and aptitude assessments, reports, careers, bursaries and jobs.  
**Accent:** emerald with gold secondary.  
**UX posture:** calm evidence-first guidance, privacy and uncertainty made explicit.

Alignment target:
- retain the Resonance sovereign foundation while using a lighter emotional load than operational RONSAS tools;
- emphasize **Direction & Purpose** rather than AI spectacle;
- surface assessment progress, evidence/source quality, privacy state and report confidence clearly;
- keep probabilistic-result disclaimers visible near recommendations;
- distinguish pilot/reward mechanics from career evidence so incentives never appear to affect guidance;
- use emerald for progress/positive direction, gold for opportunities, cyan for verified system/source state;
- link back to the Resonance ecosystem while keeping learner guidance task-first.

Public surface: https://www.career-compass.org/

## 14. Source-authority boundary

The canonical theme may define alignment targets for products whose public surfaces are visible, but implementation claims must remain scoped to repositories or systems available through an authorized write connection. A public-site assessment is not evidence that its source has been changed.
