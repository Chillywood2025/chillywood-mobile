# Actual User Chat Call And Live Closure

## July 5, 2026 Reconciliation Note

Current v79 proof status is reconciled in `docs/release/GOOGLE_SIGNED_V79_LIVEKIT_PROOF_RECONCILIATION_SMOKE.md`. This historical strict-standard document remains useful, but its older Chat Call Partial is superseded for the current requested Android call scope by v79 native CallStyle, same-thread, normal in-app, and room-safe call closures. Chi'lly Chat calls are not LiveKit Rooms. Watch-Party Party Room installed UI/realtime/readback are Closed for their scoped proof, and current v79 Party Room smoke passed. Live Stage strict normal actual-user entry and Watch-Party Live camera sidecar current smoke remain Partial/blocked by Premium/account access until an approved Premium-capable fixture is used.

Actual-user Chat Call proof: Partial.

Actual-user Live UI proof: Partial.

Real simultaneous multi-user state: Partial.

Latest targeted follow-up: `docs/release/CHAT_CALL_REMOTE_VIDEO_LIVE_ACTION_UX_SWEEP.md` fixes source-level remote video rendering, fullscreen RTC aspect fit, and Live seat-action stuck controls. Actual-user installed-app proof remains Partial until both physical Play-internal v57 phones run the updated code and reproduce the normal visible paths.

June 28, 2026 Play v58 follow-up: `docs/release/CHILLY_CHAT_PLAY_V58_ACTUAL_USER_CALL_PROOF.md` records v58 installed-app Chat call proof as Partial. Both target phones were Play-installed v58, but the v58 search path is deferred to v59 per owner instruction, receiver elsewhere-in-app did not visibly receive the app-wide banner on R5, and background push/ringing was not proved. v58 installed is not enough without actual user flow proof.

This lane follows `docs/release/ACTUAL_USER_PROOF_STANDARD.md`. A proof is not Closed unless Robert or a normal tester can reproduce it in the Play-internal installed app through the normal visible user path.

## Root Cause

chat-call prior proof limitation: the previous proof was not the normal actual-user ringing path.

The earlier Chat Call proof did not prove Robert's manual call/ring path. It proved a narrower prepared path: both phones opened the same app-backed direct thread, the caller tapped Video Call, and the receiver accepted from that same thread UI. Pre-created thread/call state was not counted as actual-user Closed.

The actual manual blocker had two code causes:

1. `_lib/chat.ts` `startChatThreadCall()` updated `chat_threads.active_communication_room_id` without checking that the update returned the receiver-visible thread row. If RLS, a stale thread, or a policy mismatch blocked the update, the caller could continue with false success while the receiver had no visible call state.
2. `_lib/chillyChatCalls.ts` swallowed invite/dispatch failure through fire-and-forget behavior. If `createChillyChatCallInvite()` or `chilly-chat-call-dispatch` failed, the caller did not see whether the receiver was actually notified.

The receiver behavior was also narrower than the prior proof implied. The same-thread receiver has an in-thread incoming call banner/sound path. A receiver in another app screen or backgrounded depends on the Android push path. If push registration or provider delivery is unavailable, no popup is guaranteed.

## Fixes Applied

- `_lib/chat.ts` now checks the `chat_threads` update result with a selected readback, ends the newly created communication room if the receiver-visible thread state is not saved, and returns a typed error instead of false call success.
- `_lib/chillyChatCalls.ts` now returns a structured invite delivery result: `sent`, `created`, `skipped`, `failed`, `blocked`, or `unknown`, including whether in-app notification was created and whether Android push was sent.
- `app/chat/[threadId].tsx` now shows a caller-visible `chat-call-delivery-status` card so the caller sees whether the receiver was sent push, received only in-app notification, or was not confirmed.
- `app/_layout.tsx` now has an app-wide foreground incoming Chi'lly Chat call banner driven by real foreground notification receipt. It routes the receiver to the call path with no auth or chat permission bypass.
- `_lib/notifications.ts` now exposes a foreground notification alert subscriber for incoming Chi'lly Chat call notifications.

## Delivery Evidence

