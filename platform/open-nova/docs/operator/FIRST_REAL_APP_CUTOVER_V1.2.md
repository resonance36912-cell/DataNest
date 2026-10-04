# Operator Guide — First Real Resonance App Cutover v1.2

The default pilot remains `reson8-life`.

## 1. Stage and import the real source

Use the v1.1 source-staging workflow, then migration assessment/import. Do not copy `.env`, private keys, dependency caches or build output.

## 2. Generate bindings/adapters and remediate blockers

Use the Service Fabric and Adapter panels. Unsupported RPC, realtime, functions, destructive SQL, or ambiguous provider behavior must be resolved explicitly.

## 3. Establish the source baseline

```powershell
.\scripts\cutover-baseline.ps1 -AppId "reson8-life"
```

Any subsequent source modification invalidates that baseline until a new one is deliberately recorded.

## 4. Create a rollback checkpoint

```powershell
.\scripts\cutover-checkpoint.ps1 -AppId "reson8-life"
```

The checkpoint is a verified sovereign export. It excludes secrets and Git history.

## 5. Run isolated regression

```powershell
.\scripts\cutover-regression.ps1 -AppId "reson8-life"
```

The tests run against a disposable copy under the network-denied isolated runner. Missing runner images remain a blocker; Open Nova will not download them in Zero-Credit mode.

## 6. Start the application preview locally

Start the migrated app using its governed local instructions. Then verify the loopback preview, for example:

```powershell
.\scripts\cutover-preview.ps1 -AppId "reson8-life" -Url "http://127.0.0.1:4310/"
```

Only the governed preview port range is accepted.

## 7. Inspect the cutover plan

```powershell
.\scripts\cutover-plan.ps1 -AppId "reson8-life"
```

All critical gates must pass.

## 8. Record local cutover certification

```powershell
.\scripts\cutover-certify-local.ps1 -AppId "reson8-life"
```

This certifies local readiness only. It does not deploy to production, change DNS, or retire the old application.
