# CONDUCTOR Tree

**CONDUCTOR** is the DataNest timing and process-synchronization tree. It observes workflow freshness and dependencies, coordinates pull/push and push/pull data-flow order, dispatches at most one due process per coordination cycle, and triggers SUGGESTER when the synchronized cycle is ready for optimization analysis.

CONDUCTOR does not merge, deploy production directly, rewrite Boundaries, or synchronize FREETREE. Cross-repository Mirror activity remains delegated to Mirror-owned consumers and maintenance.

The dependency order is Knowledge / ENVIRONMENT / Boundaries / Security → ENFORCER / BOTSQUAD → GUARDIAN → SUGGESTER. A successful run must belong to the checked-out canonical SHA, remain within its freshness window, and start after its required input runs complete. A newer failure, active run, unknown result or stale input holds dependent work. Failed runs have a 30-minute retry cooldown.

CONDUCTOR records a dispatch reservation before calling Actions and waits up to five minutes for the request to become visible. It keeps an attempt ledger for the most recent 1,000 suggestion fingerprints. Refreshing an unchanged suggestion cannot repeatedly execute it. An uncertain dispatch is recorded for inspection rather than assumed successful. The immutable run artifact contains the command and dispatch result; the state branch contains the reservation and ledger.

The 15-minute scheduled pulse recovers from missed completion events. GitHub Actions scheduling is best effort, so this is near-real-time coordination, not a hard real-time execution guarantee. Existing tree schedules remain available; CONDUCTOR checks their activity before dispatching. Mirror pull/push work stays with its existing consumers and reviewed promotion path.
