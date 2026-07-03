# Google-Signed V76 Modern Call Ringtones Installed Proof

## Verdict

Chi'lly Chat modern call ringtones installed proof: Partial.

The modern in-app ringtone source/OTA work is fixed and guarded, and the outside-app call notification path is app-fixed for Google Play-installed v76 plus OTA: calls now dispatch on `chilly_chat_calls_v3`, the channel uses Android's default notification sound plus vibration at high/max importance, and tapping the outside-app notification opens an answerable Chi'lly Chat incoming-call UI.

Full audible outside-app ringtone closure remains Partial because Android still controls notification sound output. `R3CXA0DS5JV` has DND/Zen off, but its Android `STREAM_NOTIFICATION` volume is `0`, so the app can vibrate and post the call notification but Android will not make audible notification sound on that device. `R5CR120QCBF` has DND/Zen off and nonzero notification volume; installed proof shows the call notification posts under alerting notifications with channel sound and vibration enabled, but tool-side proof cannot hear the physical speaker. Continuous phone-call-style ringing/full-screen lock-screen call behavior remains a native Android call notification/full-screen intent build requirement, not an OTA-only fix.

## Scope

This lane replaced weak click-like Chi'lly Chat call ringtone assets with original app-owned generated ringtone WAVs while preserving the existing ringtone names and preference keys:

- Chi'lly Ring
- Skyline Pulse
- Theater Bell
- Velvet Knock
- Quiet Buzz
- Classic Phone

No copyrighted ringtone files, commercial ringtone packs, or downloaded third-party audio were used.

## Source Changes

Source-code and asset files:

- `_lib/chillyChatCallSoundAssets.ts`
- `_lib/notifications.ts`
- `supabase/functions/chilly-chat-call-dispatch/index.ts`
- `app/settings.tsx`
- `scripts/generate-chilly-chat-modern-ringtones.mjs`
- `scripts/guard-chilly-chat-ringtone-assets.mjs`
- `scripts/guard-chilly-chat-call-push-policy.mjs`
- `scripts/guard-notification-room-call-policy.mjs`
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

No WebRTC/media setup, room routing, Money Center, providers, live money, payouts/cashout, auth/RLS, or Play production behavior was changed.

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

The source/default call sound remains `Chi'lly Ring`.

## Device Binary / OTA Proof

Baseline devices:

- `R5CR120QCBF`: Google Play-installed `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `76`, versionName `1.0.0`.
- `R3CXA0DS5JV`: Google Play-installed `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `76`, versionName `1.0.0`.

No sideload, `adb install`, logout, clear data, uninstall, or reinstall happened.

Latest app-source/background-call fix:

- Commit: `d23339bdbd251b4d070047d2dbe81c1e8620e3ab`
- EAS Update branch/channel: `production`
- Runtime: `1.0.0`
- Android update group: `0db0be81-fd60-49a1-ab7f-8bfb169122f4`
- Android update id: `019f2909-5188-7ff6-82eb-907e47e3dd48`
- Supabase Edge Function deployed: `chilly-chat-call-dispatch`

## Android Sound Environment Result

Latest installed readback:

- `R5CR120QCBF`: Zen/DND `0`, Android notification stream nonzero (`STREAM_NOTIFICATION` speaker volume `7`), ring stream nonzero, media stream nonzero.
- `R3CXA0DS5JV`: Zen/DND `0`, Android ring stream nonzero (`STREAM_RING` speaker volume `15`), media stream nonzero, but Android notification stream muted (`STREAM_NOTIFICATION` speaker volume `0`).

That R3 state explains the owner-observed behavior: it vibrates and shows the notification, but Android will not play an audible notification sound while the notification stream is `0`. This is a device sound setting, not a Chi'lly Chat dispatch failure.

## Settings Preview Result For All Six Sounds

Installed preview proof previously confirmed the preview handler no longer shows fake success. Preview playback uses the selected in-app ringtone asset and shows the clear failure copy if playback cannot start:

`Sound could not play. Check media volume, notification volume, or Android sound settings.`

The source/asset guard confirms all six modern sound files exist, are non-click-like, have bounded duration/loudness, preserve mapping keys, and use no third-party ringtone files.

## Ringtone Quality Result

Source/audio asset quality is guarded:

- each option is a longer deliberate alert/ringtone motif,
- each option is audible by generated waveform level checks,
- app asset and Android raw copies match exactly,
- no option is a click-only file,
- no third-party ringtone file is used.

