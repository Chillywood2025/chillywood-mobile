# Brand expiry: acknowledged deletion and observed absence

This source change does not qualify a provider, deploy a worker, enable expiry,
or assert physical or backup erasure. The existing exact-version qualification,
720-hour clock, clean byte receipt, legal holds, references, guard parity,
generation binding and permanent key nonreuse remain mandatory.

## One dispatch, then observation

The service-only prepare RPC reruns the existing guarded claim reader under the
same retention lock. Only the first confirmed immutable dispatch-intent insert
grants one DELETE authorization. A competing caller, an existing intent,
missing metadata or a prior same-claim acknowledgement is observation-only.
The intent is not an acknowledgement. It cannot be updated, removed or truncated
to manufacture a retry. A failed or uncertain prepare response never dispatches.

The adapter records a successful provider acknowledgement before observation.
Crashes after dispatch or acknowledgement-write failures retain the intent.
Even a crash before the actual dispatch can leave an intent with bytes present;
that case requires explicit operator reconciliation, not an automatic retry.
No elapsed time, hourly batch selection or pending GET grants a second DELETE.
Old claims are seeded with `legacy_unknown_history` intents because missing
results cannot prove that a legacy process never dispatched.

## Strict observation contract

Authenticated metadata and current full-download endpoints must both return
HTTP 400 or 404 with completed, bounded JSON containing an exact allowlisted
missing code (`NoSuchKey`, `NoSuchObject`, `not_found`). An optional statusCode
must also be 400/404. Arbitrary 400/404, permission errors, malformed, oversized
or incomplete bodies, network errors and timeouts never prove absence.

The version HEAD is diagnostic: 400 is inconclusive, 404 is supporting negative
evidence. Other HEAD results keep the observation pending. HEAD alone never
establishes absence. A current GET 200 always remains pending, regardless of age.
Successful media bodies are cancelled without buffering. Error bodies are
limited to 64 KiB and 15 seconds; destinations, routes, redirects and timeouts
remain restricted. No raw body, token, key or provider payload is logged.

The disposable two-file observation saw an acknowledged DELETE followed by a
current GET 200, then later structured missing metadata and current GETs. This
establishes only those fixture observations, not a cache root cause, a universal
convergence bound, provider qualification or permission to ignore a current 200.

## Deployment prerequisite

Deployment is separate. Quiesce expiry and wait for every old invocation to
finish before applying the migration; the migration refuses enabled Brand
expiry. Deploy all callers using the intent protocol before any later separately
approved activation. Old binaries do not obey the marker, so mixed-version
execution is not safe. Never reset existing claims, intents or results.

The later deployment approval must explicitly include the new private intent
table, the updated guarded reader, and service-only grants for both
`prepare_platform_brand_retention_dispatch` and
`prepare_platform_brand_retention_batch_dispatch`. The batch wrapper rechecks
the existing global/batch settings and dispatch fence immediately before the
same single-asset intent authorization. There is no schedule or enablement change.

Offline tests cover actual response shapes, bounded streams and read-only
convergence. Native PostgreSQL CI uses independent backends and an observed lock
queue to require exactly one dispatch authorization, and rejects a deliberately
unsafe replay implementation in a disposable local clone. No test contacts a
provider or creates production qualification evidence.

The native harness preserves and explicitly verifies Storage's direct-SQL
deletion prohibition. It therefore does not exercise metadata disappearance on
native Storage. Missing-metadata recovery semantics are covered by the migrated
SQL fixture separately; the bounded provider test supplies the actual observed
missing-response behavior. Neither substitutes for unperformed native actions.
