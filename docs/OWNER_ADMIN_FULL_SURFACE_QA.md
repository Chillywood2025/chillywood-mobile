# Owner/Admin Full Surface QA

Date: 2026-06-05

Lane: Owner/Admin full-surface proof and staff-access stabilization

Follow-up:

`docs/OWNER_ADMIN_SEARCH_PERMISSION_AUDIT_HARDENING.md` supersedes this doc for the latest search, exact-targeting, scoped-permission preview, audit reason, keyboard, and stable test-ID details. The follow-up proof path is `/tmp/chillywood-owner-admin-search-permission-audit-proof-20260605/`, EAS Update group `fda01165-2608-4c82-8079-2436f429ad74`, Android update `019e99a0-3b76-7475-a129-cf3d787cd4f1`.

Button-function follow-up:

`docs/OWNER_ADMIN_BUTTON_FUNCTION_PROOF.md` records the later June 5 proof for the user-reported buttons in the Staff Access and Scoped Permission Matrix screenshots. It fixed the Step 1 `Grant Role` / `Remove Role` reachability problem by moving those actions above the exact-target summary, added nearby scoped-permission chip guidance, added `Use Step 1 Target`, renamed the matrix chip `Permission Templates` to `Template Access`, and proved representative chips across Support, Moderation, Live Ops, Legal, and Security/Admin. Proof path: `/tmp/chillywood-owner-admin-button-function-proof-20260605/`; final EAS Update group `4d2e19a9-80c2-4326-a446-ff4bb481700d`; Android update `019e99d5-c372-780a-99b7-8d8f5c7bd028`.

Proof path:

```text
/tmp/chillywood-owner-admin-full-surface-proof-20260605/
```

Final OTA used for device proof:

- EAS Update group: `94ea10b5-c0ff-459d-b669-dc46555dc287`
- Android update: `019e9989-5e59-71f3-a89b-bf74c7a37ed2`
- Runtime: `1.0.0`
- App package: `com.chillywood.mobile`
- Device: `R5CR120QCBF`
- Installer: `com.android.vending`
- Version: `1.0.0`
- Version code: `25`

## Scope

This pass focused on the user-reported Owner/Admin problem: adding Admin access was confusing, there appeared to be multiple ways to do it, some buttons looked inactive or did not explain what was missing, and scoped permissions were hard to reach.

The pass covered:

- Admin main tabs.
- Admin search scopes and results.
- Regular-user search through the broader backed user read model.
- Roles & Permissions.
- Grant / Revoke Staff Access.
- Scoped Permission Matrix.
- Permission Template presets.
- Collapsible Owner/Admin sections.
- Role confirmation modal.
- Staff-role audit reason requirements.
- Temporary upgraded proof account access and post-revoke denial.

## Product Decision

There is one primary staff role path:

1. `Step 1: Grant / Revoke Staff Access`
   - Adds or removes Admin or Moderator through the existing audited backend path.
   - The generic panel does not grant Owner.

2. `Step 2: Scoped Permission Matrix`
   - Loads an existing staff account and edits scoped permissions for that staff role.
   - It is not a second way to add Admin.

Permission templates remain available as optional presets for scoped permissions only. They do not create Admin, Moderator, Owner, payout, room, or publish authority.

## Fixed

`app/admin.tsx` now makes the highest-risk Owner/Admin controls active and guarded instead of validation-disabled:

- `Grant Role` remains tappable and validates email, audit reason, and selected role authority before opening confirmation.
- `Remove Role` remains tappable and validates email, audit reason, and selected role authority before opening confirmation.
- Grant and Remove both open an explicit confirmation modal before any backed staff role action.
- Modal cancel/apply paths dismiss the Android keyboard so the action row does not get covered.
- Staff-role action feedback is rendered inside the staff access panel, not only higher on the page.
- `Load Current`, permission chips, `Reset Draft`, and `Save Permissions` stay reachable and explain missing prerequisites.
- Permission chips no longer use disabled-looking visual styling before a current permission set is loaded.
- Permission-template buttons are active/guarded and show validation feedback instead of acting like a second disabled add-admin path.
- Owner/Admin collapsible section headers have stable proof hooks.
- Admin search now includes regular user-directory rows from the backed user read model, not only Owner/Admin/Moderator role rows.

