# Owner/Admin Button Function Proof

Date: 2026-06-05

Lane follow-up: Owner/Admin button reachability and scoped-permission chip proof

Proof path:

```text
/tmp/chillywood-owner-admin-button-function-proof-20260605/
```

## Build And Device

- Starting HEAD: `a43b1dc`
- First attempted EAS Update group: `a04341aa-9021-4c38-ab16-b0c725f7cf02`
- First attempted Android update: `019e99ce-8bc5-71c8-a1e9-f99f9c6cdb12`
- Final EAS Update group: `4d2e19a9-80c2-4326-a446-ff4bb481700d`
- Final Android update: `019e99d5-c372-780a-99b7-8d8f5c7bd028`
- Runtime: `1.0.0`
- Device: `R5CR120QCBF`
- Package: `com.chillywood.mobile`
- Version: `1.0.0`
- Version code: `25`
- Installer: `com.android.vending`

## What Was Found

The user-provided screenshots showed two concrete Owner/Admin issues:

- `Grant Role` and `Remove Role` could be pushed below the selected-target summary after entering email and audit reason, making them feel dead or unreachable without another scroll.
- Scoped permission chips such as `Support Inbox`, `Reports Review`, `Live Ops`, `Legal Intake`, and `Security Review` looked like action buttons but gave no nearby feedback before `Load Current`, so tapping them felt like nothing happened.

The first device proof reproduced the Step 1 issue. Maestro filled the staff email and audit reason, hid the keyboard, and then could not find `admin-staff-grant-button` because the buttons sat below the summary in the current viewport.

## Fixes

`app/admin.tsx` now keeps the Step 1 actions immediately under the readiness line:

- `Grant Role`
- `Remove Role`

The exact target summary still appears, but below the actions. This preserves safety details while making the primary guarded action reachable after the keyboard is dismissed.

Scoped permission chips now use a shared active handler:

- before `Load Current`, tapping a chip shows nearby guidance at `admin-scoped-permission-inline-notice`;
- if Step 1 has a valid staff target, the guidance points to `Use Step 1 Target`;
- if Step 2 has a valid permission email, the guidance asks for `Load Current` for that exact masked target;
- after `Load Current`, the same chips update draft state and tell the admin to review Will Grant / Will Revoke before saving.

The chip label `Permission Templates` was renamed to `Template Access` inside the scoped permission matrix so it no longer looks like a second route for adding Admin. The actual `Permission Template Presets` route remains separate and still only applies presets.

The Admin route also now uses `keyboardDismissMode="on-drag"` and `keyboardShouldPersistTaps="handled"`, and the staff role / permission fields dismiss the keyboard with the Done key.

## Device Proof

Passing screenshots captured:

- `01-admin-root.png`
- `02-step1-ready-keyboard-dismissed.png`
- `03-grant-confirm-open.png`
- `04-grant-cancel-clean.png`
- `05-revoke-confirm-open.png`
- `06-revoke-cancel-clean.png`
- `07-step2-visible.png`
- `08-chip-grid-visible.png`
- `09-chip-before-load-feedback.png`
- `10-use-step1-target-feedback.png`
- `11-load-current-success.png`
- `12-moderation-chip-updated.png`
- `13-live-ops-chip-updated.png`
- `14-legal-chip-updated.png`
- `15-security-chip-updated.png`
- `16-save-area-visible-no-keyboard-cover.png`
- `17-reset-draft-feedback.png`
- `18-post-revoke-admin-denial.png`

Grant and Remove opened confirmation modals and canceled cleanly. No staff grant/revoke was submitted from the UI.

Scoped permission proof loaded an existing staff account, then toggled representative chips across the shared matrix handler:

- Support: `support_inbox`
- Moderation: `reports_review`
- Live Operations: `live_ops`
- Legal / DMCA: `legal_request_intake`
- Security / Admin: `security_review`

Reset Draft was tapped afterward so no scoped permission draft remained pending. No scoped permission save was submitted.

## Cleanup And Safety

A temporary proof Owner role was reactivated only for screenshots and then revoked.

Final remote readback:

- Active temporary proof roles: `0`
- Active Owner count: `1`
- Production-enabled creator configs: `0`
- Payout-enabled creator configs: `0`
- Payable/paid money-access rows: `0`
- Payout requests: `0`

Post-revoke `/admin` denial was captured with `admin-post-revoke-denial-screen`.

No backend authority rules, Owner protection, self-grant blocking, final Owner protection, production money, payouts, cash-out, withdrawal, transfer, payable balances, Stripe Android digital checkout, LiveKit token issuer, route ownership, Player behavior, Premium gates, content safety, or secrets changed.
