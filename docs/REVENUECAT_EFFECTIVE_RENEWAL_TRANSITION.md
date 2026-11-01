# Effective Premium SKU renewal

The November 1 hosted pgTAP run correctly exposed obsolete test assumptions: `SUBSCRIPTION_PAUSED` schedules a Google pause, and `PRODUCT_CHANGE` may announce a future replacement. Neither event is an effective purchase or financial terminal.

Correcting those fixtures exposed a separate implementation gap: a real changed-SKU `RENEWAL` was rejected by the retained original-transaction validator. The old change path accepted only the literal scheduled event type.

The forward migration stages the existing transaction-local product-transition marker only for a **new, effective RENEWAL** of an exact existing active/retained finite generation. Provider, user, environment and original transaction remain locked and immutable. The paid period must have begun, follow the prior authority watermark, remain finite, and carry a positive amount and valid immutable payload hash. Changed catalog identity alone, a scheduled notice, stale/future period, uncancellation, duplicate or financial-terminal binding cannot stage the marker.

The two retained validators recognize that exact internal scope without relabeling the event: it remains `RENEWAL` in immutable receipts, ordering and downstream projection. Existing catalog, mapping, store tuple, currency, period, user restrictions, quarantine, financial rails and event identity checks still execute. The existing finalizer clears the marker and verifies the exact new binding. Any exception rolls back the scope with the transaction. Direct API access to the predicate or marker mutation is not granted.

## Regression evidence and limits

- Google Restore pgTAP file: scheduled-pause no-op and actual later expiration, while genuine refund/revocation and stale/identity/quarantine/financial-rail controls remain intact (108 assertions).
- Fresh-generation pgTAP file: scheduled product-change no-op, effective Google/App Store renewal, original generation/duplicate/hash/stale Restore/financial terminal controls, plus stale/future/non-renewal/financial-terminal SKU rejection and private-scope privileges (81 assertions).
- Local execution replays the full schema in PGlite and evaluates the SQL assertions using local assertion-function substitutes. This is **not hosted native pgTAP or independent-session concurrency proof**. Exact-head hosted Required Validation must still run the unchanged pgTAP implementation against PostgreSQL before merge.
- No provider configuration, store purchase, entitlement on a real account, deployment or money switch is changed by this source work.
