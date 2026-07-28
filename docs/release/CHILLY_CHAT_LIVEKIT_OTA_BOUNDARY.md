# Chi'lly Chat LiveKit OTA boundary decision

Decision date: 2026-07-28

Assessed application source: `afa7fe79263941024392922e779f5d45f29f6b3b`

Status: source and native-boundary review complete. This report does not claim
an installed call result and does not authorize a replacement binary.

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
channel, proposed as `android-chat-livekit-qa`, while retaining runtime
`1.0.0-android-imagemanipulator-v1`, the existing package identifier, the
existing LiveKit/native-call packages, and Google Play Internal distribution.
No Android binary is authorized by this report; separate Owner approval is
required before building it.

No Android OTA was published.

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

Exactly one iOS-only update may be published to `ios-qa` after the assessed
implementation receives a green 13/13 CI run. The compatible pre-migration
update remains the rollback target. No `production` channel update and no
public release are authorized.

## Guardrails

- Do not publish the migration to Android runtime `1.0.0`.
- Do not publish to the `production` channel.
- Do not build Android without separate Owner approval of the channel-only
  replacement delta.
- Do not publish an iOS update to any runtime other than `1.0.0-iosqa1` or any
  channel other than `ios-qa`.
- Do not enroll canary accounts or disable the Chat Call LiveKit emergency stop
  until the exact installed update identity is read back.
- Keep shared LiveKit and all Cognitive schedules off.
