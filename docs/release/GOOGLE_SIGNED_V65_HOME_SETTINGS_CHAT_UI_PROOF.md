# Google-Signed v65 Home Settings + Chat UI Proof

Verdict: Partial.

The source polish is present in commit `a38e5ac5587591fab2ed4a9308c8dd90d46005a0`, and Google Play internal versionCode `65` was built and submitted from that commit. `R5CR120QCBF` updated from Google Play internal testing and proved the Home Settings icon-only requirement on the installed app. The full installed UI closeout remains Partial because `R5CR120QCBF` became ADB unauthorized before Explore/Live/Saved and direct-thread captures were completed, and `R3CXA0DS5JV` was not visible to ADB during this proof window.

Follow-up source note: `docs/release/HEADER_CONTROL_CONSISTENCY_CLEANUP.md` records the later source fix that makes Explore, Live, and Saved mirror Home's header layout by placing the icon-only Settings gear beside the tab label on the left and Profile alone on the right. That source follow-up still needs future installed proof.

Source fixed is not installed-app proof. Google Play internal install is not enough without actual user flow proof. `installerPackageName` must be `com.android.vending`. Sideloaded APK proof is not accepted.

## Build And Submit

- Repo commit proved in build: `a38e5ac5587591fab2ed4a9308c8dd90d46005a0`.
- Origin/main alignment before build: clean tracked tree, `HEAD == origin/main`.
- EAS build: `3a5e65e3-352e-4c72-bc89-2347474496e2`.
- EAS submit: `482a1080-8a7a-4c86-9f79-64ea13b7f82a`.
- Track: Google Play internal testing only.
- Artifact type: Android App Bundle / Google Play store build.
- Version: `1.0.0`.
- VersionCode: `65`.
- Runtime version: `1.0.0`.
- Play production submission: not performed.

## Installed Package Proof

| Device | Result |
| --- | --- |
| `R5CR120QCBF` | Pass: updated through Google Play internal testing; package `com.chillywood.mobile`, versionCode `65`, versionName `1.0.0`, `installerPackageName=com.android.vending`, lastUpdateTime `2026-06-29 12:23:25`. |
| `R3CXA0DS5JV` | Pending: not visible to ADB during this proof window, so no v65 package readback or UI proof was captured. |

No sideload, manual APK install, adb install, uninstall, reinstall, logout, or clear-data action was used for the installed proof.

## Home Settings Result

Home Settings control is icon-only. The visible word Settings must not appear on the Home top control. Accessibility label remains Settings. Settings icon must not overlap page labels or hero text.

`R5CR120QCBF` installed v65 proof captured Home with:

- `main-tab-home-settings-action` present as a focusable/clickable button.
- `content-desc="Settings"` for screen readers.
- Visible child text limited to the gear glyph.
- `HOME` label rendered beside the gear with non-overlapping bounds.
- Hero copy starting below the top control, with no blocked or covered text.
- Tapping the icon opened `/settings`; the signed-in session remained intact.

Artifact evidence:

- `/tmp/app-google-signed-v65-home-settings-chat-ui-proof-20260629-122417/r5-home.png`
- `/tmp/app-google-signed-v65-home-settings-chat-ui-proof-20260629-122417/r5-home.xml`
- `/tmp/app-google-signed-v65-home-settings-chat-ui-proof-20260629-122417/r5-home-relaunch.xml`
- `/tmp/app-google-signed-v65-home-settings-chat-ui-proof-20260629-122417/proof-matrix.json`
- `/tmp/app-google-signed-v65-home-settings-chat-ui-proof-20260629-122417/secret-token-scan.txt`

The Settings-open screenshot/XML were intentionally removed from the artifact set because Settings contained normal signed-in account text. The Settings-open result is recorded only as a sanitized proof fact.

## Explore / Live / Saved Settings Result

Source status: fixed. Installed proof status: Pending.

The shared top bar source uses compact icon-only Settings controls for Explore, Live, and Saved with `accessibilityLabel="Settings"` and the `main-tab-${surface}-settings-action` test id pattern. However, the installed capture attempt was interrupted after the phone focus returned to Google Play and then `R5CR120QCBF` became ADB unauthorized. The attempted Explore/Live/Saved screenshot files in the artifact folder are not counted as proof.

## Direct Thread Card Removal Result

Source status: fixed. Installed proof status: Pending.

The MESSAGE THREAD / Chat stays primary card is removed from current source. Direct thread remains message-first in source: `chat-thread-messages-scroll`, `chat-thread-composer`, compact `Recent calls in this thread` rows, Voice Call, and Video Call remain present. The v65 installed direct-thread capture was not completed after ADB authorization was lost.

Composer, Voice Call, and Video Call remain available in source. The prior Google-signed v64 hide/reopen proof and v63 direct-thread UX proof remain the latest installed evidence for those controls until v65 direct-thread flow proof is captured.

## Regression Result

- Hide/Delete from inbox behavior: source and existing v64 installed proof remain Closed; not rerun on v65 during this interrupted proof.
- Direct thread card removal: source-fixed; installed v65 direct-thread proof Pending.
- Route/brand/Supabase validation: rerun in this lane where available and documented in the final report.

## Proof Artifacts

Artifact root: `/tmp/app-google-signed-v65-home-settings-chat-ui-proof-20260629-122417/`

Valid proof artifacts:

- `README.md`
- `r5-home.png`
- `r5-home.xml`
- `r5-home-relaunch.xml`
- `proof-matrix.json`
- `secret-token-scan.txt`

Not counted as proof:

- Failed Explore/Live/Saved captures where the device focus had returned to Google Play or the loop command failed.
- Settings-open screenshot/XML because Settings contained normal signed-in account text; the result is recorded only as sanitized proof fact.

## Safety Confirmation

No logout, uninstall, reinstall, or clear-data happened. No auth/RLS/chat/account-status permission weakening happened. No provider/live-money mutation happened. `liveMoneyEnabled` remains OFF. No Play production submission happened. No chat history was hard-deleted. No provider, Premium, payout, payable balance, withdrawal, cash-out, Stripe, merch, or refund behavior changed.
