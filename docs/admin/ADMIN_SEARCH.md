# Admin Search

Updated: 2026-05-29

## Scope

`Search Admin` lives only in `/admin` and is visible only after the normal Admin Command Center permission checks pass. Public Explore owns public discovery search; Profile is not global user search.

## Backed Search Sources

Admin Search typeahead searches already-loaded Admin data only:

- staff/user role roster
- safety reports and DMCA cases
- Money Audit events and kill switches
- provider readiness rows
- Rachi posts and Originals
- Live Cost Guard / Live Ops rows
- legal requests
- immutable Admin audit rows

It does not add a public RPC, bypass RLS, expose provider secrets, or activate money.

## Audit Writer

Migration `202605290004_admin_search_query_audit.sql` adds:

- `admin_search_query_type(query)` for text/email/id classification
- `admin_search_mask_query(query)` for masked query previews
- `write_admin_search_audit(...)` for immutable Admin audit writes

The app calls the RPC through `_lib/adminSearchAudit.ts`.

Audit events:

- `admin_search_query`
- `admin_search_email_lookup`
- `admin_search_denied`
- `admin_search_result_opened`

Audit metadata records search scope, query type, masked query preview, query length, result count, status, and explicit `raw_query_stored=false` / `email_plaintext_stored=false` markers. Email-shaped lookups are stored only as masked previews.

## Denial And Privacy

Normal users cannot see Admin Search, call useful Admin Search paths, or read Admin audit rows. If a non-admin authenticated account calls `write_admin_search_audit`, the RPC writes a denied audit event with masked query data and returns `ok=false` / `status=denied`.

Public Explore still has no email lookup and no Admin, Money, Provider, Report, Legal, or Audit scope. Public People search blocks email-shaped queries and returns only public-safe fields.

## Proof

Android/Admin proof path:

- `/tmp/chillywood-admin-search-audit-denial-spectator-profile-proof-20260529/`

Captured proof:

- Admin Search query audit written for `Rachi`
- safe email-shaped Admin lookup audit written with masked preview
- Admin Search audit receipt visible in the Admin UI
- public Explore email-shaped query no-match UI proof

API/RLS proof:

- configured non-staff proof account had no active platform roles
- `write_admin_search_audit` returned denied with masked email-shaped query
- non-staff account saw zero Admin audit rows
- public People email-shaped query returned zero rows and no email fields
- public Rachi result remained `Official Chi'llwood`

Android normal-user Admin Search denial for the new panel remains unclaimed because the attached device session was owner/admin and there was no safe session-switch/restore path in that lane.

## Validation

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:admin-search-policy`
- `npm run guard:public-user-search-policy`
- `npm run guard:navigation-terminology-policy`
- `npm run guard:money-center-policy`
- `npm run guard:provider-readiness-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `supabase migration list`
- `supabase db lint --linked`
- `git diff --check`

## Remaining Limits

- Richer reason-required audit per sensitive Admin Search scope can be added later if product/security policy requires it.
- Runtime Android normal-user panel denial should be recaptured when a safe normal-user session can be restored without disrupting the owner/admin proof session.
