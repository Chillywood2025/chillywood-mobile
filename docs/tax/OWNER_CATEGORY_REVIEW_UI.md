# Owner category review UI

## Source scope

Feature registry: `creator-money-ledger` (Owner/Admin money surfaces), with
`payouts-stripe-connect` as a read-only evidence dependency. Route: `/admin`,
Owner/Admin Money Center. Components: `owner-tax-category-review`; helpers:
`ownerMerchTaxReview`, account-session authority and account-bound transport.
No native module or payment-rail change. Android, iOS and web share this UI.

The owner reviews reusable category revisions and suggests a reviewed category
for an unknown creator item. The creator must explicitly select it afterwards.
Classification references may be relevant official guidance or another
documented basis; the UI does not require purchasing professional services per
listing. It never decides an unknown legal question or treats a provider code
as registration, exemption, provider approval or checkout permission.

## Invariants and verification

- Only the currently verified owner, active exact account session and focused
  screen can read or submit. Server role/session checks remain authoritative.
- Leaving, account replacement (including A → B → A), owner revocation and
  restore-only quarantine retire requests and drafts; stale closures cannot
  initiate or publish an action.
- Reads have loading, empty, error and retry states. Mutations are single-flight;
  revision conflicts/unknown results require a fresh read, never blind replay.
- Codes come from the server-observed provider catalog, with friendly names and
  descriptions. No classification or qualification is seeded by the client.
- Category approval and separate provider/account/jurisdiction evidence are
  displayed independently. Financial switches are untouched.
- Explicit labels, selected/disabled states, live-region notices and 44-point
  actions support assistive technology. Long content wraps in the host scroll.

Mounted source tests cover account/session/focus changes, double taps, stale
responses, changed revisions, denials, cancellation, empty/loading/retry, and
the shared skyline-glass tokens. These do not prove provider reachability,
physical-device behavior, VoiceOver/TalkBack or production migration state.
Installed golden cases: Owner opens Money Center, creates/revises a reviewed
category from verified catalog data, reviews an unknown request, then creator
explicitly selects it; back/refocus and account replacement retire old data.

Rollback is removal of this UI entrypoint; immutable server review history is
preserved. No rollout, release or live-money activation is part of this source
change.
