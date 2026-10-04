# Hub production release requests

Commit `hub-production.json` only for an explicitly approved production promotion.

Required shape:

```json
{
  "schema": "ronsas-hub-release-request/v1",
  "sourceRepo": "resonance36912-cell/resonance-hub",
  "sourceBranch": "ronsas/ealiophin-production",
  "commit": "<40-char reviewed commit SHA>",
  "confirmation": "PROMOTE RONSAS HUB"
}
```

The governed Windows runner validates the current remote production head before building or promoting. A stale request fails closed.
