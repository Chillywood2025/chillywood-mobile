# Chi’llyfects Snap Camera Kit Audit

Date: 2026-04-27

Status: audit complete, docs-only. No Snap SDK was installed, no native dependency was added, no LiveKit ownership was changed, and no Android/live proof was run.

## 1. Executive Summary

Snap Camera Kit is a plausible first AR engine to test for Chi’llyfects, but it is not yet proven as the right production engine for Chi’llwood.

The reason is narrow and important: Chi’llyfects does not only need a local Snap lens preview. Chi’llyfects needs a processed local camera feed that can be published through LiveKit so remote users see the effect. Official Snap docs show Android Camera Kit can process camera frames, render lenses, and connect processed output to Android surfaces/textures. Official LiveKit docs show LiveKit can publish camera/custom media tracks, and Chi’llwood already publishes camera through LiveKit. What is not proven is the bridge between Snap Camera Kit’s processed Android output and the current React Native / Expo LiveKit publishing path.

Recommendation: test a smallest Android-only POC, then defer production adoption until the POC proves processed LiveKit publishing on a second device. Do not claim Snap Camera Kit works with Chi’llwood until that proof exists.

Official sources checked:

- Snap Camera Kit overview: https://developers.snap.com/camera-kit/getting-started/what-is-camera-kit
- Snap Android SDK setup: https://developers.snap.com/camera-kit/integrate-sdk/android/android-configuration
- Snap Android API reference: https://developers.snap.com/reference/CameraKit/android/1.46.0/-camera-kit/com.snap.camerakit/index.html
- Snap Android output API reference: https://developers.snap.com/reference/CameraKit/android/1.39.0/-camera-kit/com.snap.camerakit/-image-processor/-output/index.html
- Snap Android `outputFrom` API reference: https://developers.snap.com/reference/CameraKit/android/1.39.0/-camera-kit/com.snap.camerakit/output-from.html
- Snap React Camera Kit Web guide: https://developers.snap.com/camera-kit/integrate-sdk/web/guides/react-camera-kit
- Snap React Native Snap Kit reference: https://developers.snap.com/reference/LoginKit/react-native/index.html
- Snap lens upload workflow: https://developers.snap.com/camera-kit/ar-content/upload-lenses
- Snap app review/release guide: https://developers.snap.com/camera-kit/app-review/release-app
- Snap design/branding guide: https://developers.snap.com/camera-kit/app-review/design-guide
- Snap Terms of Service notice: https://developers.snap.com/camera-kit/app-review/terms-of-service-notice
- Snap Camera Kit FAQ: https://developers.snap.com/camera-kit/getting-started/faq
- Snap Android lens prefetch guide: https://developers.snap.com/camera-kit/integrate-sdk/android/guides/prefetch-lenses
- Expo development builds: https://docs.expo.dev/develop/development-builds/use-development-builds/
- Expo config plugins: https://docs.expo.dev/config-plugins/introduction/
- LiveKit camera/microphone publishing: https://docs.livekit.io/home/client/tracks/publish/
- LiveKit React Native quickstart: https://docs.livekit.io/transport/sdk-platforms/react-native/
- LiveKit Android publish video track reference: https://docs.livekit.io/reference/client-sdk-android/livekit-android-sdk/io.livekit.android.room.participant/-local-participant/publish-video-track.html

## 2. Current Chi’llyfects Status

Current owner files:

- `_lib/liveEffects.ts`
- `components/live/live-effects-sheet.tsx`
- `app/watch-party/live-stage/[partyId].tsx`
- `app/watch-party/[partyId].tsx`
- `components/watch-party-live/livekit-stage-media-surface.tsx` for LiveKit media rendering
- `app/player/[id].tsx` for Watch-Party Live player-side LiveKit surface usage

Current Live Stage placement:

- Live Stage is people-first at `/watch-party/live-stage/[partyId]`.
- The Chi’llyfects control opens from the approved Live Stage controls/menu area.
- Live Stage comments remain in the locked lower dock and must not be moved for this work.
- Live First and Live Watch-Party share the same Chi’ll Party Members remote-feed overlay behavior.

Current Party Room placement:

