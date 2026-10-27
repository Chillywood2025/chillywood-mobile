# Creator/buyer Stripe follow-up: source review and coverage ledger

Evidence snapshot: 2026-10-27. The Stripe follow-up has completed independent source review and the local checks recorded below. Draft publication and exact-head CI are recorded in PR 626 and the final task handoff; the successful scheduled-show checkpoint remains separate.

## Checkpoints and authority

| Checkpoint | Exact status |
| --- | --- |
| Preserved scheduled-show implementation | Commit `370ca25b2a13ecd07ba48309335d7af274bd3f03`, draft [PR 626](https://github.com/Chillywood2025/chillywood-mobile/pull/626). The parent independently verified all **13 exact-head CI checks passed**, including Required Validation job `121994288771`. |
| Source base for this follow-up | `370ca25b2a13ecd07ba48309335d7af274bd3f03`. Earlier CI results do not validate the subsequent Stripe changes. |
| Follow-up commit / published PR head | Exact immutable identity is recorded in the draft PR and task handoff after publication. |
| Follow-up exact-head CI / Required Validation | Required separately. The PR and task handoff record the run, head, check totals and skips; preceding checkpoint CI is not inherited. |

The approved follow-up repairs positive-price Stripe settlement, merchandise refund/retry reconciliation, tip refund presentation and observed Connect configuration. It preserves existing revenue-split policy and distinguishes callback settlement from admission of a new purchase. Historical migration files are unchanged; the implementation uses four new forward migrations.

No authorization is implied for live switches, products/prices, credentials, security settings, provider/account changes, payments, refunds, transfers, payouts, deployment, releases or merge. PR 624/625 logout, Studio/shared-video deletion and Brand-index work, the separate manual delivery task, and historical performance recovery are outside this follow-up.

## Source and coverage map

| Area | Current source behavior | Evidence and remaining work |
| --- | --- | --- |
| Shared settlement classification | Positive safe-integer amount, exact Checkout/PaymentIntent object and state. Positive-price Checkout credit requires `paid`; `unpaid` completion is pending evidence; unknown and `no_payment_required` do not credit. PI success requires `succeeded` and the full actual `amount_received`. | `_shared/stripe-payment-settlement.ts`; production adapters use this helper and independently bind stored identity/economics/environment. Tip and Merch focused adapter results below. |
| Tip callback authority | New SQL independently checks explicit test envelope/object, platform account scope, stored Checkout/PI, client reference, tip/sender/creator metadata and immutable amount/currency. Delayed success/failure, compensation and refund/dispute precedence remain distinct. | `stripe-tip-webhook/index.ts`; `20261027034836_creator_tip_settlement_authority.sql`. Missing exact receipt identity remains retryable without credit, including metadata-free removals. Final focused SQL/Edge and native proofs pass. |
| Tip partial refunds and reordered success | Cumulative refund evidence remains monotonic; late success must not restore the refunded portion of creator net or erase dispute/compensation state. Initiation switches do not suppress legitimate settlement of an already bound payment. | New tip migration and `stripe-tip-settlement-postgres.test.mjs`. Real reservation/receipt/settlement paths, negative controls and native races pass; initial fixture failures are retained below. |
| Merchandise atomic reconciliation | One service-role RPC serializes event identity/hash and locks the order. Receipt and order changes commit together. Exact stored identity, original total/currency and sandbox order are required. Unfinished legacy `received`/`failed`/`duplicate` receipts can retry; a finalized exact delivery is idempotent. Missing stored identities return retryable outcomes. | `stripe-merch-webhook/index.ts`; `20261027034844_creator_merch_payment_refund_reconciliation.sql`; focused Edge, complete-schema SQL and native simultaneous-session proofs pass. |
| Merchandise refunds and fulfillment | Valid cumulative refunds cannot decrease or overwrite the charged total. Partial refunds preserve fulfillment; full refunds/disputes retain shipped, delivered and returned history. Late success cannot undo full refund/dispute. Historical unknown amounts are not guessed or used to reopen canceled fulfillment. | Merch SQL tests include partial→full→stale, malformed totals/identities, refund/dispute before success, shipping histories and final-receipt transaction failure/rollback/retry. |
| Purchases refund read model | Validated Stripe-tip `refund: {state: none/partial/full, amountMinor}` is separate from original `amountMinor`. Dispute takes precedence; inconsistent historical accounting remains visible for reconciliation. Parser and mounted UI retain account/session binding and distinguish original charge from cumulative refund. | `20261027034920_buyer_purchase_partial_refund_presentation.sql`, `_lib/creatorPurchases.ts`, `app/purchases.tsx`. Client and full RPC→parser→mounted route round-trip proofs pass. |
| Event-remedy wrapper | Only `read_my_creator_purchases_pre_event_remedies(...)` is replaced. The outer `read_my_creator_purchases(...)` introduced by the earlier scheduled-show migration retains caller checks, ACL and event-remedy enrichment. | New purchase migration lines 2–4; historical `20261026170150_buyer_event_refund_eligibility_history.sql` remains unchanged. Wrapper identity/body/ACL and runtime proofs pass. |
| Observed Connect configuration | Account type, controller type/is-controller, dashboard, fee payer, loss collector and requirement collection are observed separately from the expected onboarding policy. Provider `application` maps to existing DB `platform`; missing/unknown values remain unknown. Safe mismatch/unknown responses do not grant payout authority. Express account creation policy is retained. | `_shared/stripe-connect.ts`, account/sync/onboarding/webhook adapters, `_lib/creatorPayouts.ts`, channel settings and `20261027034858_creator_connect_observed_configuration.sql`. Atomic account→eligibility projection, exact-account observation binding, stale-response protection and failure/rollback pass focused and native proof. |

## Small source excerpts for independent review

Line anchors describe this source snapshot. These excerpts are source evidence, not deployed-parity evidence.

**Paid status and actual receipt of funds:** [shared classifier:21](../../supabase/functions/_shared/stripe-payment-settlement.ts#L21), [shared classifier:32](../../supabase/functions/_shared/stripe-payment-settlement.ts#L32).

```ts
// no_payment_required is not authority to credit a positive-price product.
if (object.payment_status === "paid") return "succeeded";
return object.payment_status === "unpaid" ? "pending" : "unsupported";

return object.status === "succeeded" && object.amount_received === object.amount
  ? "succeeded" : "unsupported";
```

**Explicit sandbox gates:** [merch adapter:115](../../supabase/functions/stripe-merch-webhook/index.ts#L115), [tip SQL:224](../../supabase/migrations/20261027034836_creator_tip_settlement_authority.sql#L224). Merch SQL independently enforces the equivalent raw-environment guard at line 56; both SQL paths also validate stored environment.

```ts
if (event.livemode !== false || object?.livemode !== false
  || toText((event as unknown as Record<string, unknown>).account)) {
```

```sql
v_provider_environment_exact := v_tip."provider" = 'stripe_connect'
  and v_tip."provider_environment" = 'test'
  and p_provider_facts->'event_livemode' = 'false'::jsonb
  and p_provider_facts->'object_livemode' = 'false'::jsonb
  and (not p_provider_facts ? 'event_account' or p_provider_facts->'event_account' = 'null'::jsonb);
```

**Partial refunds and shipping history:** [merch SQL:216](../../supabase/migrations/20261027034844_creator_merch_payment_refund_reconciliation.sql#L216). Exact original amount/currency checks precede this branch; original charged totals are never assigned from callback amounts.

```sql
v_refunded:=greatest(coalesce(v_order.refunded_amount_minor,0),v_refunded);
v_full_refund:=v_refunded=v_amount or v_terminal_refund;
-- within the atomic order update:
fulfillment_status=case when not v_full_refund or fulfillment_status in ('shipped','delivered','returned')
  then fulfillment_status when v_disputed then fulfillment_status else 'canceled' end
```

**Original tip charge versus cumulative refund:** [purchase SQL:141](../../supabase/migrations/20261027034920_buyer_purchase_partial_refund_presentation.sql#L141), [purchase SQL:153](../../supabase/migrations/20261027034920_buyer_purchase_partial_refund_presentation.sql#L153), [UI:132](../../app/purchases.tsx#L132).

```sql
'state',case when v_tip."refunded_amount_cents"=0 then 'none'
  when v_tip."refunded_amount_cents"=v_tip."total_paid_cents" then 'full' else 'partial' end,
'amountMinor',v_tip."refunded_amount_cents"
-- outer purchase item, retained independently:
'status',v_status,'amountMinor',v_tip."total_paid_cents",'currency',v_tip."currency",
'refund',v_tip_refund,
```

**Outer event-remedy wrapper preserved:** [new purchase SQL:2](../../supabase/migrations/20261027034920_buyer_purchase_partial_refund_presentation.sql#L2); [existing wrapper:20](../../supabase/migrations/20261026170150_buyer_event_refund_eligibility_history.sql#L20).

```sql
-- Patch only the inner read model. The outer read_my_creator_purchases wrapper
-- retains its identity, caller checks, ACL and event-remedy enrichment.
create or replace function public."read_my_creator_purchases_pre_event_remedies"(
```

**Observed configuration and payout-off projection:** [normalizer](../../supabase/functions/_shared/stripe-connect.ts#L533), [atomic projection](../../supabase/migrations/20261027034858_creator_connect_observed_configuration.sql#L108). The observation must match the current account ID; projection and account update commit together, with independent platform holds preserved.

```ts
const observedEnum = (value: unknown, supported: readonly string[]) =>
  typeof value === "string" && supported.includes(value) ? value : "unknown";
// observedOwner maps provider application ownership to existing DB platform.
```

```sql
on conflict (creator_user_id) do update set
  payout_account_id=excluded.payout_account_id, eligible_for_payouts=false,
```

## Recorded validation: do not sum overlapping runs

Evidence files are under the local task's `../recovery-evidence/stripe-followup/`. Counts below are per saved invocation, not a unique aggregate. Some logs cover overlapping files, and source may have changed after a passing intermediate run.

| Saved evidence | Recorded result | Qualification limit |
| --- | --- | --- |
| `merch-edge.log` | **9/9 pass**, 0 fail/skip/cancel | Final merch adapter run, including restored rejection audits. |
| `merch-postgres.log` | **12/12 pass** (11 nested scenarios), **161 real SQL assertions**, 0 fail/skip/cancel | Full-schema replay; 152.75 seconds. Original running session completed successfully after executor reconnection; no duplicate rerun. |
| `merch-deno-check.log` | Deno check passed | Existing cached dependencies; no installation. |
| `tip-settlement-edge-after-removal-retry.log` | **34/34 pass**, 0 fail/skip/cancel | Includes overlapping existing lifecycle/buyer-authority tests; does not add to earlier 20/20 or 32/32 runs. |
| `tip-settlement-postgres-after-retry-repair.log` | **16/16 pass**, **367 explicit SQL assertions**, 0 fail/skip/cancel | Fifteen real lifecycle scenarios, 485 migrations, four documented managed-infrastructure substitutions. Tip SQL hash `f372ee85`; final Connect schema is qualified separately. |
| `tip-existing-retry-postgres.log` | **1/1 pass**, **26 SQL assertions**, 0 fail/skip/cancel | Existing checkout receipt/retry regression under the stricter projector. |
| Tip checkout retry/client tests | **14/14 pass**, 0 fail/skip/cancel | Separate files from the 34-test webhook run; retained initiation behavior. |
| `connect-observed-unit.log` | **12/12 pass**, 0 fail/skip/cancel | Final observation, actual Edge, Studio and webhook tests, including replaced-account onboarding denial. |
| `connect-observed-postgres-final.log` | **1/1 pass**, 0 fail/skip/cancel | Final bound-observation/atomic eligibility SQL and client round trip; failure rollback/retry, holds and stale observation CAS. |
| `connect-deno-check.log` | **Five entrypoint checks passed**, exit 0 | Final shared module and account/sync/onboarding/webhook adapters; cached dependencies, no installation. |
| `purchases-refund-client-final.log` | **23/23 pass**, 0 fail/skip/cancel | Parser and mounted client coverage; does not replace database round-trip proof. |
| `purchases-refund-postgres-roundtrip.log` | **1/1 pass**, 0 fail/skip/cancel | Actual SQL → parser → mounted screen, cumulative refund states, original price, dispute precedence and wrapper/ACL identity. |
| Existing Purchases library test in `purchases-refund-postgres.log` | **1/1 pass**, 0 skipped | All purchase modes and outer event-remedy behavior. The failed new fixture in that same invocation is retained below. |
| `client-api-grants.log` | **9/9 pass**, 0 fail/skip/cancel | Focused API-grant inventory checks. |
| `integrated-client-edge.log` | **100/100 pass**, 0 fail/skip/cancel | Final combined Tip/Merch/Connect/Purchases and customer-language regressions. Overlaps the lane-specific tests above. |
| `connect-policy.log` | Stripe Connect policy guard passed | Updated contract checks atomic SQL authority rather than removed inline implementation strings. |
| `webhook-policy-interim.log` | Provider webhook reliability guard passed | Interim guard; final proof/aggregate outcome pending. |
| `lint.log`, `typecheck.log`, `purchases-refund-lint.log` | All command exits **0** | Full app lint/TypeScript and targeted Purchases lint; exact published head still requires CI. |
| `core-runtime.log`, `money-guards.log` | All command exits **0**; route contract **13/13 pass** | Runtime, route, UX/discovery and monetization/payment-rail/Money Center/Stripe/provider-webhook guards. |
| `catalog-delta.log` | **1/1 pass**, 0 fail/skip | Exact declared function delta from audit baseline. Later Connect binding column does not add a function; final chain/ACL validation remains required. |
| `service-grant-consumer.log` | **1/1 pass**, 0 fail/skip | Immutable historical grants retained; the single removed Edge eligibility writer is explicitly retired and its private trigger successor checked. |
| `explicit-grants-full.log` | **4/4 pass**, 0 fail/skip/cancel | Fresh-schema and legacy ACL replay: 66 actual service operations, 72 new-table/private boundaries, 133 client-table surfaces. Managed-infrastructure substitutes are explicitly reported in the log. |
| `native-apply-results.json` | Four migration applications recorded exit 0 in isolated `stripe_followup_validation`, network `none`, no ports or mounts | **Historical application proof only.** Tip/Connect source has since changed; record final file hashes and refreshed native proof before qualification. |
| `native-settlement-bound-01.log` | **172 assertions passed**, **18 observed lock races**, 0 skipped | Final bound-account schema, four source hashes recorded in `native-apply-bound-results.json`; isolated PostgreSQL with network none, no ports or mounts. Earlier `native-settlement-final-01.log` is superseded schema evidence. |
| `native-tip-pgtap-bound.log` | **66/66 pass**, 0 fail/skip | Existing native atomic Tip lifecycle suite on the final bound-account schema. |
| `native-tip-legacy-concurrency-bound.log` | **3/3 pass**, exit 0 | Existing concurrency, stale-attempt fencing and authority serialization; caller-verified isolated container and explicit local socket/database. |
| `native-connect-bound-02.log` | **36 assertions pass**, **2 observed lock races**, 0 skipped | Exact-account observation CAS, atomic projection rollback/retry, replacement account, hold preservation and private function ACLs. |
| Strengthened settlement startup-only recheck | **4/4 pass**, exit 0 | Separately verifies the required live/payout switch rows both exist and are off. Full 172-assertion run used prior runner hash `37292693`; revised runner `07a38306` changes only this proof guard and adds explicit read-only startup mode. Default execution still runs all races. |
| Full aggregate validation, exact-head CI and Required Validation | **Pending** | Record commands, final totals/skips, immutable head and CI run after completion. |

### Failed and incomplete attempts retained as history

| Evidence | Exact outcome / relevance |
| --- | --- |
| `tip-existing-edge-before.log` | 20 tests: 17 pass, 3 fail. Follow-up fixtures were updated for stricter provider facts; later `tip-existing-edge-after.log` and `tip-existing-edge-client-reference.log` each show 20/20 pass. These overlap the newer 34-test run. |
| `tip-settlement-postgres.log` | 13 tests: 5 pass, 8 fail (7 nested failures plus parent). Tests incorrectly assumed an unpaid quote stores net zero; real reservation keeps quoted net while status/paid_at/payout gates prevent recognition. Expectations were corrected; no accounting calculation was changed. Final 16/16 run above includes partial-before-paid ordering. |
| `connect-observed-focused.log` | 9 tests: 8 pass, 1 fail; account-reuse/onboarding test expected 200 but received 500. Later separated 8/8 unit and 1/1 SQL passes are recorded above, with further projection review still open. |
| `purchases-refund-client.log` | 23 tests: 22 pass, 1 fail on mounted copy expectation; later `purchases-refund-client-final.log` shows 23/23. |
| `purchases-refund-postgres.log` | 2 tests: 1 pass, 1 fail. Existing owner library proof passed; new round trip failed during PGlite setup because the mounted fixture's window changed the loader selection. Delaying that fixture import until after DB initialization fixed the test setup; the separate final round trip passed above. |
| `native-settlement-01.log` | Exited before concurrency proof with `tip_checkout_quote_invalid` from `reserve_creator_tip_checkout_attempt(...)`. Repair/verify the fixture without weakening production quote validation, then rerun. |
| `native-connect-bound-01.log` | First 20 assertions and two lock races passed, then a fixture trigger compared text `creator_user_id` with an explicit UUID cast. Only that harness comparison was corrected; final 36-assertion run passed and no injected failure trigger remains. |
| `connect-policy-interim.log`, `webhook-proof-interim.log` | Interim string checks failed after authority moved into atomic SQL. Updated policy passed; final provider-reliability proof remains part of aggregate validation. |
| Initial default merch Deno check | Dependency resolution could not find `npm:openai@^4.52.5` in node_modules. `DENO_NO_PACKAGE_JSON=1 deno check --node-modules-dir=none --no-lock ...` passed using existing cached dependencies; nothing was installed. |
| Executor disconnect during merch SQL proof | Completion was initially uncertain. After actual executor restoration, the original session reported exit 0 and its complete passing log was read. No competing retry was launched. Environmental delay does not justify changing a product authorization deadline. |
| Stripe CLI diagnostic in `START.md` | `stripe version` was denied attempting `chmod /Users/loverslane/.config/stripe/config.toml: operation not permitted`. No config change, escalation or retry occurred. This local CLI denial is not evidence that all provider connectivity is unavailable. |

## Provider evidence and production limits

The parent reports successful read-only provider connectivity and sandbox-configuration verification, Supabase **ACTIVE_HEALTHY**, and live/payout switches **off**. The earlier blanket statement that provider access was unavailable is stale and must not be repeated. No new provider calls were made for this ledger.

The parent also verified a discrepancy between stored Express configuration and the provider's observed dashboard/requirement-collection configuration. Local tests model that discrepancy with synthetic fixtures; they do not synchronize or modify a real account. New code must retain expected onboarding policy separately from observed state and preserve unknown values when fields are missing.

Real end-to-end payments, live catalog, deployed-source parity and device qualification remain **unverified**. Sandbox-source tests and a healthy provider connection do not establish dormant production readiness. Existing test-only adapters and live/payout restrictions remain; no live switch or guard removal is authorized by this review.

Public references reviewed for the implementation include Stripe [Checkout Session payment status](https://docs.stripe.com/api/checkout/sessions/object), [fulfillment and delayed payments](https://docs.stripe.com/checkout/fulfillment), [PaymentIntent status verification](https://docs.stripe.com/payments/payment-intents/verifying-status), [refunds](https://docs.stripe.com/refunds), [Account controller fields](https://docs.stripe.com/api/accounts/object), and [controller-property migration guidance](https://docs.stripe.com/connect/migrate-to-controller-properties). These do not replace the repository's stored-payment authority or negative tests.

## Qualification boundary

- Tip missing-PI/receipt retry and partial-refund-before-success ordering are reviewed and pass focused real-path regression tests; native final-schema qualification remains below.
- Atomic Connect account/eligibility projection, stale account/observation changes, preserved holds and transaction failure/rollback pass focused SQL/Edge proof. The observation is bound to its exact account ID; inherited match on raw replacement is rejected, and a cleared replacement remains unknown.
- The real purchase-refund RPC→parser→mounted UI round trip passes, preserving outer event-remedy wrapper behavior and account/session denial.
- Final isolated native migration hashes and simultaneous event, refund/success/dispute, duplicate and rollback/retry cases pass as recorded above, without relaxed guards or deadlines.
- Record exact aggregate commands and outcomes, follow-up commit, published draft PR head, CI run and Required Validation result. Preserve every failed/pending result above as historical evidence.

The scheduled-show product decisions still awaiting owner direction are material-reschedule and no-show thresholds, replay inclusion/expiry defaults, and creator self-start after platform qualification versus manual approval for every show. No default is inferred here. Approved late-payment recovery remains limited to available capacity and valid original terms, otherwise visible resolution without a second charge or oversell; refund eligibility follows actual store processes without instant/guaranteed-refund promises. Auctions and physical assigned seats remain outside the approved implementation.
