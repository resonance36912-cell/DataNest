# Resonance DataNest — external-ai-sidebar-v1

Release purpose: move tracked external AI collaboration from the R&D card into a persistent DataNest right-hand sidebar.

Baseline: stakeholder-pilot-v1 at 83b74b5bb74b9669b0f0aed42274f1d888a26702.

Key behavior:
- Global AI Sidebar toggle in the DataNest top bar.
- Persistent, resizable right dock across DataNest views.
- Job Manifest selector with R&D selection synchronization.
- ChatGPT, Gemini, Claude, Grok, and Perplexity launch options.
- Embedded iframe attempt where the provider permits framing.
- Pop-out fallback where provider security headers block embedding.
- Tracked sidebar/pop-out launch mode.
- Job Manifest handoff copy.
- Audited response import into DataNest.
- Launching creates no contribution points.
- Imported external-AI work remains reported/unscored until independent review.

Release gates remain unchanged: TypeScript, dependency audit, production build, Docker build, GitHub Pages deployment, live Next.js shell/chunk/runtime/manifest checks, and rendered browser smoke tests.