- Party Room is content-first at `/watch-party/[partyId]`.
- Shared content/source stays at the top.
- Host/viewer feed bubbles stay below the content/source surface.
- Comments stay in their current visible placement.
- The Chi’llyfects panel is presented as an honest foundation-only control in the Party Room structure.

Current categories and statuses:

| Category | Current status |
| --- | --- |
| Off | Available; only real camera state |
| Beauty / Retouch | Coming soon; later native processor |
| Appearance / Makeup | Coming soon; later native processor |
| Distortion / Funny | Coming soon; later native processor |
| AI / Aging | Coming soon; later native processor |
| Glam / Signature | Coming soon; later native processor |
| Mirror / Invert | Coming soon; later native processor |
| Novelty / Face-card | Coming soon; later native processor |

What is real now:

- Chi’llyfects metadata, categories, selected-effect state, and UI.
- Honest status labeling that keeps non-Off effects from being represented as real camera processing.
- LiveKit room join and camera publishing for the current Live Stage flow.
- Layout separation between people-first Live Watch-Party and content-first Watch-Party Live.

What is UI/foundation only:

- Every non-Off Chi’llyfect.
- Beauty, makeup, distortion, AI/aging, glam, mirror, novelty, and face-card effects.
- Any claim that a selected effect changes the outgoing camera feed.

Outgoing camera processing:

- No outgoing camera processing exists in the current repo state.
- `components/watch-party-live/livekit-stage-media-surface.tsx` lets LiveKit own local camera publishing through `LiveKitRoom` and the `video` prop for publisher roles.
- `_lib/communication.ts` and `hooks/use-communication-room-session.ts` use raw media-device/WebRTC tracks for compatibility paths and do not apply AR processing.

Native AR SDK:

- No Snap Camera Kit dependency exists in `package.json`, `app.config.ts`, `app.json`, or `eas.json`.
- No native AR SDK was found in the current app.

Proof pending:

- Android/two-device proof that any real AR engine can process local preview and outgoing LiveKit camera.
- Second device must see the effect through LiveKit.
- `Off` must restore normal camera locally and remotely.
- Performance, battery, thermal, permission, privacy, and layout proof are still pending.

## 3. Snap Camera Kit Capabilities

Official Snap docs describe Camera Kit as Snap’s AR SDK for iOS, Android, and Web. It uses Lens Studio lenses and supports camera AR experiences in host applications.

Android SDK support:

- Official Android SDK exists.
- Current docs show Android setup through Maven Central dependencies such as `com.snap.camerakit:camerakit` and `com.snap.camerakit:support-camerax`.
- Android setup requires a Snap Developer account and Camera Kit access.
- Android setup requires a Camera Kit API token in native app configuration.
- Minimum device requirements in the current Android setup page are Android 5.0 / API 21 and OpenGL ES 3.0+.
- The latest mobile changelog checked lists Camera Kit Mobile `1.46.0` from February 11, 2026, with Android target version updated to 36 and Lens Studio 5.18 support.

Camera processing/output:

- Snap’s Android setup describes a `CameraXImageProcessorSource` feeding camera frames into Camera Kit’s AR pipeline.
- A Camera Kit `Session` connects an input media source to Camera Kit’s AR engine, applies a Lens, and renders output.
- If no `ViewStub` is attached, docs say output can be connected manually through `ImageProcessor.connectOutput`.
- The Android API reference exposes `ImageProcessor.Output`, `connectOutput(TextureView)`, and `outputFrom(surfaceTexture)` / `outputFrom(surface)`.
- This is encouraging for a custom pipeline, but it does not by itself prove a React Native LiveKit outgoing video track can consume the processed output.

Custom lenses:

- Lenses are created in Lens Studio.
- Camera Kit can load lenses by Lens ID and Lens Group ID.
- Snap’s upload docs support Lens Folders owned by an Organization.
- Visibility options include Public, Hidden, Offline, and Save As Draft.
- Offline visibility makes a Lens available in Camera Kit but not in Snapchat.
- Lens Groups in Lens Scheduler are the delivery mechanism the app references.

Review/approval:

