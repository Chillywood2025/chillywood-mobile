# Photo/gallery picker repair — source and test scope

Selected registry feature: `media-upload-image-manipulation` in
`config/assurance/feature-registry-v1.json`. This is source/test evidence, not
installed Android or iOS proof. No dependency, native configuration, provider,
storage policy, deployment, or release change is part of this repair.

## Observed and inventoried paths

The supplied Shop screenshots show only an advanced image URL in Add Product;
device photo controls previously appeared only after saving. The Clip Studio
screenshots show its cover chooser opening iPhone Files. The separate reported
Profile failure matches a source-level presentation race: the gallery was
requested while the appearance/review Modal was still dismissing. That is a
likely cause, not a physical-device reproduction.

| Surface | Source and change |
| --- | --- |
| Manage Shop / Add Product | `components/merch/merch-screens.tsx`, `_lib/merchProductPhotos.ts`: visible Photos / Gallery and separate Files before draft save; local preview retained on validation failure; bytes upload only after an acknowledged owned draft; explicit attach/scan/approval remain required. |
| Profile photo/background, Settings appearance, Choose Different | `app/profile/[userId].tsx`, `app/settings.tsx`, `components/profile/profile-media-sheets.tsx`: iOS native Modal dismissal boundary; Android hidden nonanimated Modal commit then frame; existing `_lib/profileMedia.ts` native library chooser unchanged. |
| Studio Clip cover; Brand hero image, logo, background and avatar image | `app/channel-settings.tsx`, `_lib/deviceImagePicker.ts`: native Photos / Gallery primary, Files separate; existing `_lib/clipStudio.ts` and `_lib/platformBranding.ts` upload boundaries normalize HEIC/HEIF without fabricating JPEG metadata. |
| Chat, profile social posts/replies, player comments, Watch Party and Live Stage attachments | Existing `_lib/socialAttachmentPicker.ts` image scope already opens Expo ImagePicker; preserved. Files scope remains explicit and permits the existing attachment types. |
| Admin official profile image | Existing `_lib/officialRachi.ts` uses the profile gallery helper; preserved. |
| Copyright report / counter-notice evidence | Document attachments intentionally use Files, including non-image evidence; preserved. |
| Studio video sources | Existing explicit video/library and video/file routes preserved; no image field broadened to video. |

## Safety, interaction and accessibility

- Existing ACTIVE, non-restore-only session authority and owner checks remain.
  Pending selections and upload continuations are fenced against exact-session
  replacement, including same-user rotation before React remount, and unmount.
- Duplicate taps cannot launch a second picker. Cancel/denial cannot upload or
  publish. A failed new-product upload retains the saved draft and same selection
  for retry rather than creating another draft or silently discarding the image.
- Image-only sources preserve MIME metadata; upload limits, normalization,
  temporary-file cleanup, scanner gates and uncertain-registration retry identity
  remain enforced at their existing upload boundaries.
- No broad library permission is requested by the new chooser. Limited/selected
  access uses the installed system picker contract. Missing native support fails
  rather than silently relabeling Files as Photos.
- Accessible source labels explicitly distinguish Photos / Gallery from Files.
  Existing shared skyline/glass styles remain unchanged.

## Required installed golden cases (not executed in cloud)

Run separately on supported signed Android and iOS builds: Add Product before
save; existing product replacement; each Studio still-image slot; Profile and
Settings avatar/background; Choose Different; dismiss/cancel; permission denial
and limited access; repeated taps; account switch; JPEG/PNG/WebP/HEIC/HEIF,
corrupt/oversized files; background/resume. Confirm actual Photos/Gallery UI opens
and Files remains separate. Validate preview, upload/scan gating and navigation.

Rollback is a normal reviewed source revert of these picker/UI changes; do not
alter storage permissions or scanner policy to work around a picker problem.

## Reproducible local checks

- `node --test tests/profile-gallery-presentation-mounted.test.mjs tests/profile-appearance-account-binding.test.mjs tests/premium-settings-mounted.test.mjs tests/premium-settings-return-mounted.test.mjs tests/merch-ui-mounted.test.mjs tests/merch-photo-helper.test.mjs`
- `node --test tests/studio-device-image-picker.test.mjs tests/platform-studio-clip-helper-session.test.mjs tests/platform-studio-clip-session.test.mjs tests/platform-brand-upload-registration.test.mjs tests/platform-brand-upload-retry.test.mjs tests/platform-studio-retry-integrity.test.mjs tests/platform-studio-ui-regression.test.mjs`
- `npx tsc --noEmit`
- `npm run test:image-upload-native-boundary`
- `npm run guard:clip-studio-policy`

The mounted/source-handler tests execute production handlers with modeled native
IO. They verify correct calls and boundaries, not a physical photo-library window.
