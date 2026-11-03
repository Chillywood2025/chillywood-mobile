# Google Premium Restore consistency

Google sandbox Restore must corroborate the current transaction's effective
expiration with the selected subscription's finite current-period end. Missing,
malformed, expired or conflicting effective expiration blocks access projection.
It does not substitute the original transaction's expiration or invent a new
purchase, refund, price, earnings row or financial authority.

After product and complete transaction-history reads, the handler reads the
exact selected subscription again. It reconstructs the same Google snapshot
from that read and requires unchanged owner, store, environment, product/base
plan, original/current transaction binding, period, access and status facts.
A refund, transfer, renewal or other conflicting observation therefore requires
a fresh Restore attempt rather than projecting the earlier observation. This
does not make a remote read atomic with a later provider event; the existing
database projector still locks and rechecks terminal/quarantine and current
binding evidence at completion.

Strict history pagination stays on the exact subscription transaction path.
No sibling subscription or other same-project endpoint can supply history.
Apple reconciliation and the private pending-reversal worker are unchanged.
Live money, payouts and cashout remain outside this sandbox-only recovery path.

The handler tests exercise effective-expiration conflicts, changed second reads,
cross-subscription pagination, authentication, rate limits and database rejection.
Synthetic transport tests do not qualify RevenueCat permissions or prove a real
Play purchase, restore, refund, renewal or installed-device flow. Deployment and
licensed sandbox lifecycle testing still require their separately approved scope.

Provider contracts:
- https://www.revenuecat.com/docs/api-v2/subscription
- https://www.revenuecat.com/docs/api-v2/subscription-transactions