- Releasing an app using Camera Kit for the first time requires Snap Kit team review and approval.
- Review requires a public Privacy Policy URL and demo videos showing the Camera Kit feature.
- A Production API Token is enabled after review/approval.
- Staging API tokens show a `Camera Kit Staging` watermark and have lower rate limits.

Offline/online behavior:

- Snap recommends prefetching lenses to reduce startup wait and support poor/no connectivity.
- Prefetched lenses can be experienced from device cache memory.
- The Android prefetch guide notes typical cache planning of 4-8 MB per cached Lens.
- Offline behavior should be treated as cache-dependent, not as proof that all lenses always work offline.

Build impact:

- Android integration is native.
- It likely requires Gradle dependency/config changes, Android manifest metadata, a Kotlin/Java bridge or native module, and a dev-client/EAS rebuild.
- It should not be attempted inside the current docs-only audit.

## 4. React Native / Expo Compatibility

No official Camera Kit React Native integration path was found in the official sources checked.

Important distinction:

- Snap’s official React wrapper, `@snap/react-camera-kit`, is for the Camera Kit Web SDK.
- Snap’s official React Native bindings for `@snapchat/snap-kit-react-native` currently list Login Kit and Creative Kit only, with other kits noted as future support.
- Camera Kit is not listed as supported by that React Native package.

Expo implication:

- Chi’llwood is an Expo/React Native app with `expo-dev-client` and EAS profiles.
- Expo’s docs state that adding a library with native code APIs requires rebuilding the development client.
- Expo config plugins are the normal way to apply native Android/iOS config in Continuous Native Generation projects.
- A Snap Camera Kit POC therefore requires an Android native module/bridge and an EAS/dev-client rebuild. It is not an Expo Go-only integration.

Current repo compatibility notes:

- Existing LiveKit native ownership is `@livekit/react-native`, `@livekit/react-native-expo-plugin`, and `@livekit/react-native-webrtc`.
- `app.config.ts` already includes `@livekit/react-native-expo-plugin`.
- `eas.json` already has a development-client profile.
- Adding Snap Camera Kit would be a native rebuild lane and must be isolated from current LiveKit ownership until proven.

## 5. LiveKit Integration Feasibility

LiveKit compatibility is the critical unknown.

What looks feasible in principle:

- LiveKit supports publishing camera/video tracks.
- LiveKit Android has APIs for publishing a `LocalVideoTrack`.
- LiveKit server/agent docs also show custom video sources can publish frames, which confirms LiveKit as a platform supports non-camera frame sources.
- Snap Android APIs expose processed output surfaces/textures, which may be usable as an input to a custom video capturer or native LiveKit track source.

What is not proven in this repo:

- The current React Native LiveKit surface does not publish a custom processed track. It lets LiveKit own camera publishing.
- There is no bridge that turns Snap Camera Kit processed output into a LiveKit React Native outgoing video track.
- There is no proof that Snap’s output can be captured efficiently enough for WebRTC without extra copies, sync issues, black frames, orientation problems, or thermal problems.
- There is no proof that `Off` can switch back to the raw LiveKit camera path without leaks or renegotiation problems.

Fit call:

- Snap Camera Kit is only acceptable for real Chi’llyfects if Option A or an equivalent custom processed-track architecture is proven.
- A local-only Snap preview does not meet the key requirement because remote users would not see the Chi’llyfect.

## 6. Lens Studio / Custom Chi’llyfects Workflow

Recommended custom workflow if testing Snap:

1. Create a Snap Organization / Camera Kit app.
2. Create one minimal Chi’llyfect in Lens Studio, such as Sparkle/Glow or a simple face prop.
3. Publish it to a Lens Folder owned by the Organization.
4. Use Offline or Save As Draft visibility for private Camera Kit availability during proof.
5. Add the Lens Folder as a Lens Source in Lens Scheduler.
6. Add the Lens to a Lens Group.
7. Reference Lens ID and Lens Group ID in the native proof module through non-secret config.

Private distribution:

- Official docs support Organization-owned Lens Folders and Offline visibility.
- Offline visibility makes the Lens available in Camera Kit but not Snapchat.
- This appears suitable for private Chi’llyfects distribution, subject to Snap review and Lens Scheduler setup.

One active Lens:

