# Money Center Product Policy

Last updated: June 11, 2026

Canonical final money truth: `docs/MONETIZATION_STACK_FINAL_TRUTH.md`.

June 12, 2026 Paid Events V1 status: repo-side implemented, Supabase-applied, and Play/internal sandbox-proven end to end. Migrations `20260612201011_paid_events_v1_sandbox.sql`, `20260612213500_paid_events_metadata_safe_keys.sql`, and `20260612215000_paid_events_access_grant_trigger_schema_fix.sql` add sandbox-only paid event offers, event passes, event transactions, event audit rows, capacity oversell protection, creator-safe offer and readback RPCs, and grant-to-pass/transaction sync from verified `event_pass` access grants. Paid Events use the existing RevenueCat / Google Play dynamic sandbox product `event_pass_sandbox_099` / `cw_event_pass_sandbox_099`, not Stripe Tips. Existing `creator_events` remains the event source of truth; `/event/[eventId]` is the paid-event gate and `Buy Event Pass` surface. Play/internal v46 on `R5CR120QCBF` proved unpaid/direct-link gate, Google Play sandbox purchase, provider event `95c22a83-85a1-4f5a-b6e4-e6f2cb72ad10`, consumed purchase intent `d9076cf4-cd98-4480-af0a-690f5bcc06df`, access grant `bce269bc-7469-484f-b82f-992437a7c7f6`, active pass `3a9b2d07-d04b-45ad-b7cd-9766566e9a04`, paid/not-payable transaction `0dc99303-baeb-489c-b5a5-8e608b63f583`, paid-fan access, authenticated second-unpaid denial, Money Center visual readback, and RLS denial for direct client writes. Event passes unlock only the linked creator event and do not grant Premium, Tips, Paid Videos, Paid Watch-Party rooms, VIP, subscriptions, LiveKit publish authority, host authority, payouts, cash-out, withdrawal, transfer, or live money. Live money remains off and sandbox rows are not payable. Capacity proof is deferred because the current creator UI does not expose `capacity_limit`; refund/revoke remains deferred until safe RevenueCat / Google Play tooling or order identifiers are available. Dedicated proof doc: `docs/PAID_EVENTS_V1_END_TO_END_PROOF.md`.

June 12, 2026 Paid Watch-Party Seats / Room Tickets V1 status: repo-side implemented, Supabase-applied, and Play/internal sandbox-proven for purchase, active ticket creation, paid fan entry, unpaid direct-link gate, normal sold-out denial, seat-limit, and Money Center RPC readback. It uses RevenueCat / Google Play dynamic sandbox product `watch_party_live_ticket_sandbox_099` / `cw_watch_party_live_ticket_sandbox_099`, not Stripe Tips. Room tickets are digital room access and must stay separate from Premium, Tips, Paid Videos, VIP, subscriptions, and Paid Events. Play/internal v44 proved sandbox purchase but exposed a direct-link camera-permission blocker; commit `541dafd` fixed local camera/mic permission startup to wait for confirmed room entry. Play/internal v45 proved fresh room `WNFUUF` / offer `ba02fbe7-97a7-4871-86f3-9ca62a141d76`: unpaid direct link showed the room-ticket gate, sandbox purchase created provider event `f768e840-3208-4251-ac84-95358987eb8b`, transaction `912a9d0a-3621-4070-826d-be2035856e47`, active ticket `8c2906da-8d02-43b2-afb9-9a7ba514fba2`, active viewer membership, sold-out seat-limit state, and paid fan Party Room entry. Paid Watch-Party tickets must route to Party Waiting Room -> Party Room, never Live Stage. Sandbox rows are not payable, live money remains off, and tickets do not grant LiveKit publish authority, host authority, payout, cash-out, withdrawal, transfer, Premium, paid video access, VIP, subscription, or event access. Visual Money Center screenshot and provider refund/revoke remain deferred. Dedicated proof doc: `docs/PAID_WATCH_PARTY_SEATS_V1_END_TO_END_PROOF.md`.

June 11, 2026 Paid Videos V1 implementation/proof status: Paid Videos are repo-side implemented, migration-applied, and happy-path sandbox-proven through RevenueCat / Google Play on a Play-installed internal tester runtime. They are not live money. Migration `20260611182509_paid_videos_v1_sandbox_bridge.sql` extends existing `creator_content_prices` for sandbox provider metadata, updates the creator content access resolver to accept verified sandbox paid-content grants, mirrors verified shared `access_grants` into `content_access_grants`, and adds creator-safe Paid Video offer/transaction read RPCs. Creator setup lives in existing creator video upload/edit UI, not a new dashboard: creators choose Free or Paid Unlock and set a price. Fan purchase lives in the creator-video Player locked state with `Unlock Video`; copy must say the purchase unlocks only that creator video and does not include Premium, subscriptions, VIP, live rooms, Watch-Party seats, or other creator content. Paid Videos use RevenueCat / Google Play sandbox product `cw_paid_content_access_sandbox_099`, source-bound `money_purchase_intents`, and verified `revenuecat-webhook` events. Paid Videos must not use Stripe Tips. Play/internal proof used device `R5CR120QCBF`, package `com.chillywood.mobile`, versionCode `37`, installer `com.android.vending`. Manual Google Play sandbox purchase for video `6e1c3405-7db8-4cb2-98f3-5a7642e82126` consumed purchase intent `949b076d-81dd-44f0-b2d8-ce514ebb7348`, processed provider event `f0006ba1-495f-4353-875e-40db2c9e7a5f` / RevenueCat event `E86C4FA9-2B73-4D8F-9D6C-2C5A19BFA283`, created access grant `71967fff-b913-4390-8b3d-aef4f4e77726`, mirrored content grant `1b6cf126-bb80-4dd6-b724-7b804765c3f9`, and wrote ledger event `7f237e32-bdfc-4394-9bb3-f8537cae8e38` as `sandbox_only` / `not_payable`. Follow-up proof passed paid-fan cold-start direct-link access, logged-out direct-link denial, exact grant scoping to the paid fan, direct anon client write denial, creator fixture login repair, Money Center visual transaction readback, and authenticated second-unpaid-fan direct-link denial. Money Center Transactions visually showed the exact Paid Video row as sandbox/not-payable and separate from Tips. Sandbox rows remain not payable, `live_money_enabled` remains off, and live Paid Videos require later Play/RevenueCat live product approval, refund/revoke proof, payout/legal/fraud/support review, and owner approval. Remaining provider proof gap is refund/revoke status because provider tooling and safe order identifiers are unavailable here. Dedicated proof doc: `docs/PAID_VIDEOS_V1_END_TO_END_PROOF.md`.

