# Owner/Admin Tabs UI/UX Polish

Owner/Admin Command Center UI: Closed after validation. Tabs must stay production-labeled, not proof/debug-labeled. Unavailable tools are hidden or honestly disabled. Dangerous actions are visually separated and require confirmation; destructive/sensitive actions require reason and audit where supported. Search/filter surfaces must remain privacy-safe, limited, and sanitized.

Updated: June 4, 2026

This lane modernizes repeated Owner/Admin tab interactions without changing backend authority, role safety, money state, LiveKit behavior, route ownership, Player behavior, or terminology.

Latest follow-up: `docs/OWNER_ADMIN_BUTTON_FUNCTION_PROOF.md` records the June 5, 2026 button-function pass for the Staff Access and Scoped Permission Matrix controls shown in user screenshots. `Grant Role` and `Remove Role` now remain reachable above the target summary after the keyboard is dismissed, scoped permission chips show nearby feedback before `Load Current`, `Use Step 1 Target` copies the Step 1 target into Step 2, and representative chips across Support, Moderation, Live Ops, Legal, and Security/Admin were proved on the Play-installed Android device. Proof path: `/tmp/chillywood-owner-admin-button-function-proof-20260605/`.

Previous follow-up: `docs/OWNER_ADMIN_SEARCH_PERMISSION_AUDIT_HARDENING.md` records the June 5, 2026 hardening pass for search clarity, exact target summaries, scoped permission active/expired/will-change previews, audit reason confirmation copy, keyboard-safe Grant/Revoke cancel behavior, and stable test IDs. Proof path: `/tmp/chillywood-owner-admin-search-permission-audit-proof-20260605/`.

## Scope

Modernized surfaces:

- Roles & Permissions: active roster, grant/revoke role form, scoped permission matrix, Permission Templates shortcut, protected Owner rules.
- Users: staff roster drilldowns, broader user directory, Roles & Permissions shortcut.
- Permission Templates: apply/revoke form and template permission list.
- Live Cost Guard: settings and manual controls.

Reusable UI pattern added in `app/admin.tsx`:

- `OwnerAdminSection`: collapsible section wrapper with chevron, status pill, larger touch target, and accessible expanded/collapsed state.
- `OwnerAdminActionButton`: modern 44px-minimum action button with primary, secondary, danger, success, warning, ghost, loading, and disabled states.
- `OwnerQuickLinkCard`: whole-card shortcut for navigation actions such as Permission Templates and Roles & Permissions.
- `OwnerRuleList`: compact protected-rule list for Owner/Admin guardrails.
- `OwnerPermissionDraftSummary`: compact draft/grant/revoke summary chips.
- `OwnerStickyActionBar`: elevated save/reset action area for permission and template forms.

## Users And Permissions

The dense stacked-card permission editor now presents:

- compact draft summary for active, expired, unchanged, pending draft, will grant, and will revoke
- inline optional ISO expiration guidance, invalid-date error, and future-date enforcement
- audit reason required copy
- save disabled until a loaded staff account has a changed permission draft, valid expiration, and sufficient audit reason
- reset disabled until there are draft changes
- an elevated Reset Draft / Save Permissions action bar
- a whole-card Permission Templates shortcut
- a collapsible Protected Owner Rules section

The June 5 hardening pass also adds exact selected-target summaries before staff Grant/Revoke or scoped permission save. The summary shows masked target/email, short user id when loaded, current role status, selected role, permission summary, protected warning, and audit reason readiness.

Protected rules are unchanged:

- Owner records stay protected.
- Owner grant/revoke now uses the separate First Owner authority controls.
- Only First Owner can grant or revoke Owner.
- First Owner cannot remove himself as the last active Owner.
- First Owner self-step-down requires successor, password re-auth, generated single-use passcode, typed confirmation, reason, and audit.
- At least one active Owner must remain.
- Owner grants are enabled only through the First Owner authority flow.
- Admin grants require Owner or `admin_grants`.
- Moderator grants require Owner or `manage_moderators`.
- Self-grant remains blocked.
- Final Owner removal remains blocked.

## Repeated Tab Pattern

The Users directory and Permission Templates tabs now use the same collapsible section pattern so clickable areas and section boundaries are clearer. Live Cost Guard settings/manual controls also use modern collapsible sections with stronger separation for danger-gated manual controls.

## Safety

This UI lane does not change:

- backend permissions logic
- Owner/Admin protection
- First Owner controls are enabled for authenticated First Owner after validation
- Normal Owner dashboard viewing is not Break Glass
- Break Glass is documented and audited when used
- No secrets, tokens, signed URLs, raw IPs, tax IDs, bank details, or provider secrets are exposed
- protected owner rules
- role authority
- money state
- production live money
- payouts/cash-out/withdraw/transfer
- Stripe Android digital checkout policy
- LiveKit token issuer
- Watch-Party route ownership
- Live Stage route ownership
- old-room handling
- Player behavior

## Proof

Android proof path:

`/tmp/chillywood-owner-admin-tabs-ui-polish-proof-20260604/`

EAS Update:

- group `a4136d52-3ec4-4066-9e91-d8c5ae70af53`
- Android update `019e913b-800d-7c6d-8961-db106da793fc`
- runtime `1.0.0`
- Play-installed device `R5CR120QCBF`, package `com.chillywood.mobile`, versionCode `23`, versionName `1.0.0`, installer `com.android.vending`

Screenshots captured:

- Owner/Admin Users tab top
- staff roster and broader user directory modern sections
- Roles & Permissions scoped permission matrix
- Save disabled without audit reason
- disabled role action state with audit reason required
- Permission Templates shortcut
- protected Owner rows and protected-rule messaging
- Permission Templates tab
- Live Cost Guard settings/manual controls
- Money Center unchanged no-production-money posture
- post-revoke Admin denial

Temporary proof access:

- existing proof membership `39` was temporarily reactivated as Owner for Owner-only permission-editor screenshots
- membership `3` was temporarily reactivated as operator for Admin entry proof
- both proof memberships were revoked immediately after screenshots
- cleanup readback showed active UI-proof roles `0`
- active Owner count returned to `1`; active operator count returned to `2`

No screenshot artifacts are committed.

## Remaining UI Gaps

- Broader Owner/Admin tabs still have older row styling in some deep historical/foundation sections. The reusable components are now available for future targeted passes.
- True sticky-to-viewport behavior for long forms remains a future layout pass if the admin screen is split into route-level surfaces; this lane adds elevated in-section sticky-style action bars without restructuring navigation.

## Shared Pattern Extension

The follow-up Public V1 Visual Consistency And Touch Polish lane extends the same interaction principles to public/creator screens through `components/ui/app-surface.tsx`:

- modern public sections and status pills
- 44px action buttons with disabled/loading states
- whole-card quick links
- cleaner empty states
- elevated form action bars

That extension is UI-only and does not alter Owner/Admin authority, money state, LiveKit behavior, route ownership, Player behavior, or terminology. Dedicated doc: `docs/PUBLIC_V1_VISUAL_TOUCH_POLISH.md`.
