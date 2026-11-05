# Exact dormant sandbox cashout deployment

The committed manifest qualifies the exact disabled schema against the live
baseline observed on November 4, 2026 at `22:50:39.638Z`, after the ordered tip and
ingress applications and verified RevenueCat webhook v94. The
[sanitized evidence](audits/sandbox-cashout-baseline-20261104.json) records the six
baseline fields, source/tree identities, two identical read-only observations,
receipt provenance and webhook verification. The sandbox schema was absent at
that observation; source qualification does not apply it, deploy endpoints,
configure credentials, qualify a creator, enable dispatch or operate a provider.

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

Catalog fingerprints sort their outer item arrays with `C` ordering and apply
the existing narrowly bounded PostgreSQL 17/18 NOT NULL normalization. Column nullability and nonredundant
constraints remain checked. Expected added-schema evidence must compare the
unchanged migration on native PostgreSQL 17 and PGlite 18; a PGlite-only hash
must not certify the native deployment. Guarded/source data fingerprints also
use `C` ordering. The committed baseline was captured with this exact tooling;
any requalification requires a fresh observation. No old baseline or fabricated
predecessor receipt is reused.
Nested policy-role array ordering is unchanged; the added schema has no policies.

## Evidence and requalification

The recorded application observations are tip at `16:46:13Z`, then ingress at
`21:57:48Z`; the webhook was verified at `22:46:45.828Z`. Receipt `appliedAt` values
retain the original post-response UTC observation times and `timestampMeaning`;
they are not invented server commit times. Only the successful tip section of the
older combined receipt is used. Its failed ingress attempt is excluded in favor
of the later successful ingress receipt.

The six committed fields describe history, existing catalog and guarded settings.
`sourceDataSha256` is deliberately not committed: each current preflight measures
the volatile source rows and binds that observation through application and
readback. A changed committed contract requires this review sequence again:

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

Refusal tests and the CLI fixture explicitly construct an unqualified manifest;
the CLI fixture commits it before selecting its source SHA. The local SQL test
uses an independent unqualified clone before constructing its synthetic qualified
bundle. These fixtures never update the real manifest or qualify deployed state.

Before application, obtain bounded native PostgreSQL performance evidence
representative of the current catalog, source-data volume and load. A local
PGlite catalog read took about 34 seconds; this does not establish production
timing or safe completion of the full transaction within its unchanged
45-second statement limit. Preserve all guards and timeouts and record remaining
uncertainty as a deployment blocker.

## Read-only inspection and exact apply

From a clean checkout containing the reviewed tool and complete helper closure:

```sh
node scripts/sandbox-cashout-exact-deploy.mjs --source FULL_MERGED_COMMIT_SHA
```

The default is read-only. With the qualified manifest it returns `plan_ready`
only when the current state matches all committed contracts and prerequisites;
this still means no write occurred. An unqualified manifest's apply command fails
before transport or credential use. Existing partial objects or incorrect history
are never treated as an invitation to repair them automatically.

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
node scripts/test-deployment-catalog-portability.mjs --output /tmp/catalog-portability-UNIQUE
```

The disposable PGlite SQL rehearsal checks exact schema and grants, prerequisite order,
old-catalog/source preservation, failure rollback, history identity and drift.
Fake-transport tests check no-write admission and uncertain-result handling.
These do not substitute for selected Required Validation or native PostgreSQL
transaction/concurrency qualification at the frozen source head.
The catalog portability command uses a new output directory and the already
cached pinned PostgreSQL 17.6 image in a disposable container with network disabled,
no ports or host mounts, tmpfs storage, and cleanup. Its artifact compares every
added-schema component against PGlite 18, retains the original raw fixture hashes
as dependency controls, and records rejection of nullability, CHECK/FK/UNIQUE/
primary-key, trigger, ACL and RLS changes. It is catalog-only evidence;
`--pglite-only` explicitly omits native verification and cannot qualify deployment.
