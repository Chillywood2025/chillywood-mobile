# Shared mobile paid-video integration

Source work based on PR 712. Not deployed or enabled. The missing earlier local
mobile checkpoint was not recovered; its test results do not validate this work.

## Restored and verified

- Forward tax environment correction admits paid-video `test` qualifications,
  without enabling live/production/sandbox aliases or changing other features.
  A full-current-schema PostgreSQL test inserts and binds a synthetic policy,
  checks exact replay, rejects other environments and checks revocation.
- Shared account/video attempt journal preserves existing web recovery keys.
  Checkout and refresh serialize over one unresolved request; storage writes
  are read back before use. Corruption and ambiguous outcomes preserve recovery
  identity. The native AsyncStorage adapter stores only request/order IDs.
- Web checkout uses the shared journal. Unsupported transports are explicitly
  rejected before database/provider work. Native checkout is not yet admitted.
- Dedicated service-only native admission now binds existing orders to current
  sandbox creator authority and exact route/price/account/session evidence.
  It is not wired to the endpoint. Android dispatch stays closed until the
  existing reporting queue has its exact paid-video launch binding. Qualification
  rows are locked through dispatch; no active routes or evidence are seeded.
- Player purchase/refresh completions are scoped to the initiating account/video
  generation. Old completions cannot mutate or release a newer action. Checkout
  provider wording uses the canonical offer instead of assuming from the OS.
- Google refund-tax consumers and resumable history preserve paid-video order,
  price and tax identities and use dedicated video account credentials, not
  auction fallback. SQL context/launch producers remain integration work.

## Audited next integration boundaries

1. Keep `stripe_paid_video_orders`, existing observations, access grants, held
   earnings and refund accounting as the single system. No second native ledger.
2. Existing external admission resolves creator Connect/live KYC authority and
   must not simply gain a `paid_video` enum. Paid-video sandbox needs exact
   current buyer/session, video owner, price/revision, platform-account mapping
   and qualified platform route, using sandbox creator authority.
3. Reuse Google native external-link prepare/launch/cancel and iOS StoreKit
   storefront observation. Native tokens stay private, never in journals or
   Stripe metadata. An SDK observation is not payment or access authority.
4. Bind admitted transport to the order and recheck it before dispatch and URL
   reuse. Recovery never impersonates an older session or creates another order.
5. Reuse the Google reporting queue, with a dedicated paid-video context and
   credentials. Do not fall through to auction metadata/accounts. Replayed
   observations must permit reporting repair. Refund revocation commits before
   optional reporting enrichment, so enrichment failure cannot preserve access.
6. Player action/price/provider selection must come from fresh canonical offers,
   not OS-only labels. Account/video ownership applies to refresh and purchase.
   Reuse existing authenticated native playback, not the web Service Worker.

## Still required before activation

## Recovery continuation checkpoint

The normal paid-video purchase and player access resolvers now select the native
Stripe adapter on iOS/Android only for a canonical Stripe-protected offer. Existing
grants retain precedence; malformed or unavailable canonical access does not
silently become checkout. Player refresh uses the same platform-specific status
helper and remains scoped to the initiating account/video operation. The native
refresh button is available for Stripe-protected offers without enabling payment
or relying on the old catalog's checkout shell.

74 focused routing, historical-access, native/web checkout, player lifecycle,
playback and price/cashout boundary tests passed for this continuation. Full
typecheck and exact-head Required Validation have not yet passed this checkpoint.
Creator authoring now uses one exact-cent sandbox price on all three platforms;
the inactive native fixed-price picker no longer authors these new offers. Pause
preserves purchased access and does not turn protected content free. Creator and
buyer history integration still needs completion; these focused results do not
claim the whole application or installed phones are verified.

## Remaining activation requirements

Full admitted prepare/bind/dispatch database proof; Android paid/refund reporting
and reconciliation proof; native route qualification/enrollment; correct installed
build/device verification; deployed provider mappings. US-only buyer admission
is not proved by legal acceptance, billing-address collection or a `worldwide`
tax policy. Do not fabricate geography evidence or broaden launch scope.

Preserve historical receipts, refunds and exact frozen evidence. Existing
catalogs may serve historical reconciliation without driving new purchases.
All live money, payout and provider activation remain outside this source work.
