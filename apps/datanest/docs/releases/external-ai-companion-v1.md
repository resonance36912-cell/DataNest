# Resonance DataNest — external-ai-companion-v1

This follow-up release responds to the live ChatGPT iframe refusal observed in the DataNest External AI sidebar.

Baseline: external-ai-sidebar-v1 at a7b78c398292d95a3eb0f355507917b899eeb0ee.

## Behavior

- ChatGPT is marked as a known non-embeddable provider.
- DataNest no longer renders the broken ChatGPT iframe.
- ChatGPT uses managed **companion mode**: the right-hand DataNest sidebar keeps the Job Manifest, handoff, tracking, and response-import workflow while ChatGPT opens in an adjacent secure browser window.
- The companion window uses the stakeholder's own ChatGPT account/credits.
- The window is pre-opened synchronously to avoid popup blocking, has its opener severed, and is navigated only after the tracked Supabase session is created.
- Other providers retain the embed attempt until their framing behavior is known, with the existing pop-out fallback.
- Supabase launch tracking now distinguishes `companion` from `sidebar` and `popout`.
- Launching a session still awards no contribution points; imported work remains reported/unscored pending review.

## Production migration

`external_ai_companion_mode` extends `external_ai_sessions.launch_mode` and `start_external_ai_sidebar_session` to support `companion`.

## Validation

Release gates remain TypeScript, dependency audit, production build, container build, GitHub Pages deployment, live manifest/runtime verification, and rendered Playwright browser smoke tests.
