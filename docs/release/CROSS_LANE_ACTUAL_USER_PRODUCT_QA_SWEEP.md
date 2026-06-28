# Cross-Lane Actual-User Product QA Sweep

Cross-Lane Actual-User Product QA Sweep: Closed / Partial / Blocked

Verdict: Partial.

This sweep applies `docs/release/ACTUAL_USER_PROOF_STANDARD.md`. Out-of-scope is not an excuse to ignore visible user-facing problems. Proof scripts passing is not enough. Diagnostic/backend proof is not actual-user proof. If Robert/testers cannot reproduce it in the Play-internal installed app, it is not actual-user Closed.

Small safe visible issues were fixed where found. Risky or larger issues were documented instead of hidden.

Issue classifications used by this sweep: Fixed now, Must fix before launch, Should fix before launch, Human review, Can wait, and Not a bug / expected behavior.

## Audit Scope

Reviewed the recent realtime, owner/admin/moderator, one-device, two-device, and release-readiness lanes for actual-user and admin-facing product problems. Minimum covered areas:

- Chi'lly Chat video call local/remote video behavior, fullscreen RTC aspect fit, app-wide incoming-call status, and prior manual-call proof limits.
- Live Watch-Party waiting-room path, Live host participant action sheet, Live seat approve/deny/mute/remove behavior, and the owner-provided `Seat update unavailable` screenshot.
- Watch-Party participant join/sync/leave state and callback/readback docs.
- Owner/Admin/Moderator Command Center, Admin Search, reporting/moderation queue, content takedown, live/chat moderation, account restriction, legal/DMCA, money admin, Premium, creator money, public routes, auth routes, and creator routes through recent proof docs and artifacts.
- Recent proof docs and scripts that claim Closed.

## Artifacts Reviewed

| Artifact | Reviewed | Notes |
| --- | --- | --- |
| `/tmp/codex-remote-attachments/019efc95-a8df-7f30-aaae-e71949180bb0/9b817405-529a-40b3-956d-935948e834dd/1-Photo-1.jpg` | Yes | Shows Live Watch-Party host controls still visible behind `Seat update unavailable`, making the sheet feel stuck. |
| `/tmp/app-chat-call-remote-video-live-action-ux-sweep-20260627-204906/README.md` | Yes | Prior targeted source fix lane; actual-user installed-app proof remained Partial. |
| `/tmp/app-actual-user-chat-call-and-live-closure-20260627-201748/README.md` | Yes | Confirms manual Chat Call and Live paths remained Partial pending installed update uptake. |
| `/tmp/app-two-client-installed-app-realtime-ui-proof-20260627152317/` | Yes | Device screenshots/XML reviewed for Chat Call, Live, Watch-Party, Admin, Moderator, and Owner surfaces. |
| `/tmp/app-final-live-chat-installed-realtime-ui-closure-20260627-170821/` | Yes | Chat Call screenshots showed local video plus remote participant card with `Connection failed`; supplemental artifact overclaimed Closed compared with later repo docs. |
| `docs/release/CHAT_CALL_REMOTE_VIDEO_LIVE_ACTION_UX_SWEEP.md` | Yes | Prior doc captured the owner-reported issue and Partial installed-app proof status. |
| `docs/release/ACTUAL_USER_CHAT_CALL_AND_LIVE_CLOSURE.md` | Yes | Governs actual-user Chat Call and Live Partial status. |
| `docs/release/TWO_CLIENT_INSTALLED_APP_REALTIME_UI_PROOF.md` | Yes | Correctly supersedes earlier Closed wording and keeps Chat Call/Live actual-user proof Partial. |
| `docs/release/FINAL_INSTALLED_REALTIME_UI_BLOCKERS.md` | Yes | Captures remaining installed realtime UI blocker truth. |
| `docs/release/FINAL_LIVE_CHAT_INSTALLED_REALTIME_UI_CLOSURE.md` | Yes | Latest repo doc says Partial, not Closed. |
| `docs/release/TWENTY_FIVE_SEEDED_PARTICIPANTS_REALTIME_PROOF.md` | Yes | Diagnostic media proof is supporting evidence only. |
| `docs/release/OWNER_ADMIN_MODERATOR_PROOF_TRUTH_AUDIT.md` | Yes | Governs staff proof classification and dashboard owner-confirmation boundaries. |

## Screenshots XML Logs Reviewed

