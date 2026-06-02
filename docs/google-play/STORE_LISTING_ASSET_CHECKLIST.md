# Google Play Store Listing Asset Checklist

Date: 2026-05-30
Status: Play default store listing saved with generated assets/screenshots; Google review acceptance pending

This checklist records what exists in the repo and what the owner/operator uploaded or approved in Play Console. It does not claim Google review acceptance.

June 1, 2026 store listing upload closeout: Play Console contact details/category were saved/published. The default store listing was saved with short description `Upload, watch together, go live, and build your creator Platform.`, the current full description, generated 512x512 listing icon, generated 1024x500 feature graphic, four sanitized phone screenshots, and the same sanitized screenshot set uploaded for 7-inch and 10-inch tablet sections. The accidental YouTube/XR field value was cleared before save. Store assets/proof live outside the repo under `/tmp/chillywood-google-play-release-v14-20260601/store-assets/`. Publishing overview/production review is still blocked by closed-testing production-access requirements; do not claim Google review acceptance.

June 1, 2026 external acceptance update: `docs/google-play/EXTERNAL_ACCEPTANCE_TRACKER.md` records Store listing as saved in Play Console. Feature graphic, listing icon, and phone/tablet screenshots were uploaded through the authenticated Play Console session. Review acceptance remains pending.

June 2, 2026 icon repair update: after the Google Play Billing sandbox sheet showed a generic placeholder icon, the current branded 512x512 listing icon was re-uploaded and committed through the Android Publisher API for `com.chillywood.mobile` / `en-US`. Readback shows one listing icon, image id `9058525658997174018`, SHA-256 `b350be77fe32353503f0b514ea2cd01f3d7d52cfe6e0d8cb45bb4bd2d966c438`. Billing UI may still need Play Store cache propagation before it reflects the replacement.

## App Identity

| Field | Current value | Status | Owner action |
| --- | --- | --- | --- |
| App name | `Chi'llywood` | repo_ready | Confirm exact public spelling in Play Console |
| Package | `com.chillywood.mobile` | repo_ready | Confirm artifact package before upload |
| Version | `1.0.0` runtime/version | repo_ready | Confirm versionCode/AAB from release process |
| Category recommendation | Entertainment or Social | external_required | Choose final category |
| Contact email | `support@chillywoodstream.com` | repo_ready, SLA external | Confirm inbox owner/SLA |
| Privacy URL | `https://chillywoodstream.com/privacy` | repo_ready, legal external | Enter after legal approval |
| Account deletion URL | `https://chillywoodstream.com/account-deletion` | repo_ready, Play external | Enter and wait for acceptance |
| Website URL | `https://chillywoodstream.com` | repo_ready, owner confirmation | Enter if owner wants the public site listed |
| Support URL | `https://chillywoodstream.com/support` | repo_ready, SLA external | Enter if Play offers a support URL field |

## Graphic Assets

| Asset | Current repo evidence | Play requirement / note | Status | Owner action |
| --- | --- | --- | --- | --- |
| App icon | Generated `/tmp/chillywood-google-play-release-v14-20260601/store-assets/play-listing-icon-512.png`; Android Publisher readback id `9058525658997174018`, SHA-256 `b350be77fe32353503f0b514ea2cd01f3d7d52cfe6e0d8cb45bb4bd2d966c438` | Play listing icon must be 512x512 PNG with alpha and max 1024KB per Google guidance | saved / API readback passed | Wait for Play cache propagation if Billing sheet still shows the placeholder |
| Launcher adaptive icon | `assets/images/android-icon-foreground.png`, `android-icon-background.png`, `android-icon-monochrome.png` | Runtime launcher asset, not the listing icon by itself | repo_ready | Confirm launcher proof in release/pre-launch |
| Splash | `assets/images/splash-icon.png` | Runtime proof exists from release lanes | repo_ready | No Play upload unless used in screenshots |
| Feature graphic | Generated `/tmp/chillywood-google-play-release-v14-20260601/store-assets/feature-graphic-1024x500.png` | 1024x500 JPEG or 24-bit PNG, no alpha | saved | Replace only if owner wants a different approved graphic |
| Phone screenshots | `/tmp/chillywood-google-play-release-v14-20260601/store-assets/screenshots/phone/` | Use final release screenshots without private account data, tokens, admin secrets, or unapproved content | saved | Recapture only if app UI materially changes |
| Tablet screenshots | Same sanitized screenshot set uploaded for 7-inch and 10-inch tablet sections | Optional unless targeting tablets | saved | Replace later with tablet-specific captures if product scope requires |
| Preview video | Not prepared | Optional | deferred | Do not add unless approved and policy-safe |