Backend authority remains unchanged:

- Owner records remain protected.
- Generic staff panel does not grant Owner.
- Admin grants still require Owner or `admin_grants`.
- Moderator grants still require Owner or `manage_moderators`.
- Scoped permission editing remains Owner-only in the current backend.
- Self-grant and final Owner protections remain backend-enforced.

## Proof Hooks Added

Stable test IDs and accessibility labels now cover:

- `admin-section-*`
- `admin-main-tab-*`
- `admin-user-search-input`
- `admin-user-search-submit-button`
- `admin-user-search-clear-button`
- `admin-user-search-result-row`
- `admin-user-search-empty-state`
- `admin-user-search-error-state`
- `admin-search-scope-*`
- `admin-search-result-chip-*`
- `admin-search-clear-recent-button`
- `admin-search-recent-*`
- `admin-search-result-*`
- `admin-selected-user-summary`
- `admin-staff-role-email-input`
- `admin-staff-role-target-admin`
- `admin-staff-role-target-moderator`
- `admin-staff-role-reason-input`
- `admin-staff-grant-button`
- `admin-staff-revoke-button`
- `admin-staff-role-action-notice`
- `admin-staff-permission-email-input`
- `admin-staff-permission-load-button`
- `admin-staff-permission-*`
- `admin-staff-permission-action-notice`
- `admin-scoped-permission-matrix`
- `admin-permission-template-shortcut`
- `admin-permission-active-summary`
- `admin-permission-expired-summary`
- `admin-permission-will-grant-summary`
- `admin-permission-will-revoke-summary`
- `admin-permission-expiration-input`
- `admin-permission-audit-reason-input`
- `admin-permission-reset-button`
- `admin-permission-save-button`
- `admin-role-confirm-modal`
- `admin-staff-grant-confirm-modal`
- `admin-staff-revoke-confirm-modal`
- `admin-staff-confirm-cancel-button`
- `admin-staff-confirm-submit-button`
- `admin-protected-owner-rules-section`
- `admin-permission-audit-section`
- `admin-post-revoke-denial-screen`

## Device Proof

Captured screenshots/XML:

- Initial Admin protected denial before temporary access.
- Admin Command Center after temporary upgraded proof access.
- Admin tab captures for Overview, Money Center, Users, Reports, Live Ops, Rachi, Legal, System, Owner Security, Roles, Permission Templates, Live Cost Guard, Audit, Audit Explorer, Break Glass, and Canary.
- Staff Access panel with active guarded Grant/Remove controls.
- Grant Role missing-input feedback.
- Grant Role confirmation modal opened and cancelled.
- Remove Role confirmation modal opened and cancelled.
- Admin search input and Users scope.
- Admin search returning `Directory user` / `Regular user` rows, not only staff-role rows.
- Scoped Permission Matrix expanded with permission chips and local guard notice.
- Post-revoke Admin denial after temporary access cleanup.

The temporary proof Owner role was revoked after proof:

- temporary role active count: `0`
- active temporary proof roles: `0`
- active Owner count remained: `1`
- post-revoke `/admin` screenshot shows the account no longer has an active admin role.

## Remaining Owner/Admin Gaps

- Destructive role writes were intentionally not submitted from the UI except the temporary proof role activation/revocation through the approved proof path.
- Scoped permission save was not submitted because the lane only needed to prove reachability, guard feedback, and that permission editing is clearly Step 2 after staff role setup.
- Additional full data-row drilldowns can be repeated with a permanent Owner/Admin account, but the confusing add-admin path and regular-user search gap are fixed.

## Safety

This pass did not change:

- production money state
- payouts
- cash-out, withdrawal, or transfer
- Stripe Android digital checkout
- LiveKit token issuer
- route ownership
- Player playback behavior
- Premium gates
- content safety gates
- Owner/Admin backend authority
- self-grant protection
- final Owner protection
