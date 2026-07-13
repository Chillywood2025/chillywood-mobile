# Full App Authority Product Behavior OTA Installed Traversal Proof

Status: Partial.

Date: 2026-07-12

## OTA Published

- Source commit: `7487ba31694b9d3c8b889a6f21cee01d516e5b57`
- Branch/channel: `production`
- Runtime: `1.0.0`
- EAS update group: `dfbfe7c9-33f0-4c11-96b1-c9bb311dbd3a`
- Android update ID: `019f58bd-8ae2-7c9e-b9fc-56f09dce62ba`
- EAS message: `Full app authority traversal 7487ba31`

## Installed App Diagnostics

The Play-installed app on attached device `R5CR120QCBF` loaded the new production OTA through Settings -> App Info diagnostics.

- Package: `com.chillywood.mobile`
- Installer: `com.android.vending`
- Version: `1.0.0`
- versionCode: `80`
- Runtime: `1.0.0`
- Channel: `production`
- Update ID: `019f58bd-8ae2-7c9e-b9fc-56f09dce62ba`
- Embedded launch: `false`
- Emergency launch: `false`

## Traversal Result

The seeded one-device installed traversal ran against the Play-installed app and current OTA.

- Verdict: `Partial`
- Roles traversed: signed-out, normal, creator, moderator, admin/operator, owner, restricted, blocked A, blocked B, Premium-labelled, non-Premium
- Status counts: `Pass=84`, `Human review=25`, `Blocked=3`, `Two-device required=4`
- Hard failures: `0`
- Service-role used: `false`
- Accounts created or recreated: `false`
- Sideload / APK install / clear-data: `false`

Installed authority behavior was proved for owner, admin/operator, moderator, normal user/creator, and non-Premium surfaces where the route markers passed. Owner/admin/moderator/admin-search and normal-user admin-denial paths were captured. No active manual Premium grant, payout release/mark-paid/send-money, production money movement, production release mutation, auth/RLS or owner-role mutation, unsafe enforcement, private evidence exposure, provider mutation, or secret exposure was observed.

## Remaining Installed Proof Gaps

These gaps prevent a Closed installed-device verdict:

1. `proof_normal_001 /chat`: expected `chat-inbox-screen` marker was not visible; the captured screen stayed on Home. This needs a focused current-OTA `/chat` route recheck for a normal signed-in account.
2. `proof_creator_001 /creator-monetization-setup`: expected Premium/Platform Studio compatibility marker was not visible. This needs a focused current-OTA legacy route recheck for the creator account.
3. `proof_restricted_001 /chat`: expected restricted/denied marker was not visible; the captured screen showed the Chat inbox. This is either a seeded restricted-account fixture issue or a product-authority mismatch and needs focused backend/account-status readback plus installed route proof.
4. The account labelled `proof_premium_001` was not a valid Premium-active installed proof account during traversal: `/subscribe` displayed `Premium is not active.` No manual Premium grant was performed. Premium-active traversal remains pending until a provider-backed Premium active account is available or the account is renewed through the approved provider-backed sandbox path.
5. Two-device realtime assertions remain `Two-device required` and were not claimed from this one-device proof.

## Safety

No source behavior was changed during this installed proof. No money was moved, no Premium entitlement was manually granted, no provider product/dashboard setting was changed, no native Play build was published or rolled back, no app sideload or `adb install` was used, app data was not cleared, auth/RLS and owner roles were not mutated, users were not banned/restricted, content was not deleted, media/backfill was not processed, and no secrets/tokens/signed URLs/private evidence were printed or committed.

## Artifacts

Local redacted artifact directory:

- `/tmp/chillywood-authority-ota-traversal-20260712-184849`

Key files:

- `eas-update.json`
- `ota-pickup-result.txt`
- `role-traversal/run-summary.json`
- `role-traversal/flow-matrix.md`
- `role-traversal/safety-confirmation.md`
