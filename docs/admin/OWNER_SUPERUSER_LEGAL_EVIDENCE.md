# Owner Superuser, Scoped Staff, And Legal Evidence

## Current Rule
- Owner is an invisible platform-owner account, not a public creator profile.
- Owner/Admin, Legal, DMCA, moderation, and security UI must follow `docs/APP_UI_UX_RULES.md`: command-center quality, compact production layouts, real states, exact disabled reasons, no dead controls, and no copy implying Owner normal work requires reason prompts or owner-sensitive app-level audit.
- Owner public profile/channel/search/discovery/follow/Chi'lly Circle/chat surfaces must return unavailable or no rows to non-owner users.
- Owner platform access is explicit `owner_platform_access`; do not create fake RevenueCat state or entitlement rows.
- Admin/operator staff powers are scoped by owner-granted permissions. Broad operator role alone is not enough for moderator/admin grants.

## Scoped Staff Permissions
- `manage_moderators` is the canonical permission for adding/removing moderators.
- `moderator_grants` is accepted as an alias and normalized to `manage_moderators`.
- `admin_grants` is separate and required for Admin/operator creation/removal by non-owner admins.
- Existing Admin Staff & Roles UI remains the entrypoint; server-side RPCs enforce the scoped permission model and audit success/blocked attempts.

## Legal Evidence
- Owner can always access Legal Intake and Legal Evidence.
- Approved Admin/operator Legal Evidence access requires exact scoped permissions. `legal_review` or `evidence_preview` allows reason-required preview/search, `evidence_export` allows reason-required export record creation, `legal_hold` allows reason-required hold placement, and `legal_ops` covers the full scoped legal workflow.
- Legal Intake is part of the single top-level Legal Admin tab, not a separate top-level Admin tab.
- Legal Intake stores legal request records with status, target links, notes, evidence links, exports, holds, and timeline/history. These are functional legal case records, not owner-sensitive app-level audit rows.
- The Edge Functions write legal request events plus preview/export/hold records, with service-role credentials kept server-side only.
- This tool must never delete evidence, chat history, or user content.
- Owner normal Legal Evidence use no longer requires a reason prompt and does not emit app-level owner audit rows unless Break Glass is active. Approved Admin legal/evidence use still requires exact grants, a reason, and audit.

## DMCA / Copyright Admin
- Owner can always access Admin DMCA.
- Approved Admin/operator users require `dmca_review`, `copyright_review`, or `legal_review`.
- Moderators and regular users are denied by server-side RLS/RPC checks.
- DMCA case records, status history, notices, content actions, counter-notices, and copyright strikes are functional case records, not owner-sensitive app-level audit rows.
- Owner normal DMCA work does not require a reason prompt unless Owner manually activates Break Glass.

## Owner/Admin Control Tools
- `admin-owner-controls` adds Audit Explorer, permission templates, temporary grant presets, Break Glass, the consolidated Legal tab, Owner Security, Canary Checks, and a low-risk Safety Dashboard.
- Audit Explorer hides normal owner actions unless `break_glass_active=true`.
- Permission templates grant permissions only; staff roles remain in the existing Staff & Roles flow.
- Canary checks must return pass/fail/manual-required and must not fake green status.
- `admin-owner-controls` is deployed as ACTIVE version 20 on Supabase project `bmkkhihfbmsnnmcqkoly`; `admin-legal-evidence` is ACTIVE version 7.
- May 21, 2026 physical Android owner-device Admin Canary proof returned `33 pass`, `0 manual`, and `0 failed`, including owner public-profile/discovery hiding, owner normal no-audit preservation, admin self-grant denial, moderator grant denial, Legal Evidence restriction, Supabase redirect proof, and proof role/grant cleanup.
- May 22, 2026 physical Android owner-device Admin DMCA/public-legal proof returned `60 pass`, `0 manual_required`, and `0 failed`, including real case detail, formal manual intake, public hosted URL reachability, public form submission through anon `submit_dmca_notice`, private evidence attachment upload/access denial, uploader counter-notice self-service/other-user denial, content action recording, strike dispute/resolve, Admin counter-notice flow, filters/search, email-intake mode disclosure, per-content-type mutation coverage, proof-case hygiene, and unauthorized server-side denial.
- May 22, 2026 physical Android owner-device Legal Intake / Legal Evidence closeout proof returned `65 pass`, `0 manual_required`, and `0 failed`, including the one-top-level-Legal navigation, Legal Intake inside Legal, legal request list/create/open/status/timeline/evidence linkage, owner no-reason normal intake, scoped Admin preview/export/hold enforcement, ungranted Admin/moderator/viewer denial, admin self-grant denial, proof grant cleanup, and Legal Evidence target-matrix coverage without LiveKit or remediation actions.

## Remaining Manual / External Proof
- Attorney review remains required before public launch legal approval.
- Play Console account deletion URL/Data Safety acceptance remains external.
- Regular users must continue to prove normal subscription gates through real store/RevenueCat entitlement proof; do not fake Premium or owner access for regular users.
- Any future grant, legal, or Break Glass behavior changes must rerun real owner/admin/moderator/viewer proof and preserve server-side enforcement.
