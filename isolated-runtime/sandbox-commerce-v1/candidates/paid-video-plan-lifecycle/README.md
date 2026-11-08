# Retained-plan lifecycle candidate

This is a separate, inactive **fresh-install substitute** for protocol3 paid-video admission. It is not a migration or a production cutover plan. The frozen protocol3 checkpoint remains unchanged. Do not install these commands or provisioning definitions alongside the frozen definitions, use `CREATE OR REPLACE` on a running lane, or inspect deployed definitions to construct a replacement.

In the existing inactive install order, install the frozen protocol3 core, then `lifecycle.sql`, this directory's `commands.sql` and `provisioning.sql`, followed by the frozen protocol3 receipts and paid-video access sources. All qualification and activation prerequisites of the original lane remain required. No installer, project, provider credential, native configuration, or live-money control is changed here.

## Meaning of retirement

Every immutable plan has a separate state: `active`, then `draining`, then `retired`. A new allocation enrolls its plan automatically. The transition journal and request journal are immutable; there is no reactivation, deletion, force-complete, or hold-clearing operation.

`max_active_plans` limits active plus draining plans. A separate **32-plan total retained ceiling** still limits the dedicated provider project. Retiring a plan can free one local active slot; it does not delete its Offering, Package, original receipt identity, consumed permit, or unknown outcome. It does not prove a provider call completed or stopped. All old objects must remain recognizable in subsequent inventory, and any unresolved or foreign object still holds admission.

The operator-only functions are:

```sql
test_store_v3_plan_lifecycle_read(plan_uuid)
test_store_v3_retire_plan(plan_uuid, 'drain' | 'retire', request_uuid, expected_revision)
```

New POST permits, new SDK claims, and these transitions share nonblocking project-then-plan fences. Draining captures a fixed horizon covering every already consumed ticket, existing work lease, and SDK purchase-acceptance window. Before that horizon, `retire` records a `waiting` result. Replaying that exact request returns the retained outcome without another mutation; a later attempt requires a new request UUID with the current revision. Changed arguments for an existing UUID conflict. Late GET reconciliation does not extend the captured horizon indefinitely.

SDK cancellation, SDK failure, and releasing a buyer reservation do not shorten that horizon. Previously admitted work may still complete. No new POST or SDK claim is admitted after drain. Existing SDK-claim replay returns retained status without another dispatch permit.

Encrypted provider evidence, late GET bindings, raw receipt intake, grants, holds, refunds, transfers, and current-access checks remain tied to the original plan after retirement. A receipt for a purchase inside its original acceptance window can still settle after retirement. A purchase outside that window cannot move to a newer allocation. Current valid access does not depend on the plan being active; current receipt, grant, media, lifecycle, policy and hold checks still apply.

## Local evidence and remaining prerequisites

`../../tests/test-store-v3-lifecycle.native.mjs` installs these candidate sources into a disposable PostgreSQL17.6 cluster with TCP disabled. Its provider API, keys, catalog qualification, storage routes and moderation records are explicitly synthetic. The short SDK-window case sets an eight-second fixture intent deadline **before** the actual source claim; it never rewrites an admitted acceptance window. Production preparation remains fifteen minutes. The frozen checkpoint's actual scanner proof remains separate.

This candidate does not qualify RevenueCat inventory quotas, Offering/Package archival or deletion, delayed provider commit behavior, cached native Package behavior, authenticated provider HTTP, or a deployed application. The total32 ceiling must remain until separately qualified provider retirement and inventory semantics support another reviewed design. Normal documented Dashboard TEST events can contain economic fields and may still produce a hold under the frozen conservative probe parser; this candidate does not broaden that parser.

No production or provider action, deployment approval, release approval, or maintenance-window authorization is implied by these files or their tests.
