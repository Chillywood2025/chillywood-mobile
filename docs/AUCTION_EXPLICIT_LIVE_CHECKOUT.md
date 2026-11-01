# Dormant auction live checkout contract

This source supports explicit `test` and `live` auction lanes. It does not activate either lane, create credentials, certify provider/legal readiness, or authorize transfers.

## Authority and dispatch

- Quote mode comes from the database, never the request body. Dedicated key and platform account configuration must match that server context before consuming a one-shot claim.
- Test checkout requires the existing sandbox controls with global live money off. Live checkout requires all five live money, provider webhook, digital sales, creator monetization and Connect controls on, plus current exact-session route/recipient, platform product and tax qualifications.
- Live legacy prepare is unavailable outside an ephemeral transaction-bound admission issued by the platform-contract wrapper. The marker is inaccessible to API roles and removed within the transaction. Tax failure rolls back claim, contract and inventory changes together.
- Product mode/status, account, tax code, immutable settlement identity and provider response mode must agree. After provider GETs, current controls, source/capability, platform qualification and tax policy are checked again before POST. No database lock spans a provider request; a stop after dispatch is handled as an uncertain operation, not permission to retry.
- An uncertain POST remains claimed. Recovery can only GET a previously bound exact Checkout session, never repeat POST or free inventory on transport failure.

## Receipts and financial separation

Raw webhook HMAC verification uses the explicitly configured mode-specific secret. Payload mode only selects a candidate secret; it is not signature evidence. Platform account, event/object mode, quote, product, contract and settlement policy are still checked by evidence parsing and the database.

A canonical paid production receipt grants active access and records verified payment evidence. This is not a payable balance: provider cost/tax evidence, accepted fee snapshot, fulfillment maturity, release qualification and separate live cashout remain mandatory. The historical auction test-transfer lane rejects live contracts.

## Optional configuration (not provisioned here)

- `STRIPE_AUCTION_PLATFORM_LIVE_KEY`
- `STRIPE_AUCTION_PLATFORM_LIVE_ACCOUNT_ID`
- `STRIPE_EVENT_AUCTION_PLATFORM_LIVE_WEBHOOK_SECRET`
- `STRIPE_ROOM_AUCTION_PLATFORM_LIVE_WEBHOOK_SECRET`
- Legacy account-scoped receipt secrets: `STRIPE_EVENT_AUCTION_LIVE_WEBHOOK_SECRET`, `STRIPE_ROOM_AUCTION_LIVE_WEBHOOK_SECRET`

All existing test names remain. No fallback from live to a test or unrelated rail is allowed.

## Verification boundary

Mocked Edge tests cover exact live account/mode, dedicated config, signed live callbacks, test-secret rejection, stopped/revoked dispatch, wrong tax product and GET-only recovery. Disposable full-schema tests exercise actual SQL guards; synthetic rows and local switch activation are not provider qualification. Native PostgreSQL exact-head CI is required before integration. Real device behavior and authenticated provider qualification remain separate evidence requirements. Google Play external checkout remains unavailable where its own production qualification is absent; this change does not invent program approval.

## Event source configuration

The existing scheduled-event `active` configuration is admitted only through a unique, current live auction platform/product qualification for that creator and active controls. Its stored product/provider is the real qualified Stripe auction product. RevenueCat sandbox products are not relabeled as production. Ambiguous product/account choices, revoked latest qualifications and absent route proof block this path. Terms revision, current creator authority, capacity and source-event guards still execute through the existing configuration wrappers. Source configuration is not checkout or payout authority.

The creator reviews server-qualified test/live mode explicitly before confirmation. For the first live event auction, confirmation promotes only the exact existing sandbox terms revision through the qualified product setter in the same transaction as auction creation. A stale revision, changed session, revoked qualification or stop decision rolls the transaction back. Auction-only event offers do not expose the generic fixed-price checkout button. Buyer bid reviews and winner checkout always call server eligibility; rendering a live card never submits a bid or starts a provider operation.

Party admission has the same first-live source path, distinct from reserved Stage spots. After verifying the exact creator and current room incarnation under the canonical inventory locks, confirmation promotes only the existing limited-capacity sandbox Party offer to the uniquely qualified Stripe room-auction product. It preserves title, capacity and source price fields; those legacy price fields are never advertised as the auction price. Direct room and waiting-room gates show the exact Party admission auction instead of generic fixed-price checkout. Reopened rooms, wrong creators, changed source kinds and mismatched active provider products cannot reuse the promotion.