June 11, 2026 Tips V1 deployment proof: Tips is the first repo-side end-to-end creator monetization flow and now has deployed, sandbox-proven Stripe test-mode infrastructure. It is not a live-money launch. Migration `20260611151221_tips_v1_stripe_checkout.sql` is remote-applied, `create-creator-tip-checkout` and `stripe-tip-webhook` are deployed, and the existing Stripe Connect setup/sync functions were redeployed with the shared helper update. A Stripe test webhook endpoint is configured to the deployed `stripe-tip-webhook` URL, and `STRIPE_TIP_WEBHOOK_SECRET` is configured in Supabase without printing or committing the value. The original hosted-onboarding account stayed blocked on `individual.verification.document` past due, so a fresh Stripe test connected account was created with Stripe test-only verification values and synced ready. Public tip status became `canTip=true` only after provider readiness passed. Successful proof: `tips_fan_test` completed a $1.00 Stripe test Checkout, signed webhook marked the tip paid, Money Center transaction readback showed the verified paid test tip with `payout_status=not_payable`, a $3.00 declined-card checkout was marked failed and did not credit creator earnings, and no access grant/content access grant/user entitlement was created. Safety proof passed for unauthenticated checkout rejection, unsigned webhook signature rejection, settings persistence through RPC, self-tip rejection, blocked-user rejection, prior unready creator rejection, rapid unready duplicate rejection, and direct client paid-row/provider-status write denial. Tips V1 uses server-side Stripe Connect Checkout and signed webhook verification with additive tables/RPCs. Creator setup lives in Money Center > Ways to Earn > Tips; the V1 fan CTA is limited to the creator channel header. Tips are pure contributions only: they must not unlock content, badges, VIP, room access, paid video access, channel subscription perks, event access, Watch-Party seats, public ranking rewards, Premium, LiveKit authority, or any other digital benefit. Mobile code must not contain Stripe secrets or mark payments paid; only the verified webhook can mark paid/refunded/failed/disputed. `tips_enabled` may be `sandbox_only`; `live_money_enabled` remains off and no payout/cash-out/withdrawal/transfer/payable-balance claim is allowed until a separate live-money approval lane passes provider/legal/tax/fraud/support/Data Safety/owner review. BrowserStack is deferred until final full regression after all creator monetization flows have cheap local/manual proof.

June 11, 2026 creator-money hub cleanup: Platform Studio Money Center is the single creator-facing money hub. It now has exactly seven creator sections: Overview, Ways to Earn, Offers, Transactions, Payouts, Tax & Legal, and Provider Status. The six creator monetization flows are cataloged in `_lib/creatorMonetizationFeatures.ts`: Tips, Paid Videos, Paid Watch-Parties, Channel Subscriptions, VIP Passes, and Paid Events. Money Center renders Ways to Earn from that shared catalog and must not hardcode a second label set elsewhere. Duplicate creator-facing sections for Digital Sales, Tips, Watch-Party Seats, Paid Content, Merch, Creator Balance, Future Tools, and Technical checks are removed or folded into the seven-section structure. `/creator-monetization-setup` is compatibility-only and redirects to Money Center Offers; old `/monetize`, `/revenue`, `/payouts`, and legacy focus params should continue mapping into the correct Money Center section instead of creating new dashboards. Premium remains separate from creator purchases. This cleanup does not activate production money, checkout, tips, paid videos, ticketed rooms, creator subscriptions, VIP, paid events, merch checkout, payable balances, payout execution, cash-out, withdrawal, transfer, LiveKit authority, room routing changes, or admin controls.

June 5, 2026 production policy operations readiness update: `docs/PRODUCTION_MONEY_POLICY_OPERATIONS_READINESS.md` and `docs/PRODUCTION_MONEY_READINESS_INDEX.md` add the future-production legal, tax, fraud/risk, support, refund/return, merch fulfillment, payout operations, and Owner/Admin approval-gate framework. Money Center/Admin copy may reference these documents as readiness/draft status only: legal review needed, tax review needed, fraud/support workflows prepared for review, refund/return drafts ready for review, merch fulfillment plan ready for review, payout terms draft ready for review, production activation locked, payouts not active, and no payable balance. Do not add or imply live activation buttons from this packet.

June 5, 2026 creator setup flow update: `docs/CREATOR_MONETIZATION_SETUP_COMPLETION_MATRIX.md` records the completed in-app setup matrix for approved creator/internal tester sandbox monetization. Platform Studio links to `/creator-monetization-setup`, where creators choose approved sandbox tiers only and bind a real source UUID. Migrations `20260605000610_creator_monetization_in_app_setup_flows.sql` and `20260605002000_bound_creator_monetization_setup_access.sql` add `creator_monetization_configs` plus safe creator/admin RPCs, then require owner/operator or active beta/internal tester access for saves. Config rows are sandbox-only/not-payable and remote readback proves one safe setup row for each product type, provider-event/intent/grant/ledger proof for Android digital products, merch readiness, payout readiness read-only, and no production money, payouts, payable balance, cash-out, withdrawal, transfer, Stripe Android digital checkout, fake sales, LiveKit publish, host/speaker/mod/admin authority, or safety bypass.

June 5, 2026 viewer/Admin QA update: `docs/CREATOR_MONETIZATION_VIEWER_GATE_ADMIN_QA.md` captures Android setup/tier/internal-sandbox/merch/payout-readiness screens and correct Admin denial from a non-admin tester session. Sanitized remote readback proves Owner/Admin inspection data exists, but fresh Owner/Admin UI drilldowns require an active Owner/Admin app session. Contextual viewer-gate screenshots require route-backed safe content/room/event fixtures.

June 4, 2026 internal tester sandbox mode update: `docs/INTERNAL_TESTER_SANDBOX_PURCHASE_MODE.md` documents the bounded tester-only purchase path and Owner/Admin controls. Public/default Premium purchasing remains closed (`PREMIUM_PURCHASE_SHELL_ON_HOLD = true`, `premiumPurchaseEnabled=false`), but approved Owner/Operator, runtime-allowlisted tester, or active internal tester accounts can see clearly labeled sandbox purchase surfaces. Google Play / RevenueCat remains the only Android digital-goods rail; Stripe remains physical merch and payout readiness only. Owner/Admin Money Center now shows `Internal Sandbox Testing` status and tester-tool routing. Stripe physical merch sandbox checkout is available to approved testers only. Stripe Connect payout readiness remains read-only: no payout request, simulation, cash-out, withdrawal, transfer, payable balance, or payout activation is available. Sandbox rows stay not payable, and live money, fake balances, fake sales, and Stripe Android digital checkout remain absent.

June 4, 2026 Stripe merch/payout readiness update: physical merch now has a sandbox-only Stripe readiness path and one real sandbox runtime checkout proof without changing Android digital-goods policy. Migration `20260604043000_stripe_merch_payout_sandbox_readiness.sql` adds physical-only merch checkout fields, `merch_order_items`, sanitized idempotent `stripe_merch_events`, and `cw_merch_test_tee_sandbox`; constraints keep `creates_digital_access=false`. `stripe-merch-checkout` ACTIVE version `4` and `stripe-merch-webhook` ACTIVE version `5` require server-side Stripe test configuration, verify webhook signatures, reject live-mode events, and update only merch order/payment/fulfillment readout. The upgraded proof account completed one real Stripe test-mode physical-merch Checkout payment and a signed `checkout.session.completed` webhook updated one sandbox merch order to `paid` / `processing`. Final readback kept merch access grants `0`, merch orders with digital access `0`, Stripe/merch entitlements `0`, Stripe/merch Premium entitlements `0`, payable/paid money-access rows `0`, provider payout-enabled accounts `0`, `live_money_enabled=off`, and `payouts_enabled=off`. Stripe merch does not create access grants, RevenueCat entitlements, Premium entitlements, money-access ledger rows, payable balances, payouts, cash-out, withdrawals, transfers, or LiveKit/room authority. Stripe Connect remains payout readiness only; production payouts remain off.

