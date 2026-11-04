# Exact native production ingress prerequisite deployment

This prepares one evidence-only schema migration and pins its matching RevenueCat
source closure. It is not deployment approval, a provider qualification, native
production purchase admission, or financial settlement readiness. The CLI never
deploys Edge Functions or creates credentials. Do not use a broad database push.

## Scope and sequence

- Project: `bmkkhihfbmsnnmcqkoly`.
- Migration: `20261103005000_native_production_ingress_observations`.
- SHA256: `f18382b2899ed69a3e422538f451f11f1519b53b1ce780d12221cbeb50a48efe`.
- Required predecessor operation: exact tip migration `20261104032615`, including
  its immutable original statement bytes and all three final function bodies.
- Planned order: tip, native ingress schema, matching RevenueCat webhook, then
  separately requalified sandbox cashout. Clip/renderer work remains excluded.

Native's immutable timestamp sorts before tip's. This tool preserves both exact
identities: the original 583-entry history stays unchanged, tip makes 584 entries,
and native makes 585 while the maximum remains `20261104032615`. It never renames
or restamps a migration, fills other pending migrations, or changes old history.

The manifest's original history and guarded catalog/data were read on November 4,
2026. At preparation time neither tip nor native was deployed. The three tip
bodies are checked separately against their exact final hashes; masking only
those bodies in the invariant digest permits the reviewed tip-first sequence
without inventing a live post-tip observation. Their metadata remains guarded.
Native's expected added catalog was independently measured by local SQL replay.

The added-catalog fingerprint sorts its outer item array with explicit `C`
ordering and omits only the canonical PostgreSQL 18 NOT NULL constraint rows already represented by each
column's `attnotnull`. PostgreSQL 17 has no such constraint rows. Unvalidated,
unenforced, inherited or otherwise noncanonical constraints remain fingerprinted,
as do all real CHECK/foreign-key/UNIQUE/primary-key constraints, triggers, grants
and RLS. The added schema has no policies; nested policy-role ordering is not
changed by this repair. This normalization preserves the original migration bytes and the separately captured
baseline/history/data digests; it does not qualify a changed baseline.

The migration creates three empty, owner-only, append-only, FORCE-RLS tables and
two functions. Observations have `financial_authority=false`; API roles cannot
issue qualifications. It also changes exactly one existing checkout body to
recheck live-money mode at native SDK dispatch, preserving its owner and ACLs.
This is dormant evidence capture under the old webhook, but not entirely inert:
the checkout safety recheck takes effect as soon as the schema commits.

## Review and read-only preflight

1. Review the exact tool, manifest, migration bytes, tests and Edge closure.
   Obtain exact-head Required Validation success under current repository rules,
   check the current base, then freeze the merged source commit.
2. Resolve and verify the exact tip deployment first. Neither a source merge nor
   a tip deployment plan satisfies that prerequisite.
3. Obtain action-specific authority for this single migration and project. Use
   only existing authorized Management API transport. If `SUPABASE_ACCESS_TOKEN`
   is unavailable or transport/read context is denied, stop; do not create a
   token, inspect secret files, change configuration, use a browser, or route
   around the denial. The built-in migration tool has no explicit version input
   and is not a substitute for verified identity-preserving application.
4. From a clean checkout at the frozen commit, run:

   ```sh
   node scripts/native-ingress-exact-deploy.mjs --source FULL_MERGED_COMMIT_SHA
   ```

The default is read-only. It requires verified read-only request/session context,
the exact original ledger, exact tip identity and final bodies, the exact existing
checkout body, no partial native objects, all guarded contracts and authority
indexes (including checkout-attempt uniqueness), and OFF/sandbox
holds. `plan_ready` is not applied. Any drift requires investigation and a
reviewed manifest refresh, not relaxed assertions or automatic regeneration.

## Authorized schema application and readback

Before application or retry, obtain bounded native PostgreSQL performance
evidence representative of the current catalog, guarded data and load. A local
PGlite catalog read took about 34 seconds; that is neither a production timing
nor proof that the complete transaction fits the unchanged 45-second statement
limit. Preserve all guards and timeouts, report measured headroom and uncertainty,
and keep deployment blocked until this operational qualification is satisfied.

