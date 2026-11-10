# Frozen RevenueCat test closure

`historical-revenuecat-webhook-index.ts.txt` preserves the original entrypoint
at source `dfc481e9029614c89233e1be614adcf5be53540f`, with SHA-256
`b6d07180aa97d203bda4385f8946c8bcb90bedce5f1be549914e0940d1287935`.
It is test data, not an active Edge entrypoint. No deployment manifest or proof
source lock is updated to accept the successor webhook implementation.

The historical helper materializes only original, digest-checked source for
refund, cashout, ingress and observer replay tests. Observer proof tests copy
the unchanged proof package into a temporary pinned tree, so its original
verifier and offline emitter continue checking every historical input. The
supplemental inventory pins executable proof modules and closure dependencies
not already enumerated by the original source lock. The only symlink provides
installed test dependencies; no Git history or network is needed at test time.

Current production loaders, source binding, proof verification and the offline
CLI remain unchanged and reject the changed current webhook. Historical test
success grants no current Edge, database execution or deployment qualification.
Adversarial tests cover mutated/missing archived bytes, lock tampering, current
source substitution, and continued failure of current production entrypoints.
