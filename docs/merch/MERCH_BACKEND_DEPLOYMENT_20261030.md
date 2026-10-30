# Merch backend deployment — 2026-10-30

The three merch migrations are installed. The checkout Edge function is deployed.
Client OTA publication and installed-device/provider transport verification remain
unfinished. Live money and payouts remain off; this is not a live commerce launch.

## Source and installed identities

PR #634 merged as `11fcc5c37e5449a108395c917f6d67d88242faf1`, with tree
`c3b2eff7c3d475aa2dd3873dc49123df9ac0adb3`, identical to validated head
`85fd908863d7f6b46a9090777eed6d4d9b13c71e`. All 13 latest checks, including
Required Validation, passed before merge. The connector assigned deployment
timestamps. This reconciliation changes filenames and their fixture references,
not SQL bytes, and does not rewrite remote migration history.

| Migration | Candidate version | Installed version | Bytes | SHA-256 |
| --- | --- | --- | --- | --- |
| creator_merch_storefront | 20261029191508 | 20261030000957 | 26430 | `0bc69c2652a0ba29ff4865d7193483bdef60038bcc870251e53369ac9326f1e4` |
| creator_merch_sku_inventory | 20261029195422 | 20261030001019 | 23951 | `914f9a879b1fff013bd0d54765643974513d439985cafad1388e53f89094c084` |
| creator_merch_product_photos | 20261029195448 | 20261030001043 | 24499 | `09977dd0f7ca6323a52b1c0e61b2c8121e452da2aabbd06405422a6d0f68ea66` |

Each history entry contains one statement holding the exact submitted file.
Independent readback at 00:11–00:13 UTC confirmed all names, bytes and SHA-256
values. History increased from 474 to 477 entries. The ordered SHA-256 of the
474 prior version/name/statements records remained
`1927c574839d457b4bf0ea8e1c10e46c74483df6bfc9ef22b0200eb937c0eb77`.
The three candidate versions are absent remotely and are not retained as duplicate
source files. No archived creator-policy prerequisites were replayed.

Original source qualification remains attached to its original source identities;
these renames do not relabel historical tests as tests of a different filename.
Fresh reconciliation validation checks exact-byte preservation and the catalog,
mutation, grant, photo and SKU fixtures with the installed filenames. Required
Validation must pass on the reconciliation head before client publication.
The five focused files passed **13/13 tests**, including both held/included Studio
catalog and mutation paths, 206 SQL mutation assertions, full-chain photo/SKU
checks and explicit-grant replay/133-table parity. No test was skipped or canceled.
These local results do not replace the pending reconciliation CI run.

## Installed backend verification

- Thirty function bodies introduced or replaced by these files match their
  source SHA-256 values exactly. The retained pre-storefront lifecycle definition,
  normalized only for its renamed function identifier, matches its preflight
  SHA-256 `a39f85bf6942b0e2fc07d23c3a815a5a01e20bfdcfbca93389163e45bd30ab69`.
- Seven expected product fields and eight order/reservation/SKU snapshot fields
  are present. All seven new named indexes are valid and ready.
- The SKU table has RLS and FORCE RLS. Anon, authenticated and service_role have
  no direct SELECT/INSERT/UPDATE/DELETE privileges on it.
- Scoped function ACLs match source: anonymous access is denied; creator/buyer
  RPCs retain their current-session checks; reservation and webhook entrypoints
  are service-only; renamed implementation helpers are inaccessible to API roles.
  The catalog/order/fulfillment RPCs also retain the source's service-role execute
  privilege; this is not described as authenticated-only.
- All scoped functions have a fixed empty search path. Five photo/reference
  triggers are enabled, and the two authenticated product-photo SELECT policies
  use the authorized published-product predicate.
- The two existing product rows remain draft/simple with zero stock/reservations
  and no attached photo. Existing order/item row counts remain four/four. No
  listings were automatically published or synthetic production users created.
- All nine monetary settings remain false. Live-money and payout kill switches
  remain off, and merch remains sandbox_only.

These are bounded catalog and history checks, not a global production audit or
evidence that real provider delivery, scanning, physical devices or shipments work.

## Checkout Edge receipt

The release coordinator deployed `stripe-merch-checkout` version **40**, ACTIVE,
preserving `verify_jwt=false` and the handler's explicit authentication/current-
session checks. Reported bundle hash:
`09ca4b3f566a515102744a65722fbc0a73cda69f18a74619250e7541350a750a`.
Independent deployed-file readback matched the three source files: the checkout
entrypoint, shared Stripe Connect helper and shared exact-subject helper. This is
Supabase code deployment, not a Stripe account/configuration change or a purchase.

## Advisor delta and remaining work

Before/after advisor counts added one intentional
[RLS-without-policy notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
for the deny-direct-access SKU table, and eleven intentional
[authenticated SECURITY DEFINER notices](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
for the scoped creator/buyer RPCs. Their grants and current-session/owner/product
authorization remain as reviewed. No other count changes were reported; existing
global warnings remain. No scoped mutable search paths were introduced.

OTA remains unpublished at this checkpoint. Canonical release tooling still needs
authenticated Expo access, matching signed binary receipts and the merged
reconciliation source. Historical Android 111/iOS 42 native-digest matches do not
replace those release requirements or prove installation.

No native multi-connection contention test, real scanner/upload/payment transport
test or physical-device smoke test was performed by this deployment verification.
Shipping ownership/costs/timing, returns/refunds, taxes and live provider readiness
remain prerequisites to live commerce.

## Recovery

No rollback was performed. Preserve migration history, orders and settlement
processing. Do not down-migrate or restore legacy checkout after durable
storefront/SKU orders exist. Use reviewed forward repairs and, if needed, a
compatible client OTA that removes exposure without disabling reconciliation.
Provider ambiguity must remain held for authoritative reconciliation; it is not
permission to restock or invent successful payment/refund outcomes.