- Snap’s FAQ states Camera Kit supports one active Lens at a time, though multiple features can be combined inside one Lens.
- Chi’llyfects category UX should therefore treat each selected Chi’llyfect as one composed Lens unless a later custom engine supports stackable effects.

## 7. Pricing, Licensing, And Branding Findings

Pricing/cost:

- The checked official docs do not provide a simple public pricing table for this use case.
- Lens creation may carry production costs if Chi’llwood buys Lens Packs or hires creators through Creator Marketplace.
- Any production cost, usage limits, contract terms, or monetization restrictions must be confirmed in the Snap Developer Portal / Camera Kit terms before production commitment.

Licensing/legal:

- Snap’s developer terms page says Snap Kit apps must comply with Developer Terms, Snap Terms of Service, Community Guidelines, Privacy Policy, and Brand Guidelines.
- Violation can cause loss of access to Snap Kit.
- This is a vendor access risk and must be treated as a launch dependency.

Branding/attribution:

- The current Camera Kit design guide says Snap attribution requirements vary by integration type.
- For mobile and web applications, Snap attribution is listed as optional, including monetized apps.
- Commercial public displays require attribution.
- The Camera Kit overview page also says Snap branding is required when a Lens is instantiated, so the POC/legal review must reconcile current Camera Kit docs and any terms shown in the Snap portal.
- If attribution is used, it must not imply Snap endorsement.

Monetization:

- The current design guide says mobile/web apps do not require attribution even if monetized.
- Snap still reserves branding compliance review rights.
- Any premium Chi’llyfects, sponsored effects, ads, paid access, creator monetization, or branded campaigns require explicit legal/product review against Snap terms.

## 8. Privacy And Security Findings

Privacy:

- Camera Kit requires host-app camera access and may need microphone, location, media library, and native AR capability access depending on Lens features.
- Snap docs say Camera Kit does not directly request protected permissions; the host app is responsible.
- Camera Kit review requires a public Privacy Policy URL.
- Snap’s release guide notes anonymized usage/performance metrics in normal operation on iOS; Android privacy disclosure still needs legal review against current Snap terms and app store requirements.
- If users under 13 in the U.S. are served, Snap requires additional Terms of Service acceptance flow and documentation.

Terms prompt:

- Snap’s Terms of Service notice says users in certain regions must review and accept Snap’s terms before interacting with Lenses.
- If a user declines, Camera Kit blocks Lens activation while normal camera functionality can continue.
- Chi’llyfects UI must handle this honestly and show that the Lens is not active.

Security:

- Do not commit API tokens or client credentials as secrets.
- Treat Camera Kit API token placement as native config that must use approved secret/runtime configuration.
- Do not log Lens tokens, signed URLs, user media URLs, or private source IDs beyond non-sensitive debug identifiers.
- Do not send face/AR-derived data to app servers unless a specific privacy/legal review approves it.

## 9. Architecture Options

### Option A: Snap Owns Preview, Chi’llwood Publishes Processed Output To LiveKit

Technical feasibility: unknown but promising enough for a POC. Snap Android exposes processed output to surfaces/textures; LiveKit can publish video tracks. The missing proof is a native bridge/custom video source that sends Snap-processed frames as the outgoing LiveKit camera track.

Risk: high. Risks include duplicate camera ownership, frame copy overhead, orientation/mirroring bugs, black frames, audio/video sync, battery/thermal cost, permission conflicts, and LiveKit reconnect behavior.

Repo files likely affected in a future POC:

- `app.config.ts`
- `package.json`
- `eas.json` only if build profiles need proof-only config
- native Android module/config plugin files
- `components/watch-party-live/livekit-stage-media-surface.tsx`
- `_lib/liveEffects.ts` or a new `_lib/chillyfects/*` adapter
- `components/live/live-effects-sheet.tsx` only for honest POC state wiring

Native rebuild impact: required.

Proof required:

- Local preview shows Snap lens.
- LiveKit publishes processed video, not raw video.
- Second device sees the effect.
- `Off` restores raw camera locally and remotely.
- Layout/comments do not move.

Meets Chi’llwood requirements: yes only if processed LiveKit publishing is proven.

### Option B: LiveKit Owns Camera Track, Snap Is Local Preview/Effects UI Only