Backend auth/readback and prior diagnostic media proof remain supporting evidence only. Backend readback was not counted as actual-user Closed.

EAS Update was published to the existing Play internal runtime:

| Field | Value |
| --- | --- |
| Branch/channel | `production` |
| Runtime | `1.0.0` |
| Android update ID | `019f0bc2-d794-71c3-8ab9-4502df41e790` |
| Update group | `bc66e544-d7b8-44d7-8236-9957f378b95a` |
| Message | `Fix actual-user chat call delivery status` |
| Platform | Android |

Both physical Play-internal v57 phones were non-destructively relaunched after publish:

| Device | Package | Version | versionCode | Installer | Update check result |
| --- | --- | --- | --- | --- | --- |
| `R5CR120QCBF` | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` | Expo Updates logged `CheckCompleteUnavailable`; active update ID was not directly readable |
| `R3CXA0DS5JV` | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` | Expo Updates logged `CheckCompleteUnavailable`; active update ID was not directly readable |

Because active update ID was not directly readable and the logs did not prove download/apply of group `bc66e544-d7b8-44d7-8236-9957f378b95a`, installed-app manual closure remains Partial in this run.

## Scenario Results

| Scenario | Result | Notes |
| --- | --- | --- |
| Scenario 1: same-thread receiver | Partial | Code now supports honest delivery status and existing in-thread banner path, but installed-app rerun after update uptake was not proven in this run. |
| Scenario 2: receiver elsewhere in app | Partial | App-wide foreground banner was added, but it requires real foreground notification receipt after the update is active. |
| Scenario 3: receiver backgrounded/outside app | Partial | Android push is the required path. Caller now sees if push is sent, skipped, or failed. Push delivery was not re-proved after update uptake. |

Receiver background push: Partial.

Manual call initiation/ringing path was tested through installed UI: Partial. The previous installed UI proof is retained as diagnostic/same-thread evidence only, not actual-user Closed.

## Live UI Result

Actual-user Live UI proof: Partial.

The earlier Live diagnostic media proof remains useful, and Watch-Party/Live safety guards remain intact. Actual-user Live UI still requires the normal waiting-room/entry path with two Premium-capable seeded clients or a safe repo-backed proof entitlement path. Premium gates were not bypassed or weakened.

## Watch-Party And Staff Status

Watch-Party installed UI proof remains Closed for the prior supported scope. Watch-Party backend realtime callback remains Closed and playback readback matched.

Owner/Admin/Moderator realtime controls remain safe for the prior scoped proof. Current First Owner was not touched.

## Safety Confirmation

- Pre-created thread/call state was not counted as actual-user Closed.
- Diagnostic media proof was not counted as actual-user Chat Call Closed.
- `chat_threads` RLS was not weakened.
- Premium gates were not bypassed or weakened.
- No service-role chat permission proof was used.
- No auth/account-status/chat permission bypass was added.
- No physical phone sideload was used.
- No install, uninstall, reinstall, clear-data, or wipe-cache happened.
- No Play production submission happened.
- No provider mutation happened.
- No Google Play product/base-plan mutation happened.
- No RevenueCat provider configuration mutation happened.
- No Stripe mutation happened.
- No purchases were executed.
- No provider refunds were executed.
- No payouts/cashout/withdrawals/transfers happened.
- No Stripe Connect production happened.
- No payable balances were enabled.
- Current First Owner was not touched.
- liveMoneyEnabled remains OFF.
- Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF.
- No secrets/tokens/private data were committed or artifacted.

## Remaining Blockers

1. Confirm the published EAS Update group `bc66e544-d7b8-44d7-8236-9957f378b95a` is active on both Play-internal phones or deliver the same code through the next approved Play internal build.
2. Rerun actual-user Chat Call:
   - same-thread ringing/join/end;
   - receiver elsewhere in-app foreground banner;
   - receiver background Android push or explicit caller “not confirmed” status.
3. Rerun actual-user Live UI through the normal waiting-room flow with both active clients satisfying Premium/readiness requirements.

## Recommendation

Next lane: fix update uptake or ship a new Play internal build with this runtime code embedded, then rerun only actual-user Chat Call and Live UI paths.
