# Items 1–9: operational checkpoint

As of November 1, 2026, 22:54 UTC. This is a dated checkpoint, not an activation
approval or a claim that all features are operational. New builds and OTA remain
held under the owner's instruction. Physical-phone qualification (10) and unused
credential cleanup (11) remain outside this completion batch.

## What is deployed

- Original PR647 merged as `748b0fec`; all 48 new migrations are applied with
  independent source/history/catalog checks. Fresh read-only history remains
  **573 rows through 20261101180001**. Earlier 525-row counts are pre-rollout.
- Deployment receipts record **36 of the original 37 Edge closures verified**.
  The held tracking worker is superseded by the GET-only repair in PR648, whose
  owner-authored tree matches `da30fa58`. That repair and its additional migration
  are not counted as deployed here. The tracking webhook's shared closure also
  needs the matching GET-only source readback.
- Live money, payouts and cashout remain **OFF**. No provider qualification,
  registration, creator acceptance, real transaction or paid service was
  fabricated to make a readiness check pass.
- Client code in the merged source is not proof that installed phones have it.
  No new OTA/build should be published merely because backend checks pass.

## Completion matrix

| Item | Source/backend work completed | Operational evidence still required | Safe next action while money/builds stay OFF |
| --- | --- | --- | --- |
| 1. Bank/debit cashout | Durable reservation, exact gross-fee/net calculation, funding then separate bank payout, unknown-outcome GET recovery, failed/returned payout handling and late fee adjustments are implemented; corresponding backend batch deployed. | Real creator account/controller, payer and manual/exclusive payout configuration, eligible destination, provider pricing and actual fee evidence. Live creator-account list is empty and cashout qualification count is zero. | Review real account/configuration read-only when a creator completes hosted onboarding. Keep preview separate from execution; no real payout is needed to review source. |
| 2. Actual fees/settlement | Authenticated itemized imports, component deduplication, accepted known-cost policy, future adjustments, exact source allocation and owner health are implemented/deployed. | Account-specific fee semantics, available actual reports, auction/store costs, platform-held funding and creator policy acceptance. Fee-semantic and earnings qualification counts are zero. | Inspect existing report catalog/exports without purchasing Sigma or treating missing costs as zero. Validate exact report/account/currency attribution before qualification. |
| 3. Partial-refund tax | Exact original-tax/reversal evidence, multi-partial accounting, Checkout association reads and Google reconciliation support are implemented/deployed. | A real eligible existing payment/refund path with authoritative tax association or supported authenticated export; actual Checkout interoperability is not established by synthetic fixtures. | Read existing eligible records only; keep unavailable tax evidence pending. Do not create a real refund merely to obtain a sample or use proportional guesses. |
| 4. Clip trim/crop/export | Bounded real FFmpeg worker, immutable source/edit binding, private upload/readback, scan and publication gates, retry/cancellation and UI are implemented. Database jobs/gates deployed. | Actual authorized compute host installation, existing credential scope, disk/CPU bounds, renderer heartbeat, private output/scanner proof and measured queue behavior. Fresh DB shows worker disabled with no version or heartbeat. | Locate the existing authorized host access; prepare reviewed deployment and run bounded synthetic private render qualification once access is available. A deployed database queue is not a running renderer. |
| 5. Hero Reel/watermarks | Selection/playback and watermark export rendering, access checks and stale-owner/media handling are implemented/tested in source. | Item 4's deployed renderer for burned-in exports, provider playback availability and installed-client/device proof. | Review exact media/private-access paths and renderer artifacts; do not make private assets public or promise current phones have unpublished UI. |
| 6. Retention/storage | Reference registry, owner/publication/legal-hold fencing, retired-object guards, private expiry claims/receipts and safe transport are implemented/deployed; original retention settings and cron preserved. | Actual storage transport qualification and explicitly authorized deletion commissioning. Fresh transport qualification count is zero and secondary expiry is disabled. | Audit storage references, coverage, ACLs and preserved settings read-only. Do not run destructive expiry to demonstrate readiness. |
| 7. Stripe/tax | Mode-separated creator onboarding/observation, explicit live setup consent, safe legacy callbacks, physical-merch tax-category review and evidence-bound runtime gates are implemented/deployed. | Exact sales-type/location responsibility, any legally required registrations, intended Tax Basic billing terms, physical-merch classification, creator onboarding and provider configuration. Live tax/onboarding policy qualification counts are zero. | Continue account/provider reads and targeted tax classification; leave seller duties with sellers only where law permits. Government/legal acceptance, paid enrollment and creator identity/terms remain user/provider handoffs. |
| 8. Google → RevenueCat | Scheduled pause/product-change no-op semantics, effective renewal, terminal protections and exact-bound extension/refund-reversal snapshots are implemented/deployed. | Actual Play topic/RevenueCat project wiring, provider delivery test, credentials' existing scope and lifecycle evidence. Both snapshot worker modes are disabled. No fresh console proof is available. | Use the existing authorized console route when available; verify RevenueCat's intended RTDN route, not the standalone scaffold. Do not bypass the unavailable local execution route or claim source tests prove notification delivery. |
| 9. Tracking/outcomes/queues/alerts | Refund/dispute observations, bounded resumable Stripe histories, snapshot revalidation, measured queue health and owner incident/recovery notifications are implemented/deployed. GET-only tracking repair removes registration capability in pending PR648. | Shippo account-scoped existing feed/signing/cost/carrier evidence, real provider samples and schedule/alert receipt/capacity qualification. Tracking qualification/account/assignment counts are zero; financial reconciliation driver remains disabled. | Finish PR648 validation/merge and authorized dormant rollout, verify exact closures and migration, then pursue existing-feed access/terms read-only. Test provider and alert paths without enabling financial automation or claiming theoretical throughput. |

