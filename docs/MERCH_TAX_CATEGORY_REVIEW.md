# Reusable merchandise tax category review

This source change supplies a normal creator/owner workflow, not a tax decision,
registration, provider setting change, or permission to activate live money.
It seeds no category, legal classification, account evidence or qualification.

## Normal workflow

1. The owner reads the actual Stripe tax-code catalog, with provider names and
   descriptions rather than memorizing opaque code IDs. The edge function is
   exact-current-owner-session restricted, uses existing server-only read-only
   observation configuration, checks the configured account, and makes only
   `GET /v1/account` and `GET /v1/tax_codes` requests. Pagination is bounded and
   explicit. Unsupported required performance-location codes cannot be selected.
2. The owner reviews an applicability description, category code, inclusive
   pricing, classification reference/reason, destination coverage reference and
   expiry. A relevant official reference can be a classification basis; the UI
   does not require buying professional advice for each listing. Unresolved
   classification/legal questions remain unresolved, not automatically approved.
3. Independently qualified provider/account/liability/US-destination evidence
   must already exist. Service-only `record_merch_tax_category_context` links
   that immutable policy to a current creator Connect account and an explicit
   independently verified reusable **inline product_data tax_code** evidence
   reference. A different SKU's proof alone does not establish this scope.
   This is a per-category/per-creator qualification, not per-listing SQL.
4. The creator selects the reviewed category. The server derives an exact
   immutable per-product qualification only if both the category and provider
   context are current. The returned `ready` means tax evidence is current;
   separate publication review, provider, legal, shipping and live switches
   remain mandatory. No money is moved by selection.
5. Unknown categories create owner-visible review requests. The owner may
   suggest a reviewed category against the exact unchanged product snapshot.
   The creator must explicitly select it; the owner does not silently classify
   or publish the creator's listing.

## Revision, revocation and privacy

- Categories and provider contexts are immutable except one-way revocation.
  A new revision supersedes the old revision. Stale owner edits fail their
  expected revision, and stale creator selections fail their product timestamp.
- Category-sensitive title/description/physical flags/variant changes invalidate
  the derived policy. Stock replenishment does not change the classification.
- Account replacement, stale account observation, liability mismatch, expired
  source evidence, context revocation and template revision/revocation close
  prospective publication/checkout. Neither owner review nor a catalog read
  produces independent provider evidence.
- Existing accepted order policy bindings and terms are never rewritten. A
  newly derived policy does not silently replace a previously accepted one.
- Owner queue uses deterministic `(created_at,id)` pagination, separates
  classification/provider/account/jurisdiction statuses, and rejects decisions
  on a changed or superseded request. Private tables have forced RLS and no
  direct API grants. Creator APIs require the exact current creator session;
  owner APIs require current owner membership and session.
- Retained brand latch precedes product lock, tax-authority lock and provider/table
  fences. Existing publication captures the category/context epoch; an authority
  change invalidates a previously displayed publication review.

## External qualification is still external

An active Stripe Tax setting, a general services default, an empty registrations
list, an owner's checkbox or this migration is **not** verified physical-merch
tax coverage. Missing evidence returns `provider_evidence_required`; it does not
fall back to zero tax, seller responsibility, a generic code, or automatic sales.
Actual registrations, legal decisions, provider configuration and activation
remain separate authorized actions. There is no provider-write endpoint here.

Provider taxonomy API reference: https://docs.stripe.com/api/tax_codes/list

## Verification

Full-schema synthetic tests cover owner/creator/service boundaries, no automatic
proof, catalog qualification, exact derivation, current accounts, revocation,
source changes, immutable accepted terms, revision races and tuple pagination.
The guarded native merchandise runner adds five independent-session blocking
schedules for category revocation/revision, source review and selection order.
PGlite's sequential fixture replay validates schedule SQL only; hosted native
PostgreSQL execution remains required evidence for actual blocking behavior.
