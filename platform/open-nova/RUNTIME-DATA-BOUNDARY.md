# Runtime Data Boundary

RONS v1.5.8 sealed-r5 excludes generated secrets, execution receipts, machine-specific runtime paths, Python caches, and live application databases.

Runtime secrets are generated locally during governed provisioning and must never be distributed.
Aurum Operations initializes its SQLite data store locally at runtime.

