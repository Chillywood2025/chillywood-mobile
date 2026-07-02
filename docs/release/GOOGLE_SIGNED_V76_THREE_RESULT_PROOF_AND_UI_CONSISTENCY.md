# Google-Signed V76 Three Result Proof And UI Consistency

Date: 2026-07-02

Verdict: Closed for the three requested installed-result lanes on Google Play-installed v76 plus verified runtime-compatible OTA behavior. Room-safe tray/call closure remains governed by the prior final room notification/Profile bell proof and was not broadened in this pass.

Proof artifacts:

- `/tmp/google-play-internal-v76-three-result-proof-and-ui-consistency-20260702-103354/`

## Repo / Origin Alignment

Start state:

- `HEAD == origin/main == c8e963c17e84c617dcf9ede2e61e2398fd5a0813`
- Tracked tree was clean before proof.
- Only pre-existing untracked artifact/temp folders were present.

## Device Binary / OTA Proof

Both physical phones were attached and authorized:

- `R5CR120QCBF`: package `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `76`, versionName `1.0.0`, lastUpdateTime `2026-07-01 00:55:59`.
- `R3CXA0DS5JV`: package `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `76`, versionName `1.0.0`, lastUpdateTime `2026-07-01 00:53:55`.

The installed release app is not debuggable, so the active Expo Updates database could not be read directly from app storage. The installed UI behavior proved the latest runtime-compatible OTA lanes were active:

- Premium gate / call media / timestamp source lane: commit `3a3d4da001ecd9eec8276c5e8ba0d64941cb388c`, OTA group `75e28a95-63c1-4fd6-b317-89346b55e4b8`, Android update `019f234d-5d62-7098-9982-97cea9a0af7d`, runtime `1.0.0`.
- Settings / Bell Activity split source lane: commit `9c77ceaa72d574d9745b9d139630ea907b54c0f8`, OTA group `f402a647-a04a-4920-9543-c9e3b7499f3e`, Android update `019f236d-1032-79d5-a333-ec0a4a7f62ca`, runtime `1.0.0`.

No Play production submission, sideload, `adb install`, logout, uninstall, reinstall, clear data, provider mutation, live money, payout, cashout, or auth/RLS weakening happened.

## Lane 1: Creator Transaction Matrix

Closed for installed UI routing proof.

The current no-logout creator proof account could open Platform Studio and Money Center Transactions. Safe sandbox/proof/not-payable creator notification fixture rows were mirrored only for the current creator account because the older fixture packet did not expose all six rows in the current installed session.

Fixture limits:

- UI/routing proof only.
- Not purchase-generation proof.
- No access grant from notification.
- No provider mutation.
- No payout, cashout, payable balance, or live money.
- Target route: `/channel-studio?tab=monetization&focus=transactions`.

Installed proof tapped all six rows and each routed to Platform Studio Money Center Transactions with no Premium gate and no Not Found:

- Paid Video sold.
- Seat Pass sold.
- Channel Subscription started.
- VIP sold.
- Event Pass sold.
- Tip received.

Seat Pass wording remained visible as Seat Pass, not Ticket.

## Lane 2: Premium Gate / Call Media / Notification Timestamps

Closed for installed proof.

Premium gate:

- A Premium-backed Live gate opened and showed `Premium required`.
- The primary path was `Manage Premium`.
- Tapping `Manage Premium` opened the Premium / subscribe screen.
- The installed gate no longer dead-ended on `Retry Offer Lookup`.
- No Premium bypass was created.

Voice call media label:

- A Chi'lly Chat voice call was started and answered.
- The incoming voice call overlay showed voice-call copy and actions.
- The audio-only voice flow did not show `Video connected`.
- The call returned to `No Active Call` after the quick proof flow.

Video call / camera render:

- A Chi'lly Chat video call reached `2 in call` on both phones.
- Both phones showed local and remote video.
- `Video connected` appeared only on tiles with renderable video.
- Camera imagery rendered as real video, not as a reused audio stream URL.
- Toggling the caller camera produced a transient connecting state and then recovered to live video on both tiles.
- End Call cleared both phones back to `No Active Call`.

Notification timestamps:

- Bell tray rows showed readable timestamps.
- Accessibility labels included timestamps.
- Read/unread state and routing remained visible after timestamps were added.

## Lane 3: Settings / Bell Activity Split

Closed for installed proof.

Settings:

- Settings no longer renders a notification Activity inbox/list.
- Settings manages notification preferences, device push status, Register Device, Refresh, Bell Activity guidance, and incoming call sound.
- Settings copy explains that Activity lives in the bell tray.

Bell Activity:

- The bell tray owns Important / Action Needed and Recent Activity rows.
- Rows show timestamps, read state, dismiss affordances, and route actions.
- The footer says `Open Notification Settings`, not `Open Activity Settings`.
- Tapping the footer opens Settings notification controls, not a duplicate Activity inbox.

## Observed UI/UX Consistency Issues

- Surface/screen: Chi'lly Chat thread. Issue: an older proof message visibly showed URL-encoded text (`%20`) instead of decoded spaces. Why it matters: users may read encoded text as broken chat content. Severity: Low. Blocks proof: No. Recommended next action: message rendering/backfill review. Fixed in this pass: No.
- Surface/screen: Settings account header. Issue: the signed-in account header can expose a private email address as the primary account identifier. Why it matters: screenshots and public support contexts can reveal private data. Severity: Medium. Blocks proof: No. Recommended next action: privacy/display review for Settings account identity. Fixed in this pass: No.
- Surface/screen: Live / Platform Studio Premium copy. Issue: creator/business screens still contain dense sandbox and money-safety copy. Why it matters: safe but visually heavy; users may miss the primary action. Severity: Low. Blocks proof: No. Recommended next action: later copy hierarchy polish without changing money safety. Fixed in this pass: No.
- Surface/screen: Video call camera toggle. Issue: one tap produced a transient `Camera connecting` state before a second tap recovered live video. Why it matters: if this sticks for a user it can look like the camera button is broken. Severity: Medium. Blocks proof: No in this pass because recovery and live video were proved. Recommended next action: monitor for stuck camera-connecting reports and add clearer off/connecting/live labels if repeated. Fixed in this pass: No.

## Safety Confirmation

No Money Center refactor, navigation refactor, room architecture refactor, Play production submission, sideload, `adb install`, logout, uninstall, reinstall, clear data, provider mutation, live money, payout, cashout, auth/RLS weakening, fake purchase-generation proof, or raw-token exposure happened.

Seeded/mirrored notification rows are sandbox/proof/not-payable UI fixtures only. They do not prove purchase generation, grant access, create payouts, create cashout, create payable balances, mutate providers, or enable live money.

`liveMoneyEnabled` remains OFF.

## Validation

Validation logs are stored under:

- `/tmp/google-play-internal-v76-three-result-proof-and-ui-consistency-20260702-103354/validation/`

