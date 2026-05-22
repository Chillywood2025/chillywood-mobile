# Owner Superuser, Scoped Staff, And Legal Evidence

## Current Rule
- Owner is an invisible platform-owner account, not a public creator profile.
- Owner public profile/channel/search/discovery/follow/Chi'lly Circle/chat surfaces must return unavailable or no rows to non-owner users.
- Owner platform access is explicit `owner_platform_access`; do not create fake RevenueCat state or entitlement rows.
- Admin/operator staff powers are scoped by owner-granted permissions. Broad operator role alone is not enough for moderator/admin grants.

## Scoped Staff Permissions
- `manage_moderators` is the canonical permission for adding/removing moderators.
- `moderator_grants` is accepted as an alias and normalized to `manage_moderators`.
- `admin_grants` is separate and required for Admin/operator creation/removal by non-owner admins.
- Existing Admin Staff & Roles UI remains the entrypoint; server-side RPCs enforce the scoped permission model and audit success/blocked attempts.

## Legal Evidence
- Legal Review and Evidence Export are owner-only by default.
- `legal_review` allows reason-required search/preview and legal hold placement.
- `evidence_export` allows reason-required export record creation.
- The Edge Function writes preview/export/hold records and append-only audit rows with service-role credentials kept server-side only.
- This tool must never delete evidence, chat history, or user content.
- Owner normal Legal Evidence use no longer requires a reason prompt and does not emit app-level owner audit rows unless Break Glass is active. Approved Admin legal/evidence use still requires exact grants, a reason, and audit.

## DMCA / Copyright Admin
- Owner can always access Admin DMCA.
- Approved Admin/operator users require `dmca_review`, `copyright_review`, or `legal_review`.
- Moderators and regular users are denied by server-side RLS/RPC checks.
- DMCA case records, status history, notices, content actions, counter-notices, and copyright strikes are functional case records, not owner-sensitive app-level audit rows.
- Owner normal DMCA work does not require a reason prompt unless Owner manually activates Break Glass.

## Owner/Admin Control Tools
- `admin-owner-controls` adds Audit Explorer, permission templates, temporary grant presets, Break Glass, Legal Request Intake, Owner Security, Canary Checks, and a low-risk Safety Dashboard.
- Audit Explorer hides normal owner actions unless `break_glass_active=true`.
- Permission templates grant permissions only; staff roles remain in the existing Staff & Roles flow.
- Canary checks must return pass/fail/manual-required and must not fake green status.
- `admin-owner-controls` is deployed as ACTIVE version 14 on Supabase project `bmkkhihfbmsnnmcqkoly`.
- May 21, 2026 physical Android owner-device Admin Canary proof returned `33 pass`, `0 manual`, and `0 failed`, including owner public-profile/discovery hiding, owner normal no-audit preservation, admin self-grant denial, moderator grant denial, Legal Evidence restriction, Supabase redirect proof, and proof role/grant cleanup.
- May 22, 2026 physical Android owner-device Admin DMCA/public-legal proof returned `60 pass`, `0 manual_required`, and `0 failed`, including real case detail, formal manual intake, public hosted URL reachability, public form submission through anon `submit_dmca_notice`, content action recording, strike dispute/resolve, counter-notice flow, filters/search, attachment/email/uploader status disclosure, per-content-type mutation coverage, proof-case hygiene, and unauthorized server-side denial.

## Remaining Manual / External Proof
- Attorney review remains required before public launch legal approval.
- Play Console account deletion URL/Data Safety acceptance remains external.
- Regular users must continue to prove normal subscription gates through real store/RevenueCat entitlement proof; do not fake Premium or owner access for regular users.
- Any future grant, legal, or Break Glass behavior changes must rerun real owner/admin/moderator/viewer proof and preserve server-side enforcement.
