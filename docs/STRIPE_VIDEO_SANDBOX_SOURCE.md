# Stripe paid-video sandbox source

This change is source-only. It does not deploy an endpoint, create a Stripe
product, change a provider dashboard, activate live payments, release earnings,
or prove an installed device works.

## Scope

- The normal web player selects a server-priced Stripe test checkout. Native
  tips/subscriptions and existing native purchase authority remain separate.
- The creator enters an exact USD price within existing platform limits. The
  order freezes creator, buyer/session, video, price revision, account, product,
  currency and amount before dispatch. No per-buyer owner approval is added.
- The server verifies the authenticated Stripe account and complete
  Checkout/PaymentIntent/charge/product/line-item chain. Redirects cannot grant
  access. Disputes hold access and refunds revoke it.
- A dedicated test-mode webhook signature admits background reconciliation.
  Metadata never identifies an unbound order by itself.
- Receipts append to the existing money ledger. They stay sandbox-only and
  not payable. A refund records the increase in the cumulative refund, not the
  total again. Replay cannot add another paid receipt.

## Accounting truth

A paid charge proves gross, not net earnings. The receipt bridge initially records
`awaiting_authenticated_costs` and `creator_earnings_known=false`. The separate
service-only `stripe-video-cost-reconcile` observer retrieves authenticated
Stripe balance transactions, complete refunds, tax evidence and existing fee
report exports. It reuses the established known-cost calculation and archives
the result in the existing commerce cost snapshots. The digital policy is
20% of verified net, not 20% of gross.

Only then does the existing creator earnings ledger receive a sandbox **held**
entry. Replays do not add earnings twice. Later fees or refunds append a signed
delta instead of rewriting the original earning or crediting the full sale
again. Earlier observed report identities/components cannot silently disappear.
Missing costs, missing creator fee-policy acceptance or missing/revoked fee
semantics qualification still block materialization. A qualified no-collection
tax policy requires explicit provider-reported zero tax; absent tax is unknown.
No new payout route or second financial ledger is introduced. All these entries
remain nonpayable, with no production release or bank operation.

## Enablement remains separate

Web playback uses a narrowly scoped Service Worker route to attach authorization
to streaming media requests, because Expo's web player drops custom headers.
Credentials stay in memory and bindings require the initiating browser client.
Each upstream range is at most 4 MiB and is reauthorized server-side. There is no
whole-video Blob fallback, public origin URL, bearer URL or offline cache. An
unexpected existing Service Worker blocks setup rather than being replaced.
Already-delivered bytes cannot be remotely recalled; new ranges stop on revoked
authority, and retiring a binding aborts its outstanding reads.

Actual use requires deployed source, test credentials and a dedicated webhook,
an exact test product/account mapping, existing tax qualification for the
permitted checkout scope, and qualified protected source delivery. Missing
qualification blocks dispatch instead of fabricating evidence. The creator
price table alone does not make checkout ready. Native external checkout is not
enabled by this web-only change.

The cost observer additionally requires existing authenticated Stripe fee report
identities, exact fee semantics qualification and the creator's fee-policy
acceptance. It does not create reports, invent qualifications, run a scheduler,
or claim to know all future fees. Report descriptors are bounded to 16 retained
runs per order; exceeding that bound requires an explicit archival continuation,
not silently dropping older fee evidence.

This initial sandbox observer is not an arbitrary-history reconciler: one
invocation supports at most eight complete refunds and 64 provider GETs. It has
a 20-minute application ceiling and 60-second individual header/body deadlines
for fee reports, while preserving caller cancellation. A hosting platform's
shorter hard runtime limit still applies; a larger timeout does not override it.
Oversized histories return `video_cost_history_requires_continuation` and do not
write a partial cost snapshot. Supporting larger histories requires resumable
reconciliation before they can be advertised as supported.

Focused synthetic tests exercise code and SQL behavior; they are not evidence
of a real Stripe purchase, live delivery, or installed Android/iPhone execution.

## Geography is not yet launch-qualified

The launch scope remains US-only. The standalone web sandbox does not yet
establish a buyer's country before checkout: account/legal eligibility is not
residence evidence, and collecting a Stripe billing address is not a verified
pre-payment geographic restriction. Native Apple/Google storefront evidence is
platform-specific and is not reused as web residence evidence. The current
`worldwide` tax-coverage prerequisite is deliberately conservative tax coverage,
not permission for a worldwide launch and not a US admission proof.

Before this path is enabled for real customers, the approved US-only scope needs
a reliable server/provider-qualified pre-payment buyer-location control and
negative proofs for non-US, absent, stale and conflicting evidence. No new
per-buyer owner approval registry is introduced here. Sandbox fixtures contain
synthetic US declarations only and cannot establish real-world geography. Live
activation remains outside this source change and remains off.