## Fresh provider facts

At 22:50 UTC, authenticated live Stripe reads show platform charges/payouts
enabled and no currently-due, past-due, pending verification or errors. The
earlier identity-verification blocker is resolved; do not request it again.
This does not turn on Chi'llywood's money switches.

Complete live lists contain **zero connected creator accounts** and **zero tax
registrations**. Tax Settings are active with the digital-services default tax
code and inferred-by-currency behavior. This is neither a physical-merch tax
classification nor proof of the Tax Basic billing plan, tax registration,
lawful no-collection, fee coverage or filing readiness. Fresh 22:54 UTC reads
also show zero live webhook endpoints and zero event destinations, with no next
page. Deploying receivers alone therefore does not connect Stripe event delivery.
The connector's current API search still exposes no reporting-report-runs
operation; this is a connector access limitation, not proof that no reports exist
or authority to buy a reporting subscription.

Shippo consumption is not a label-purchasing integration. Creators may use their
own shipping/eligible return-label workflow; the app does not currently transfer
orders into that workflow, deliver return-label attachments or bind a distinct
return parcel's tracking. Buyers are not promised a Shippo account/free labels.
GET-only API calls are not proven free: existing account scope, exact billing
and marketplace terms still need confirmation. See [tracking details](MERCH_AUTOMATIC_TRACKING.md).

## Next execution order

1. Finish exact-head Required Validation for PR648; only then merge and execute
   its reviewed dormant backend rollout. Verify both tracking closures, the new
   migration and unchanged money/live/retention controls. Keep no-POST source
   separate from the previously held registration-capable payload.
2. Preserve current client/build hold. Consolidate further source repairs before
   the eventual single delivery; don't count a prepared artifact as installed.
3. Close provider facts through existing read-only access: reports/tax evidence,
   account configuration, existing shipping feed, renderer host access and Play/
   RevenueCat routing. Missing evidence is a specific commissioning gate, not
   permission to weaken code or fabricate approvals.
4. For any remaining action requiring new credentials, legal acceptance, paid
   enrollment, real money, provider activation or deletion, identify the exact
   action and obtain its required handoff/authority before execution.

## Evidence and verification limits

Protected merge and deployment receipts, exact Git source/closure hashes and
read-only database/provider observations support this checkpoint. Consume-only
repair tests cover 8 Edge cases, 2 full-schema tracking/correction cases and 25
related mode/return/health cases; TypeScript, focused lint and diff checks pass.
Its guarded migration packet independently matches the source and preserves
function owner/ACL, original history body and rollback semantics. PGlite tests
are not native multi-session contention or real provider commissioning proof.
No sensitive identifiers, provider payloads or credentials belong in this file.
