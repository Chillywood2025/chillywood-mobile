# Wave 5 Account / Admin / Revoke Proof

Status: Partial as of June 24, 2026.

This Wave 5 lane covers account lifecycle, Admin/support access, and refund/revoke/entitlement behavior. It does not activate live money, payouts, cash-out, withdrawals, payable balances, production purchase buttons, provider refunds, or creator monetization.

## Proof Command

Dry-run:

```sh
node scripts/proof-wave5-account-admin-revoke.mjs
```

Runtime proof with approved ignored local proof credentials:

```sh
node scripts/proof-wave5-account-admin-revoke.mjs --run
```

The proof script uses only local ignored proof env values, redacts identities to suffixes, writes sanitized JSON to `/tmp/app-wave5-account-admin-revoke-proof-YYYYMMDDHHMMSS/`, and cleans up proof rows where it mutates.

Latest artifact:

- `/tmp/app-wave5-account-admin-revoke-proof-20260624144115/`

## Runtime Results

| Area | Result | Notes |
| --- | --- | --- |
| Account deletion status | Pass | Signed-in proof deletion candidate can read own deletion status. Signed-out status read is denied safely. |
| Schedule deletion | Pass | `schedule_account_deletion` creates a scheduled deletion with a restore window. |
| Public Profile hiding | Pass | Scheduled-deletion profile is hidden from another signed-in proof user. |
| Public Platform hiding | Pass | `resolve_platform_visibility_access` returns denied with `account_deletion_scheduled`. |
| Restore deletion | Pass | `restore_scheduled_account_deletion` restores the proof account inside the restore window. |
| Permanent purge/de-identification | Pending | No permanent purge job/runbook was executed or claimed in this lane. |
| Global deleted/deactivated private-feature denial | Pending | Scheduled deletion hides public Profile/Platform and app signs out, but a broader disabled/deactivated account enforcement sweep is not claimed. |
| Admin Users read model | Pass | Owner/operator proof account can read the admin Users read model. |
| Non-admin admin denial | Pass | Non-admin proof account is denied admin Users read model access. |
| Support/report submission | Pass | A proof safety report can be submitted with public-safe fields and cleaned up. |
| Support/report privacy | Pass | Unrelated proof user cannot read the support/report row. |
| DMCA submission | Pass | Public DMCA proof submission returns only case id/number/status and is cleaned up. |
| DMCA privacy | Pass | Unrelated proof user cannot read private DMCA reporter data. |
| Admin audit privacy | Pass | Non-admin proof user cannot read admin audit rows. |
| Valid Premium entitlement | Pass | Temporary Premium test grant is self-readable as active. |
| Client spoof prevention | Pass | Non-admin client cannot insert a Premium entitlement for itself. |
| Revoked Premium entitlement | Pass | Revoked Premium entitlement reads back as inactive/revoked. |
| Sandbox access revoke | Pass | `admin_revoke_money_access_grant_for_proof` revokes a sandbox grant, writes not-payable/reversed ledger state, claims no provider refund, and performs no live-money action. |
| Provider refund execution | Pending | Real provider refunds remain external/manual and were not run. |

## Bug Fixed

Runtime proof found that the June 18 profile access bridge overwrote the earlier account-deletion guard in `can_view_profile_content`. Migration `20260624150600_restore_account_deletion_profile_platform_visibility.sql` restores scheduled-deletion fail-closed behavior in the Profile and Public Platform resolver wrappers before the normal public/private/subscriber gates run.

## Safety

This lane did not:

- commit secrets, credentials, service-role keys, provider keys, proof passwords, push tokens, LiveKit tokens, signed URLs, or local env files;
- call provider refund APIs;
- activate live money, payouts, cash-out, withdrawals, payable balances, or production purchases;
- change Premium pricing or billing products;
- weaken RLS, Premium gates, LiveKit authority, participant caps, scan gates, or auth/reset behavior;
- create fake production UI users or public proof/debug UI.

## Remaining Wave 5 Blockers

- Permanent account purge/de-identification job and operational runbook proof.
- Full disabled/deactivated account private-feature denial sweep across rooms, calls, chat, upload, comments, and notifications.
- Real provider refund execution path remains external/manual and pending.
- Installed Android account deletion/restore visual proof if required for the next Play/internal build.
- Admin/operator support action proof for suspend/deactivate remains pending unless an approved operator path is opened.
- Wave 4 password reset/auth email provider proof remains pending outside Wave 5.
