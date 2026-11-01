# RevenueCat non-purchase lifecycle

`PRODUCT_CHANGE` can announce a deferred replacement. All public lifecycle
entry points and the authenticated webhook now retain its immutable ingress
receipt without granting the target product, changing original-transaction
bindings, creating earnings, or advancing terminal ordering. An actual effective
purchase/renewal or independently verified current-owner snapshot is required.

`SUBSCRIPTION_EXTENDED` is not a new charge. A separate service-only projector
requires an existing exact Premium owner/store/original-transaction/product/
base-plan/environment binding, newer signed event time, the same finite period
start, strictly greater future expiry, enabled matching environment rails, no
quarantine/restriction, and consistent existing nonterminal entitlement/grant/
provider evidence. It appends extension evidence and updates only that graph's
expiry and evidence pointers. It creates no purchase, grant, billing or earnings
row. Missing/ambiguous/creator-domain facts remain pending. A refund, revocation,
blocked binding or terminal watermark is never reset by an extension.

`REFUND_REVERSED` is an App Store reconciliation signal, not automatic access or
financial authority. It no longer enters the UNKNOWN terminal quarantine lane.
Its immutable event and exact available identities are retained in the private
pending reconciliation table. **An automatic provider-read reconciliation worker
and a separately proven exact refund-reversal snapshot contract are still
required**; this change does not claim to restore refunded access. Existing
current-owner snapshot projectors intentionally reject financial-terminal
bindings, and must not be bypassed by pretending this event is a renewal.

True terminal events and malformed/unknown terminal envelopes retain their
existing quarantine/dispatch behavior. No client role can execute the new
authority projector or write its private receipt table. All eight public SQL
lifecycle entry-point overloads use the same nonpurchase projector.

Validation: actual initial purchase -> extension -> duplicate -> refund ->
rejected extension full-schema test; negative owner/product/plan/environment/
period/order cases; actual webhook routing; all eight SQL overloads; retained
Google provenance suite. Tests do not qualify live store configuration.

[RevenueCat event semantics](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields)
