# Clip Studio Trim Export Research

Updated: 2026-05-25

This is a research and repo-audit document only. No trim/export implementation was added, no package was installed, no native Android or Gradle file was edited, no Expo config was changed, no migration was added, and no app behavior changed.

## Summary

Recommended path:

1. Add a metadata-only trim preview lane later: store `trim_start_ms` and `trim_end_ms`, preview that range in Clip Studio, and keep public playback unchanged unless a separate VOD renderer lane explicitly chooses to respect trim metadata.
2. Prototype server-side render/export separately after launch-readiness work: queue a job, render a new VOD asset on a trusted worker, store the exported media as a new creator-video/rendition object, and require review/publish state before public display.
3. Consider native Android export with Android Media3 Transformer only after a small release-build proof measures APK size, native dependency conflict risk, export duration, backgrounding behavior, and device thermal impact.

Native export should not be the next production lane. The app already has a safe Clip Studio Lite model: draft persistence, owner-only previews, public cover cards, sanitized public metadata cards, and no claim that metadata is burned into video. The safest next step is to keep trim metadata honest before introducing a real render pipeline.

## Repo Media Stack Audit

Current media flow:

| Area | Current repo behavior |
| --- | --- |
| Video picking | `app/channel-settings.tsx` uses `expo-document-picker` `getDocumentAsync` with MP4, MOV, WebM, and M4V MIME types plus `copyToCacheDirectory: true` for creator upload and Clip Studio video selection. |
| Cover/poster picking | Clip Studio cover selection uses `expo-document-picker` for JPG, PNG, and WebP with `copyToCacheDirectory: true`; Brand Studio uses the same picker family for images and hero video. |
| Android `content://` handling | `_lib/mediaStorage.ts` and `_lib/clipStudio.ts` copy Android `content://` URIs into `FileSystem.cacheDirectory` before upload, then clean the cache copy in `finally`. |
| Upload staging | `_lib/mediaStorage.ts` creates signed uploads through the `media-storage` Edge Function, uploads through `FileSystem.uploadAsync` first, then Blob-style and React Native file-body fallbacks. |
| Signed upload verification | `_lib/mediaStorage.ts` signs a download after upload and probes `Range: bytes=0-0`; empty objects are deleted and treated as failed upload. |
| VOD storage | `_lib/creatorVideos.ts` uploads source media to the `creator-videos` surface under an owner/video prefix, inserts a `videos` row, records the original rendition, and keeps storage path/object details out of public card responses. |
| VOD playback | `readCreatorVideoForPlayer` signs playback through the VOD quality resolver/fallback path and respects public/owner visibility plus monetization access. |
| Public video cards | Public card reads go through `supabase/functions/public-creator-video-cards/index.ts`; it filters to public moderation-safe rows and returns only sanitized card fields. |
| Clip Studio preview | `app/channel-settings.tsx` uses `expo-av` `Video` for local/signed preview, then cover/poster image, then a neutral placeholder. Title/template overlay is visual UI metadata, not video export. |
| Thumbnail/cover behavior | Clip Studio cover upload stores `videos.thumb_storage_path` and `creator_clip_edits.cover_storage_path`; public card resolver signs the cover only for published, moderation-safe rows and safe owner/video-prefixed paths. |
| Video metadata storage | `_lib/clipStudio.ts` maps `creator_clip_edits`, including format, fit, reserved trim fields, cover metadata, title/subtitle/style/position/template, and optional brand mark metadata. |
| Draft/publish flow | Save Draft writes a real `videos` row with `visibility='draft'`, upserts `creator_clip_edits`, reads back both records, and confirms the owner Content Library can see the saved id. Publish uses the existing creator-video visibility update path. |
| Android release build | `eas.json` uses production AAB and production APK profiles; native Android files exist under `android/`, new architecture and Hermes are enabled, and `expo.useLegacyPackaging=false`. |

Current trim truth:

- `creator_clip_edits` already has reserved `trim_start_ms` and `trim_end_ms` fields.
- `_lib/clipStudio.ts` reads/writes those fields.
- `app/channel-settings.tsx` currently saves them as `null`.
- There are no trim controls, no native export, no server export, no cut list player, and no public trim renderer.

## Dependency Audit

Current discovered stack:

| Dependency or config | Status |
| --- | --- |
| Expo SDK | `expo ~54.0.33` in `package.json`. |
| React Native | `0.81.5`; React `19.1.0`. |
| `expo-video` | Installed as `~3.0.16` and listed as an `app.json` plugin. Used in `app/player/[id].tsx`. |
| `expo-av` | Installed as `~16.0.8`; still used by Clip Studio preview, Player fallback paths, Spectate, and Watch-Party audio. Expo docs now point new video playback work toward `expo-video`, so future Clip Studio work should not expand `expo-av` use. |
| `expo-document-picker` | Installed as `~14.0.8` and used for video, cover, Brand Studio, attachments, copyright, and counter-notice file picking. |
| `expo-image-picker` | Not installed. Its Android pending-result recovery API is relevant research, but switching pickers would be a separate behavior change. |
| `expo-video-thumbnails` | Not installed. It can generate thumbnails from video sources, but it is not a trim/export tool. |
| FFmpeg mobile package | No `ffmpeg`, `ffmpeg-kit`, or equivalent mobile FFmpeg package appears in package or lock files. |
| Media3 Transformer | No direct AndroidX Media3/Transformer dependency appears in Gradle or package files. |
| Native video editor/export package | No credible native video editor, cropper, or exporter package appears in current dependencies. |
| EAS/CNG constraints | The repo has generated native Android files, `app.config.ts`, Expo plugins, LiveKit, Firebase, Hermes, and New Architecture enabled. Any native module lane needs prebuild/release proof and must not silently alter Gradle or Expo config. |

Risky or deprecated signals:

- `expo-av` is still present in several playback/audio surfaces. Future Clip Studio trim/export should avoid deepening the dependency and should plan playback preview migration or isolation before editing Player behavior.
- FFmpegKit is not a safe new mobile dependency target because the official project is retired.
- Native editor packages found in general ecosystem searches tend to require native linking/prebuild, may wrap FFmpegKit, or have uneven maintenance. None should be introduced without a narrow prototype and release-build proof.

## External Research Sources

Official/current sources checked on 2026-05-25:

| Source | Relevant finding |
| --- | --- |
| [Expo Video](https://docs.expo.dev/versions/latest/sdk/video/) | `expo-video` is the supported Expo video playback surface. It is for playback/player UI, not a video trim/export renderer. |
| [Expo AV](https://docs.expo.dev/versions/latest/sdk/av/) | Expo positions `expo-av` as deprecated for new audio/video work in favor of newer modules. Chi'llwood should not add new Clip Studio export work on top of `expo-av`. |
| [Expo DocumentPicker](https://docs.expo.dev/versions/latest/sdk/document-picker/) | `getDocumentAsync` and `copyToCacheDirectory` match the repo's current picker/upload pattern. It does not provide trim/export. |
| [Expo ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/) | `getPendingResultAsync` exists for Android picker result recovery after MainActivity destruction. The repo does not currently use ImagePicker, so adopting this would be a separate picker behavior lane. |
| [Expo VideoThumbnails](https://docs.expo.dev/versions/latest/sdk/video-thumbnails/) | Supports thumbnail generation from video; useful for future poster-frame extraction, but not for trimming or exporting a new video. |
| [Android Media3 Transformer getting started](https://developer.android.com/media/media3/transformer/getting-started) | Media3 Transformer is the credible official Android path for native edit/export, including edited media items. It requires native integration, release proof, and device proof. |
| [Android Media3 Transformer supported formats](https://developer.android.com/media/media3/transformer/supported-formats) | Export capability depends on device codecs, container/track support, and format constraints. Chi'llwood would need physical-device coverage, not only emulator proof. |
| [FFmpegKit repository](https://github.com/arthenica/ffmpeg-kit) | The official FFmpegKit project is retired. It should not be the foundation for a new mobile native export lane. |
| [FFmpeg CLI documentation](https://ffmpeg.org/ffmpeg.html) | FFmpeg remains a strong server-side worker option for true trim/render/export, overlays, captions, transcodes, and deterministic output files. |
| [Expo prebuild](https://docs.expo.dev/workflow/prebuild/) and [Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/) | Native dependencies and config plugins must be treated as native project changes with build reproducibility and release validation. |
| [react-native-video-trim](https://github.com/maitrungduc1410/react-native-video-trim) | A current-looking React Native trimmer claims Expo compatibility and New Architecture support, but it requires native prebuild/rebuild work and some advanced outputs mention FFmpegKit. It is not safe to add without a separate prototype and release proof. |

## Strategy Comparison

| Option | What it enables | Benefits | Costs and risks | Recommendation |
| --- | --- | --- | --- | --- |
| A. Metadata-only trim preview | Store `trim_start_ms` and `trim_end_ms`; Clip Studio preview starts/stops inside the chosen range. | Lowest risk, no new package, no native change, uses existing private edit metadata model, easy to keep honest. | Not a real export. Public video still plays original unless a separate public VOD renderer explicitly respects trim metadata. | Best next short-term lane if product wants trim affordance before launch. |
| B. Native Android trim/export | Real local exported clip file from Android, likely through Media3 Transformer or a credible native module. | Real trimmed output can remove unwanted sections before upload/publish. | Native dependency, Gradle/config risk, APK size, codec/device variability, long-running export UX, backgrounding risk, iOS gap, release build proof required. | Do not choose first. Prototype only after launch priorities and only with release APK/AAB proof. |
| C. Server-side render/export | Worker trims/renders source media into a new VOD asset and stores an export result for review/publish. | Best long-term foundation for trims, title cards, templates, captions, watermarks, moderation, and deterministic output. Keeps app binary simpler. | Needs queue/status UI, worker infra, compute/storage cost controls, failed-job cleanup, moderation/publish state, and retry/idempotency. | Best long-term true export path. Should be a separate backend/VOD processing lane. |
| D. Hybrid | Metadata preview now, server export later, native only for carefully scoped local features. | Lets creators plan edits now while preserving honest product copy and avoiding native risk. | Requires clear UI copy so preview is not mistaken for exported media. Later server work still needed for true output. | Recommended. |

## LiveKit Isolation Map

Trim/export can be isolated from LiveKit if future work is limited to Clip Studio/VOD upload/render paths and does not touch LiveKit/Watch-Party routes.

Future trim/export implementation should stay out of:

| Area | Files and surfaces to leave untouched |
| --- | --- |
| LiveKit token/room routing | `supabase/functions/livekit-token/index.ts`, `supabase/functions/livekit-registry/index.ts`, `supabase/functions/_shared/livekit-routing.ts`, `_lib/livekit/*`. |
| Watch-Party routes | `app/watch-party/[partyId].tsx`, `app/watch-party/live-stage/[partyId].tsx`, `app/watch-party/index.tsx`, `app/watch-party/live-stage/index.tsx`. |
| Live media surfaces | `components/watch-party-live/livekit-stage-media-surface.tsx`, `_lib/livekit/react-native-module.tsx`, `_lib/livekit/join-boundary.ts`. |
| Watch-Party state/helpers | `_lib/watchParty.ts`, `_lib/watchPartyContentSources.ts`, `_lib/watchPartyPinning.ts`. |
| Spectator/live egress | `supabase/functions/spectator-broadcast-start/index.ts`, `supabase/functions/spectator-broadcast-stop/index.ts`, `supabase/functions/spectator-broadcast-status/index.ts`, `supabase/functions/spectator-playback/index.ts`, `supabase/functions/_shared/spectator-broadcast.ts`. |
| Player/live route | `app/player/[id].tsx` unless a later lane explicitly scopes public VOD Player trim playback. |

Future Clip Studio trim work can stay inside:

- `app/channel-settings.tsx` Clip Studio editor UI.
- `_lib/clipStudio.ts` edit metadata helpers.
- `_lib/creatorVideos.ts` only if a later VOD/export state needs explicit creator-video fields.
- Dedicated docs and guards.
- A future worker/Edge/queue path only in a separate render/export lane.

LiveKit-specific constraints:

- Do not change token issuance.
- Do not change room registry or stale-room handling.
- Do not change speaker/viewer permissions.
- Do not change Watch-Party Live route ownership.
- Do not change Live Watch-Party route ownership.
- Do not add egress dependencies for VOD trim/export.

## Android Risk Matrix

| Risk | Why it matters | Suggested mitigation before implementation |
| --- | --- | --- |
| `content://` URI lifetime | Picker URIs can become inaccessible after process death or delayed work. | Keep copying to app cache for upload/export, and document cleanup. For long exports, consider app-owned persistent temp files. |
| Picker result loss | Android may destroy MainActivity while a picker is open. | If switching to ImagePicker, evaluate `getPendingResultAsync`; for DocumentPicker, proof actual failure/recovery behavior on physical devices. |
| Memory pressure | Large videos can exceed memory or cause native export crashes. | Stream/copy files, avoid loading full media into JS memory, use size caps and physical-device stress proof. |
| Long export time | Real export can take minutes for large videos. | Add queue/progress/cancel UX, timeout policies, and resume strategy before enabling. |
| Backgrounding | Local export may fail if app is backgrounded or killed. | Prefer server export for long renders; if native, prove background/foreground behavior. |
| Battery/thermal impact | Encoding is CPU/GPU intensive. | Measure on real Android devices, especially older/midrange hardware. |
| Permission denial | Media reads/writes may fail depending on picker and storage policy. | Keep document-picker copies, friendly error states, and no raw local path logs. |
| Temporary storage | Export copies and caches can fill device storage. | Enforce temp size limits and cleanup success/failure paths. |
| APK size | Native render libraries/codecs can increase binary size. | Measure APK/AAB delta before product acceptance. |
| Gradle/native conflicts | Media3/FFmpeg/native modules may conflict with Expo, Firebase, LiveKit, Hermes, New Architecture, or min SDK. | Prototype in a branch, run release APK/AAB build, and keep LiveKit route proof unchanged. |
| Emulator mismatch | Codec support differs between emulator and physical devices. | Require proof on `R5CR120QCBF` or equivalent physical device, plus at least one lower-capability Android device before launch. |
| iOS gap | Native Android-only export creates platform parity issues. | Product should decide whether Android-first export is acceptable or server export should lead. |

## Privacy And Safety Notes

- Metadata-only trims are not privacy removal. If the original video remains uploaded and public playback uses the original file, trimmed-out moments still exist in storage and may still be playable through any surface that ignores trim metadata.
- MP4 edit-list style trimming should be treated carefully because non-destructive edit metadata may leave original samples in the file. If the purpose is privacy, safety, or rights removal, Chi'llwood should physically render a new file and avoid publishing the untrimmed source.
- Draft/private source videos must remain owner-only while edit metadata is private.
- Exported clips should use new storage object keys under the owner/video/export prefix, never expose raw local file paths, and never publish automatically after export success.
- Failed exports must clean temporary local files and abandoned storage objects.
- Public resolver paths must keep excluding draft/private rows and must not return raw `creator_clip_edits` records.
- User-facing copy must say preview or draft until a real export file exists.

## Recommended Safe Plan

Phase 1: metadata-only trim preview after this research lane

- Add Clip Studio controls for start/end trim metadata only.
- Persist `trim_start_ms` and `trim_end_ms` in `creator_clip_edits`.
- Preview the selected range locally in Clip Studio where the player API can do so reliably.
- Keep public cards and public Player unchanged unless a separate public VOD renderer lane is requested.
- Use copy like "Preview range" and avoid "exported" or "rendered" language.
- Prove Save Draft, reopen, owner Content Library, public non-leak, and no public behavior change.

Phase 2: server-side render/export prototype

- Create a separate worker design for true export.
- Queue a job from an owned draft.
- Render a new media object using FFmpeg or equivalent worker tooling.
- Store export status and output metadata separately from the source video.
- Require review/publish decision before the export becomes public.
- Keep title cards, templates, captions, watermarks, and trim logic on the same trusted render path rather than separately faking UI output.

Phase 3: native Android Media3 Transformer only if still useful

- Prototype in an isolated branch.
- Measure APK/AAB size delta.
- Prove release build on physical Android.
- Prove codec behavior on source formats Chi'llwood accepts.
- Prove backgrounding/cancel/temp cleanup.
- Decide how to handle iOS parity before productizing.

## Future Implementation Boundaries

Any future trim/export lane should state these boundaries explicitly:

- Do not touch LiveKit files.
- Do not touch Watch-Party routes.
- Do not touch public Player behavior unless the lane is explicitly a VOD renderer lane.
- Do not change Premium gates.
- Do not change creator upload/publish behavior except an explicit export-draft/export-job state.
- Do not add a native dependency without release build proof.
- Do not add migrations unless the lane explicitly owns schema.
- Do not expose raw storage paths or local file paths.
- Do not make public cards depend on direct anonymous `creator_clip_edits` reads.
- Do not claim exported or burned-in output until a real output file exists and is proved.

## Remaining Questions

- Should metadata-only trim preview be launch-scope, or should trim wait until after public v1?
- Should public Player ever respect trim metadata without a physically exported file, or should public playback always require a rendered output?
- Should server export produce a new `videos` row, a new `video_renditions` row, or a separate export table with explicit review/publish state?
- What output durations and source sizes are acceptable for first export support?
- Is Android-first native export acceptable, or should Chi'llwood avoid platform-specific export until server export exists?

## Closeout Notes

- This lane added documentation only.
- No package was installed.
- No `package.json` or lockfile change was made.
- No Android, Gradle, EAS, Expo config, LiveKit, Watch-Party, Player, public resolver, upload, publish, Premium, Edge Function, migration, or storage behavior was changed.
- Validation passed: `git status --short`, `npm run typecheck`, `npm run validate:runtime`, `npm run guard:refresh-policy`, `npm run guard:payment-rail-policy`, `npm run guard:creator-monetization-policy`, `npm run guard:stripe-connect-policy`, `npm run guard:vod-quality-policy`, `npm run guard:clip-studio-policy`, `npm run guard:platform-brand-studio-policy`, `npm run guard:watch-party-livekit`, `npm run guard:old-room-handling`, `git diff --check`, and `git diff --cached --check`.
- Targeted proof passed for no package/lockfile diff, no Android/Gradle/EAS/Expo config diff, no LiveKit/Watch-Party/Player route diff, no fake export-availability claim, and staged docs-only changes.
- `artifacts/` and `supabase/.temp/` were left untouched.
