# First Owner Authority And Succession

Date: 2026-06-25

First Owner authority: Closed / Partial / Blocked: Closed repo-side after migration, Edge function, UI, docs, and guards pass. Production database use requires the new migration to be applied. If migration apply finds more than one active Owner and no First Owner marker, the launch status becomes `Implemented but blocked pending First Owner seed`.

## Doctrine

- There may be multiple Owners.
- There is exactly one First Owner.
- First Owner is the root platform owner and has the highest platform authority.
- First Owner controls Owner succession.
- Only First Owner can grant or revoke Owner.
- A normal Owner cannot remove another Owner.
- A normal Owner cannot remove the First Owner.
- Admin, Moderator, support-scoped staff, and normal users cannot grant or revoke Owner. `operator` remains an internal backend alias for product-facing Admin; Support is a work area, not a separate role.
- First Owner cannot remove himself as the last active Owner.
- First Owner controls are enabled for authenticated First Owner after validation.

## Current Representation

The current First Owner is seeded from the existing active bootstrap Owner row in `platform_role_memberships` when the production migration sees exactly one active Owner and no active First Owner marker. This preserves existing backend-controlled Owner state and does not invent a new identity.

If production state has multiple active Owners before the marker exists, seeding fails closed. Owner action then requires selecting exactly one existing active Owner row as First Owner through the approved migration/RPC path.

## Owner Vs First Owner

Owner has full platform operational visibility by default through the Admin Command Center and owner/security dashboards. Normal Owner dashboard viewing is not Break Glass.

First Owner adds root authority:

- grant Owner;
- revoke another Owner;
- initiate and complete First Owner succession;
- use Break Glass emergency mode.

Normal Owner cannot grant or revoke Owner and cannot run First Owner succession.

## Break Glass

Break Glass means emergency/private/sensitive owner override mode, destructive security actions, or emergency override actions. It is not normal Owner dashboard viewing.

Break Glass is documented and audited when used with actor, reason, scope, start time, expiry, and result/status. Break Glass audit records must not contain secrets or raw private data.

Break Glass is enabled only for authenticated First Owner in this lane.

## Never Exposed

No secrets, tokens, signed URLs, raw IPs, tax IDs, bank details, or provider secrets are exposed.

The app must never show service-role keys, access tokens, refresh tokens, signed storage URLs, raw provider secrets, raw payment keys, raw bank/tax data, private environment values, or raw security context. Network proof remains masked/summarized according to the security-context policy.

## Grant Owner Flow

First Owner enters the target account email and a reason in `/admin` Owners. The Edge function authenticates the actor, the database verifies active First Owner authority, the target is checked for deleted/disabled state where discoverable, `platform_role_memberships` is updated or inserted as active Owner, and audit rows are written.

Grant Owner fails closed on missing actor, missing target, missing reason, non-First Owner actor, deleted/disabled target, or missing First Owner marker.

## Revoke Owner Flow

First Owner enters the target Owner email and a reason. The normal revoke path rejects self-revocation and routes Owner revocation through the First Owner RPC. The database verifies active First Owner authority, active target Owner state, and last-owner protection before revoking.

Normal Owner cannot revoke Owner. First Owner cannot remove himself through the normal revoke-owner path.

## Self-Step-Down / Succession

First Owner self-step-down requires successor, password re-auth, generated single-use passcode, typed confirmation, reason, and audit.

Required sequence:

1. At least one other active Owner exists.
2. First Owner selects an active Owner successor.
3. First Owner reauthenticates with the platform's existing password auth flow.
4. Backend generates a short-lived single-use passcode challenge.
5. Passcode is stored only as a salted hash.
6. First Owner types the generated passcode.
7. First Owner types `STEP DOWN FIRST OWNER`.
8. First Owner provides required reason text.
9. Backend consumes the challenge once, promotes the successor marker, revokes the previous First Owner's Owner row, and writes audit.

Failed passcode attempts are counted, rate-limited by maximum attempts, and audited. Expired, consumed, locked, or wrong-context challenges fail closed.

## Audit Rules

Owner role changes write `platform_staff_role_audit`, `platform_admin_audit_logs`, and `platform_first_owner_authority_audit` where available.

Succession challenges write challenge-created, challenge-failed, challenge-consumed, and succession audit rows.

Break Glass writes Break Glass audit plus First Owner authority audit.

Audit rows are append-only/protected and must not contain secrets, plaintext passcodes, provider credentials, tokens, signed URLs, raw IPs, tax IDs, bank details, or private environment values.

## Last-Owner Protection

First Owner cannot remove himself as the last active Owner. Revoke Owner fails if it would leave zero active Owners. Succession requires a selected active Owner successor.

## Non-Owner Denial

Non-owner and normal-owner bypass attempts fail server-side even if the UI is bypassed. The legacy staff-role revoke RPC now routes Owner revocation through the First Owner doctrine.

## Launch Status

First Owner controls are enabled for authenticated First Owner after validation.

Current repo launch status: Enabled, pending production migration apply. If production migration apply cannot safely seed exactly one First Owner marker from existing active Owner state, status is `Implemented but blocked pending First Owner seed`.

No real owner/admin/staff role mutation is required for proof. Live Owner grant/revoke/succession proof remains pending owner-approved live operation with a documented safe target account.
