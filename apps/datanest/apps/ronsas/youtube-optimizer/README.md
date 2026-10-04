# RONSAS YouTube Optimizer

YouTube Optimizer is a governed spoke application in the Resonance Open Nova Sovereign Application Suite (RONSAS).

## Development contract

- Runtime/source authority: this repository.
- Package manager: Bun 1.3.14, pinned in `package.json`.
- Install: `bun install --frozen-lockfile`.
- Validate: `bun run typecheck && bun run test && bun run build`.
- CI: `.github/workflows/ci.yml`.
- Secrets, runtime databases, generated build output, logs, and model caches must remain outside Git source authority.

## RONSAS integration

The app follows the Hub entitlement and governance contracts and is published through the governed review-branch -> CI -> merge -> promotion workflow. Production runtime state is separate from source authority.

Do not reintroduce Lovable-specific ownership or deployment assumptions into this repository.

## Resonance UI/UX alignment

This application follows the **Resonance Sovereign Spectrum 2026** portfolio design system: sovereign-dark operational surfaces, restrained translucent control layers, product-specific accents, explicit AI/governance state, accessible focus/motion behavior, and RONSAS-aligned product identity.

Canonical design authority: https://github.com/resonance36912-cell/RONSAS/blob/main/docs/design/RESONANCE_SOVEREIGN_SPECTRUM_2026.md
