# Native production ingress prerequisite — money remains OFF

This is an evidence-only prerequisite, **not production purchase admission or
native financial settlement readiness**. The existing production purchase-intent
constraint still excludes native creator purchases. No products, credentials,
qualification records, settings, deployments or activation are supplied.

The paid-video successor is documented in
[`NATIVE_PRODUCTION_ECONOMIC_CONTRACT.md`](NATIVE_PRODUCTION_ECONOMIC_CONTRACT.md).
It reuses this normal post-canonical RPC and adds private immutable economic
observations/HELD accounting; the channel contract below is preserved. Prospective
production source admission and actual report/earnings integration remain open.

## Source behavior

- After canonical RevenueCat processing, SQL resolves channel-subscription scope
  from the persisted receipt's product. Production App Store/Play Store events
  append a private observation bound to that canonical receipt ID and its exact
  provider/event/hash/environment/user/original-transaction tuple, plus the
  already-reserved immutable webhook event ID and raw-body hash. Duplicate
  terminal responses need not repeat a product-type label to retain provenance.
- Preserve the reported app, exact product/base-plan reference, original
  transaction identity and renewal-cycle transaction identity separately. These
  are authenticated delivery observations, not provider financial settlement
  receipts or evidence of actual fees. No original-to-creator financial binding
  or renewal-cycle payable authority is created by this change. The service-only
  observation RPC cannot issue ownership qualifications; authenticated transport
  observations and server configuration alone are not independently verified
  provider ownership proof.
- The project comes only from existing server `REVENUECAT_PROJECT_ID`
  configuration, never webhook payload metadata. Missing/malformed app/project
  context remains unknown. An app ID does not prove a project/store account.
- Independently verified qualification may bind exact project/app/provider/full
  product reference. Qualification and revocation tables are private, FORCE RLS,
  immutable and unwritable by all API roles. No generic qualification issuer or
  seed exists. Qualification creation requires separate authorized provider
  verification; matching a row is not financial authority.
- The newest exact qualification is considered even when expired or revoked;
  there is no fallback to older evidence. An event retry preserves its first
  observation rather than upgrading it after configuration or qualification
  changes. A later qualified receipt does not qualify an earlier observation.
- Premium and sandbox processing are unchanged. Terminal refunds/revocations
  execute **before** observation. Expired/absent qualification is recorded without
  blocking cleanup. Storage failure requests retry after canonical effects have
  committed; existing receipt idempotency owns replay. No observation is a
  precondition for retaining/revoking historical access.
- Existing malformed-terminal quarantine, deferred product change/pause and
  nonpurchase snapshot paths remain unchanged. This slice does not claim those
  paths have new provenance coverage.
- Immediately before the existing one-use native SDK dispatch marker is written,
  SQL rechecks global live-money mode under a row share lock: production requires
  `on`, sandbox requires `off`, absent/unknown modes fail closed. Other exact
  session/source/quote/rail checks and unknown-outcome behavior remain intact.

## Provider contract basis

RevenueCat documents `app_id` as the public dashboard app/store-configuration
identifier, not a project/account attestation:
[event fields](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields).
Webhook integrations can be scoped to one app or all apps in a project and use
a configured Authorization header:
[webhook authentication and configuration](https://www.revenuecat.com/docs/integrations/webhooks).
This source reuses existing header authentication; it does not claim signed JWS
provider-account verification or provision a new integration.

## Verification and remaining work

Focused tests execute the actual whole webhook handler with controlled provider
boundaries, plus actual migration-chain SQL, grants, immutability and switch
assertions. These are not real provider/device or native-lock contention proof.
The production dispatch assertion can be exercised directly in SQL while the
production native-intent prohibition is retained; that is not an executable
production purchase demonstration.

Next: consume exact current ingress/account qualification in a separately tested
intent/dispatch/receipt admission contract, preserve historical terminal identity,
then remove hardcoded client sandbox assumptions only for that qualified branch.
Apple aggregate financial attribution, Google order/aggregate fee completeness,
typed tax/proceeds/commission settlement and renewal-cycle financial binding
remain separate gaps. No Apple fee allocation or future custom-Stripe tip charge
pattern is selected. Tip app commission remains zero; PR653 simulated deductions
are not production fee or tax evidence.

Deployment, if separately authorized, requires this forward schema before the
updated webhook closure. A mixed deployment can fail the new observation RPC;
never interpret that as a failed provider purchase or retry a charge. Full
exact-head Required Validation and independent review remain required before
source qualification.
