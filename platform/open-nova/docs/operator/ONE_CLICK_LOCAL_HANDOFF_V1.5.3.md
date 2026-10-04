# Open Nova v1.5.3 — One-Click Local Handoff

## First run

Double-click `OPEN-NOVA-FIRST-RUN.cmd`. This permits an explicit one-time download of only the pinned Python runtime packages when the local wheelhouse is empty. It does not download an AI model or enable external AI.

## Normal run

Double-click `OPEN-NOVA-OFFLINE.cmd`. This path does not provide a network fallback.

## Safety gates

The workflow stops if repository selection is ambiguous, the repository is dirty, tracked secrets are detected, a governed destination would be overwritten, or required migration/runtime evidence is missing. The original repository is never rewritten.

## Result

Upload `exports/evidence-bundles/reson8-life-real-execution-evidence.zip` to ChatGPT for analysis.
