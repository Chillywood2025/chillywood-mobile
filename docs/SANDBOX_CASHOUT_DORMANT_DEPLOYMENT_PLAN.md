# Sandbox cashout dormant deployment preparation

This plan stages source for one migration and two new Edge endpoints. It is not
deployment or activation authority. The preparation tool has no network,
credential access, SQL executor, apply mode, or baseline override. Every output
is marked not deployable until the remaining gates below are independently met.

## Fixed scope

- Project: `bmkkhihfbmsnnmcqkoly`.
- Migration: `20261102194000_sandbox_creator_cashout_execution.sql`, SHA-256
  `a41152e19ab73a959a514a8495f5b00dc9c4ff50f436fb15e16c908ac2483e46`.
- Endpoints: `sandbox-creator-cashout` (JWT verification true) and
  `sandbox-creator-cashout-webhook` (false, dedicated raw-body signature check).
- Preserve the exact source version, name and single-element statement array
  containing the unchanged migration bytes. The generic MCP migration tool
  does not expose a version argument and is not an identity-preserving executor
  for this source file. Do not invent aliases or repair history afterwards.
- No renderer, native-ingress, broad migration push, existing payment handler,
  provider setting, secret, account, tester membership, qualification, schedule,
  mobile publication or release is included.

The migration adds 11 private tables and 21 functions. All new tables use RLS
and FORCE RLS with direct access revoked from API roles. Five authenticated RPCs
and three service-only RPCs have explicit grants; private helpers do not become
public API. It creates a single disabled control row and no financial records.
It also adds source-change hold triggers to the existing money ledger and merch
orders. Therefore it still needs schema compatibility and transaction/lock
validation even while disabled; additive does not mean operationally inert.

## Tip, ingress, then sandbox ordering

The exact tip deployment tool is qualified against all 583 existing history rows
and the current catalog. Apply the separately authorized tip migration
`20261104032615_native_tip_catalog_amount_policy` first, then the separately
qualified `20261103005000_native_production_ingress_observations` migration.
A sandbox-first change
would invalidate that baseline and must not be used to evade the tip gate.

The offline sandbox preflight requires the original history digest
`8ef39413e785edf6381b2d52f4c427415a4528e15314e2419c19a4e181ba5310`
after excluding only the exact tip, ingress and sandbox versions. Before tip it
reports blocked; after tip it blocks until ingress is recorded with exact bytes.
After both exact predecessor history rows, it still reports that a fresh complete
baseline requires independent requalification. History rows alone do not prove
applied catalog definitions or the chronological order of application. Verify
both executors' successful applied readbacks and their retained ordered receipts.

The preflight is metadata-only and has been designed to run in a read-only
transaction. It captures a catalog fingerprint, required gate state, dependency
presence and target absence. `projectExpected` is a constant, not a database
identity proof: bind the transport to the observed Supabase project. Name-level
dependency presence is not exact columns, signatures, ownership or compatibility.
Do not turn this packet or a caller-supplied snapshot into an approved manifest.

## Preparation

After the helper is reviewed, run it with a full frozen source commit containing
the native-tip policy, native-ingress migration and PR668's bounded cleanup:

```
node scripts/sandbox-cashout-dormant-plan.mjs --source FULL_COMMIT_SHA --out NEW_DIRECTORY
```

The new directory contains the exact migration, one read-only preflight query,
two complete Edge deploy argument objects and a source/hash inventory. Existing
directories are never overwritten. The collector follows local imports and
runtime config from Git. External JSR/npm imports remain runtime-resolved, so
these hashes qualify uploaded source, not a reproducible hosted dependency lock.

The earlier November 3 packet used an older shared engine and a generic
tool-assigned migration version. Do not execute that packet. This preparation
requires the bounded cleanup shared-engine hash and retains source identity.

## Required identity-preserving transaction design

A separately source-reviewed executor must be qualified after tip and ingress. It must:

1. Bind the clean committed tool, manifest, migration and complete local helper
   closure to the exact source head. Verify exact-head Required Validation and
   review current late-sentinel findings before deployment.
2. Read current project history, target absence, complete predecessor schema and
   grants, both predecessors' applied readbacks, all money holds and discovery controls. Pin the
   complete fresh baseline in the reviewed manifest; no override or auto-refresh
   option is permitted. Different history requires explicit fresh qualification.
