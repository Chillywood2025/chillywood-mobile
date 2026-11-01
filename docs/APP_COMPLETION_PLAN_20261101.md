# App completion plan: remaining items 1–9

Requested 2026-11-01. Baseline: `632d9cdb5b14c841aecfb5469c3cbf9ce03af77e`.
The preceding backend rollout and Android 112 / iOS 43 internal OTA are complete.
This plan does not reopen those completed repairs or claim installed-device proof.

## Scope and completion rules

Complete the nine remaining areas below, including implementation, integration,
failure-path tests, exact-head review/Required Validation, authorized deployment,
and independent readback. Work proceeds in parallel with isolated worktrees.
Physical-phone qualification (item 10) and unused credential cleanup (item 11)
are explicitly excluded. Public release is not requested.

Record implementation, deployed configuration, and provider qualification
separately. A dormant implementation is not an operationally complete feature.
No unknown provider result becomes success, no missing cost becomes zero, and no
manual checkbox substitutes for provider evidence. Do not remove safeguards to
make readiness green. Required legal/financial handoffs, credential authorization
and irreversible-deletion approvals remain separate from source/deployment approval.

## 1. Creator cashout

- Trace earnings, reserves, accepted fee terms, funding transfers, payout requests,
  signed events, provider reconciliation and creator-facing status as one flow.
- Bind each operation to creator, connected account, currency, destination,
  accepted gross amount, app fee, provider cost and net bank amount.
- Preserve standard cashout's zero app fee and instant cashout's accepted 2% of
  gross basis; do not substitute 2% of the net payout or collect twice.
- Persist dispatch intent before external calls; replay uses the same immutable
  operation. Unknown outcomes stay reserved pending provider reconciliation.
- Distinguish platform-to-connected funding from an actual bank payout.
  Handle pending, paid, failed, canceled and a bank return after an apparent paid
  result. Restore availability only after all required return evidence exists.
- Test duplicate requests, concurrency, expired sessions, account/destination
  changes, unavailable balances, dispatch crashes, replay, provider disagreement,
  webhook order and irreversible external-success/local-failure boundaries.
- Operational proof requires actual capability, schedule, fee and destination
  configuration. No real transfer or payout is part of source tests.

## 2. Actual fee accounting

- Bind report observations to both merchandise and auction transaction chains.
- Deduplicate component identities across overlapping reports; reject changed
  evidence under an existing identity and avoid counting balance fees twice.
- Preserve amount/tax components until exact provider/account semantics are known.
- Account for attributed processing, tax-service and payout costs and adjustments;
  support authoritative zero evidence without treating absence as zero.
- Integrate ledger and creator gross/deductions/net views under immutable terms.
- Define an evidence-qualified settlement policy including late adjustments.
  Report coverage or elapsed time alone does not prove all future costs final.
- Test overlapping imports, refunds, disputes, negative adjustments, currency and
  account mismatches, multi-party allocation, rounding, concurrency and retries.
- Do not unblock settlement without qualified coverage and any required owner
  business-policy decision. Report-source access is separate from parser tests.

## 3. Partial-refund tax evidence

- Obtain authoritative original-tax/reversal links for each exact payment/refund.
  Qualify the actual Checkout path rather than assuming PaymentIntent Tax
  Association support applies to every historical charge.
- Normalize supported authenticated tax exports without treating customer CSV
  assertions as provider authority.
- Feed merchandise, auction and applicable Google reporting obligations from the
  same immutable account/mode/currency-bound evidence.
- Test multiple partials, full-after-partial refunds, out-of-order events,
  duplicates, mismatched origins, invalid amounts, jurisdiction totals and
  concurrent consumption. Do not infer a proportional tax refund.
- Missing provider evidence remains a visible pending obligation.

## 4. Clip Studio rendering

- Add real bounded server-side trim/crop/export using the existing media
  architecture; preserve original bytes and immutable source generations.
- Bind jobs to owner, source version and edit snapshot; stale, canceled or
  superseded jobs cannot publish outputs into a newer edit or different account.
- Integrate queue/progress/failure/retry/review UI with the shared app background.
- Require valid output identity, scan/publication authorization and storage
  reference registration before an export can become available for publication.
- Test real FFmpeg files for duration, dimensions, audio and malformed inputs,
  plus worker death, repeated requests, authorization and output upload failure.
- A functioning deployed render worker is required. A local render library or
  canary-only worker is not completion of the service.

## 5. Brand Studio media

- Implement approved Hero Reel selection and actual playback with valid current
  access, loading/error states and source removal/replacement handling.