Technical feasibility: easier than Option A, but not enough for real live effects.

Risk: medium product risk because it could look like Chi’llyfects works locally while remote viewers see raw camera.

Repo files likely affected in a future POC:

- `components/live/live-effects-sheet.tsx`
- native Snap preview component
- possibly route-local preview surfaces

Native rebuild impact: required if native Snap preview is used.

Proof required:

- Confirm remote users do not see effects, and label as local preview only.

Meets Chi’llwood requirements: no. This fails the key requirement unless product explicitly chooses local-only effects.

### Option C: Snap For Chi’llyfects Preview/Local Content Only, LiveKit Unprocessed

Technical feasibility: feasible as a content/preview tool.

Risk: high if marketed as live Chi’llyfects. It creates a product truth gap.

Repo files likely affected in a future POC:

- Dedicated preview route or creator tool
- Native Snap preview component
- Chi’llyfects catalog metadata

Native rebuild impact: required.

Proof required:

- Clear labeling that this is not live remote Chi’llyfects.

Meets Chi’llwood requirements: no for real live effects. Acceptable only if explicitly scoped as preview/local content.

### Option D: Snap For First AR Proof, Later Replace With MediaPipe/OpenGL

Technical feasibility: reasonable as a learning/proof path if the adapter boundary stays narrow.

Risk: medium-high vendor lock-in and rewrite risk. Lens Studio assets and Snap-specific APIs may not transfer to a custom engine.

Repo files likely affected in a future POC:

- A new AR adapter boundary, ideally `_lib/chillyfects/*`
- Native Android bridge/config plugin
- LiveKit media surface adapter points
- No route ownership changes

Native rebuild impact: required for the Snap proof; later custom engine likely also requires native work.

Proof required:

- Same as Option A, plus adapter isolation strong enough to replace Snap later.

Meets Chi’llwood requirements: potentially. This is the recommended test path if Chi’llwood wants quick AR learning without committing to Snap long term.

## 10. Recommended POC Plan

POC recommendation: run a separate Android-only Snap Camera Kit proof only after this audit is accepted. Keep it off by default and do not ship it to public users until the full proof passes.

POC goal:

- One Android-only Chi’llyfect lens.
- One simple safe effect: Sparkle/Glow or a simple face prop.
- Local preview shows effect.
- LiveKit publishes the processed feed.
- A second device sees the effect.
- `Off` restores normal camera locally and remotely.

SDK/install steps for the future POC:

1. Create/enable Snap Camera Kit app and Organization in Snap portal.
2. Create or upload one Lens Studio lens to an Organization Lens Folder.
3. Add the Lens Folder as a Lens Source and create a Lens Group.
4. Add Snap Android dependencies in native build config, likely `com.snap.camerakit:camerakit` and `com.snap.camerakit:support-camerax`.
5. Add Camera Kit API token native metadata through approved non-committed config.
6. Add any required Android permissions/config already not present.
7. Add a small Android native module/bridge for Snap session, lens apply/clear, and processed output.
8. Build a custom LiveKit publishing path or capturer that consumes Snap processed output.
9. Rebuild an Android development client through EAS/dev-client.

Files likely touched in the future POC:

- `package.json`
- `app.config.ts`
- `eas.json` only if a proof profile is needed
- `plugins/*` or native module/config plugin files
- Android native module files generated by the POC
- `_lib/chillyfects/*` or equivalent adapter
- `components/watch-party-live/livekit-stage-media-surface.tsx`
- `components/live/live-effects-sheet.tsx`
- `docs/LIVE_LAYOUT_AND_EFFECTS_SYSTEM.md` after proof result
- `CURRENT_STATE.md` and `NEXT_TASK.md` after proof result

Risk of breaking LiveKit:

- High if Snap and LiveKit both attempt to own the camera at the same time.
- High if processed output replaces the camera track without clean lifecycle handling.
- Medium if the proof uses a separate hidden route/surface and does not touch current publishing until the bridge is ready.

Layout lock:

- Do not move comments.
- Do not move route ownership.
- Do not route Player Watch-Party Live into Live Stage.
- Do not replace the current LiveKit media surface until proof is behind a flag and reversible.
- Keep Chi’llyfects UI placement exactly where it is; only wire the selected effect to the proof adapter when the proof is active.

