# Google-Signed V76 Modern Call Ringtones Installed Proof

## Verdict

Chi'lly Chat modern call ringtones installed proof: Partial.

Source/audio asset replacement is ready and guarded. Installed two-phone audible in-app ringtone proof and background/outside-app audible ring proof remain pending until the Google Play-installed v76 app loads the OTA and the calls are physically exercised.

## Scope

This lane replaces weak click-like Chi'lly Chat call ringtone assets with original app-owned generated ringtone WAVs while preserving the existing ringtone names and preference keys:

- Chi'lly Ring
- Skyline Pulse
- Theater Bell
- Velvet Knock
- Quiet Buzz
- Classic Phone

No copyrighted ringtone files, commercial ringtone packs, or downloaded third-party audio were used.

## Source Changes

Source-code and asset files:

- `scripts/generate-chilly-chat-modern-ringtones.mjs`
- `scripts/guard-chilly-chat-ringtone-assets.mjs`
- `package.json`
- `assets/sounds/chilly-chat/chilly_ring.wav`
- `assets/sounds/chilly-chat/skyline_pulse.wav`
- `assets/sounds/chilly-chat/theater_bell.wav`
- `assets/sounds/chilly-chat/velvet_knock.wav`
- `assets/sounds/chilly-chat/quiet_buzz.wav`
- `assets/sounds/chilly-chat/classic_phone.wav`
- `android/app/src/main/res/raw/chilly_ring.wav`
- `android/app/src/main/res/raw/skyline_pulse.wav`
- `android/app/src/main/res/raw/theater_bell.wav`
- `android/app/src/main/res/raw/velvet_knock.wav`
- `android/app/src/main/res/raw/quiet_buzz.wav`
- `android/app/src/main/res/raw/classic_phone.wav`

Docs/proof files:

- `docs/CHILLY_CHAT_SOUND_LICENSES.md`
- `docs/CHILLY_CHAT_CALL_NOTIFICATION_RINGTONE_SYSTEM.md`
- `docs/release/GOOGLE_SIGNED_V76_MODERN_CALL_RINGTONES_INSTALLED_PROOF.md`
- `CURRENT_STATE.md`
- `NEXT_TASK.md`
- `docs/FINAL_PUBLIC_USE_GO_NO_GO.md`
- `docs/FINAL_PRODUCTION_READINESS_CHECKLIST.md`

No WebRTC/media setup, room routing, Money Center, providers, live money, payouts/cashout, auth/RLS, or native config behavior was changed.

## Audio Asset Replacement Result

The six ringtone WAV files are original deterministic generated Chi'llywood app assets. The generator creates committed final audio assets; no runtime generation is required on-device.

The generated files are 16-bit mono PCM WAV at 44.1 kHz, with durations around 2.6-3.4 seconds so each option behaves like a deliberate ringtone motif rather than a one-shot click. `Quiet Buzz` remains lower-volume and vibration-first by design, but it is not silent.

## Ringtone Name / Preference-Key Preservation Result

The existing user-facing names and preference keys are preserved. Saved ringtone choices continue to map to the same keys:

- `chilly_ring`
- `skyline_pulse`
- `theater_bell`
- `velvet_knock`
- `quiet_buzz`
- `classic_phone`

The default background Android call channel sound remains `chilly_ring.wav`.

## Device Binary / OTA Proof

Baseline devices:

- `R5CR120QCBF`: Google Play-installed `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `76`, versionName `1.0.0`.
- `R3CXA0DS5JV`: Google Play-installed `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `76`, versionName `1.0.0`.

No sideload, `adb install`, logout, clear data, uninstall, or reinstall happened.

OTA proof for the modern in-app ringtone assets is pending until the source commit is published and the installed app loads the update. Android background/outside-app channel sound uses the installed native raw resource and may require a future Google Play build, new channel id, channel reset, or user channel settings change before the background asset itself changes.

## Android Sound Environment Result

Baseline readback:

- `R3CXA0DS5JV` has Android Zen/DND mode off (`0`) and is the preferred audible background-ring receiver.
- `R5CR120QCBF` has Android Zen/DND mode on (`1`), so Android may suppress audible notification sound on that device.
- Both phones have the `chilly_chat_calls_v2` notification channel with max/high importance, sound `android.resource://com.chillywood.mobile/raw/chilly_ring`, and vibration enabled.

## Settings Preview Result For All Six Sounds

Pending installed proof after OTA load:

- Chi'lly Ring
- Skyline Pulse
- Theater Bell
- Velvet Knock
- Quiet Buzz
- Classic Phone

Expected installed result: each Preview Sound action audibly plays the selected in-app ringtone. If playback fails, the UI must show: `Sound could not play. Check media volume, notification volume, or Android sound settings.`

## Ringtone Quality Result

Source/audio asset quality is guarded:

- each option is a longer deliberate alert/ringtone motif,
- each option is audible by generated waveform level checks,
- app asset and Android raw copies match exactly,
- no option is a click-only file,
- no third-party ringtone file is used.

Human installed-device audible quality proof remains pending.

## Voice In-App Ringtone Result

Pending two-phone installed proof after OTA load.

Expected result: with Ring on calls ON, receiver hears the selected ringtone on a normal in-app surface outside the thread; with Ring on calls OFF, receiver gets the incoming-call modal with no ringtone.

## Video In-App Ringtone Result

Pending two-phone installed proof after OTA load.

Expected result: receiver hears the selected ringtone for video calls and the existing local/remote video behavior remains intact.

## Ring Toggle OFF Result

Pending installed proof after OTA load.

Expected result: Ring on calls OFF disables audible in-app ringtone without disabling vibration or the incoming-call UI.

## Vibrate Toggle OFF Result

Pending installed proof after OTA load.

Expected result: Vibrate on calls OFF disables vibration without disabling audible ringtone or the incoming-call UI.

## Same-Thread Incoming Call Result

Pending installed proof after OTA load.

Expected result: same-thread full incoming-call UI still appears, follows selected sound/vibration settings, and does not show duplicate broken overlays.

## Background / Outside-App Notification Ring Result

Partial.

The installed Android call channel is configured with `chilly_ring` and vibration. Actual background audible ringing still requires physical proof on a non-DND receiver. If the background sound remains silent, Android DND, notification permission, channel/user settings, OEM restrictions, or the installed native raw asset/channel lifecycle must be checked before calling it an app bug.

## Notification Channel / DND / User Setting Caveats

Android notification channels are user- and OS-controlled after creation. OTA can update in-app preview and foreground ringtone assets, but it may not replace the raw sound already bundled into a Play-installed native binary or override a channel whose sound has been user/OS locked. Background/outside-app sound may require:

- a future Google Play internal build containing the new raw WAVs,
- a new channel id,
- user channel reset or manual channel sound adjustment,
- Android DND/Zen OFF,
- notification permission and notification volume enabled.

## Safety Confirmation

No provider setup changed. No live money, payouts, cashout, auth/RLS, Money Center, room routing, WebRTC/media setup, Play production submission, sideload, `adb install`, logout, clear data, uninstall, or reinstall happened.

## Proof Artifacts

Artifact folder:

`/tmp/google-play-internal-v76-modern-call-ringtones-installed-proof-20260703-121053/`