| Evidence | Finding |
| --- | --- |
| `device-a-chat-call.png` and `device-b-chat-call.png` under `/tmp/app-final-live-chat-installed-realtime-ui-closure-20260627-170821/` | Both phones showed a local video tile; the other participant could still render as `Connection failed`, which is confusing if a remote stream URL exists. |
| `device-a-chat-call-after-join.xml` and `device-b-chat-call-after-join.xml` under `/tmp/app-final-live-chat-installed-realtime-ui-closure-20260627-170821/` | Same-thread call evidence exists, but actual-user manual ring/background path remains Partial under the actual-user standard. |
| `device-a-live-stage*.png` and `device-b-live-stage*.png` under `/tmp/app-final-live-chat-installed-realtime-ui-closure-20260627-170821/` | Live screens reached active states, but actual-user Live waiting-room/seat path still needs updated installed-app proof. |
| `device-b-admin-operator.png`, `device-b-admin-operator.txt`, `device-b-moderator-admin.xml`, `device-b-owner.txt` under `/tmp/app-two-client-installed-app-realtime-ui-proof-20260627152317/` | Screenshot review raised a possible broken Refresh glyph; XML and source show `Refresh` and `content-desc="Refresh"`, so this is a human-review visual artifact, not a code bug found in source. |
| Watch-Party callback artifacts under `/tmp/app-watch-party-realtime-callback-fix-20260627145327/` | Watch-Party callback/readback remained Closed and was not re-opened by this sweep. |

## Proof Docs Scripts Reviewed

Reviewed proof/guard coverage around actual-user Chat Call/Live closure, two-client installed-app realtime UI proof, Watch-Party realtime callback, 25 seeded participants, final installed realtime UI blockers, owner/admin/moderator proof truth, and the prior chat remote-video/live action UX sweep. The main proof-label issue is that artifact-local supplemental text can still read stronger than the governing repo docs; repo docs correctly supersede those artifacts with Partial actual-user status.

## User-Facing Issues Found

| Issue | Classification | Result |
| --- | --- | --- |
| Chi'lly Chat remote video can exist as a stream URL but still show avatar/`Connection failed` because the tile required stale `cameraOn` presence state. | Fixed now | Fixed `components/communication/communication-participant-grid.tsx` to render video and status from actual stream presence. |
| Chi'lly Chat call header said `2 connected` while a remote card could say `Connection failed`, creating fake-success/confusing state. | Fixed now | Changed communication panel/header participant count copy to `in call` / `in room`; connection health stays on each participant card. |
| Fullscreen RTC video can be cropped on mismatched phone aspect ratios. | Not a bug / expected behavior after prior fix | Current code uses `objectFit="contain"` in fullscreen; guard keeps this. |
| Live Stage remote feed could require stale `cameraOn` presence even when the remote media stream exists. | Fixed now | Fixed `app/watch-party/live-stage/[partyId].tsx` to render remote RTC video from stream URL presence. |
| Live host participant action controls can feel stuck behind `Seat update unavailable`. | Should fix before launch | Current source already has busy state and collapses host controls around persistence failure; actual-user installed-app proof remains needed after update uptake. |
| Manual Chat Call app-wide/background ringing is not actual-user Closed. | Must fix before launch if Chat video calls are launch scope | Current docs keep this Partial; do not count pre-created thread/call state as actual-user Closed. |
| Live waiting-room Premium/seat path is not actual-user Closed. | Must fix before launch if Live is launch scope | Current docs keep this Partial until two Play-internal phones reproduce the normal path. |
| Watch-Party installed UI sync/callback. | Not a bug / expected behavior | Watch-Party callback and installed UI markers remain Closed in governing docs. |

## Admin Moderator Owner Facing Issues Found

| Issue | Classification | Result |
| --- | --- | --- |
| Possible malformed Admin `Refresh` glyph in one screenshot. | Human review | XML and source expose the Refresh control correctly, so no code fix was made. Recheck visually in the next installed-app admin smoke. |
| Owner/Admin/Moderator proof labels could be confused with actual-user proof. | Fixed now | `docs/release/OWNER_ADMIN_MODERATOR_PROOF_TRUTH_AUDIT.md` is the governing classification and keeps backend/RPC, diagnostic, seeded, service-role/bootstrap, and provider-dashboard evidence separate. |
| Provider dashboard MFA/access proof. | Human review | Provider dashboard MFA/access remains owner-confirmation-required unless sanitized evidence exists. |
| Admin Search privacy, moderation queue, legal/DMCA, money admin, and support flows. | Not a bug / expected behavior | Recent docs keep these scoped, masked, audited where backed, and money/provider actions status/readback-only. |

## Proof-Label Issues Found

