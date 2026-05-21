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

## Owner/Admin Control Tools
- `admin-owner-controls` adds Audit Explorer, permission templates, temporary grant presets, Break Glass, Legal Request Intake, Owner Security, Canary Checks, and a low-risk Safety Dashboard.
- Audit Explorer hides normal owner actions unless `break_glass_active=true`.
- Permission templates grant permissions only; staff roles remain in the existing Staff & Roles flow.
- Canary checks must return pass/fail/unknown and must not fake green status.

## Manual Proof Required
- Non-owner cannot view or discover the Owner account through public surfaces.
- Owner can access their own account/profile area and premium/studio/live/admin tools.
- Regular users still hit normal subscription gates.
- Authorized admins can still add/remove moderators through the existing flow only after `manage_moderators`.
- Admin legal actions require a reason, write audit, and expose no secrets to the mobile app.
- Owner Break Glass activation and admin sensitive-action denial/allow proof must be rerun with real accounts after deployment.