3. Use one bounded transaction with an advisory transaction lock, a five-second
   lock timeout, a finite statement timeout, and locks on migration history,
   control/settings and the source relations touched by this migration. Recheck
   the baseline under lock. Avoid broad migration commands.
4. Execute only the unchanged source bytes and record only version
   `20261102194000`, name `sandbox_creator_cashout_execution`, and exact
   `statements=[source_bytes]` in the same transaction. Never rewrite prior rows.
   This source version is older than the tip version; retain the tip version as
   history maximum. The expected history count after all three migrations is 586.
5. Before commit, prove all previous history is unchanged; new table columns,
   constraints, indexes, RLS/FORCE RLS, owners and grants match the independently
   qualified schema; all 21 function bodies/metadata/ACLs and 14 explicit/generated
   triggers match; control is false; all other new tables are empty; old catalog,
   ledger and operational controls are unchanged except the two intended triggers.
6. Read back the exact result after commit. An uncertain outcome is not a retry
   instruction: reconcile schema/history first and do not submit a second write.
   Forward-only corrections require a new reviewed migration. Do not drop schema
   or delete migration history as rollback.

The offline helper does not emit executable apply SQL. A separate
[exact executor](SANDBOX_CASHOUT_EXACT_DEPLOYMENT_RUNBOOK.md) now implements the
bounded transaction and readback, with its committed production manifest still
**unqualified**. Its apply command fails before transport until a separately
reviewed source change binds the real ordered predecessor receipts and fresh
baseline. Neither the offline packet nor a synthetic test manifest can qualify
deployment. Focused tests do not replace the full selected database suite or
native concurrency proof.

## Dormant endpoint rollout and evidence

After verified database closure, deploy only the two prepared endpoints through
the canonical Edge deployment tool. Recheck they are still absent immediately
before deploying; if present, capture their existing bytes, version and JWT policy
before deciding whether a replacement is authorized. Preserve prepared JWT flags.
Read back the complete deployed file closure and compare hashes and settings.

Keep live money, payouts and cashout OFF. Keep Stripe Connect, creator
monetization and provider webhooks sandbox-only. Keep discovery enabled,
collecting and primary delivery ON. Keep the sandbox database control false and
`SANDBOX_CREATOR_CASHOUT_ENABLED` not equal to `true`. Do not change any live
cashout worker activation variable. Verify runtime configuration using only
authorized name/status evidence; do not retrieve or log secret values.

The client endpoint checks its environment gate before reading credentials or
dispatching. The webhook deliberately remains a provider-read-only reconciliation
path that can record database observations after dispatch is disabled; its store
cannot claim a dispatch and its engine is called in observation-only mode.
Neither endpoint deployment needs Stripe
reauthentication, a new credential or a provider mutation. Existing DB false
control and empty qualifications/executions are independent dispatch barriers.

Bounded negative probes may check wrong method, missing/invalid authorization,
disabled dispatch and unsigned webhook rejection. JWT rejection at the gateway
does not prove the handler's disabled gate. Use an already-authorized test session
to distinguish them when available; otherwise report the narrower evidence.
Do not fabricate a token, execution, event signature or provider success.

## Activation is separate

Actual test funding/payout proof still needs refreshed Stripe connection and
independent test-platform, connected-account, destination, balance, fee-contract,
webhook-delivery and exclusive-writer evidence. The secret names are
`STRIPE_CASHOUT_TEST_KEY` and `STRIPE_CASHOUT_TEST_WEBHOOK_SECRET`; this stage
does not create, read, configure or rotate them. New persistent access requires
action-time approval. Existing stale provider observations are insufficient.

Only a separately authorized finite commissioning scope may append qualification
and enable both isolated sandbox controls. Preserve every live control OFF.
Provider test-paid is not real bank receipt or proof of production fees/tax.

## Focused verification

```
node --test tests/sandbox-cashout-dormant-plan.test.mjs
```

This checks fixed source scope, complete bundle closure, exact tip-first identity,
drift and safety holds, no apply mode or overwrite, and metadata-only SQL against
the disposable live-era schema. Its local migration test checks disabled/empty
seed state, not real Stripe execution or installed-device behavior.