June 4, 2026 Stripe Connect payout readiness proof: existing sandbox Connect functions completed creator payout-readiness proof without payout activation. `stripe-connect-account`, `stripe-connect-onboarding-link`, and `stripe-connect-account-sync` are ACTIVE version `47`; `stripe-connect-webhook` is ACTIVE version `49`. The upgraded proof account reused a real Stripe test-mode Express connected account, created a sandbox onboarding link with the approved HTTPS Chi'llwood origin, and refreshed provider capability state. Safe readout showed provider environment `test`, status `pending_kyc`, onboarding `onboarding_in_progress`, KYC `pending`, tax `not_connected`, `charges_enabled=false`, `payouts_enabled=false`, details not submitted, and transfers capability inactive. Final readback kept app-level `payouts_enabled=off`, `live_money_enabled=off`, provider payout-enabled accounts `0`, payout requests `0`, payable/paid creator payout ledger rows `0`, payable/paid money-access rows `0`, payout-readiness access grants `0`, Stripe Connect entitlements `0`, Stripe Connect Premium entitlements `0`, and active proof roles `0`. No payout simulation was run because provider payouts are disabled; do not fake payout success.

June 4, 2026 Public V1 Money-Proof RC Sweep update: `docs/PUBLIC_V1_MONEY_PROOF_RC_SWEEP.md` records the release-candidate regression sweep after launch polish. Android proof path `/tmp/chillywood-public-v1-money-proof-rc-sweep-20260604/` captures Creator Money Center, Owner/Admin Money Center, non-Premium / non-role Platform Studio denial, and post-revoke Admin denial. Remote counts stayed provider_events `6`, purchase_intents `8`, access_grants `5`, ledger_events `7`, payable/paid rows `0`, active proof roles `0`. No production money, payout, cash-out, public buy button, fake balance, Stripe Android digital checkout, LiveKit authority, route ownership change, or safety bypass was introduced.

June 4, 2026 launch-polish update: Creator Money Center now foregrounds the completed sandbox digital-access proof, `Sandbox only` / `Not payable` copy, no verified payable earnings, payouts not active, product readiness, and provider-tooling gaps. Owner/Admin Money Center now foregrounds Product Catalog, Provider Events, Purchase Intents, Access Grants, Ledger Events, payable sandbox/setup rows, and failure-path status. Review packet: `docs/MONEY_CENTER_LAUNCH_REVIEW_PACKET.md`. UI proof doc: `docs/MONEY_CENTER_UI_POLISH_PROOF.md`. This polish does not activate production money, payouts, public buy buttons, fake balances, Stripe Android digital checkout, LiveKit publish, host/speaker/admin power, or safety bypass.

June 4, 2026 failure-path/event-pass addendum: sandbox failure-path proof and event-pass backing are now complete without production money. Remote migrations `20260604015548`, `20260604015818`, and `20260604015941` add duplicate provider/grant/ledger protections, admin revoke proof, and `has_event_pass_access` over `creator_events`. Event pass `cw_event_pass_sandbox_099` completed a real Google Play test-card / RevenueCat sandbox purchase and wrote one provider event, one consumed intent, one `event_pass` sandbox-only grant, and one sandbox/not-payable ledger row. One Watch-Party ticket grant was admin-revoked and now denies resolver access with a sandbox `reversed` ledger row; one expired purchase-intent fixture created no provider event, grant, ledger, or payable money. Final readback: payable/paid money-access rows `0`, active proof roles `0`. Proof path: `/tmp/chillywood-money-failure-and-event-pass-proof-20260604/`. Real provider refund/revoke and delayed-payment pending remain provider-tooling follow-ups only; do not fake them.

June 3, 2026 money-access catalog update: Chi'llwood now has an additive shared product catalog/access grant/readiness ledger architecture for future Premium-adjacent digital access, paid content, Watch-Party Live tickets, Live Watch-Party access/seat passes, tips, event passes, and merch separation. `monetization_products`, `provider_events`, shared `access_grants`, `money_access_ledger_events`, `merch_products`, and `merch_orders` are readiness/control-plane tables only. Setup and sandbox ledger rows are `Not payable`; merch cannot create digital access; Android digital products remain RevenueCat/Google Play; Stripe remains payout/physical-goods readiness only. Payment records never grant LiveKit publish, host/mod/admin, payout, speaker, privacy, moderation, or Premium bypass authority. Owner/Admin Money Center can inspect safe counts; Creator Money Center remains setup/readiness-only with no fake money.

Remote proof addendum: migration `20260603165000_money_access_grants_product_catalog.sql` passed local Supabase lint, was applied with `supabase db push`, and a post-apply dry-run reported the remote database up to date. `supabase/database.types.ts` was refreshed from the linked project. `supabase migration list` is still unavailable in this shell because the linked CLI login role hits the known SASL auth failure. Android proof paths now include `/tmp/chillywood-money-access-grants-remote-proof-20260603/`, `/tmp/chillywood-money-center-signed-in-proof-20260603/`, and `/tmp/chillywood-real-sandbox-digital-sales-proof-20260603/`. The signed-in proof captured the upgraded proof account in Creator Money Center with `Not active`, `Sandbox ready`, `No verified earnings yet`, `Setup needed`, `No payable balance`, and setup/provider rows `Not payable`. The v22 proof captured current-main Owner/Admin Money Center Product Catalog, Shared Access Grants, Provider Rows, Money Audit Explorer setup/sandbox/not-payable states, and a sanitized detail sheet. Temporary proof roles were revoked and post-revoke Admin denial was captured.

Real sandbox sales preflight addendum: `revenuecat-webhook` ACTIVE version `8` mirrors real RevenueCat Premium events into the shared money-access tables, but no new sandbox sale was fired or faked. Premium is the only mapped RevenueCat/Google Play product. Paid content, Watch-Party tickets, Live Watch-Party access/seat passes, tips, and event pass remain blocked by missing provider product ids; merch remains physical/planned. Remote switches now read `live_money_enabled=off`, `payouts_enabled=off`, paid content/tips/merch/tickets/access/seats `off`, with only provider webhooks and RevenueCat/Google Play in `sandbox_only` readiness. EAS Update `c0bb32bb-3c7e-406e-a619-2e3e0eb536ed` did not load current Admin money visuals on Play/EAS v21. EAS APK build `cc88ce26-6e94-4adb-9768-d0483c12505a` finished for versionCode `22`; after the documented signature mismatch, the Play/EAS v21 app was explicitly uninstalled and the EAS v22 APK installed for current-main proof. `/tmp/chillywood-real-sandbox-digital-sales-proof-20260603/` captures Owner/Admin Money Center Product Catalog, Shared Access Grants, Provider Rows, Money Audit Explorer setup/sandbox/not-payable states, and a sanitized detail sheet. Temporary owner/operator proof roles were revoked and post-revoke denial was captured.