Only after the preceding checks and explicit authority, append `--apply` to the
same command. Source is rechecked immediately before one bounded transaction:
5-second lock timeout, 45-second statement timeout and 60-second idle timeout.
The transaction takes a deployment advisory lock, locks migration history and
the guarded catalog/settings tables, then rechecks the complete frozen baseline.

The exact original migration and its `version/name/statements=[original bytes]`
row commit together only if the exact new functions, table/column ACLs, RLS,
constraints, indexes and immutability triggers match. New tables must be empty at
commit. Every prior history entry and guarded catalog/data digest must remain
unchanged; the checkout body must match its exact successor. Failure rolls back.
Schema-cache notification is transactional.

A separate read-only request verifies the committed state. Run the default again
for independent readback and retain source/tree, migration hash, time and result.
`already_applied_verified` never writes. It verifies schema identity rather than
requiring observations to remain empty forever after the later webhook rollout.

`apply_unconfirmed` remains unresolved. A timeout can precede a later commit;
even an unchanged read is not permission to resend. The tool never retries a
write. Reconcile the exact history/catalog and the original transaction's end
using authorized read-only access before any new authorized attempt. Committed
corrections must be separately reviewed forward migrations, never history edits.

## Separate matching webhook rollout

This CLI pins but does not upload the seven files in the manifest. Deploy them
only after exact schema readback and separate authorization for
`revenuecat-webhook`, with entrypoint `supabase/functions/revenuecat-webhook/index.ts`
and existing `verify_jwt=false`. Preserve the current shared-header authentication
and all configuration; do not add or change provider secrets or project settings.
Read back the deployed function, compare every file byte/hash and JWT setting,
and retain the returned function version. No test charges or synthetic production
events are part of this rollout.

At preparation, live v93 (November 1) differs only by the 29-line index addition
and 20-line store-policy addition. Its five shared dependencies match exactly.
Re-read live metadata/source before deployment and investigate any intervening
change; the preparation snapshot is not continuing authority over newer code.
Schema-first is compatible with v93. Webhook-first can fail the new RPC and is
prohibited. If observation storage fails, canonical lifecycle effects have already
committed and the provider delivery retries idempotently. Never interpret that as
a failed purchase or repeat a charge. Premium/sandbox processing and historical
terminal cleanup remain governed by their existing contracts.

Keep live money, payouts and cashout OFF; native/provider gates sandbox-only;
qualification/revocation tables unseeded; renderer, deletion and OTA holds intact.
No production-native-intent prohibition is removed. Ownership verification,
provider/store account and product qualification, physical-device evidence,
renewal financial binding, actual fees/taxes and financial settlement remain
separate work. See `NATIVE_PRODUCTION_INGRESS_PREREQUISITE.md` for those boundaries.

## Verification

`node --test tests/native-ingress-exact-deploy.test.mjs` proves source binding,
read-only/idempotent behavior, tip-first admission, drift rejection, atomic
rollback, exact native catalog and prior-history preservation. Its local replay
starts without all five pending migrations, applies tip only, then native only.
It is synthetic SQL proof, not native-lock contention or provider/device proof.
Run the existing two `tests/creator-money/native-production-ingress*` suites too.
Full exact-head Required Validation remains required before source qualification.

Run `node scripts/test-deployment-catalog-portability.mjs --output /tmp/catalog-portability-UNIQUE`
with a new output directory to compare every added-catalog component on PGlite 18
and native PostgreSQL 17.6 with ICU. It requires the script's pinned image already
cached locally; it never pulls an image. Its unique container has no network,
ports or host mounts, stores its database in tmpfs, and is removed after success,
error, or handled SIGINT/SIGTERM interruption.
The JSON artifact distinguishes engine versions/locales and records nullability,
CHECK/FK/UNIQUE/primary-key, trigger, ACL, RLS and FORCE-RLS drift rejection, plus
PostgreSQL 18-only noncanonical NOT NULL cases. `--pglite-only` is partial evidence
and cannot establish cross-version agreement. This catalog fixture does not
execute money/provider behavior or qualify a production baseline.
