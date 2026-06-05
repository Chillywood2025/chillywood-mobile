# Owner/Admin Search Permission Audit Hardening

Date: 2026-06-05

Lane: Owner Admin Search And Permission Audit Hardening

Proof path:

```text
/tmp/chillywood-owner-admin-search-permission-audit-proof-20260605/
```

## Build And Device

- Starting HEAD: `0e4c915`
- EAS Update group: `fda01165-2608-4c82-8079-2436f429ad74`
- Android update: `019e99a0-3b76-7475-a129-cf3d787cd4f1`
- Runtime: `1.0.0`
- Device: `R5CR120QCBF`
- Package: `com.chillywood.mobile`
- Version: `1.0.0`
- Version code: `25`
- Installer: `com.android.vending`

## Scope

This lane hardened the existing Owner/Admin staff-control surface. It did not rewrite the role system, change backend authority, add a new role model, or activate money controls.

The work focused on:

- Search result clarity.
- Exact user targeting before staff actions.
- Staff Grant/Revoke confirmation clarity.
- Scoped permission active/expired/draft previews.
- Required audit reason visibility.
- Recent audit/readout clarity.
- Stable proof hooks for future device and Firebase/Maestro checks.
- Keyboard behavior around confirmation and lower action rows.

## Search Improvements

Admin search now exposes stable user-search controls:

- `admin-user-search-input`
- `admin-user-search-submit-button`
- `admin-user-search-clear-button`
- `admin-user-search-result-row`
- `admin-user-search-empty-state`
- `admin-user-search-error-state`

Device proof captured a regular directory result with `Directory user` and `Regular user` labels, proving search finds normal users and not only Owner/Admin/Moderator role rows. Staff-linked rows remain distinguishable with Owner/Admin-only or staff-linked status copy.

The clear-search action was captured and safely resets the visible search state. No-results proof shows `No admin matches` with non-scary retry copy and a masked search audit readout.

## Exact Targeting

Before Grant, Revoke, or scoped permission save, the UI now shows an exact target summary through `admin-selected-user-summary`.

The summary includes:

- Target.
- Email or safe masked identifier.
- Short user id when loaded.
- Current role status.
- Selected role.
- Permission summary.
- Protected Owner warning.
- Audit reason readiness.

The confirmation modal repeats the action and audit reason. Backend final Owner, self-grant, and authority checks remain server-enforced.

## Staff Access Flow

Staff access remains one clear flow:

1. `Step 1: Grant / Revoke Staff Access`
2. `Step 2: Scoped Permission Matrix`

Permission Templates are presets only. They do not create Admin, Moderator, or Owner roles.

Grant/Revoke controls are active and guarded:

- `admin-staff-grant-button`
- `admin-staff-revoke-button`
- `admin-staff-grant-confirm-modal`
- `admin-staff-revoke-confirm-modal`
- `admin-staff-confirm-cancel-button`
- `admin-staff-confirm-submit-button`

Device/Maestro proof opened and canceled both Grant and Revoke confirmation modals. No grant or revoke action was submitted from the UI during this proof.

## Scoped Permission Matrix

The scoped permission editor has stable proof hooks:

- `admin-scoped-permission-matrix`
- `admin-permission-template-shortcut`
- `admin-permission-active-summary`
- `admin-permission-expired-summary`
- `admin-permission-will-grant-summary`
- `admin-permission-will-revoke-summary`
- `admin-permission-expiration-input`
- `admin-permission-audit-reason-input`
- `admin-permission-save-button`
- `admin-permission-reset-button`

The preview separates:

- Active.
- Expired.
- Unchanged.
- Pending Draft.
- Will Grant.
- Will Revoke.

Expired grants are described as filtered out by the backed permission reader and not counted active. Past expiration values are blocked with inline copy: `Expiration must be in the future, or leave this blank.`

## Audit Reason And Audit Trail

Audit reason is required for staff Grant, Revoke, and scoped permission save. The reason status appears in the target summary and confirmation modal.

Recent audit/history readout is backed where rows are returned. If a slice has no rows, the UI says audit history is not available there yet and does not fake rows.

Relevant proof hooks:

- `admin-permission-audit-section`
- `admin-protected-owner-rules-section`

## Keyboard Proof

Keyboard screenshots were captured around Step 1 and Step 2 fields. Maestro proof used stable IDs to fill the staff email and reason fields, opened Grant/Revoke confirmation modals, canceled them, and captured the post-cancel state.

Result:

- Confirmation cancel closes the modal.
- The keyboard does not remain over the lower Admin action row.
- Grant/Revoke action buttons remain visible and reachable after cancel.

## Safety Proof

Temporary proof Owner role `39` was reactivated only for screenshots and then revoked.

Final remote readback:

- Active temporary proof roles: `0`
- Active Owner count: `1`
- Production-enabled creator configs: `0`
- Payout-enabled creator configs: `0`
- Payable/paid money-access rows: `0`
- Proof role status: `revoked`

Post-revoke `/admin` denial was captured with `admin-post-revoke-denial-screen`.

## No-Change Boundaries

This lane did not change:

- Backend authority rules.
- Owner protection.
- Self-grant blocking.
- Final Owner protection.
- Permission Template authority.
- Production money state.
- Payouts.
- Cash-out, withdrawal, or transfer.
- Payable creator balance.
- Stripe Android digital checkout.
- LiveKit token issuer.
- Watch-Party Live route ownership.
- Live Watch-Party / Live Stage route ownership.
- Party Room behavior.
- Old-room handling.
- Player playback behavior.
- Premium gates.
- Content safety.

## Remaining Gaps

- Destructive staff writes were not submitted from the UI. The proof intentionally opened and canceled confirmation modals only.
- Scoped permission save was not submitted because this lane was UI hardening and proof-hook coverage, not a backend role-write proof lane.
- Future full-surface sweeps can use the stable IDs added here to automate deeper Owner/Admin tabs without relying on coordinate taps.
