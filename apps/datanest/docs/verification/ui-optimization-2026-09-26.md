# DataNest entry and dashboard optimization — 26 September 2026

Changes:
- Responsive AI & I entry page with shared CSS collaboration artwork and existing sign-in flow.
- Keyboard skip link, larger mobile form controls, persistent pause-animation toggle, and system reduced-motion support.
- Dashboard graph identifies the loaded sample, displays daily counts, and groups dates in UTC. Operational timestamps explicitly identify UTC.
- No new production dependencies, carrier functionality, authentication permissions, or backend changes.

Validation:
- GitHub Pages production static export passed (Next.js 15.5.26; 172 kB reported first-load JS).
- TypeScript check passed.
- Existing unit suite: 254 passed.
- Chromium 153: 10 browser tests passed, including existing auth smoke tests and new entry/dashboard tests.
- Layout checked at 320, 390, 768, and 1440 px; no horizontal overflow.
- Desktop and mobile screenshots visually inspected.
- Dashboard test uses isolated mocked responses in America/Los_Angeles to verify UTC boundary handling; it does not certify live backend authorization.

The Pages verification workflow now runs both browser suites after deployment.
