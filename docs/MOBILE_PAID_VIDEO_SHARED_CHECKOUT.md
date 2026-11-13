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

Full admitted prepare/bind/dispatch database proof; Android paid/refund reporting
and reconciliation proof; native route qualification/enrollment; correct installed
build/device verification; deployed provider mappings. US-only buyer admission
is not proved by legal acceptance, billing-address collection or a `worldwide`
tax policy. Do not fabricate geography evidence or broaden launch scope.

Preserve historical receipts, refunds and exact frozen evidence. Existing
catalogs may serve historical reconciliation without driving new purchases.
All live money, payout and provider activation remain outside this source work.
