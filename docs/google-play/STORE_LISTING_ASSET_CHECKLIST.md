# Google Play Store Listing Asset Checklist

Date: 2026-05-30
Status: repo evidence prepared; final Play listing assets still external

This checklist records what exists in the repo and what the owner/operator must upload or approve in Play Console. It does not claim store listing completion.

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

## Graphic Assets

| Asset | Current repo evidence | Play requirement / note | Status | Owner action |
| --- | --- | --- | --- | --- |
| App icon | `assets/images/icon.png`, 1024x1024 RGB PNG | Play listing icon must be 512x512 PNG with alpha and max 1024KB per Google guidance | partial | Export/verify Play-specific 512x512 icon |
| Launcher adaptive icon | `assets/images/android-icon-foreground.png`, `android-icon-background.png`, `android-icon-monochrome.png` | Runtime launcher asset, not the listing icon by itself | repo_ready | Confirm launcher proof in release/pre-launch |
| Splash | `assets/images/splash-icon.png` | Runtime proof exists from release lanes | repo_ready | No Play upload unless used in screenshots |
| Feature graphic | No final Play feature graphic found | 1024x500 JPEG or 24-bit PNG, no alpha | missing | Create final approved graphic |
| Phone screenshots | Existing proof screenshots in `/tmp` | Use final release screenshots without private account data, tokens, admin secrets, or unapproved content | partial | Select/crop/store outside repo or upload directly |
| Tablet screenshots | Not prepared | Optional unless targeting tablets; iOS/tablet not Public V1 priority | deferred | Decide if Android tablet assets are needed |
| Preview video | Not prepared | Optional | deferred | Do not add unless approved and policy-safe |

## Listing Copy

| Field | Draft / rule | Status |
| --- | --- | --- |
| Short description | Use a concise social streaming description that does not claim fake money, ads, payouts, or free copyrighted content | owner/legal approval required |
| Full description | Use `docs/PLAY_STORE_LISTING_CONTENT_RATING_RUNBOOK.md` as source, but keep user-facing creator-surface wording as "Platform" before submission | needs copy review |
| Release notes | State only actual current-build changes | external_required |
| Tags | streaming, video, creators, social, entertainment, live, chat, watch party if Play supports them | owner approval required |

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

Store listing is **partial** until the owner uploads final approved assets/copy in Play Console and saves external proof. This is part of the remaining external P0 bundle.
