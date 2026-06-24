# Wave 5 Account / Admin / Revoke Proof

Status: Partial as of June 24, 2026. Wave 5.1 app-controlled disabled/admin blockers are closed; password reset/auth email provider proof remains external.

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
| Permanent purge/de-identification | Pass for proof-account policy implementation | The dedicated proof-account lane defines the policy boundary and proves owner/operator-only de-identification for a disposable proof account after scheduled deletion with explicit proof override. No broad production auto-purge or legal compliance claim is made. |
| Global deleted/deactivated private-feature denial | Pass | Wave 5.1 proves backend denial for suspended/restricted proof accounts across private chat, call, room, LiveKit/token, upload, creator media, comment/reply, and notification-source paths. |
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
| Provider refund execution | Accepted manual/external | Real provider refunds remain external/manual and were not run; automated provider refund execution is not claimed. |

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

## Wave 5.1 Disabled/Admin Proof

Closed in the Wave 5.1 follow-up.

Latest artifact:

- `/tmp/app-wave5-disabled-admin-actions-proof-20260624172202/`

Runtime proof results:

- owner/operator suspend/deactivate action: Pass;
- non-admin suspend/deactivate denial: Pass;
- sanitized owner/operator audit readback: Pass;
- restore/reactivation behavior: Pass;
- restricted account chat thread creation and message sending denial: Pass;
- restricted account voice/video call invite/ring source denial: Pass;
- restricted account communication room creation and membership denial: Pass;
- restricted account Watch-Party room creation and membership denial: Pass;
- restricted account LiveKit token denial before token mint: Pass;
- restricted account seat/camera request marker denial: Pass;
- restricted account media upload URL initiation denial: Pass;
- restricted account creator-video metadata/publish denial: Pass;
- restricted account creator-video comment/reply denial: Pass;
- private-feature notification prevention: Pass by source-write denial before notification-producing state exists;
- support/report intake preservation: Pass.

Migrations/functions added or updated for Wave 5.1:

- `20260624171153_wave5_1_account_access_restrictions.sql`
- `20260624171939_wave5_1_account_support_audit_readback.sql`
- `livekit-token`
- `media-storage`
- `chilly-chat-call-dispatch`

The Wave 5.1 pass did not run provider refunds, activate live money, change Premium pricing/products, loosen LiveKit authority, raise participant caps, weaken RLS, weaken scan gates, or change auth/reset behavior.

## Carry-Forward External / Policy Blockers

- Password reset/auth email provider proof: Pending external/provider.
- Real provider refund execution path: Accepted manual/external. Provider refund execution is not automated/proved, refund handling remains manual/external, and the app must not claim instant or automatic provider refunds.
- Installed Android account deletion/restore visual proof: Closed on Play-installed versionCode 55 runtime. UI/copy, immediate scheduled-state copy, restore/cancel visual, and active/not-scheduled cleanup readback passed.
- Installed Android blocked-viewer visual proof: Closed on Play-installed versionCode 55 runtime. Blocked-viewer Profile/Platform denial, blocked-action non-exposure, unrelated-viewer regression, and cleanup passed.
- Play/internal proof where prior lanes used direct APK/backend proof: Closed for versionCode 55 with installer `com.android.vending`.
- Permanent purge/de-identification: Closed for proof-account policy implementation. `docs/ACCOUNT_PURGE_DEIDENTIFICATION_POLICY.md`, migration `20260624231731_account_purge_deidentification_proof.sql`, repair migrations `20260624232323_account_purge_deidentification_username_repair.sql` and `20260624232653_account_purge_deidentification_uuid_repair.sql`, and artifact `/tmp/app-account-purge-deidentification-proof-20260624233257/` prove disposable proof-account de-identification, dry-run behavior, owner/operator-only access, denial safeguards, public fail-closed readback, private-feature denial, and audit/support privacy. No real-user purge, broad auto-purge job, provider refund, or live-money action is claimed.
- Firebase dashboard receipt proof for Analytics/Crashlytics/Performance: Closed by browser readback; Firebase packages/config/redaction are repo-proved.