Sandbox product mapping addendum: dynamic Android digital products now have a backend purchase-intent bridge. Migration `20260603190000_money_purchase_intents.sql` is remote-applied and type-refreshed; `revenuecat-webhook` is ACTIVE version `9`. Non-Premium RevenueCat events can create grants/ledger rows only when a pending unexpired intent binds the generic provider product to the specific content, room, creator, or event target. Missing/expired/consumed/mismatched/setup/production events are ignored without access or payable money. External provider products remain missing for paid content, Watch-Party ticket, Live Watch-Party access/seat pass, tip, and event pass, so no non-Premium purchase was run. Setup checklist: `docs/REVENUECAT_GOOGLE_PLAY_SANDBOX_PRODUCT_SETUP.md`; proof matrix: `docs/SANDBOX_DIGITAL_SALES_PROOF_MATRIX.md`.

Sandbox product provider follow-up: Google Play now has active one-time sandbox products for paid content, Watch-Party ticket, Live Watch-Party access, Live Watch-Party seat, creator tip, and event pass, all using purchase option `sandbox-099`. RevenueCat has matching published Play Store consumable products with no entitlements or offerings. Migration `20260603225500_sandbox_digital_product_mappings.sql` is remote-applied and connector readback confirms six sandbox catalog rows with exact provider product IDs and purchase intents enabled. The `/admin-money-sandbox-purchases` route originally launched from owner/operator proof accounts; current internal tester sandbox mode also permits approved internal testers/reviewers/proof accounts to launch clearly labeled real sandbox purchases from a signed Play-installed build. The first Creator tip attempt created one sandbox intent but failed Google Play item availability and was marked failed/unconsumed. The follow-up Play-installed versionCode `23` proof fixed item availability and completed Creator tip through Google Play's test card. Final readback after the successful proof showed provider events `1`, access grants `0`, money-access ledger events `1`, payable/paid rows `0`, and active proof roles `0`. No fake sale rows were inserted, and setup/sandbox rows remain not payable.

Google Play item availability closeout: the non-Premium sandbox purchase blocker was fixed by using the exact internal-test opt-in link, uninstalling the prior EAS/internal install with `installer=null`, installing from Google Play, and updating to Play-delivered versionCode `23` built from commit `8219c23` (`766b8015-cb3a-43ba-910d-fa442a45e9be`). `R5CR120QCBF` then showed `installer=com.android.vending`, Billing permission granted, and the current `/admin-money-sandbox-purchases` route. Creator tip `cw_creator_tip_sandbox_099` loaded in Google Play with the test card and completed a real sandbox purchase. The webhook stored one sandbox `provider_events` row, consumed one `money_purchase_intents` row, wrote one `money_access_ledger_events` row as `Sandbox only` / `Not payable`, and created no access grant. Final readback showed provider events `1`, access grants `0`, money-access ledger events `1`, payable/paid rows `0`, and active proof roles `0`. This proves sandbox tip ledger activity without creator payable balance, payout, cash-out, LiveKit permission, host/speaker/admin authority, or public production buy button.

Real sandbox access-product closeout: `cw_watch_party_live_ticket_sandbox_099`, `cw_live_watch_party_access_sandbox_099`, `cw_live_watch_party_seat_sandbox_099`, and `cw_paid_content_access_sandbox_099` each completed real Google Play test-card purchases through RevenueCat and the Chi'llwood webhook. Migration `20260604011000_allow_sandbox_access_grants_in_resolvers.sql` lets proof-only `sandbox_only` access grants resolve without granting publish authority. Final readback showed provider events `5`, consumed purchase intents `5`, access grants `4`, sandbox/not-payable ledger rows `5`, payable/paid rows `0`, and active proof roles `0` after revoke. Creator Money Center still shows Money Center `Not active`, active money `None`, locked `Sales and payouts`, no payable balance, and no cash-out. Event pass was deferred from that lane and closed by the June 4 backing proof above.

Money Center is the creator-facing source of truth for money readiness in Platform Studio. It consolidates the old Monetize, Revenue, Payouts, provider-readiness, Premium, Stripe, RevenueCat, Google Play, tips, paid content, Watch-Party seats, merch, creator balance, tax/legal, and payout-readiness surfaces into one collapsible readiness area.

This is a readiness, consolidation, and Owner/Admin control layer only. It does not activate live money, checkout, paid access, tips, merch sales, balances, withdrawals, transfers, payouts, or purchase verification.

June 1, 2026 Premium reviewer readiness update: the reviewer/test purchase path remains closed by default and safe for Google/internal testing. `R5CR120QCBF` is Play-installed versionCode `13`, runtime validation reports the Android RevenueCat public SDK key configured, `revenuecat-webhook` is ACTIVE version `7`, and EAS production branch readback for runtime `1.0.0` shows the newest update is the closed-shell group `5668cdaa-cd5b-4553-bd91-7b786323fd22`. `/subscribe` shows Premium inactive and purchase `Temporarily unavailable`; Admin Money Center shows `Live money off`. No fresh purchase, restore, provider event, ticket/seat/tip/paid-content/payout action, or fake balance was run in this readiness lane because the approved reviewer/app credential path was not available and Play API readback returned `403`. The existing licensed-tester sandbox proof remains valid, but reviewer purchase testing requires owner-entered Play Console/App access credentials plus an explicitly approved bounded purchase-shell opening.

June 1, 2026 owner-session closeout: after the sandbox Premium proof, `R5CR120QCBF` was updated from Google Play internal testing to versionCode `13` and restored/confirmed in the normal owner/admin operating state. The app opens Home, Admin Command Center opens, and `/subscribe` shows purchase status `Temporarily unavailable`. No purchase was run in that closeout lane; a closed-shell Restore Purchases check returned `Restore complete. Premium is not active.` Current source remains closed with `PREMIUM_PURCHASE_SHELL_ON_HOLD = true` and `premiumPurchaseEnabled: false`. Money Center remains setup/readiness-only; no live-money, ticket/seat, tip, paid-content, payout, cash-out, fake balance, or Stripe Android digital checkout behavior changed.

June 1, 2026 backend entitlement sync update: the Play-installed RevenueCat/Google sandbox purchase and restore proof passed, and `revenuecat-webhook` now contains a real verified-event-to-`user_entitlements` sync path for Premium. The server-side RevenueCat webhook secret and RevenueCat dashboard webhook integration are configured; dashboard `TEST` delivery is received as `test_received` with no Premium grant and no live-money action. A fresh real sandbox purchase event and later renewal wrote/refreshed one backend-active Premium row with `source='revenuecat'`, and Platform Studio unlocked during that active entitlement window. RevenueCat client UI or dashboard test delivery alone is not enough to unlock creator tools or mark production Premium live; creator tools require the backend row to be active and unexpired.