## Listing Copy

| Field | Draft / rule | Status |
| --- | --- | --- |
| Short description | `Upload, watch together, go live, and build your creator Platform.` | saved in Play Console |
| Alternate short description | Draft: `A premium social streaming home for creators, Platforms, and watch parties.` | owner/legal approval required |
| Full description | Current Play Console description saved with free/public flows, Premium-gated creator tools, account/support/report/legal paths, and money-off posture | saved in Play Console |
| Release notes | State only actual current-build changes | external_required |
| Tags | streaming, video, creators, social, entertainment, live, chat, watch party if Play supports them | owner approval required |

## Release Artifact Entry

| Field | Current proof value | Status | Owner action |
| --- | --- | --- | --- |
| Fresh current-HEAD AAB proof path | `android/app/build/outputs/bundle/release/app-release.aab` | current local build proof | Use only after owner-approved Play upload signing is confirmed |
| Fresh current-HEAD AAB proof size/hash | `132125002` bytes / 126M; SHA-256 `57f8f8da17f21959ef7d3f4abb661fad5135757caa277d2b9a03ddec192ad199` | current local build proof | Save Play upload/external proof after signed upload |
| Signing status | Local Gradle release uses `signingConfigs.debug`; proof shows `CN=Android Debug` | external_required before Play upload | Use EAS production/Play upload signing or corrected local release signing unless owner confirms current cert is accepted |
| Version name | `1.0.0` | repo_ready | Confirm acceptable for intended track |
| Version code | `8` | repo_ready | Confirm it is greater than the last Play-uploaded versionCode before upload |

Release upload details now live in `docs/google-play/RELEASE_UPLOAD_CHECKLIST.md`.

## Policy Declarations

| Declaration | Current recommendation | Status |
| --- | --- | --- |
| Contains ads | Current repo evidence supports "No ads active in current app build" only if owner confirms ads remain disabled and no ad SDK/provider delivery is active | owner confirmation required |
| In-app purchases | Yes if Premium/RevenueCat/Google Play subscription flow ships in the artifact; otherwise keep monetization claims off | owner/provider confirmation required |
| Target audience | Adult/general audience, not children; signup has 18+ confirmation | owner/legal confirmation required |
| UGC | Yes: profiles, posts, comments, chat, uploads, live/rooms | repo evidence ready; owner completes Play answers |
| Content rating | Must account for UGC, live streaming, chat/social interaction, video content, reporting/moderation | external_required |
| Data Safety | Use `DATA_SAFETY_EVIDENCE_MAP.md` | external_required |
| Account deletion | Use `ACCOUNT_DELETION_URL_CONTENT.md` | external_required |

## Assets Not To Use

- Private user photos or family images.
- Screenshots showing private email addresses, tokens, signed media URLs, raw storage paths, room tokens, service-role values, provider secrets, Admin-only private data, or unapproved user content.
- Claims about live payouts, cash-out, ads, fake Premium, fake Rachi content, fake live rooms, or fake creator stats.

## Remaining Store Listing Blocker

Store listing assets/copy are saved, but Google review acceptance is not claimed. The remaining Play blocker is production access/review: closed testing must satisfy Play's current requirements, including at least 12 opted-in testers and the required 14-day closed test.