Installed v76's native APK still contains the old bundled raw notification resources, because OTA cannot replace native `res/raw` resources inside the already-installed Play binary. Pulled v76 APK inspection showed old short raw files such as `res/raw/chilly_ring.wav` at about 1.16 seconds with low RMS compared with the modern source asset. Modern background raw notification sound assets require a future Google Play/internal native build.

## Voice In-App Ringtone Result

Source/OTA behavior is fixed for foreground/in-app call sheets. The selected ringtone is used for in-app incoming calls when Ring on calls is ON, and Ring on calls OFF disables audible foreground ringing without disabling the incoming-call UI. Vibrate on calls remains separate.

## Video In-App Ringtone Result

Source/OTA behavior is fixed for foreground/in-app video call sheets. The selected ringtone is used for incoming video calls, while existing local/remote video render behavior remains separate from sound playback.

## Ring Toggle OFF Result

Ring on calls controls audible in-app ringtone playback. It does not disable the incoming-call UI or vibration.

## Vibrate Toggle OFF Result

Vibrate on calls controls in-app vibration separately from sound. It does not disable the incoming-call UI or audible ringtone.

## Same-Thread Incoming Call Result

Same-thread incoming call UI remains thread-owned and full-screen/card-style, not compact-only. It follows selected sound/vibration preferences and avoids the app-wide duplicate overlay where possible.

## Background / Outside-App Notification Ring Result

Partial.

The app-side outside-app notification path is fixed:

- Push dispatch now targets `chilly_chat_calls_v3`.
- Edge push payload uses default notification sound for v76: `sound: "default"`.
- The installed app creates `chilly_chat_calls_v3` with max/high importance and vibration.
- R3 channel readback showed `mImportance=5`, `mSound=content://settings/system/notification_sound`, and vibration enabled.
- R5 outside-app receiver proof showed an alerting notification for `Incoming Chi'lly Chat voice call` on `chilly_chat_calls_v3`.
- R5 notification readback showed high importance, default notification sound, and vibration enabled.
- Tapping the outside-app notification opened the correct answerable Chi'lly Chat incoming-call UI with Accept and Decline.
- End Call cleanup returned both phones to `No Active Call`.

Audible ring remains device-setting/native-limited:

- `R3CXA0DS5JV` cannot audibly ring from Android notifications while its Android notification stream is `0`, even though DND is off.
- `R5CR120QCBF` has nonzero notification volume and the notification was posted as sound/vibration capable, but the proof tooling cannot hear the physical speaker.
- A continuous phone-call-like ringtone outside the app, full-screen lock-screen call UI, or bundled modern raw channel sound requires native Android notification/full-screen intent/call-style work and a future Play build. OTA cannot make a backgrounded/killed JS app loop an in-app ringtone or replace already-installed native `res/raw` channel sound files.

## Notification Channel / DND / User Setting Caveats

Android notification channels are user- and OS-controlled after creation. OTA can update in-app preview and foreground ringtone behavior, but it cannot override:

- Android notification stream volume set to zero,
- Android notification permission,
- DND/Zen,
- user-muted app/channel settings,
- OEM notification/battery restrictions,
- already-installed native raw resources,
- native full-screen/call-style behavior that is not present in the current binary.

For v76, using `chilly_chat_calls_v3` with Android's default notification sound is the safest OTA-compatible outside-app fix because it avoids relying on the old weak bundled raw sound in the installed binary. A stronger background call ringtone should be handled in a future owner-approved Play/internal native build with a new bundled raw asset/channel plan.

## Safety Confirmation

No provider setup changed. No live money, payouts, cashout, auth/RLS, Money Center, room routing, WebRTC/media setup, Play production submission, sideload, `adb install`, logout, clear data, uninstall, or reinstall happened.

## Proof Artifacts

Artifact folder:

`/tmp/google-play-internal-v76-modern-call-ringtones-installed-proof-20260703-121053/`

Key subfolders:

- `/tmp/google-play-internal-v76-modern-call-ringtones-installed-proof-20260703-121053/outside-app-v3-fix/`
- `/tmp/google-play-internal-v76-modern-call-ringtones-installed-proof-20260703-121053/outside-app-v3-fix/r5-receiver-20260703-123826/`

Key artifacts:

- `R3-v3-background-call-home-notification.png`
- `R3-v3-notification-shade-during-call.png`
- `R3-dumpsys-notification-v3-during-call.txt`
- `R5-outside-call-notification-home.png`
- `R5-outside-call-notification-shade.png`
- `R5-dumpsys-notification-outside-call.txt`
- `R5-after-tapping-outside-call-notification.xml`
- `R5CR120QCBF-after-end-call-cleanup.xml`
- `R3CXA0DS5JV-after-end-call-cleanup.xml`
