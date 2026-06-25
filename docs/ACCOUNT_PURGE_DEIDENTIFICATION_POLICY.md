# Account Purge / De-identification Policy

## Status

Verdict: Closed for controlled production path as of June 25, 2026.

Current proved behavior covers scheduled deletion, restore/cancel, public Profile/Platform hiding, disabled/deactivated private-feature denial, admin/operator suspend/restore, proof-account de-identification, and controlled single-user production purge/de-identification for expired scheduled-deletion accounts.

This document is not a legal compliance claim. It records the implementation and proof boundary for the app. Any broader legal retention, permanent deletion, or de-identification promise still requires owner/legal approval.

Latest proof artifact:

- `/tmp/app-account-purge-deidentification-proof-20260624233257/`

Latest production enablement proof artifact:

- `/tmp/app-account-purge-production-enable-proof-20260625000935/`

Latest final launch operations proof artifact:

- `/tmp/app-final-launch-operations-proof-20260625003349/`

## Scheduled Deletion

Scheduled deletion is the reversible phase.

- The user requests account deletion from Settings.
- The account enters a restore window.
- Public Profile and public Platform routes fail closed.
- Private features are denied.
- The user can restore/cancel while the restore window remains open.
- The app must not describe scheduled deletion as instant permanent deletion.
- The app must not imply provider refunds, payout changes, or live-money actions happen because deletion was scheduled.

Account restriction and appeals operations: Closed for current production policy and existing backed enforcement. Suspension, deactivation, disabled status, scheduled deletion, deleted status, and purge/de-identification are separate states. Reports do not auto-suspend or auto-ban. Suspension/deactivation/restore require exact scope, reason, target, and audit. Purge/de-identification remains separate owner-controlled policy and must not be merged into normal account suspension.

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

Permanent purge/de-identification is production-capable only through a controlled admin/operator path and/or an explicitly enabled job. No broad auto-purge runs by default.

## Retained Data Categories

Some records may be retained for security, fraud prevention, legal, transaction, support, audit, DMCA, or dispute reasons. These categories are retained unless a later owner/legal policy explicitly approves a narrower deletion path:

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

## Production Controls

Production-capable purge is controlled by:

- dry-run default;
- owner/operator-only single-user RPC;
- restore-window expiry requirement;
- protected owner/operator/moderator denial;
- active sandbox tester/protected tester denial;
- emergency stop runtime config;
- single-user enable flag;
- batch enable flag that is default-off;
- proof-batch enable flag for disposable proof-account automation;
- explicit call-time batch enable requirement;
- sanitized audit readback;
- idempotent already-deidentified result.

Proof-only batch auto-purge is enabled/proved for disposable proof accounts. Production batch auto-purge remains config-gated/default-off unless owner/operator explicitly enables it after dry-run review.

## Manual / Legal Process

Some categories remain manual or policy-controlled:

- Provider-side identity, billing, refund, chargeback, and store records.
- Auth-provider deletion beyond local restriction/de-identification.
- Storage-object deletion where content may be needed for legal, safety, DMCA, fraud, or another user's record.
- Batch purge for production users unless owner/operator explicitly enables the config-gated production path after dry-run review.
- Any data category subject to legal hold, fraud review, abuse investigation, payment dispute, or DMCA retention.

The support/legal path should review these manually unless owner/legal approves the config-gated production batch path for eligible expired scheduled-deletion accounts. The controlled single-user production path is available for eligible expired scheduled-deletion accounts; proof-only batch mutation remains proof-account scoped.

## Safety Requirements

The purge/de-identification path must:

- Deny active-account purge.
- Deny restore-window purge for production accounts.
- Deny owner/admin/operator/moderator account purge.
- Deny active sandbox tester/protected tester purge.
- Deny non-admin callers.
- Retain audit/support/DMCA/payment records.
- Preserve public Profile/Platform fail-closed behavior.
- Preserve private-feature denial.
- Preserve RLS and existing admin/support privacy.
- Avoid provider refund execution.
- Avoid live-money, payout, Premium product, LiveKit, scan-gate, auth/reset, abuse, and block-policy changes.

## Proof Boundary

The proof harness creates or uses a dedicated disposable purge proof account, adds safe sample records, schedules deletion, proves deny states, runs a dry-run, and only then runs proof-account de-identification with explicit `--run --proof-only`.

The production enablement harness creates a dedicated disposable proof account, schedules deletion, expires the restore window only for that proof account, proves dry-run eligibility, proves controlled single-user purge, proves idempotency, proves active/restore-window/protected/non-admin denial, proves batch mutation is disabled/default-off, and proves sanitized audit readback.

The final launch operations harness proves refund manual/external classification, emergency stop, batch dry-run, disabled mutation, proof-only batch processing for disposable proof accounts, bounded batch size, idempotency, sanitized batch audit readback, manual-review queue creation, manual-review status transition, non-admin denial, and no provider refund or live-money side effect.

Broad production batch processing remains config-gated/default-off unless owner/operator explicitly enables it after dry-run review.

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

Latest production enablement result:

- Controlled single-user owner/operator purge: Pass.
- Batch auto-purge: disabled/default-off.
- Batch disabled proof: Pass.
- Idempotency: Pass.
- Active-account purge denial: Pass.
- Restore-window purge denial: Pass.
- Owner/admin/operator purge denial: Pass.
- Non-admin purge denial: Pass.
- Sanitized purge audit readback: Pass.
- Public Profile/Platform fail-closed after purge: Pass.
- Private-feature denial after purge: Pass.
- Provider refund execution: not performed.
- Live-money action: not performed.

Latest final launch operations result:

- Provider refund execution manual/external: Pass.
- Batch dry-run: Pass.
- Emergency stop: Pass.
- Proof-only batch mutation for disposable proof accounts: Pass.
- Production mode gate/default-off: Pass.
- Batch size bound: Pass.
- Active-account skip/denial: Pass.
- Restore-window skip/denial: Pass.
- Owner/admin/operator protected account skip/denial: Pass.
- Non-admin batch/manual-review denial: Pass.
- Batch audit readback: Pass.
- Idempotency: Pass.
- Manual-review queue creation: Pass for creator media, storage references, provider records, legal/support/DMCA, and payment/access grants.
- Provider refund execution: not performed.
- Live-money action: not performed.
