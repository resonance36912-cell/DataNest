# Open Nova runtime boundary

Runtime state is deliberately excluded from canonical source control. This directory exists only to document the boundary.

Do not commit secrets, local database contents, model binaries, machine caches, live receipts, credentials or mutable runtime state here. Source-level runtime adapters/scripts belong in reviewed source folders; large model artifacts and runtime evidence are referenced by hash and external evidence location.
