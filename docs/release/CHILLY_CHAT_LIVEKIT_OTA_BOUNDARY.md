# Chi'lly Chat LiveKit OTA boundary decision

Decision date: 2026-07-28

Assessed application source: `afa7fe79263941024392922e779f5d45f29f6b3b`

Status: source and native-boundary review complete. The one compatible iOS
internal OTA has been published and read back on build 8. The Owner separately
approved one bounded Android replacement binary after reviewing the exact
channel-only delta below. This report does not claim an installed call result.

## Migration delta

The accepted-call migration changes JavaScript/TypeScript media ownership and
the Supabase schema and Edge Functions. It does not change a native dependency,
LiveKit SDK version, Expo config plugin, entitlement, permission, background
mode, privacy manifest, Android manifest rule, R8/ProGuard rule, CocoaPods
linkage, or native CallKit/PushKit module.

Both installed candidate source commits contain the same locked versions used
by the migration:

- `@livekit/react-native` `2.10.0`
- `@livekit/react-native-expo-plugin` `1.0.2`
- `@livekit/react-native-webrtc` `144.0.0`
- `livekit-client` `2.18.3`
- Expo `54.0.36`
- React Native `0.81.5`

Both candidate sources already contain the LiveKit Expo plugin, the iOS static
framework compatibility plugin, the native Chat Call notification and
PushKit/CallKit plugins, camera and microphone usage descriptions, and Android
camera, audio-recording, and audio-routing permissions.

## Android

Classification: `ANDROID_REPLACEMENT_BINARY_REQUIRED`

Google Play Internal build 84 has the necessary native LiveKit modules and is
otherwise JavaScript-compatible with the migration. Its embedded update
identity is:

- runtime `1.0.0-android-imagemanipulator-v1`;
- channel `production`;
- native source `8c426f4e74de61de7d4529d32d124744833912dc`.

The migration therefore does not require a LiveKit SDK or permission rebuild.
It does require an isolated internal delivery boundary. The installed binary
cannot be retargeted from `production` to an internal-only channel by OTA, and
publishing this canary to the channel named `production` is prohibited. Runtime
filtering does not turn that public channel into an internal channel.

The exact replacement-binary delta is an embedded Android-only internal update
channel `android-chat-livekit-qa`, while retaining runtime
`1.0.0-android-imagemanipulator-v1`, the existing package identifier, the
existing LiveKit/native-call packages, and Google Play Internal distribution.
The dedicated `android-chat-livekit-qa` EAS profile extends the existing
locally-signed production App Bundle profile, changes only the embedded update
channel, and remains bound to the production backend configuration and the
Google Play `internal` submit target. Owner approval was received on 2026-07-28
for exactly one replacement App Bundle under this boundary. Production, open,
and closed Play tracks remain prohibited.

No Android OTA was published. Before the approved replacement is installed, a
connected Google Play installation reads back app version `1.0.0`, native build
`84`; the migration source is not installed there.

## iOS

Classification: `IOS_CHAT_CALL_LIVEKIT_OTA_COMPATIBLE`

Internal TestFlight build 8 is already isolated on:

- runtime `1.0.0-iosqa1`;
- channel `ios-qa`;
- native source `bbb9d6db67620b1d39e3a3e67ab8ef7166ce02ae`.

Its source contains the same LiveKit SDK and bridge versions, static framework
compatibility, privacy manifest, camera/microphone descriptions, audio
background mode, and PushKit/CallKit module required by the migration. The
accepted-call migration adds no iOS-native delta.

The assessed implementation passed CI 13/13. Exactly one iOS-only update was
published:

- branch/channel: `ios-qa`;
- runtime: `1.0.0-iosqa1`;
- source: `fe741d57caf7a16d0c2b0c512c4e2dbef0dd4a13`;
- update group: `2bc8da20-5b4d-4c02-b34b-7c7b59fcc097`;
- iOS update: `019fa921-fb2c-754d-858b-578a26d67063`.

The connected TestFlight build 8 downloaded the update and recorded two
successful launches with zero failed launches. Pre-migration update
`019f9c13-9f6d-7c52-9cee-71265b8fd565` remains retained as the compatible
rollback target. No `production` channel update and no public release
occurred.

## Canary hold

Two configured synthetic participant accounts authenticate successfully and
each has zero active platform roles. Their sanitized account hashes are
`c390b3190ff5788a` and `4aa617dd1819d6d3`. Neither account is enrolled yet.
The Chat Call rollout remains `legacy_webrtc` by default with canary disabled
and emergency stop engaged because both installed platforms do not yet contain
the migration source.

## Guardrails

- Do not publish the migration to Android runtime `1.0.0`.
- Do not publish to the `production` channel.
- Build at most the one Owner-approved Android App Bundle from the reviewed
  `android-chat-livekit-qa` profile and submit it only to Google Play Internal.
- Do not publish an iOS update to any runtime other than `1.0.0-iosqa1` or any
  channel other than `ios-qa`.
- Do not enroll canary accounts or disable the Chat Call LiveKit emergency stop
  until the exact installed update identity is read back.
- Keep shared LiveKit and all Cognitive schedules off.