- Render selected watermarks into exported public video where intended, with
  deterministic placement, scale, transparency and output verification.
- Keep preview and published output consistent, preserve ownership and safety
  checks, and reject unavailable/private assets outside authorized access.
- Test repeated selection, cancellation, navigation/account changes, failed
  playback/rendering and withdrawal of previously selected assets.

## 6. Retention/storage coverage

- Persist exact immutable original/secondary object identities and all source
  references, including HLS manifests/segments and newly rendered exports.
- Coordinate every producer with admission/drain/version protocols so late or
  replaced objects cannot escape capture or be deleted under stale evidence.
- Respect 30-day retention, owner exceptions, holds, shared references,
  restoration and the distinction between unpublishing and deletion.
- Preserve existing Brand and Supabase-to-R2 adapters; close concrete missing
  coverage rather than duplicating these integrations.
- Test real database producer/consumer races, immutable generation conflicts,
  retries, restore races, reference removal and provider transport negatives.
- Commission with non-destructive live readbacks. Automatic irreversible deletion
  is not enabled without its own required authorization and object qualification.

## 7. Stripe/tax readiness

- Map physical goods, digital content, events, subscriptions, VIP and tips to
  responsible parties and applicable location rules using current primary sources.
- Preserve the low-cost objective: sellers retain lawful seller duties, while the
  platform handles obligations law actually assigns to it.
- Verify live account capabilities, marketplace configuration, pay-as-you-go Tax
  availability, registrations, product classifications and account-specific fees.
- Keep test/live identities separate. An accessible test account does not prove
  live configuration, registration or enrollment.
- Identify exact required user legal/identity actions; do not perform government
  or financial agreement acceptance or transmit national identifiers.

## 8. Google-to-RevenueCat notifications

- Verify the intended Pub/Sub topic, Google Play configuration, RevenueCat
  integration and receipt of a supported test event.
- Trace purchase, renewal, cancellation, refund and revocation through the actual
  authoritative entitlement path, not the standalone readiness-only webhook.
- Test duplicates, stale/delayed events, transfer/account switching, provider
  outages and later reconciliation without granting access from unknown state.
- Treat IAM or new persistent credentials as separately authorized actions.

## 9. Tracking, financial feeds and operations

- Finish tracking-only integration; no shipping-label purchasing feature.
  Prior conversation selected Shippo's tracking service, not a second shipping
  provider. Current source transport is test-only and is not live-feed proof.
- Authenticate incoming updates, resolve the exact carrier/order/shipment, and
  use corroborated delivery for the tracked 30-day return window. Untracked orders
  use verified purchase time; preserve immutable order terms and corrections.
- Reconcile refunds/disputes using authoritative snapshots, bounded retries,
  leases, fairness and resumable large histories with snapshot consistency.
- Persist operational health beyond transient responses. Test alert deduplication,
  recovery, severity and the actual approved destination rather than log-only alerts.
- Measure sustainable capacity and backlog/freshness under provider limits;
  mathematical maximum throughput is not a capacity guarantee.

## Integration and deployment sequence

1. Establish baseline migrations, source, provider controls and current deployment.
2. Agree shared tax/cost interfaces and producer/render object contracts before
   merging independently authored changes.
3. Run focused production-path and negative tests in each worktree, then combine
   changes and rerun all selected checks on the final integrated source.
4. Review the exact diff and obtain successful protected Required Validation for
   the exact remote head. Merge only through the repository's live rules.
5. Prepare ordered forward-only migrations, function/service closures, compatibility
   and safe failure/rollback steps. Never rewrite deployed migration history.
6. Deploy the authorized implementation and verify database definitions, grants,
   function/source identity and service state independently.
7. Publish only compatible internal OTAs using canonical runtime/channel/native
   artifact gates. A native change requires the appropriate native build instead.
8. Record source completion, deployment and operational qualification separately
   for each item, with precise unresolved blockers and no physical-proof claims.

## Initial verified blockers, 2026-11-01

- Connected Stripe tools expose test accounts, not verified live configuration.
- The read-only Mac provider audit failed before execution due the existing Codex
  usage limit. Independent cloud source work continues.
- The existing media CLI is canary-specific; general rendering host capability and
  scoped credentials require actual verification before service activation.
- Exact fee finality and refund-tax availability require account-specific evidence;
  no documented generic flag proves every future fee is final.
- Any remaining government registration, new persistent access or irreversible
  production deletion needs the specifically required user involvement.

These are blockers to operational claims, not permission to omit implementation,
tests, deployment preparation or other work that can proceed independently.
