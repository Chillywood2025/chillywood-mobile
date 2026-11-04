# Exact dormant sandbox cashout deployment

The executor is implemented, but its committed production manifest is
**unqualified**. No production baseline has been inferred from a local fixture or
the earlier 583-entry snapshot. The CLI cannot apply this migration until a
separately reviewed source change qualifies that manifest with actual evidence.
This work does not deploy endpoints, configure credentials, qualify a creator,
enable sandbox dispatch, or operate a payment provider.

## Fixed scope

- Project: `bmkkhihfbmsnnmcqkoly`.
- Migration: `20261102194000_sandbox_creator_cashout_execution`.
- Original SQL SHA-256:
  `a41152e19ab73a959a514a8495f5b00dc9c4ff50f436fb15e16c908ac2483e46`.
- Original identity and `statements=[unchanged source bytes]` are committed in
  the same transaction as the schema. No history repair, timestamp substitution,
  migration replay, broad database push or unrelated migration is supported.
- Eleven private tables, 21 exact functions and 14 application triggers are
  inventoried explicitly in `scripts/sandbox-cashout-deployment-contract.mjs`.
  Five RPCs are authenticated-only and three service-only. All private tables
  have RLS and FORCE RLS with no direct API-role access. The only seed is the
  disabled control row; the other ten tables must be empty.

The two source-hold triggers affect existing ledger and merchandise writes even
while cashout is disabled. New foreign keys also add internal constraint triggers
to existing referenced relations. The catalog comparison accounts for those RI
triggers by constraint and function identity, without relying on generated OID
names or ignoring unrelated existing triggers. It preserves all other old
functions, relations, columns, constraints, indexes, policies, schema ownership,
ACLs, roles and memberships in the `public`, `private` and `auth` schemas.

## Complete the evidence before qualification

1. Confirm the actual exact native-tip deployment, followed by the actual exact
   native-ingress deployment, using their existing canonical executors. Retain
   their ordered `applied_verified` receipts, source/tree, original migration
   hashes and timestamps. Migration rows alone do not establish this order.
2. Verify the matching RevenueCat webhook deployment separately. The sandbox
   executor binds that local source closure but does not inspect or upload the
   deployed webhook. The existing ingress runbook remains its rollout authority.
3. Read a fresh complete post-predecessor snapshot through the existing
   project-bound authorized transport. Review schema/grants, authority controls,
   original history and exact predecessor bodies independently. The expected
   pre-sandbox count is 585 and maximum version remains `20261104032615`.
   Unexpected intervening history, including another migration rollout, requires
   explicit requalification rather than ignoring the difference.
4. Independently review the source-derived expected added catalog and the fresh
   live baseline. Fill `qualification.baseline`, `observedAt`, and the two
   `predecessorReceipts` in the committed manifest, then change its status to
   `qualified`. This is a source change requiring normal exact-head review and
   Required Validation. There is no CLI baseline override, caller snapshot
   qualification, manifest regeneration or automatic promotion path.
5. Freeze the merged, validated commit and verify current late-sentinel findings
   before executing the named production operation under its action authority.

The local SQL test may construct a synthetic qualified bundle in memory. That
bundle never updates the production manifest and never qualifies deployed state.

## Read-only inspection and exact apply

From a clean checkout containing the reviewed tool and complete helper closure:

```sh
node scripts/sandbox-cashout-exact-deploy.mjs --source FULL_MERGED_COMMIT_SHA
```

The default is read-only and returns a concrete prerequisite or unqualified
status until the evidence is complete. The manifest in this change makes
`--apply` fail before transport or credential use. After real qualification,
`plan_ready` still means no write occurred. Existing partial objects or incorrect
history are never treated as an invitation to repair them automatically.

Only with a qualified manifest, current clean exact source, successful preflight
and action authority may the same command include `--apply`. It sends at most
one bounded transaction: five-second lock timeout, 45-second statement timeout,
60-second idle timeout, an advisory transaction lock, and relation locks on
migration history, guarded settings, discovery controls, ledger/merch sources
and the referenced user relation. It rechecks the baseline under those locks.
Source rows are fingerprinted immediately before apply and must remain unchanged.

Before commit it verifies the immutable history entry, all existing catalog/data
invariants, exact added schema/ACLs, disabled control, and empty financial tables.
The final history count is 586 and its maximum remains the tip version. Failed
checks roll back both schema and history. Only the intended two application
source triggers and the new constraints' internal effects are excluded from the
unchanged-old-catalog comparison.

A separate read-only request verifies the committed catalog and history, then
another verifies the disabled/empty state. `already_applied_verified` is read-only
and requires those same dormant conditions. `apply_unconfirmed` must be reconciled
against actual schema/history and the original transaction's termination; the
tool never resends a write, even if an initial read still looks unchanged.
Forward-only correction is required for committed differences.

## Separate dormant endpoint rollout

The manifest pins the complete local source and JWT policy for
`sandbox-creator-cashout` (`true`) and `sandbox-creator-cashout-webhook` (`false`).
The CLI does not upload either. After exact schema readback, follow the existing
[dormant rollout plan](SANDBOX_CASHOUT_DORMANT_DEPLOYMENT_PLAN.md): inspect current
endpoint presence, use canonical Edge deployment, and independently compare the
deployed file closure and JWT settings. Keep the DB control false and
`SANDBOX_CREATOR_CASHOUT_ENABLED` disabled. No credential values are needed here.

Keep discovery enabled, collecting and primary delivery on; live money, payouts
and cashout off; and provider/creator/native gates sandbox-only. Actual test
funding and test bank payout still require independent Stripe account, destination,
fee, webhook, tester/session and finite commissioning evidence. No result from
this executor proves provider delivery, actual fees/tax or installed app behavior.

## Verification

```sh
node --test tests/sandbox-cashout-exact-deploy.test.mjs tests/sandbox-cashout-exact-deploy-postgres.test.mjs
```

The disposable SQL rehearsal checks exact schema and grants, prerequisite order,
old-catalog/source preservation, failure rollback, history identity and drift.
Fake-transport tests check no-write admission and uncertain-result handling.
These do not substitute for selected Required Validation or native PostgreSQL
transaction/concurrency qualification at the frozen source head.