June 1, 2026 RevenueCat/Google sandbox purchase proof update: the earlier restore-only blocker was superseded by the Play-installed internal-test v12 sandbox purchase/restore proof and the fresh real-event backend entitlement proof. Money Center still stayed setup/readiness-only: no payout, balance, ticket, seat, tip, paid-content unlock, live-money action, or Stripe Android checkout was created. Watch-Party Live and Live Watch-Party / Live Stage keep Premium access gates, but ticket/seat monetization remains `watch_party_seats_enabled=off` and setup-only with no buy button unless a future Play/RevenueCat-backed product is proved.

The later Play-installed follow-up on June 1, 2026 superseded the earlier local-install blocker. Money Center remains unchanged: readiness/sandbox status can be inspected, but no switch or provider row may be treated as active money until a later explicit live-money lane proves provider readiness, policy approval, and owner approval.

## Payment Rules

- Android digital access inside the app uses Google Play Billing and RevenueCat where required by policy. Google Play's Payments policy says Play-distributed apps charging for in-app features, services, digital content, or digital goods must use Google Play billing unless an eligible policy path applies: https://support.google.com/googleplay/android-developer/answer/9858738
- RevenueCat remains the Premium/subscription entitlement integration. Webhooks must be authenticated and idempotent because RevenueCat may deliver duplicate events: https://www.revenuecat.com/docs/integrations/webhooks
- Stripe Connect is for creator payout onboarding and future payout operations, not Android digital purchase collection. Stripe documents Connect as a platform/marketplace system for connected accounts, balances, and payouts: https://docs.stripe.com/connect
- Physical merch can use Stripe, Shopify, or another approved merch checkout later because physical goods are separate from Android digital app access.
- Chi'llwood's internal ledger is the source of future creator-balance truth. Provider balances alone are not creator payable balance truth.
- Refunds, reversals, fraud holds, taxes, provider fees, app-store fees, disputes, moderation holds, and policy checks can reduce pending or available balances.
- No payout is available until purchase verification, refund/reversal handling, fraud checks, payout setup, tax/legal/KYC readiness, provider checks, and owner-approved policy checks pass.

## Owner/Admin Kill Switches

Migration `202605270001_platform_money_kill_switches.sql` adds backend-enforced Money Center switches and append-only audit:

- `platform_money_kill_switches`
- `platform_money_kill_switch_audit`
- creator-safe `get_money_feature_flags_summary()`
- owner/operator `get_platform_money_kill_switches()`
- owner/operator `list_platform_money_kill_switch_audit()`
- audited owner/operator `set_platform_money_kill_switch_state()`
- backend action guards `is_money_feature_allowed()` and `assert_money_feature_allowed()`

Allowed states are `off`, `on`, `locked`, `maintenance`, and `sandbox_only`.

Required switch defaults:

| Switch | Default |
| --- | --- |
| `money_center_visible` | `on` |
| `digital_sales_enabled` | `off` |
| `tips_enabled` | `off` |
| `watch_party_seats_enabled` | `off` |
| `paid_content_enabled` | `off` |
| `merch_enabled` | `off` |
| `creator_balance_visible` | `on` |
| `payouts_enabled` | `off` |
| `stripe_connect_enabled` | `sandbox_only` |
| `revenuecat_google_play_enabled` | `sandbox_only` |
| `provider_webhooks_enabled` | `sandbox_only` |
| `live_money_enabled` | `off` |

Optional scaffold switches default to `sandbox_only` for creator monetization readiness and `off` for creator revenue imports, tax/KYC collection, ads revenue, and sponsorships.

Rules:

- `off` shows disabled/setup copy to creators.
- `locked` and owner-only reasons are visible only in Owner/Admin controls.
- `maintenance` shows temporary unavailability.
- `sandbox_only` allows provider test proof and readiness review but no production money.
- `on` still requires provider readiness and, for live-money actions, `live_money_enabled=on`.
- `live_money_enabled` stays off unless a later explicit launch lane documents provider proof, legal/accounting approval, rollback proof, and owner approval.
- High-risk switches require confirmation and a reason: `live_money_enabled`, `payouts_enabled`, `digital_sales_enabled`, `tips_enabled`, `watch_party_seats_enabled`, `paid_content_enabled`, `stripe_connect_enabled`, `revenuecat_google_play_enabled`, and `provider_webhooks_enabled`.
- High-risk switch changes write both Money switch audit and immutable admin audit; future money actions must call backend guards and fail closed if the switch or audit path blocks.

## Owner/Admin Money Center

Owner/Admin Command Center has one visible `Money Center` tab for money controls. Separate top-level Admin money tabs for Premium, Kill Switches, Ads, Revenue, Payouts, Sponsors, and Fraud were consolidated into section anchors. Old params remain compatible:

- `admin?tab=premium` -> Money Center > Premium / RevenueCat / Google Play
- `admin?tab=kill-switches` -> Money Center > Kill Switches
- `admin?tab=ads` and `admin?tab=sponsors` -> Money Center > Sponsors / Ads
- `admin?tab=fraud` -> Money Center > Fraud & Risk
- `admin?tab=revenue` -> Money Center > Creator Balance / Ledger
- `admin?tab=payouts` -> Money Center > Payouts / Stripe Connect

Owner/Admin Money Center sections:

- Overview
- Kill Switches
- Premium / RevenueCat / Google Play
- Sponsors / Ads
- Fraud & Risk
- Digital Sales
- Tips / Watch-Party Seats / Paid Content
- Merch
- Creator Balance / Ledger
- Payouts / Stripe Connect
- Provider Webhooks
- Tax & Legal
- Audit Trail
- Technical Checks

Kill switches are grouped as Global Money, Digital Purchases, Physical / Merch, Payouts, Sponsors / Ads, and Fraud / Risk. Usage, Networks, Live Cost Guard, and Live Ops remain separate operational/admin surfaces because they do not activate creator money or payout capability.

Detailed Admin surface audit: `docs/ADMIN_MONEY_CENTER_SURFACE_AUDIT.md`.

## Money Center Sections

- Overview: active/locked/next-step summary plus short payment rules.
- Digital Sales: Premium, digital passes, paid creator content, and other app digital access readiness.
- Tips: planned digital-support readiness with no fake tip totals or checkout.
- Watch-Party Seats: planned viewer/VIP/speaker/event/room-access seat readiness without changing room authority.
- Paid Content: planned paid videos, replays, posts, and collections with entitlement checks required.
- Merch: physical goods only, separate from digital app unlocks.
- Creator Balance: ledger-first pending/available/paid/refunded/reversed/blocked status.
- Payouts: Stripe Connect setup/readiness only, no payout execution.
- Tax & Legal: tax profile, identity/KYC, payout terms, refunds/reversals, and policy links.
- Provider Status: sanitized provider readiness from the backend-owned readiness summary.
- Future Tools: planned subscriptions, sponsorships, ads, and revenue imports.
- Technical Checks: owner/dev-only public-safe readiness details, never secret values.

## Event Drilldowns And Audit Explorer

Money Center has two inspection levels:

- Creator Platform Studio Money Center shows creator-owned/source-safe money events only. Rows open `Money Event Detail` with event/source label, status, environment, provider/capability label, timestamp where available, idempotency proof label, reason, next step, and explicit payable state.
- Owner/Admin Money Center includes `Money Audit Explorer` for source rows, provider readiness, kill switch current state, kill switch audit rows, revenue-import/ledger/payout/webhook/sponsor/fraud setup rows, and blocked money actions.
- Owner/Admin `Search Admin` may typeahead over Money Audit events, kill switches, provider readiness, and Live Cost Guard rows only inside the `/admin` permission gate. Result rows open existing Money Center / Live Ops surfaces, mask private identity fields, and must not expose raw provider payloads, provider secrets, webhook secrets, service-role values, authorization headers, or live-money controls.
- As of May 29, 2026, Admin Search writes query-level and result-open audit events through `write_admin_search_audit`. Money/provider search scopes record masked query preview, query type, result count, status, and scope in immutable Admin audit metadata. Email-shaped Admin Search queries are logged as masked email lookups; public Explore still has no email lookup. The audit writer is inspect-only and does not activate checkout, payout, transfer, revenue import, balance creation, sandbox-to-production promotion, Premium grant, or any live-money path.

Creator-safe detail never renders raw provider payloads, service-role values, provider secrets, webhook secrets, private provider internals, other-user ids, or admin-only notes. Owner/Admin detail may show safe ids and safe technical labels, but still never renders provider secrets, raw private provider payloads, service-role values, webhook secret values, Stripe secret keys, RevenueCat secret keys, Google service-account JSON, authorization headers, signatures, tokens, or private metadata blobs.

Sandbox and setup rules:

- Sandbox provider/test rows are labeled `Sandbox only`.
- Sandbox and setup rows are labeled `Not payable`.
- Sandbox rows do not become production revenue.
- Sandbox rows do not create available creator balance.
- Sandbox rows do not enable withdraw, cash-out, payout release, transfer, checkout, unlock, or payable obligations.
- Setup/foundation rows are creator-facing as `Setup only`, `Readiness row`, `Planning record`, or `No verified ledger rows yet`, not confusing raw foundation wording.
- If raw source rows are not safely readable, the UI may show a source-labeled count/detail event, but it must still say the row is not payable and why.

June 1, 2026 Premium sandbox regression note:

- Premium guards are restored, and Money Center does not override them.
- The local Android debug and production RevenueCat public SDK keys are present in ignored local config. `validate:runtime` now reports `revenueCatAndroidPublicKeyConfigured: true`, and the regenerated release bundle contains the public key through the approved client-safe path without printing or committing the value.
- A debug/internal sandbox build may configure RevenueCat with `runtime.revenueCat.androidDebugPublicSdkKey`; a release build needs `runtime.revenueCat.androidPublicSdkKey` plus a freshly generated JS bundle before purchase/restore can be claimed.
- Play-installed v12, signed-in app state, RevenueCat mapping, sandbox purchase, sandbox restore, real RevenueCat webhook delivery, backend `user_entitlements` sync, and Platform Studio unlock are now proved for the licensed sandbox tester. The fresh proof used bounded EAS updates to open only the Premium shell, then closed the shell again with update group `5668cdaa-cd5b-4553-bd91-7b786323fd22`; current source keeps `PREMIUM_PURCHASE_SHELL_ON_HOLD = true` and `premiumPurchaseEnabled: false`. Do not mark production Premium active from local config, provider mapping, signed-in screenshots, Play install proof, sandbox screenshots, or setup-only screenshots.
- Backend `user_entitlements` purchase sync is implemented in `revenuecat-webhook`, and the RevenueCat/Supabase webhook secret path is configured. Fresh real sandbox event `0bd7...60d7` plus a later renewal wrote/refreshed a Premium row with `source='revenuecat'`, sandbox Play Store metadata, and no raw provider payload storage. Premium creator tools can unlock only while that backend entitlement is active and unexpired.
- Backend `user_entitlements` active rows can unlock Premium where RLS-visible and trusted, but docs and UI must not label owner setup access, fake rows, or proof-hold state as Premium.
- Watch-Party Live and Live Watch-Party / Live Stage Premium gates remain access gates only. Ticket/seat monetization for both room types is off/setup-only until a real Google Play/RevenueCat-backed product and entitlement path exists; no buy button should appear unless it is truly backed.
- `live_money_enabled`, tips, paid content, payouts, and Stripe checkout for Android digital goods remain off.

`_lib/moneyAuditEvents.ts` is the shared normalization layer for these surfaces. It reads safe source rows where RLS allows and builds source-labeled events from existing read models otherwise. It filters secret-like fields and marks every sandbox/setup event as non-payable.

## Surface Audit And Consolidation

