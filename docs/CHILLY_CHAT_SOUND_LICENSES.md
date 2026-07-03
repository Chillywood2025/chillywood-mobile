# Chi'lly Chat Sound Licenses

Date: 2026-07-03

This file records provenance for every bundled Chi'lly Chat call ringtone committed under `assets/sounds/chilly-chat/`.

The same files are mirrored under `android/app/src/main/res/raw/` with Android-safe filenames so checked-in native Android builds include the notification sound resources. The Android raw copies carry the same source and license as the app asset copies.

## Source And License

The current Chi'lly Chat ringtone files are original generated Chi'llywood app assets. No third-party ringtone files are used. No copyrighted ringtone files, commercial ringtone packs, or downloaded third-party audio are included in this pass.

Generation source:

- Generator script: `scripts/generate-chilly-chat-modern-ringtones.mjs`
- Generation date: 2026-07-03
- Author/owner: Chi'llywood app project
- License/use status: app-owned original generated assets for use inside Chi'llywood
- Runtime generation required: no
- Committed final files: yes

The generator creates deterministic PCM WAV tones using oscillator/envelope synthesis. It does not sample or import external audio.

## Chi'lly Ring

- Display name in app: Chi'lly Ring
- Preference key: `chilly_ring`
- Local filename: `assets/sounds/chilly-chat/chilly_ring.wav`
- Android raw filename: `android/app/src/main/res/raw/chilly_ring.wav`
- Source: original generated Chi'llywood app asset
- Intended use: default modern Chi'lly Chat ring
- Notes: Chi'lly Ring remains the default bundled Android call-channel sound for future native builds.

## Skyline Pulse

- Display name in app: Skyline Pulse
- Preference key: `skyline_pulse`
- Local filename: `assets/sounds/chilly-chat/skyline_pulse.wav`
- Android raw filename: `android/app/src/main/res/raw/skyline_pulse.wav`
- Source: original generated Chi'llywood app asset
- Intended use: brighter modern pulse for users who want a more energetic call alert
- Notes: In-app ringtone selection only on already installed binaries until a future native build carries the updated Android raw copy.

## Theater Bell

- Display name in app: Theater Bell
- Preference key: `theater_bell`
- Local filename: `assets/sounds/chilly-chat/theater_bell.wav`
- Android raw filename: `android/app/src/main/res/raw/theater_bell.wav`
- Source: original generated Chi'llywood app asset
- Intended use: clean bell-style call alert
- Notes: Generated as a short repeating bell motif, not a one-shot click.

## Velvet Knock

- Display name in app: Velvet Knock
- Preference key: `velvet_knock`
- Local filename: `assets/sounds/chilly-chat/velvet_knock.wav`
- Android raw filename: `android/app/src/main/res/raw/velvet_knock.wav`
- Source: original generated Chi'llywood app asset
- Intended use: softer warm call alert that remains audible
- Notes: Generated with longer tonal body so it is not just a dull tap.

## Quiet Buzz

- Display name in app: Quiet Buzz
- Preference key: `quiet_buzz`
- Local filename: `assets/sounds/chilly-chat/quiet_buzz.wav`
- Android raw filename: `android/app/src/main/res/raw/quiet_buzz.wav`
- Source: original generated Chi'llywood app asset
- Intended use: low-key, vibration-first call alert
- Notes: Quiet Buzz is intentionally quieter than the other options but still contains audible generated tone content. Settings copy identifies it as quieter / vibration-first.

## Classic Phone

- Display name in app: Classic Phone
- Preference key: `classic_phone`
- Local filename: `assets/sounds/chilly-chat/classic_phone.wav`
- Android raw filename: `android/app/src/main/res/raw/classic_phone.wav`
- Source: original generated Chi'llywood app asset
- Intended use: familiar phone-style ring with modernized synthesized tone
- Notes: Generated as an alternating call-ring motif.

## Native Build Boundary

The Expo OTA bundle can update the in-app Settings preview and foreground incoming-call ringtone assets because those are JavaScript-managed app assets.

Background/outside-app Android call notification sound still depends on Android notification channel behavior:

- The active channel id is `chilly_chat_calls_v2`.
- The default bundled channel sound is `chilly_ring.wav`.
- Android channel sound/importance behavior is controlled by Android and the user's channel settings after a channel exists.
- If an installed device already created the channel with older sound behavior, Android may keep the user's existing channel sound settings.
- Updating the native Android raw sound used by notification channels for all testers may require a new Google Play internal build, a new channel id, or a user channel reset/settings change.

User downloaded/imported sounds remain in-app-only for V1 and are not promised for Android background push notification sounds.
