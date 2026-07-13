# Full App Authority Product Behavior OTA Installed Traversal Proof

Status: Partial.

Date: 2026-07-12; focused blocker follow-up 2026-07-13

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

## Original Installed Proof Gaps

These gaps from the seeded traversal prevented a Closed installed-device verdict:

1. `proof_normal_001 /chat`: expected `chat-inbox-screen` marker was not visible; the captured screen stayed on Home. This needs a focused current-OTA `/chat` route recheck for a normal signed-in account.
2. `proof_creator_001 /creator-monetization-setup`: expected Premium/Platform Studio compatibility marker was not visible. This needs a focused current-OTA legacy route recheck for the creator account.
3. `proof_restricted_001 /chat`: expected restricted/denied marker was not visible; the captured screen showed the Chat inbox. This is either a seeded restricted-account fixture issue or a product-authority mismatch and needs focused backend/account-status readback plus installed route proof.
4. The account labelled `proof_premium_001` was not a valid Premium-active installed proof account during traversal: `/subscribe` displayed `Premium is not active.` No manual Premium grant was performed. Premium-active traversal remains pending until a provider-backed Premium active account is available or the account is renewed through the approved provider-backed sandbox path.
5. Two-device realtime assertions remain `Two-device required` and were not claimed from this one-device proof.

## Focused Blocker Follow-Up

The remaining installed blockers were rerun on 2026-07-13 without reopening the full traversal suite.

### Follow-Up OTA

- Source commit: `32e56c3abb5c046e853a9c2f3d978ba72af447f4`
- Branch/channel: `production`
- Runtime: `1.0.0`
- EAS update group: `8e158980-75d1-47ef-bd26-f3f9e564fdab`
- Android update ID: `019f58f4-55ea-7d55-b1b1-6ea85fdb1c56`
- EAS message: `Installed authority blocker follow-up 32e56c3a`

### Follow-Up Installed Diagnostics

The Play-installed app on attached device `R5CR120QCBF` loaded the follow-up production OTA through Settings -> App Info diagnostics.

- Package: `com.chillywood.mobile`
- Installer: `com.android.vending`
- Version: `1.0.0`
- versionCode: `80`
- Runtime: `1.0.0`
- Channel: `production`
- Update ID: `019f58f4-55ea-7d55-b1b1-6ea85fdb1c56`
- Update created at: `2026-07-13T00:50:35.626Z`
- Embedded launch: `false`
- Emergency launch: `false`

### Follow-Up Results

- Normal `/chat`: Closed. `proof_normal_001` opened `chillywoodmobile:///chat` and the installed hierarchy contained `chat-inbox-screen` and `chat-search-input`, with no admin/moderator/private controls.
- Restricted `/chat`: Partial. Source now checks account-status readback before listing threads and renders `chat-access-restricted-state` for a truly restricted account, but installed `proof_restricted_001` readback is `not_restricted` and the installed route still showed the Chat inbox. This is a fixture/account-state blocker, not a closed installed denial proof.
- `/creator-monetization-setup`: Closed. `proof_creator_001` opened the compatibility route and landed in the canonical Platform Studio monetization gate with `Premium required`, `Manage Premium`, and `Platform Studio` markers. No live money, payout, provider mutation, or manual Premium grant occurred.
- Premium active user: Partial. Backend readback showed the Premium-labelled account has an active backend entitlement, but the installed login path did not produce a Premium-active app session or `/subscribe` active receipt. No manual Premium grant, direct entitlement edit, fake row, provider mutation, or money movement was performed.
- Moderator boundaries: Closed for the focused installed boundary packet. `proof_moderator_001` accessed only the bounded moderation/admin entry; broad Admin Search, owner approvals, direct ban/suspend/restrict/delete controls, and private evidence/reporter identity markers were absent in the captured artifacts.
- Two-device realtime: Two-device required. Only one Play-installed device, `R5CR120QCBF`, was available, so simultaneous realtime behavior was not claimed.

Current installed verdict remains `Partial` because restricted-denial proof requires an actually restricted approved fixture/account, Premium-active proof requires a provider-backed active installed session or approved sandbox renewal, and two-device realtime requires a second Play-installed device.

### Follow-Up Artifacts

- `/tmp/chillywood-installed-authority-blockers-20260713-0050`

## Safety

The follow-up source change added a narrow chat account-status UI gate and stable proof scripts only. No money was moved, no Premium entitlement was manually granted, no provider product/dashboard setting was changed, no native Play build was published or rolled back, no app sideload or `adb install` was used, app data was not cleared, auth/RLS and owner roles were not mutated, users were not banned/restricted, content was not deleted, media/backfill was not processed, and no secrets/tokens/signed URLs/private evidence were committed.

## Artifacts

Local redacted artifact directory:

- `/tmp/chillywood-authority-ota-traversal-20260712-184849`

Key files:

- `eas-update.json`
- `ota-pickup-result.txt`
- `role-traversal/run-summary.json`
- `role-traversal/flow-matrix.md`
- `role-traversal/safety-confirmation.md`