| Path | Current purpose | Backing | Consolidation decision |
| --- | --- | --- | --- |
| `app/channel-settings.tsx` | Platform Studio, old Monetization tab, payout setup UI, provider readiness readout | UI plus safe helpers/RPCs | Kept as the single Money Center surface; old Revenue/Payouts/Store/Stripe sections are section anchors inside Money Center. |
| `app/monetize.tsx` | Old route compatibility | Redirect only | Redirects to `Money Center > Overview`. |
| `app/revenue.tsx` | Old route compatibility | Redirect only | Redirects to `Money Center > Creator Balance`. |
| `app/payouts.tsx` | Old route compatibility | Redirect only | Redirects to `Money Center > Payouts`. |
| `app/creator-monetization.tsx` | Creator monetization policy page | Static legal/policy copy | Kept as the Tax & Legal policy destination. |
| `app/subscribe.tsx` | Premium subscription UI | Existing RevenueCat/Google Play flow | Kept; Money Center links to it without changing Premium gates. |
| `app/channel/[userId].tsx` | Public Platform store/product readout | Public-safe rows only | Kept outside Money Center; no checkout is activated. |
| `app/player/[id].tsx` | Creator-paid content access lock/read path | Existing resolver/RPC foundation | Kept; Money Center documents paid-content readiness without changing Player behavior. |
| `app/admin.tsx` | Owner/admin money controls, Premium/store readiness, sponsor/ads/fraud/revenue/payout foundation readouts | Admin-only/foundation helpers plus Money switch and provider readiness helpers | Consolidated into one visible Owner/Admin Money Center tab; old Admin money params map into section anchors instead of separate long top-level money tabs. |
| `_lib/moneyFeatureFlags.ts` | Sanitized Money switch reader and owner/admin writer helpers | Money kill-switch RPCs | Added; normal creators read sanitized states only, owner/admin writes require backend RPC and audit. |
| `_lib/providerReadiness.ts` | Sanitized readiness summary reader | `get_provider_readiness_summary()` | Kept as the visible readiness source for Money Center. |
| `_lib/paymentRailPolicy.ts` | Client-side payment rail doctrine | Static policy helper | Kept; Money Center copy follows it. |
| `_lib/creatorMonetization.ts` | Default-off monetization foundation helpers | Fail-closed RPCs/tables | Kept; no live money flags changed. |
| `_lib/creatorPayouts.ts` | Creator payout readiness, Stripe test-mode setup helpers | Edge Functions/RPCs | Kept; Money Center shows readiness and no payout execution. |
| `_lib/monetization.ts`, `_lib/revenuecat.ts`, `_lib/premiumEntitlements.ts` | Premium/RevenueCat entitlement configuration | Existing Premium path | Kept unchanged. |
| `_lib/platformFinance.ts` | Admin finance foundation readouts | Admin/foundation tables | Kept admin-only; not creator-facing balance truth. |
| `supabase/functions/provider-readiness` | Sanitized provider readiness Edge Function | Authenticated server read | Kept; returns no secrets and no live money action. |
| `supabase/functions/revenuecat-webhook` | Fail-closed RevenueCat webhook shell | Server secret required | Kept; must be idempotent before active purchase handling. |
| `supabase/functions/google-play-webhook` | Fail-closed Google Play webhook shell | Server secret required | Kept; grants no subscription while setup is incomplete. |
| `supabase/functions/stripe-connect-*` | Stripe Connect test-mode setup/sync/webhook foundations | Backend-only Edge Functions | Kept for payout readiness; no Android digital checkout. |
| `supabase/functions/stripe-connect-transfer-create`, `payout-release-preflight` | Admin/operator preflight refusals | Backend-only | Kept closed; no transfer or payout execution. |
| `supabase/migrations/202605140011_creator_monetization_systems_foundation.sql` | Default-off money tables/RPCs including ledger/idempotency | Remote-applied schema | Kept; no fake entries or active live-money rows. |
| `supabase/migrations/202605250002_provider_link_readiness_scaffold.sql` and `202605250004_provider_link_sandbox_proof_status.sql` | Provider readiness source and sandbox proof rows | Remote-applied schema | Kept as readiness truth; only Stripe webhook signature is sandbox-ready. |
| `supabase/migrations/202605270001_platform_money_kill_switches.sql` | Backend Money switch state, audit, sanitized creator RPC, owner/admin write RPC, backend action guards | New schema | Added; defaults are fail-closed and no live money is enabled. |
| `docs/CREATOR_MONETIZATION_SYSTEMS_FOUNDATION.md` | Monetization foundation docs | Documentation | Updated to point creator-facing UI to Money Center. |
| `docs/PROVIDER_LINK_READINESS_RUNBOOK.md` | Provider readiness runbook | Documentation | Updated to point provider status to Money Center. |
| `scripts/guard-*money*` and related policy guards | Static safety checks | Node scripts | Updated/added Money Center guard coverage. |

No separate creator-facing Monetize, Revenue, or Payouts top-level tabs remain in Platform Studio. Admin Revenue and Admin Payouts remain admin-only operational/foundation readouts, not normal creator dashboards.

## Ledger Model

The repo already has an append-only `creator_earnings_ledger` foundation from `202605140011_creator_monetization_systems_foundation.sql`. Money Center treats ledger rows as the only future source for creator balance display. The UI shows `No verified earnings yet` until real verified ledger rows exist.

Future ledger rows must retain:

- creator id;
- provider/source event id and idempotency key;
- product type and product id;
- gross amount, taxes, provider/app-store fees, platform fee, creator share, refunds, reversals, and net amounts;
- status: `pending`, `available`, `paid`, `refunded`, `reversed`, or `blocked`;
- available date, payout batch id, and immutable audit timestamps.

Normal mobile clients must not write ledger rows, payout paid states, provider processed states, or balance totals.

## Webhook And Idempotency Rules

- Every provider event must have a provider event id.
- Duplicate provider events must not create duplicate ledger rows.
- Refunds/reversals must adjust prior entries before payout availability.
- Webhook shells fail closed without valid signature/auth.
- `provider_webhooks_enabled=off` means webhooks may audit readiness only and must not activate money.
- Sandbox events cannot mark production readiness active.
- `live_money_enabled=off` blocks all live-money claims/actions.
- No event can create a payout without a separate owner-approved payout workflow.

## Android Proof

June 12, 2026 Channel Subscriptions V1 policy update: creator channel subscriptions are recurring digital access and must use the RevenueCat / Google Play subscription path, not Stripe Tips. The sandbox product is `channel_subscription_sandbox_monthly_499` / `cw_channel_subscription_sandbox_monthly_499` with RevenueCat entitlement `creator_channel_subscription`. The implementation is deployed in sandbox mode, but sandbox purchase proof is still pending. Uncommitted v48 build `da86b3e9-145f-45a4-9f84-d713d906dc98` is abandoned for official proof because it points to old commit `9b2ae8e78958c3c38c08c7b3397104d2d35e1a0f`. Official v49 build `67995a33-6b4c-4e0a-afa2-02f95cff47c1` installed on `R5CR120QCBF` with `installer=com.android.vending` and versionCode `49`; it proved creator setup, fan `Subscribe` CTA, and unsubscribed direct-route gate. v49 purchase proof found backend `unsupported_purchase_intent_product`; remote migration `20260613004804_channel_subscription_purchase_intent_allowlist.sql` fixed the central purchase-intent allowlist. v49 retry then found the RevenueCat offering-only lookup blocker; commit `54c9f5c11b9a67f366c97a7b8b6718fe76704f43` adds direct RevenueCat subscription product lookup fallback. Official v50 build `c6859970-89a9-470b-882d-eeb848bb2fe9` is in progress for versionCode `50` and must be installed before retrying purchase proof. Channel subscriptions unlock only subscriber state for that creator channel and do not include Chi'llwood Premium, VIP, Paid Videos, Paid Watch-Party tickets, Paid Events, Tips, LiveKit authority, payout access, cash-out, withdrawal, transfer, platform-wide badge/status, or other creators' channels. Money Center must label subscription rows as sandbox/not_payable until live money is explicitly approved.

Money Center Android proof should capture Platform Studio tab row, first view, each collapsed/expanded Money Center section, Provider Status, Technical Checks hidden or owner/dev-only, old Monetize/Revenue/Payouts route redirects, locked/setup-needed states, no fake money, and no secrets.

Screenshots must stay outside the repo.

May 26, 2026 proof result: `R5CR120QCBF` captured the consolidated tab row, Money Center first view, Overview, Digital Sales, Tips, Watch-Party Seats, Paid Content, Merch, Creator Balance, Payouts, Tax & Legal, Provider Status, Future Tools, and owner/dev Technical Checks at `/tmp/chillywood-money-center-proof-20260526-r5/`. The screenshots show locked/setup-needed/sandbox-ready states, no duplicate money tabs, no fake money actions, no Stripe checkout for Android digital access, and no provider secret values.

