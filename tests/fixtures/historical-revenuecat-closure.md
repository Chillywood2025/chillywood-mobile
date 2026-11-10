# Frozen RevenueCat test closure

`historical-revenuecat-webhook-index.ts.txt` preserves the original entrypoint
at source `dfc481e9029614c89233e1be614adcf5be53540f`, with SHA-256
`b6d07180aa97d203bda4385f8946c8bcb90bedce5f1be549914e0940d1287935`.
It is test data, not an active Edge entrypoint. No deployment manifest or proof
source lock is updated to accept the successor webhook implementation.

`historical-supabase-config.toml.txt` preserves the exact `supabase/config.toml`
bytes from source `cac579c2161874a739ecb21e1ed090f181d83a37`, with SHA-256
`ebcc4972b4fc1497241222cdb846f7561ecdb7690146728d6e71170829c64115`, matching
the original observer proof source lock. It is test data, not active Supabase
configuration. The current config retains the authenticated normal Studio
endpoint sections; no historical manifest or source lock is repinned to it.

The three `historical-isolated-paid-video-*.ts.txt` archives preserve the exact
`supabase/functions/_shared/isolated-paid-video-{contract,rpc,runtime}.ts` bytes
from the same `cac579c2161874a739ecb21e1ed090f181d83a37` source. Their SHA-256
digests also match the unchanged observer proof source lock:

- contract: `c5bd58b23512d32457efddc4e272afa67a5654370c09f2380ef6243984687ffe`
- rpc: `47976601f0694393d26614f57a6ab5915542cb3ad39171dab0b5a24ecc903f2e`
- runtime: `651904284540b0d23ce8f059fe066bf5676f5087c324537790d957b66198eaae`

These archives retain the historical proof inputs without accepting or
reverting the normal Studio successor implementations.

The historical helper materializes only original, digest-checked source for
refund, cashout, ingress and observer replay tests. Observer proof tests copy
the unchanged proof package into a temporary pinned tree, so its original
verifier and offline emitter continue checking every historical input. The
supplemental inventory pins executable proof modules and closure dependencies
not already enumerated by the original source lock. The only symlink provides
installed test dependencies; no Git history or network is needed at test time.

Current production loaders, source binding, proof verification and the offline
CLI remain unchanged. Proof verification independently rejects every changed
current archived source; deployment loaders retain their original source and JWT
checks. Historical test success grants no current Edge, database execution or
deployment qualification.
Adversarial tests cover mutated/missing archived bytes, lock tampering, current
source substitution for every archive, and continued failure of current
production entrypoints. Missing or altered archives never fall back to current
worktree bytes, and all original archived digests are enforced independently
of the source lock.