Android proof checklist:

- Build installs on Android dev client.
- Camera/microphone permission flow remains understandable.
- Local Live Stage preview shows Sparkle/Glow.
- Host joins LiveKit with effect enabled.
- Second Android device joins same room.
- Second device sees the effect on host video.
- Host switches `Off`.
- Second device sees raw camera restored.
- Effect can be toggled on/off repeatedly without crash.
- Leave/rejoin does not leak camera or leave black frames.
- App background/foreground does not break LiveKit reconnect.
- Orientation/mirroring are correct for front camera.
- Comments remain in locked visible placement.
- Live Watch-Party stays people-first.
- Watch-Party Live stays content-first.
- Logs do not expose tokens, signed URLs, or secrets.
- CPU, memory, battery, and thermal behavior are acceptable for sustained live room use.

Rollback plan:

- Remove Snap native dependency/config/plugin/module.
- Remove Camera Kit API token config.
- Remove Snap Lens IDs/groups from app config.
- Revert LiveKit media surface to current `LiveKitRoom` camera publishing path.
- Keep this audit doc as historical decision record.
- Do not touch Supabase schema or LiveKit token ownership for rollback.

## 11. Stop Conditions

Do not continue with Snap Camera Kit as Chi’llyfects v1 engine if any of these are true:

- No reliable way exists to publish Snap-processed output into LiveKit.
- The solution requires replacing LiveKit camera ownership entirely.
- Remote users cannot see the Chi’llyfect.
- `Off` cannot restore raw camera cleanly.
- License, review, terms, branding, attribution, or monetization rules conflict with Chi’llwood’s product plan.
- Privacy requirements cannot be satisfied with current policy/consent surfaces.
- Terms prompt behavior conflicts with the live room flow.
- Android performance, battery, or thermal cost is too high during sustained LiveKit use.
- React Native/Expo native bridge work is too heavy for Public v1.
- Lens review/distribution timing blocks the launch schedule.
- The integration requires exposing secrets or logging sensitive camera/media identifiers.

## 12. Build/Rebuild Impact

Expected future impact if Snap POC proceeds:

- Native Android dependencies added.
- Android Gradle/Maven dependency changes.
- Android manifest metadata for Camera Kit API token.
- Kotlin/Java native bridge or Expo module/config plugin.
- EAS Android development build rebuild.
- Likely no Expo Go support.
- Possible Android target/compile compatibility review because Snap’s latest mobile changelog notes Android target 36.
- Potential binary size increase. Snap FAQ notes about 14 MB if full Android modules are bundled, with smaller impact possible using Play Feature Delivery.

No build/rebuild was performed in this audit.

## 13. Proof Checklist

Before claiming Snap Camera Kit works with Chi’llwood, capture proof for all of the following:

- Snap app access approved for development.
- One private/proof Lens is available through Lens Scheduler.
- Android dev build includes Camera Kit.
- Local preview renders the Lens.
- LiveKit publishes the processed feed.
- Second device sees processed feed.
- `Off` restores normal feed locally and remotely.
- LiveKit role rules remain intact.
- Viewer roles do not publish camera unexpectedly.
- Live Stage layout remains people-first.
- Party Room layout remains content-first.
- Comments remain in current locked placement.
- No route ownership changes.
- No tokens/secrets/log-sensitive media values exposed.
- Permission prompts and Snap Terms prompt behavior are acceptable.
- App review, production token, privacy policy, and branding requirements are understood.
- Performance/battery/thermal are acceptable on representative Android hardware.

## 14. Recommendation

Recommendation: test POC.

Do not use Snap Camera Kit in production now. Do not reject it yet. Run a focused Android-only POC only if Chi’llwood wants a realistic first AR engine test.

Decision language:

- Use now: no.
- Test POC: yes.
- Defer: yes for production adoption until proof passes.
- Reject: only if the POC cannot publish processed output through LiveKit or legal/performance constraints fail.

The first proof must be Option A or Option D. Option B and Option C are not acceptable as real live Chi’llyfects because they do not prove remote users see the effect.