| Claim area | Classification | Result |
| --- | --- | --- |
| `/tmp/app-final-live-chat-installed-realtime-ui-closure-20260627-170821/live-chat-closure-supplemental-review.md` and summary JSON can read as Closed for Live/Chat. | Fixed now | Governing repo docs already downgrade to Partial. This sweep documents that artifact-local overclaim as superseded and guard-protects against calling diagnostic/backend/controlled evidence actual-user Closed. |
| 25-participant RTC-node media proof. | Not a bug / expected behavior | Valid diagnostic evidence, not actual-user installed-app Closed by itself. |
| Owner/Admin/Moderator service-role fixture traversal. | Not a bug / expected behavior | Valid controlled seeded traversal only where documented; service-role/bootstrap proof is not role-authority proof. |
| Provider dashboard governance. | Not a bug / expected behavior | Owner-confirmation-required where repo cannot verify private dashboard state. |

## Fixes Made

- `components/communication/communication-participant-grid.tsx`
  - Remote video now renders when a real stream URL exists, even if presence `cameraOn` is stale.
  - Remote status now reports `Video connected` when stream media is present instead of showing `Connection failed`.
  - Debug counters use stream presence for renderability.
  - Camera pill treats a real stream as camera-capable.
- `components/communication/in-room-communication-panel.tsx`
  - Participant count copy now says `in call`, avoiding a false all-connected claim.
- `components/communication/communication-room-header.tsx`
  - Room participant count copy now says `in room`, avoiding a false all-connected claim.
- `app/watch-party/live-stage/[partyId].tsx`
  - Remote Live Stage video now renders from stream URL presence instead of stale `cameraOn` presence.
- `scripts/proof-cross-lane-actual-user-product-qa-sweep.mjs` and `scripts/guard-cross-lane-actual-user-product-qa-policy.mjs`
  - Added proof/guard coverage for this sweep and the source-level RTC guardrails.

## Issues Not Fixed And Why

| Issue | Classification | Why not fixed here |
| --- | --- | --- |
| Actual-user installed-app proof of updated Chat Call remote video and Live seat-action behavior. | Must fix before launch if those flows are launch scope | Requires Play-internal runtime uptake or a new Play internal build plus two physical phones on the normal visible paths. |
| Android background push/incoming call notification. | Should fix before launch if background ringing is required | Current app can report unconfirmed notification status, but true background push proof needs provider/device conditions. |
| Possible Admin Refresh visual artifact. | Human review | XML/source were correct; changing admin UI without a reproducible source bug would be speculative. |
| Provider dashboard MFA/access evidence. | Human review | Requires sanitized owner/provider proof; repo code cannot prove private dashboard state. |

## Remaining Launch Blockers

- Actual-user Chat Call normal manual call/ring/join/end proof remains Partial until two Play-internal phones reproduce the updated path. Diagnostic/backend proof is not actual-user proof.
- Actual-user Live waiting-room/seat request/host action proof remains Partial until Robert/testers reproduce it in the Play-internal installed app.
- Background receiver push/ring behavior remains Partial unless the product explicitly supports only in-app/in-thread ringing with clear caller status.
- Provider dashboard MFA/access remains owner-confirmation-required.
- Any proof labeled Closed from diagnostic/backend/controlled evidence must stay downgraded unless installed-app actual-user evidence exists.

## Actual-User Proof Classification

Actual-user installed-app proof result: Partial.

Source fixes and guardrails are in place. The affected user-visible paths still require a Play-internal installed-app rerun through the normal visible path before they can be called actual-user Closed.

## Safety Confirmation

- No physical phone sideload was used.
- No install, uninstall, reinstall, clear-data, or wipe-cache happened.
- No Play production submission happened.
- No provider mutation happened.
- No provider/live-money mutation happened.
- No Google Play product/base-plan mutation happened.
- No RevenueCat provider configuration mutation happened.
- No Stripe mutation happened.
- No purchases were executed.
- No provider refunds were executed.
- No payouts/cashout/withdrawals/transfers happened.
- No Stripe Connect production happened.
- No payable balances were enabled.
- Current First Owner was not touched.
- No real users were modified.
- No auth/RLS/Premium/chat/account-status/staff permission weakening happened.
- No auth/account-status/chat permission bypass was added.
- No service-role authority proof was used.
- liveMoneyEnabled remains OFF.
- Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF.
- No secrets/tokens/private data were committed or artifacted.

## Next Action

Deliver or pick up the JS fix on the Play-internal runtime or next Play internal build, then rerun only the affected installed-app paths:

1. Chi'lly Chat video call through normal visible app path on both physical Play-internal v57 phones, verifying local and remote video on both devices.
2. Fullscreen/large RTC video on mismatched phone sizes.
3. Live Watch-Party waiting-room seat request and host Approve, Deny, Mute, Seat Participant, and Remove controls.
4. Focused Admin visual smoke for the Platform Snapshot Refresh control.
