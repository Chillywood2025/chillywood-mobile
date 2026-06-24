# Account Purge / De-identification Policy

## Status

Verdict: Closed for proof-account policy implementation as of June 24, 2026.

Current proved behavior covers scheduled deletion, restore/cancel, public Profile/Platform hiding, disabled/deactivated private-feature denial, and admin/operator suspend/restore. This policy defines the narrower post-restore-window behavior that starts after the restore window ends.

This document is not a legal compliance claim. It records the implementation and proof boundary for the app. Any broader legal retention, permanent deletion, or de-identification promise still requires owner/legal approval.

Latest proof artifact:

- `/tmp/app-account-purge-deidentification-proof-20260624233257/`

## Scheduled Deletion

Scheduled deletion is the reversible phase.

- The user requests account deletion from Settings.
- The account enters a restore window.
- Public Profile and public Platform routes fail closed.
- Private features are denied.
- The user can restore/cancel while the restore window remains open.
- The app must not describe scheduled deletion as instant permanent deletion.
- The app must not imply provider refunds, payout changes, or live-money actions happen because deletion was scheduled.

## Permanent Purge / De-identification

Permanent purge/de-identification is the post-restore-window phase.

- It happens only after the restore window expires, except for proof-only disposable accounts using an explicit proof override.
- It applies only to eligible personal account data.
- It must not delete legal, safety, support, DMCA, security, fraud, payment, chargeback, provider, or admin audit records that need retention.
- It replaces retained user-facing identity with safe deleted-user/de-identified labels where needed.
- It removes or de-identifies profile identity data where the current implementation supports it.
- It revokes/de-identifies local push-token rows where implemented.
- It keeps public Profile and public Platform hidden/fail-closed.
- It keeps private-feature access denied.

No automatic broad production purge job is enabled by this lane.

## Retained Data Categories

These categories are retained unless a later owner/legal policy explicitly approves a narrower deletion path:

- Payment/provider transaction records.
- Refund, chargeback, access-grant, and entitlement audit.
- Abuse, rate-limit, and security logs.
- Moderation, support, report, and DMCA records.
- Admin audit logs.
- Fraud/security records.
- Legal compliance records.
- Content records where deletion would break another user's lawful record or moderation history.
- Public or private content references that need retention for integrity, safety, legal, or audit reasons, with owner identity de-identified where supported.

Retained records must remain private under their existing RLS/admin/support boundaries and must not expose service-role keys, provider secrets, tokens, raw storage credentials, or signed URLs.

## Purged / De-identified Data Categories

The current proof-account implementation de-identifies or removes:

- Profile display identity.
- Username, by replacing it with a generated deleted-user username.
- Bio/tagline fields.
- Avatar/profile media references on the profile row.
- Background media references on the profile row.
- Public Profile/Platform visibility and activity visibility.
- Follower/subscriber surface flags.
- Local push-token values, fingerprints, device ids, install ids, and metadata.
- Notification title/body/context fields where the deleted user is the target or actor.
- Auth metadata that is safe to replace locally.
- Auth access, by setting the account into a restricted state.

The implementation does not physically delete auth provider records, support/report/DMCA records, admin audit logs, payment/provider records, creator media objects, or storage objects.

## Manual / Legal Process

Some categories remain manual or policy-controlled:

- Provider-side identity, billing, refund, chargeback, and store records.
- Auth-provider deletion beyond local restriction/de-identification.
- Storage-object deletion where content may be needed for legal, safety, DMCA, fraud, or another user's record.
- Permanent purge for non-proof production users.
- Any data category subject to legal hold, fraud review, abuse investigation, payment dispute, or DMCA retention.

The support/legal path should review these manually until owner/legal approves an automated production job. The proof RPC is intentionally proof-account scoped and must not be treated as a general production purge worker.

## Safety Requirements

The purge/de-identification path must:

- Deny active-account purge.
- Deny restore-window purge unless the target is a dedicated disposable proof account and proof override is explicitly requested.
- Deny owner/admin/operator/moderator account purge.
- Deny non-admin callers.
- Retain audit/support/DMCA/payment records.
- Preserve public Profile/Platform fail-closed behavior.
- Preserve private-feature denial.
- Preserve RLS and existing admin/support privacy.
- Avoid provider refund execution.
- Avoid live-money, payout, Premium product, LiveKit, scan-gate, auth/reset, abuse, and block-policy changes.

## Proof Boundary

The proof harness creates or uses a dedicated disposable purge proof account, adds safe sample records, schedules deletion, proves deny states, runs a dry-run, and only then runs proof-account de-identification with explicit `--run --proof-only`.

A broad production purge job remains disabled unless a future owner/legal-approved lane explicitly enables it.

Latest proof result:

- Dry-run proof: Pass.
- Proof-only disposable account mutation: Pass.
- Active-account purge denial: Pass.
- Restore-window purge denial without proof override: Pass.
- Owner/admin/operator purge denial: Pass.
- Non-admin purge denial: Pass.
- Public Profile/Platform fail-closed after de-identification: Pass.
- Private-feature denial after de-identification: Pass.
- Support/audit privacy preservation: Pass.
- Provider refund execution: not performed.
- Live-money action: not performed.
