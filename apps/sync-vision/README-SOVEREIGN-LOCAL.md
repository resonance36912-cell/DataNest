# Resonance Sync Vision — Sovereign Local v0.1

This migration is a local-first compatibility build for Open Nova.

## Local now
- Original Vite/React Sync Vision interface.
- Local Open Nova identity (no hosted sign-in required).
- Local project/table persistence in the browser.
- Large media blobs stored in IndexedDB rather than hosted Supabase Storage.
- Pasted-lyrics transcription fallback and deterministic local verification/segmentation.
- Deterministic local character concepts and placeholder storyboard imagery.
- Local All-Access entitlement response; no Hub billing/credit calls required.
- External HTTP requests are denied by default by a runtime network guard.

## Deliberately held for the next sovereign engine phase
- Acoustic speech-to-text when no pasted lyrics are supplied.
- Local generative image model execution.
- Local WAN/lip-sync video model execution.
- Vendored FFmpeg core for final browser audiovisual render/export.
- Email, payments, and hosted admin integrations.

No production cutover is performed by this package.
