# Exact native-tip amount-policy deployment

This is a deployment tool, not deployment approval. Source merge and passing CI
do not activate it. Keep all provider, money, renderer, retention, Edge and OTA
operations outside this migration. Do not use a broad database push.

## Frozen identity and scope

- Project: `bmkkhihfbmsnnmcqkoly`.
- Reviewed feature merge: PR669, `145951df38eb673bf626cf32382c9bc67433231d`.
- Version: `20261104032615`; name: `native_tip_catalog_amount_policy`.
- Source: `supabase/migrations/20261104032615_native_tip_catalog_amount_policy.sql`.
- SHA256: `f18d738818dcc68ab6ff61f737a4755be4dcc4fd02846249c01647c1f5d3fc2b`.

Only three existing internal function bodies change. Their exact before/after
hashes are pinned in `scripts/native-tip-exact-deploy.mjs`. The immutable SQL
also requires exactly one old clause in each function before replacement.
Public wrappers, signatures, owners, grants, search paths, RLS and data are
preserved. No new product, price, provider capability or money operation occurs.

The live baseline was read on November 4, 2026: 583 migration entries, maximum
`20261101215711`, and the full version/name/statement digest in the manifest.
The manifest pins all public/private function definitions except the three
expected bodies, their unchanged metadata, relevant relation/column/policy/
trigger/constraint/role contracts, and an aggregate digest of the existing
catalog, creator tip settings, switches and operational holds. No row payloads
or secrets are emitted. Any changed baseline requires investigation and a
reviewed manifest refresh, not relaxed checks or blind regeneration.

These pending migrations are expressly excluded and are not prerequisites:

- `20261102093836_creator_clip_export_bounded_pool`
- `20261102094308_creator_clip_scale_lifecycle_ledger`
- `20261102194000_sandbox_creator_cashout_execution`
- `20261103005000_native_production_ingress_observations`

The historical price-list prerequisite is present through the archived
`20261029091757_creator_backend_atomic_rollout` deployment. Never infer an absent
dependency from only an individual filename; the tool checks effective bodies.

## Review and preflight

1. Review the exact source diff, tests, manifest, migration bytes and this scope.
   Require exact-head `Chi'llywood / Required Validation` success under live
   repository rules. Freeze the merged commit containing this tooling.
2. Obtain action-specific authority for the named project and single migration.
   Do not create credentials, change configuration or use a browser workaround.
3. In a clean checkout at that frozen commit, use the existing authorized
   `SUPABASE_ACCESS_TOKEN` transport only. The tool never reads secret files.
   If existing access is unavailable or denied, stop at that boundary.
4. Run the read-only default:

   ```sh
   node scripts/native-tip-exact-deploy.mjs --source FULL_MERGED_COMMIT_SHA
   ```

   It requires verified read-only session/transaction context, the exact full
   baseline history, exact before-body hashes and ACLs, guard digests and holds.
   `plan_ready` is not applied. `already_applied_verified` means exact ledger
   identity, post-bodies and all frozen invariants match; it never writes.

## Authorized application and independent postcheck

After preflight and explicit deployment authority, append `--apply` to the same
command. The tool rechecks clean committed source immediately before one write.
It uses a bounded transaction (5-second lock timeout, 45-second statement timeout,
60-second idle timeout), a deployment advisory lock and locks on history plus
the guarded data tables. Under those locks it revalidates the complete baseline.

The exact migration and `version/name/statements=[original file bytes]` history
entry are committed together only after exact post-body hashes, every prior
history entry, all invariant/data digests and OFF/sandbox-only holds pass again.
Failure rolls back the transaction. The schema-cache notification is transactional.
There is no generic migration application or timestamp substitution.

After the write, a separate read-only request verifies the complete committed
state. Run the default command again for an independent operator readback. Save
the source/tree, migration hash, status and timestamp in the deployment record.
Existing read-only Supabase access can independently inspect the same generated
readback query without applying SQL or changing credentials.

## Unknown outcome and corrections

`apply_unconfirmed` is unresolved, even if the readback still shows the old
baseline. A request can time out while its transaction later commits. The tool
never retries its write. Reconcile the exact ledger, all three function bodies,
invariants and any still-running transaction through authorized read-only access.
If the exact post-state is present, record success without another write. If
absent, establish the original transaction has ended before considering another
authorized invocation. Partial, mismatched or drifted state remains blocked.

Do not delete history, mutate deployed migration bytes or reverse a committed
deployment in place. Any committed correction is a separately reviewed forward
migration. Preserve purchase, quote, receipt and unresolved execution records.

## Compatibility and remaining qualification

- Database-only rollout is compatible with the OTA hold, but existing iOS
  clients may see newly eligible exact catalog prices. It is not inert staging.
- Old Android clients retain the legacy 100-cent UI filter. This database
  deployment does not deliver the client fix to installed devices.
- Android's current 99-cent row lacks `sandbox_purchase_intents_enabled`; do not
  set that flag or change its provider product ID as part of this operation.
- Existing iOS 99/299/499/999-cent mappings remain `providerVerified=false`.
  Neither source tests nor deployment claim provider or physical-device proof.
- Genuine unsupported amounts remain unavailable without rounding or an
  automatic external route. No Edge deployment is needed for PR669.
- Live money, payouts and cashout stay OFF. Relevant native/provider switches
  stay sandbox-only; renderer/deletion holds and OTA remain unchanged.

## Local verification

`node --test tests/native-tip-exact-deploy.test.mjs` replays the live-era schema
without all five pending migrations, checks exact bodies, source binding,
read-only/idempotent behavior, drift admission, transaction/postcheck rollback,
exact history preservation and uncertain-result reconciliation. Local fixtures
use synthetic data only. Full required validation remains the merge gate.
