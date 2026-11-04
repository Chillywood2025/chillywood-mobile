# Exact Google refund-tax deployment preparation

This is source-only preparation for PR674. It does not authorize deployment,
activate reporting, qualify provider evidence, or enable money. The committed
manifest is deliberately unqualified. The CLI cannot apply this migration.

## Immutable subject and predecessor order

- Project: `bmkkhihfbmsnnmcqkoly`.
- Migration: `20261104120922_google_refund_tax_history_checkpoints`.
- Original SQL SHA256: `6929bccfbdb7f440afc3b8aa37ab1e9bc4001799e301f23840054eb3ef55a2c9`.
- Keep the reviewed order: exact tip `20261104032615`, native ingress
  `20261103005000`, matching RevenueCat webhook, separately requalified dormant
  sandbox cashout `20261102194000`, then this refund migration.
- Both clip/renderer migrations remain excluded. No broad database push,
  restamping, replay, history repair, new credentials or provider setup.

The three predecessors are absent from the refreshed November 4 observation.
The original 583-row history still has maximum `20261101215711` and digest
`8ef39413e785edf6381b2d52f4c427415a4528e15314e2419c19a4e181ba5310`.
Applying refund first would invalidate the tip/native frozen preconditions.
Expected counts after the qualified sequence are 586 before refund and 587
afterward. The maximum is tip's immutable version before refund, then refund's.

The manifest's `prePredecessorObservation` is a metadata/hash observation only.
Its SELECT queries made no changes. The observed MCP session was not an enforced
read-only Management API session; `readContextVerified=false` is retained rather
than promoted to transport qualification. It is not an expected post-sandbox
state. No post-predecessor live baseline currently exists.

## Current executable boundary

`node scripts/google-refund-tax-exact-deploy.mjs --help` explains the interface.
From a clean, frozen, reviewed source commit, the default `--source FULL_SHA`
path can perform a read-only prerequisite probe using an already-authorized
Management API transport. It rejects the wrong current/session role or a
non-read-only transaction. Do not obtain a token, inspect credential files,
change settings or use another transport to work around that rejection.

`--apply` rejects the pending qualification before credential access or network
construction. Even a future qualified manifest alone does not enable the CLI:
it still rejects because no verified live RevenueCat readback transport is
implemented. Unknown arguments, baseline overrides and force flags are rejected.

The exported atomic executor is implemented for synthetic local testing. A future
reviewed caller must provide a current exact RevenueCat readback, including the
project, ACTIVE status, version, JWT setting and complete source closure. A
boolean, stale file or SQL ledger entry is not proof of an Edge deployment.

## What must be independently qualified later

1. Complete and read back each authorized predecessor in its established order.
   Sandbox's offline packet is not an executor or deployment evidence.
2. Capture a fresh, complete post-sandbox ledger, defined catalog contract,
   guarded data and holds using verified read-only transport. Independently
   review it and commit the qualification in a new source change. Do not
   automatically accept whatever values the live database returns.
3. Bind all three predecessor version/name/original-statement hashes and the
   original 583 history rows. Bind current RevenueCat project/version/ACTIVE,
   JWT and all seven source files to the reviewed ingress closure.
4. Implement and review verified live predecessor Edge readback transport before
   enabling any CLI write path. Obtain action-specific deployment authority.
5. Rerun exact-head Required Validation and review the final diff. Revalidate all
   source and live preconditions immediately before the bounded transaction.

The catalog contract covers functions/owners/grants/configuration, schemas,
relations and view options, columns/defaults/collations, constraints, indexes,
noninternal triggers, policies, roles/memberships, default grants and event
triggers. No existing body is masked: refund adds objects only. Guarded data
includes Google admissions/bindings/transactions/outbox/report events/tax
evidence, relevant tip/auction/merch and ledger sources, native evidence and
dormant sandbox state. Money/provider gates, renderer/deletion holds and
Discovery-on state must remain unchanged. Sandbox control stays OFF with its
other tables empty; native qualifications and Google program rows remain empty.

## Tested transaction and readback contract

The executor rechecks the qualified baseline under an advisory lock and bounded
table locks, with 5-second lock, 45-second statement and 60-second idle timeouts.
It executes the original SQL once and records exactly its immutable
`version/name/statements=[original SQL]` in the same transaction. Postchecks
require unchanged history/catalog/data/holds, the independently measured new
catalog and an empty new checkpoint table. Failure rolls back schema and ledger.

All fingerprint queries normalize `search_path=pg_catalog,public`. New catalog
measurement is independent synthetic PGlite replay, not a live deployment. The
one new private table has FORCE RLS and no API table grants; only service_role
can execute the two public RPCs. The private helper has no API execution grant.

A separate read-only request reconciles a possibly committed transaction.
`apply_unconfirmed` remains unresolved, even if an immediate read still shows
the prior state. There is never an automatic write retry. Reconcile the original
transaction outcome before any separately authorized attempt. Applied migrations
remain immutable; corrections use a separately reviewed forward migration.

## Separate Edge rollout

Only after exact schema readback and separate authorization, deploy complete
closures from the same frozen source. The tool pins but never deploys them:

- `google-play-external-reporter`: 10 files, existing `verify_jwt=false` and
  dedicated worker-secret authentication preserved.
- `stripe-merch-cost-reconcile`: nine files, existing `verify_jwt=true` and
  exact service credential check preserved.
- `stripe-auction-cost-reconcile`: eight files, same JWT/service boundary.

At preparation, Google v2 differs only by the intended checkpoint call and two
added dependency files. Merch v3 and auction v2 differ only in the shared
checkpoint module. Every other existing file was compared byte-for-byte.
Read all live versions again before rollout; this snapshot is not authority over
intervening changes. Verify all returned source bytes and JWT values afterward.

Schema-first is compatible with the old reporter. Do not invoke workers as a
deployment test, seed qualifications, change secrets/schedules, enable reporting,
make charges/refunds/transfers/payouts or alter entitlements. Checkout Tax
Association/authenticated export completeness and Google rounding interoperability
remain separately unqualified provider work after this source preparation.

## Local verification

Run `node --test tests/google-refund-tax-exact-deploy.test.mjs
tests/google-refund-tax-exact-deploy-replay.test.mjs` (on one command line).
Tests cover blocked preparation, immutable source/dependency/JWT checks,
predecessor order, drift rejection, source/current-Edge gates, atomic rollback,
exact new catalog, idempotency and one-attempt uncertain-write handling.
Synthetic baseline injection exists only in test code and never qualifies the
committed manifest. Full protected exact-head validation is still required.