May 27, 2026 Android refresh proof result: `R5CR120QCBF` was refreshed against current JS by restarting Metro with `--clear`, using `adb reverse tcp:8081 tcp:8081`, clearing `com.chillywood.mobile` app state, and launching the dev-client URL directly. After an active owner account was available, Metro/dev-client still did not attach to the installed Admin bundle, so `./gradlew assembleRelease` bundled current JS and `adb install -r -d android/app/build/outputs/apk/release/app-release.apk` installed over the existing app data. Screenshots live at `/tmp/chillywood-money-center-android-refresh-proof-20260527/` and capture Platform Studio Monetization / Money Center first view, Overview, Digital Sales, Tips, Watch-Party Seats, Paid Content, Merch, Creator Balance, Payouts, Tax & Legal, Provider Status, Technical Checks, Owner/Admin Money Controls, kill-switch rows, `live_money_enabled=off`, and the high-risk Live money confirmation/reason sheet. The Payouts section shows the final tightened current-JS state: no setup-payout CTA, no payout release, no balance, no withdrawal, no transfer, and only a read-only status refresh.

May 27, 2026 kill-switch proof result: the linked Supabase environment now has `202605270001` applied and aligned. A signed-in proof-account probe returned 17 creator-safe switch summary rows, no secret-like fields, `live_money_enabled=off`, `payouts_enabled=off`, digital sales/tips/Watch-Party seats/paid content/merch off, and Stripe Connect/RevenueCat-Google Play/provider webhooks sandbox-only. Direct table update was denied with `42501`; switch write RPC attempts were denied with `money_kill_switch_admin_required`; no toggle was performed and no live-money state changed. Owner/Admin Money Controls runtime proof used the logged-in owner account after release reinstall: Admin was opened with `chillywoodmobile://admin`, then Kill Switches was selected from the internal tab strip because `app/admin.tsx` does not consume `tab=kill-switches`. The high-risk Live money confirmation sheet required a 12+ character reason, warned that backend RPC and immutable audit must happen before creator-visible changes, and was cancelled without submitting.

May 27, 2026 Owner/Admin Money Center consolidation result: `app/admin.tsx` now consumes `tab`, `section`, and `focus` query params, exposes one visible `Money Center` tab, and maps old Admin money tabs into collapsible Money Center sections. The consolidated UI reads `readPlatformMoneyKillSwitches()`, `listPlatformMoneyKillSwitchAudit()`, and `readProviderReadinessSummary()`; no provider secret values or raw payloads are rendered. Android `R5CR120QCBF` proof lives at `/tmp/chillywood-admin-money-center-proof-20260527/`. It used a current release APK installed over the existing owner session, opened `chillywoodmobile://admin?tab=money-center`, and captured the Admin tab row, Owner/Admin Money Center first view, Overview, grouped Kill Switches, Premium / RevenueCat / Google Play, Sponsors / Ads, Fraud & Risk, Digital Sales, Tips / Watch-Party Seats / Paid Content, Merch, Creator Balance / Ledger, Payouts / Stripe Connect, Provider Webhooks, Tax & Legal, Audit Trail, Technical Checks, and creator Money Center disabled/setup consistency. The high-risk Live money confirmation sheet was opened and cancelled; no switch was confirmed and `live_money_enabled` stayed off.

May 27, 2026 Ledger Audit Explorer proof result: creator Money Center event rows now open sanitized `Money Event Detail` sheets, and Owner/Admin Money Center now includes `Money Audit Explorer` with filters for production, sandbox, setup, blocked actions, kill switches, provider readiness, ledger, revenue imports, payouts, sponsors/ads, fraud/risk, webhooks, digital sales, and merch. Admin details show safe source table/event/actor/target/provider/capability/environment/idempotency/reason/timestamp metadata and inspect-only action-safety copy. Creator details hide other-user ids and private/admin fields. Sandbox and setup rows are labeled `Sandbox only` or `Setup only` plus `Not payable`. Android `R5CR120QCBF` proof lives at `/tmp/chillywood-money-audit-explorer-proof-20260527/`. It used `./gradlew assembleRelease`, installed the release APK over the existing owner session with `adb install -r -d`, opened creator/admin deep links, and captured creator event rows/detail, creator balance detail with no verified earnings/not payable, Provider Status readiness, Owner/Admin Money Audit Explorer metrics and Sandbox/Setup filters, sandbox row detail, kill-switch event detail, sponsor/fraud/money-control drilldown surfaces, no secret exposure, no fake money, and no withdrawal/cash-out action. No schema migration, live-money activation, fake balance, payout, checkout, transfer, withdrawal, Premium gate change, LiveKit change, or Watch-Party behavior change was added.

May 27, 2026 provider CLI proof result: Stripe CLI fired a test-mode `payment_intent.succeeded` event and resent the same event to the enabled Chi'llwood Connect test webhook endpoint. Stripe reported `livemode=false` and `pending_webhooks=0` after delivery. Owner/Admin Money Audit Explorer on `R5CR120QCBF` shows the resulting provider webhook source row as `Sandbox only`, `Not payable`, `ignored`, provider `stripe_connect`, provider environment `test`, `livemode=false`, event type `payment_intent.succeeded`, and duplicate-safe/idempotency labeled. Screenshots live at `/tmp/chillywood-provider-cli-proof-20260527/`. Supabase names-only secret inventory still has Stripe webhook secrets configured but no `REVENUECAT_WEBHOOK_SECRET` or `GOOGLE_PLAY_WEBHOOK_SECRET`; no official RevenueCat CLI is installed locally; Google CLI confirmed Android Publisher/PubSub APIs are enabled but no Pub/Sub topics exist, and Android Publisher subscription read proof returned `403` for both the active user and the local Google Play service account. RevenueCat/Google signed webhook proof remains blocked on server-side secret/provider permission linking. No live money, payable ledger, payout, transfer, withdrawal, checkout, Premium gate change, provider secret exposure, or raw provider payload display occurred.

May 27, 2026 validation commands passed:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:refresh-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:stripe-connect-policy`
- `npm run guard:provider-readiness-policy`
- `npm run guard:money-center-policy`
- `npm run guard:vod-quality-policy`
- `npm run guard:clip-studio-policy`
- `npm run guard:platform-brand-studio-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `supabase migration list`
- `supabase db lint --linked --schema public --fail-on error`
- `supabase db push --dry-run`

Targeted source scans for fake earnings/tips/payouts/balances/checkout, Stripe checkout misuse for Android digital goods, provider-secret rendering in Money Center/Admin money files, live-money movement calls, duplicate creator-facing money tabs, user-facing `Mini Platform`, provider readiness source usage, Premium changes, and LiveKit/Watch-Party changes found only locked/negative policy copy, admin-only readouts, or no product-code changes.

## Remaining Limitations

- RevenueCat and Google Play server/webhook secrets still need provider credential linking and signed sandbox event proof before production-active status.
- Stripe Connect production payout readiness, tax/KYC completion, owner approval, and payout execution remain blocked.
- Paid content, tips, Watch-Party seats, merch checkout, sponsorships, ads, and revenue imports remain planned/readiness-only.
- No live money was activated by this consolidation.
- Owner/Admin switches are a control scaffold, not payout or checkout activation.
- A harmless audited switch mutation was not performed in this proof. Future no-live audit proof should be explicit, reasoned, and owner-approved before using the backend write RPC.
- Stripe signed sandbox event firing/idempotency is now CLI-proved and inspectable in Money Audit Explorer. RevenueCat/Google signed webhook proof remains blocked until missing server webhook secrets and provider permissions are linked.
