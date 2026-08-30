# Seven-Money-Flow Recursive Full-Graph Closure Ledger

This ledger is cumulative. A merge alone does not close a defect. Production money, provider product activation, and creator payouts remain fail-closed.

## RFGC-001 — Caller-asserted settlement and payout provider results

- Defect ID: `RFGC-001`
- Flow(s): Tips, Paid Video, Watch-Party Seat Pass, Channel Subscription, VIP, Event Pass; payout downstream. Premium inspected and excluded from creator earnings.
- User role: authenticated buyer is the upstream purchase subject; no client role may advance settlement or payout state.
- Creator role: exact credited creator and exact Stripe Connect destination owner.
- Platform: Android and iOS provider events converge on the affected accounting boundary.
- Provider: App Store, Google Play, RevenueCat settlement evidence; Stripe Connect payout result.
- Discovery evidence: protected-main `finalize_creator_money_settlement` accepted caller-supplied net, fee, and evidence hash; `mark_creator_payout_provider_result` accepted caller-supplied provider object ID and terminal status. Both were service-role-only and production switches were off, but neither required immutable provider-verifier evidence.
- First failed boundary: provider reconciliation -> durable settlement/payout authority.
- Visible symptom: no current user-visible symptom because live money and payouts are off; activating the dormant boundary could create unsupported earnings availability or payout completion.
- Upstream producer: provider report/webhook verifier is the only valid producer of financial result evidence.
- Downstream consequence: creator earnings lifecycle, available balance, payout request state, and Money Center readback could trust an unverified assertion.
- Root cause: authorization was role-scoped but financial facts were not bound to immutable provider receipts.
- Root-cause group: missing provider-evidence authority at financial state transitions.
- Same-class siblings: settlement finalization and payout-result projection. All other service-role financial transitions were searched; no sibling with the same caller-asserted terminal provider fact was validated.
- Adjacent different-class risks: replay, conflicting provider object reuse, creator mismatch, amount/currency mismatch, environment mismatch, wrong Connect destination, caller-selected settlement hold, forged status, refunded/revoked earnings becoming payable.
- Shared integration seams: provider events, money access ledger, creator earnings lifecycle, payout requests, payout accounts, Money Center.
- Security impact: a compromised or buggy ordinary service integration could forge provider-confirmed financial state.
- Financial impact: potential unsupported creator balance or incorrect payout state after future activation.
- Changed files: `supabase/migrations/20260830203952_lock_unverified_settlement_and_payout_authority.sql`, `supabase/tests/provider_financial_receipt_authority_closure_test.sql`, `supabase/tests/creator_money_authority_integrity_closeout_test.sql`.
- Migration requirement: exact migration `20260830203952` only, after protected-main merge.
- Provider mutation requirement: none. A future database-owned verifier may insert receipts only after independently verifying provider evidence.
- OTA requirement: none; database authority and tests only.
- Physical/provider proof requirement: executable local pgTAP, full money/provider policy matrix, and fail-closed live-state readback. No real charge or payout.
- Test blind spot: prior tests proved service-role ACLs and serialized lifecycle transitions but did not require provider-origin evidence at the seam. New pgTAP proves immutable receipt ACLs, absent-receipt rejection, exact provider/user/creator/economics/environment/destination bindings, server-owned settlement holds, and non-executable predecessor functions.
- Disposition: `REPAIRED_UNPROVEN` until exact merge, migration readback, and final matrix rerun.

## RFGC-002 — Premium proof script stale source-string assertion

- Defect ID: `RFGC-002`
- Flow(s): Premium.
- User role: Premium subscriber.
- Creator role: none; Premium remains separate from creator earnings.
- Platform: Android and iOS.
- Provider: RevenueCat, Google Play, App Store.
- Discovery evidence: `proof:premium-first-activation` expects a historical source string for the manage-subscription analytics event, while the implemented restore/manage paths exist in `_lib/revenuecat.ts`, `_lib/monetization.ts`, and `app/subscribe.tsx` and the executable Premium readiness and iOS commerce proofs pass.
- First failed boundary: assurance source-string projection, after substantive implementation.
- Visible symptom: proof-script false negative; no application failure established.
- Upstream producer: stale proof assertion.
- Downstream consequence: assurance noise only.
- Root cause: the proof couples to historical source text instead of behavior.
- Root-cause group: assurance-only drift.
- Same-class siblings: searched applicable money guards; none failed substantively.
- Adjacent different-class risks: restore, refresh, cancel, failure, entitlement identity, and Premium/creator separation were separately inspected.
- Shared integration seams: RevenueCat restore/manage subscription UI.
- Security impact: none established.
- Financial impact: none established.
- Changed files: none.
- Migration requirement: none.
- Provider mutation requirement: none.
- OTA requirement: none.
- Physical/provider proof requirement: provider sandbox/StoreKit proof when an authenticated provider test surface is available.
- Test blind spot: source-string assertions can drift independently from executable behavior.
- Disposition: `NONBLOCKING_DEBT`.

## RFGC-EXT-001 — Production provider activation/readback unavailable

