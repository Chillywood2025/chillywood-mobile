# Checkout readiness and unallocated closure candidate

This is a fresh, inactive successor candidate. It preserves the original protocol3 checkpoint and the separately frozen retained-plan lifecycle checkpoint. It does not authorize a production migration, function replacement, provider operation, or release.

Use the lifecycle candidate's `lifecycle.sql` and `provisioning.sql`, substitute this directory's `commands.sql` for the earlier commands, and add `abandon.sql` after commands. The unchanged raw-receipt and access sources remain required. Do not install multiple versions of the same commands. The complete source order must be reviewed as one fresh-install profile before activation.

The combined managed profile also requires the backend-owned `paid-video-install-context-v2.sql`, its bounded grant/revoke pair, and `paid-video-gateway-v2.sql`. Install context after the baseline graph/delivery files; use grant/revoke around the frozen media/upload/commands group and again around access/gateway, then the baseline finalizer. Those guarded files supply the new public wrapper owner's temporary CREATE permission and abort commit when final revocation or disabled gateway/lifecycle is missing. The separate modeled non-superuser test uses this exact arrangement; simply concatenating the earlier superuser-native source order is insufficient.

## Truthful preparation readiness

`offer.data.preparationAllowed` uses the same private helper as `prepare`. It checks the current active generation, qualified native profile and connection, enabled isolated controls, exclusive provider scope, current buyer and Premium creator authority, real-money-off switches, and exact current media qualification and route. The existing shared quote/catalog/product checks run for both commands. Known authority failures return false for the read-only offer; contention or unknown errors remain errors. Preparation rechecks authority and the exact immutable quoted asset before inserting its intent.

This flag only describes current preparation eligibility. It reserves no provider object or slot, admits no SDK call, and cannot replace allocation, provider registration, one-use claim, or raw receipt verification. History and recovery remain readable while initiation is inactive.

## Explicit closure before allocation

The new command is `abandon` on the `isolated-paid-video-checkout-v3` envelope, routed exclusively to the additive `public.isolated_paid_video_abandon_v3` RPC. It accepts the same six outer RPC arguments as checkout. Its exact payload is:

```text
{originalRequestId, originalSessionId, intentId, expectedQuote}
```

The current authenticated actor must own the immutable original preparation, session, native configuration and complete quote. A current session can differ from the original session. Under the intent's nonblocking lock, the server requires no plan, allocation, dispatch attempt, dispatched marker or receipt. It then records an immutable tombstone and changes this prepared/expired intent to expired. V3 plan and allocation insert guards use that same lock and reject a retained tombstone. Any allocated, ambiguous, mismatched or unknown attempt remains unresolved; this action cannot cancel a provider operation.

Successful `data` is exactly:

```text
{
  intent: <existing history shape, state expired, receipt null, grantId null>,
  closure: {
    id, originalRequestId, originalSessionId, configurationDigest, closedAt,
    kind: 'unallocated_preparation', allocationAbsent: true, dispatchAbsent: true
  },
  replayed: boolean
}
```

Repeated matching acknowledgments return the same tombstone. Reusing an action request with different arguments or session conflicts; a new authenticated session can use a new request to read the existing exact closure. Prepare replay and recovery keep the original immutable quote and expired state. Cross-profile recovery cannot adopt the preparation because it filters the original configuration digest. Raw expiry, a client exception, a failed RPC, or an SDK result alone is never a closure acknowledgment.

The journals are private, force RLS, and reject updates, deletes and truncation. No client/operator receives a normalized receipt setter, hold-clearer, provider cancellation capability, payout authority or live-money control.

## Verification limits

`../../tests/test-store-v3-checkout-recovery.native.mjs` runs the actual SQL and source parsers against disposable PostgreSQL17.6, including both allocation/closure orders, SDK claim collision, replay/session/configuration drift, truthful readiness failures and every retained-plan lifecycle control. Fixtures explicitly synthesize provider APIs, credentials, storage and signed scan facts. The short acceptance window is set before source SDK admission; retained windows are never rewritten. Actual provider/native/app delivery and deployment are separate prerequisites. The total32 retained provider-plan ceiling remains unchanged.

`../../tests/test-store-v3-checkout-recovery-managed.native.mjs` additionally installs the combined profile as a modeled NOSUPERUSER owner, checks finalized table/helper/public ACLs, and runs the actual public preparation/closure/recovery functions. Private core authoring is used only to seed synthetic media for that permission test; it does not prove the stricter public upload receipt path or HTTP delivery. The gateway remains disabled in this fixture. Its readiness flag currently covers the original media/S3 qualification boundary; the combined activation profile must additionally bind preparation to the stronger gateway control and verified upload receipt before treating it as full delivery readiness.
