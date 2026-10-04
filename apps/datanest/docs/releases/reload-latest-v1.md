# Resonance DataNest — reload-latest-v1

Baseline: external-ai-companion-v1 at 36ef62377b347fc6a6fe107fa35895b65e001a01.

Adds a top-bar **Reload latest** action that:
- fetches the live release manifest with `cache: no-store`;
- uses the deployed frontend commit as a cache-busting release key when available;
- falls back to a timestamp if the manifest cannot be fetched;
- reopens the current DataNest route with `release` and `_reload` query parameters so the browser requests a fresh document and content-hashed Next.js bundle;
- does not depend on Ctrl+F5 / browser-specific hard-refresh shortcuts.

The existing **Refresh** button remains a data/control-plane refresh only.