- Defect ID: `RFGC-EXT-001`
- Flow(s): all seven.
- User role: buyer/subscriber.
- Creator role: target creator for six creator-money flows.
- Platform: Android and iOS.
- Provider: Google Play, App Store, RevenueCat, Stripe Connect.
- Discovery evidence: RevenueCat readback exposes current project products and entitlements; direct Google Play and App Store authenticated dashboard readback is unavailable in the current session; Stripe connection requires reauthentication. RevenueCat has Android sandbox products for all seven flows, but its iOS project currently exposes Premium, Tips, and Seat Pass products only. Repository/provider proof records the Google Play Channel Subscription base-plan blocker.
- First failed boundary: external provider configuration/readback.
- Visible symptom: production activation cannot be asserted green and remains fail-closed.
- Upstream producer: provider consoles/accounts.
- Downstream consequence: no public production-money activation; unsupported product paths remain unavailable.
- Root cause: missing/unverified external provider state, not an application authority defect.
- Root-cause group: external activation prerequisites.
- Same-class siblings: per-platform product availability, App Store transaction configuration, Google Play base plan, Stripe account/KYC readiness.
- Adjacent different-class risks: unknown provider state, stale catalog, environment mismatch, and false readiness UI; all must fail closed.
- Shared integration seams: switchboard, provider readiness, RevenueCat offerings, StoreKit/Play products, Stripe Connect.
- Security impact: none while fail-closed; bypassing the state would be unsafe and is prohibited.
- Financial impact: production sales/payouts remain unavailable rather than unverified.
- Changed files: none.
- Migration requirement: none.
- Provider mutation requirement: required only in a separately authorized activation task.
- OTA requirement: none for this external state.
- Physical/provider proof requirement: authenticated provider dashboards and provider sandbox devices.
- Test blind spot: repository assertions cannot substitute for provider-console authority.
- Disposition: `EXTERNAL_BLOCKED` / `OWNER_ACTIVATION_PENDING`.

## RFGC-EXT-002 — Current Android tester artifact and provider-sandbox physical limits

- Defect ID: `RFGC-EXT-002`
- Flow(s): all seven physical Android paths.
- User role: authenticated sandbox buyer/subscriber.
- Creator role: exact proof creator targeted by sandbox offers.
- Platform: Android internal-v2.
- Provider: EAS Update, Supabase Auth, RevenueCat, Google Play.
- Discovery evidence: the installed version-91 tester artifact embeds a retired Supabase public key and declares update-check-on-launch `NEVER`; its source runtime gate subsequently fetches the current internal-v2 OTA, after which authenticated login succeeds. Clearing app state causes pre-update login to fail. The repository's monetization Maestro flows clear state, use a stale creator fixture ID, omit per-session legal acceptance, and use a custom-scheme channel link that did not route on the attached device. The canonical proof owner has sandbox offers for all six creator flows, and an authenticated HTTPS app link reaches that exact creator. Android physical proof reached the Premium surface and the exact sandbox creator-support surface; the Tip flow remained fail-closed before a Google Play sheet because current provider readiness did not authorize checkout.
- First failed boundary: stale native/test artifact and external sandbox checkout availability, after current OTA source and database fixture readback.
- Visible symptom: cold-state automation cannot complete login; creator-flow provider sheets cannot be claimed physically proven from this artifact/session.
- Upstream producer: EAS native build environment, test fixture configuration, Google Play licensed-test state, and current provider catalog/readiness.
- Downstream consequence: physical provider proof is partial; no entitlement, ledger, or payout authority was granted.
- Root cause: stale external/native proof artifacts and unavailable provider-test checkout, not a validated current-source authority defect.
- Root-cause group: physical/provider proof prerequisites.
- Same-class siblings: all six creator-flow Maestro fixtures share the cold-state login and stale creator/link assumptions.
- Adjacent different-class risks: false provider-ready UI, wrong creator target, legal-version drift, accidental real purchase, stale entitlement, and mistaken physical-green reporting.
- Shared integration seams: EAS Update, Auth, legal acceptance, app links, sandbox tester resolver, RevenueCat/Play purchase surface.
- Security impact: fail-closed behavior preserved; no cross-user or cross-creator access observed.
- Financial impact: no charge, creator credit, payable balance, or payout occurred.
- Changed files: none; these are external/native/test-fixture prerequisites and assurance plumbing.
- Migration requirement: none.
- Provider mutation requirement: separately authorize/complete provider sandbox and, if desired, issue a new internal native tester build with the current public key. No store submission is required for engineering source closure.
- OTA requirement: none; the current internal-v2 OTA already contains the valid public client configuration.
- Physical/provider proof requirement: new current-key native tester artifact or a warmed OTA session plus authenticated Google Play sandbox checkout availability.
- Test blind spot: clear-state flows validated neither embedded-runtime credential currency nor the mandatory legal/app-link path before attempting purchase UI.
- Disposition: `EXTERNAL_BLOCKED`; substantive current source remains fail-closed.

## Closure counts

- `BLOCKING_OPEN`: 0
- `REPAIRED_UNPROVEN`: 1
- `PHYSICALLY_PROVEN`: 0
- `PROVIDER_PROVEN`: 0
- `NONBLOCKING_DEBT`: 1
- `EXTERNAL_BLOCKED`: 2
- `NOT_A_DEFECT`: 0

Counts are updated after merge, exact migration deployment/readback, and the final full-matrix restart.
