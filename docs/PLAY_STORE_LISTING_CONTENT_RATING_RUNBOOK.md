# Play Store Listing And Content Rating Runbook

Date: 2026-04-26

Lane: Store listing assets / content rating checklist

Purpose: prepare Chi'llywood's Google Play Store listing metadata, graphic asset, screenshot, content rating, target audience, Data Safety consistency, and user-generated-content policy readiness for Public v1 without uploading assets, submitting forms, changing runtime behavior, or claiming legal/store approval.

This runbook is not proof that Google Play listing setup is complete. It is a repo-backed preparation checklist for the release owner, product owner, and legal/support owner to use in Play Console.

## Guardrails

- Do not submit or upload anything to Google Play from this docs lane.
- Do not claim Store Listing, Content Rating, Target Audience, Data Safety, or UGC policy setup is Done until Play Console accepts the entries and proof is captured.
- Do not overpromise later-phase features as live.
- Do not say paid creator videos, subscriber-only videos, tips, coins, payouts, ads, VIPs, native game streaming, comment media uploads, advanced creator studio, or automatic transcoding are live.
- Do not include screenshots with test emails, account ids, signed media URLs, room tokens, LiveKit tokens, RevenueCat receipts, internal admin data, private room codes, or unapproved user content.
- Do not treat this runbook as legal advice. Legal/support owners must approve final public listing copy, policy pages, and support/account deletion processes.

## Official References To Recheck Before Submission

Use current Google Play docs during final setup because console requirements can change:

- Store listing preview assets: `https://support.google.com/googleplay/android-developer/answer/1078870`
- Content ratings questionnaire: `https://support.google.com/googleplay/answer/188189`
- App content and target audience settings: `https://support.google.com/googleplay/android-developer/answer/9859455`
- Target audience and content: `https://support.google.com/googleplay/android-developer/answer/9867159`
- User Generated Content policy: `https://support.google.com/googleplay/android-developer/answer/9876937`
- Data Safety: `https://support.google.com/googleplay/android-developer/answer/10787469`
- Account deletion: `https://support.google.com/googleplay/android-developer/answer/13327111`

Current official Google Play guidance says store listing preview assets include app icon, feature graphic, screenshots, short description, and optional video; content ratings are assigned from questionnaire responses; target audience/content declarations must be accurate; and UGC apps need clear user policy plus in-app report/block/moderation readiness where applicable.

## Current Repo Snapshot

| Item | Current repo truth | Status |
| --- | --- | --- |
| App name | `Chi'llywood` in `app.json` | Implemented / Proof Pending |
| Android package id | `com.chillywood.mobile` in `app.json` | Implemented / Proof Pending |
| App version | `1.0.0` in `app.json` and `package.json` | Implemented / Proof Pending |
| Expo slug | `chillywood-mobile` | Implemented |
| Category posture | Social streaming / entertainment app with creator upload, Player, Watch-Party, Live, Chat, Premium, and safety surfaces | External Setup Pending |
| Legal routes | `/privacy`, `/terms`, `/account-deletion`, `/community-guidelines`, `/copyright`, `/support` | Implemented / Proof Pending |
| Hosted legal URL fallbacks | Privacy, Terms, and Account Deletion fallback URLs exist in `app.config.ts` | External Setup Pending until final approval |
| Data Safety prep | `docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md` maps data categories | External Setup Pending |
| Android release prep | `docs/ANDROID_RELEASE_EAS_RUNBOOK.md` maps build/signing path | External Setup Pending |
| Production env prep | `docs/PRODUCTION_ENV_SECRETS_RUNBOOK.md` maps env and secret boundaries | External Setup Pending |
| Store screenshots | No dedicated store screenshot/mockup folder found outside ignored build artifacts | Missing |
| Feature graphic | No Play feature graphic asset found | Missing |
| Play Console listing | Not created or verified by this repo lane | External Setup Pending |
| Runtime proof | Not run in this lane | Proof Pending |
| Default Expo/template assets | `partial-react-logo.png`, `react-logo.png`, `react-logo@2x.png`, and `react-logo@3x.png` remain in `assets/images`; no active app/component references were found in this audit | Cleanup Recommended |

## Draft Listing Metadata

All copy in this section is draft pending product, legal, and store-owner approval.

### App Name

Recommended Play listing app name:

`Chi'llywood`

Notes:

- Matches `app.json`.
- Preserve the apostrophe exactly unless Play Console character rules or brand/legal review require an alternate public spelling.
- Do not add keyword stuffing to the app name.

### Short Description Draft

Draft, pending owner/legal approval:

`Upload, watch together, go live, and build your creator channel.`

Why this fits v1:

- Mentions creator upload, watch-together behavior, Live, and Channel.
- Does not promise paid creator media, payouts, tips, ads, native game streaming, VIPs, or comment media uploads.
- Should fit Play's short-description limit, but the release owner must confirm the current Play Console character count.

Alternate draft:

`A premium social streaming home for creators, channels, and watch parties.`

Use only one final short description.

### Full Description Draft

Draft, pending owner/legal approval:

```text
Chi'llywood is a premium social streaming space where every account has a Profile and a Channel.

Build your public identity, upload creator videos to your Channel, watch in a standalone Player, and bring people into Watch-Party Live rooms when the content is ready to share. Chi'llywood keeps Profile and Channel connected: your Profile is who you are, and your Channel is your mini streaming platform.

Watch platform titles, creator uploads, and shared rooms with a modern Player experience. Start or join supported Watch-Party flows, use Chi'lly Chat for direct conversations, and enter Live rooms where camera and microphone features are available.

Creator uploads, chat, profiles, rooms, and live features are protected by community guidelines, report paths, and moderation review. Some Premium, billing, and live features may require sign-in, subscription access, or staged rollout availability.

Public v1 focuses on Profile, Channel, creator videos, Player, Watch-Party, Live, Chat, Premium access, and safety basics. Native game streaming, paid creator media, tips, coins, payouts, VIP systems, comment media uploads, ads, and advanced creator studio tools are not live v1 features unless a future release explicitly adds and proves them.
```

Description guardrails:

- Do not use "free movies", "watch anything", "TV channels", or any wording that implies Chi'llywood owns rights to all media.
- Do not promise automatic transcoding, payouts, subscriptions to creators, native game streaming, ad revenue, or paid creator content.
- Do not say "no ads" unless the final monetization configuration has been verified. Current repo truth has ad planning flags/admin fields, but no proved ad delivery for v1.
- Do not say "private" or "secure" without backing details. Prefer "protected by access rules" or "moderation/reporting tools".

### Category Recommendation

Recommended primary category:

- `Entertainment`

Reason:

- Chi'llywood's Public v1 center of gravity is video watching, creator channels, Watch-Party, Player, Live, and social streaming.

Alternative to review:

- `Social` if the product owner wants Play ranking/category posture to emphasize Profile, Chi'lly Chat, rooms, and community over streaming entertainment.

Do not choose a game category. Native game streaming is later phase and is not a current app genre.

### Tags / Keywords Guidance

Use Play Console tags only where supported and accurate. Suggested review list:

- streaming
- video
- creators
- social
- entertainment
- live
- chat
- watch party

Avoid:

- movies free
- TV free
- payouts
- game streaming
- earn money
- casino
- dating
- social network for kids
- paid videos
- subscribers
- VIP

### Developer Contact And Public URLs

| Field | Current repo truth | Store status | Exact next action |
| --- | --- | --- | --- |
| Support email | `EXPO_PUBLIC_SUPPORT_EMAIL` is runtime-configured; legal pages currently show `chillywood92@gmail.com` | External Setup Pending | Confirm final support email/inbox/SLA before entering in Play Console. |
| Website URL | No final public website URL proved in this lane | External Setup Pending | Choose final public marketing/support URL. |
| Privacy Policy URL | Fallback `https://live.chillywoodstream.com/privacy`; bundled `/privacy` route | External Setup Pending | Legal owner approves final Privacy URL and Play owner enters it. |
| Terms URL | Fallback `https://live.chillywoodstream.com/terms`; bundled `/terms` route | External Setup Pending | Legal owner approves final Terms URL. |
| Account Deletion URL | Fallback `https://live.chillywoodstream.com/account-deletion`; bundled `/account-deletion` route | External Setup Pending | Confirm deletion process/SLA and enter final URL in Play Console. |
| Community Guidelines URL | Bundled `/community-guidelines` route; no dedicated external env URL | External Setup Pending | Publish or confirm public hosted page if Play/support materials require it. |
| Copyright / DMCA URL | Bundled `/copyright` route; no dedicated external env URL | External Setup Pending | Confirm public DMCA contact/process and hosted page. |
| Developer name/account | Play Console owner truth is external | External Setup Pending | Confirm official developer account name and contact profile in Play Console. |

## Graphic And Asset Readiness

### Current Repo Assets

| Asset | Path | Dimensions from local inspection | Store-readiness note |
| --- | --- | --- | --- |
| Expo app icon | `assets/images/icon.png` | 1024 x 1024 PNG | Good source asset, but Play listing icon usually needs a 512 x 512 export. Create/export a Play-specific icon if Play Console rejects or crops this source. |
| Android adaptive foreground | `assets/images/android-icon-foreground.png` | 512 x 512 PNG | Launcher adaptive icon foreground; not a complete Play listing asset by itself. |
| Android adaptive background | `assets/images/android-icon-background.png` | 512 x 512 PNG | Launcher adaptive icon background; not a complete Play listing asset by itself. |
| Android monochrome icon | `assets/images/android-icon-monochrome.png` | 432 x 432 PNG | Android themed icon support; not a Play feature graphic. |
| Splash image | `assets/images/splash-icon.png` | 1024 x 1024 PNG | Splash/runtime asset, not store screenshot/feature graphic. |
| Favicon | `assets/images/favicon.png` | 48 x 48 PNG | Web icon only. |
| Branded background | `assets/images/chillywood-branded-background.png` | 1024 x 1536 PNG | Could be source art for a feature graphic, but not final 1024 x 500 Play feature graphic. |
| App background | `assets/images/app-background.jpg` | 1024 x 1536 PNG data despite `.jpg` extension | Runtime/source art only; verify extension if reused. |
| Platform art | `assets/images/chicago-skyline.jpg` and title images | 1024 x 1536 or 576 x 576 | Title/runtime art; avoid using content imagery in listing unless rights are confirmed. |
| Store screenshots | Not found | Missing | Must capture from release-like build. |
| Feature graphic | Not found | Missing | Must create 1024 x 500 asset before Play submission. |

## Chi'llywood Brand Asset Audit

This audit covers repo assets and references only. It does not replace final device screenshots, Play Console upload validation, or a design-owner visual review.

### App Icon

| Check | Result |
| --- | --- |
| Config owner | `app.json` uses `./assets/images/icon.png` as the Expo app icon. |
| File truth | `assets/images/icon.png`, 1024 x 1024 PNG, RGB, no alpha, about 388 KB. |
| Brand posture | Present and app-owned; appears to be the current source icon. |
| Play Store posture | Not a Play-ready export yet. Google Play's current preview-asset guidance lists app icon requirements as 512 x 512, 32-bit PNG with alpha, and max file size 1024 KB. |
| Next action | Export/verify a Play-specific 512 x 512 icon from approved Chi'llywood brand art before submission. Keep the 1024 x 1024 source if it remains the Expo source. |

### Adaptive Icon

| Check | Result |
| --- | --- |
| Config owner | `app.json` Android adaptive icon config. |
| Foreground | `assets/images/android-icon-foreground.png`, 512 x 512 PNG, RGBA. |
| Background | `assets/images/android-icon-background.png`, 512 x 512 PNG, RGBA; config also sets `backgroundColor` to `#E6F4FE`. |
| Monochrome | `assets/images/android-icon-monochrome.png`, 432 x 432 PNG, RGBA. |
| Brand posture | Present and separated into adaptive layers. |
| Proof status | Needs release-build launcher proof on a physical Android device and Play listing icon export proof. |
| Next action | Verify adaptive icon cropping, themed icon behavior, and legibility on Android launcher before release. |

### Splash Screen

| Check | Result |
| --- | --- |
| Config owner | `app.json` `expo-splash-screen` plugin. |
| File truth | `assets/images/splash-icon.png`, 1024 x 1024 PNG with alpha; displayed at `imageWidth: 200`. |
| Backgrounds | Light background `#ffffff`, dark background `#000000`. |
| Brand posture | Present and configured. |
| Proof status | Needs preview/release build open proof to confirm splash scale, dark-mode treatment, and transition into Login/Home. |
| Next action | Capture splash in a release-like Android build and confirm it feels premium rather than default/template. |

### Login And Branded Background

| Check | Result |
| --- | --- |
| Login owner | `app/(auth)/login.tsx` uses `assets/images/chicago-skyline.jpg` as `LOGIN_BACKGROUND_SOURCE`. |
| Other branded shells | `components/system/support-screen.tsx`, `app/admin.tsx`, and `app/channel-settings.tsx` also use `assets/images/chicago-skyline.jpg`. |
| Player brand background | `app/player/[id].tsx` uses `assets/images/chillywood-branded-background.png` for the Watch-Party branded framework background. |
| Background asset truth | `assets/images/chicago-skyline.jpg` is 1024 x 1536 JPEG; `assets/images/chillywood-branded-background.png` is 1024 x 1536 PNG. |
| Brand posture | Aligned with `ARCHITECTURE_RULES.md`: active branded shells converge on the shared skyline runtime asset while content/room owners retain their own treatments. |
| Premium/modern assessment | Repo usage supports a premium dark cinematic direction: skyline image, dark overlays, branded cards, and route-specific Player treatment. Final judgement still requires release screenshots because this docs lane did not run visual proof. |
| Next action | Keep the skyline/dark-cinematic direction, then capture release screenshots to verify the background is crisp, modern, and not too dark/muddy on real Android devices. |

### Play Store Feature Graphic / Cover

| Check | Result |
| --- | --- |
| Repo asset | No dedicated Play Store feature graphic found. |
| Search result | No `feature graphic`, `store`, `screenshot`, or `mockup` asset folder was found outside ignored build artifacts. |
| Required asset | Google Play's current preview-asset guidance requires a feature graphic to publish the store listing: JPEG or 24-bit PNG, no alpha, 1024 x 500. |
| Status | Missing / External Setup Pending. |
| Required design direction | Premium dark cinematic background, Chi'llywood logo or wordmark centered, clean modern 2026 streaming-app feel, no clutter, no fake screenshots, no copyrighted movie imagery, no Google Play badge, no ranking/price/promo claims, no later-phase promises. |
| Composition guidance | Keep the Chi'llywood logo/wordmark and focal point safely centered so Play cropping/overlays do not cut off the brand. Use the feature graphic as a brand extension, not a duplicate app icon pasted large. |
| Next action | Create `1024 x 500` Play feature graphic from approved brand art. Recommended alt text: `Chi'llywood premium social streaming app logo over a dark cinematic background.` |

### Screenshots And Mockups

| Check | Result |
| --- | --- |
| Store screenshot folder | Not found. |
| Mockup folder | Not found. |
| Existing screenshots | Only runtime/proof screenshots under `/tmp` are mentioned in docs; those are not store-safe assets. |
| Play requirements | Current Google guidance requires at least two screenshots across device types for publishing and recommends at least four app screenshots at 1080 px minimum resolution for large-format recommendation eligibility. |
| Status | Missing / Proof Pending. |
| Next action | Capture clean release-like screenshots from the screenshot plan in this runbook, then store final assets in a deliberate non-secret asset folder or outside the repo according to release-owner preference. |

### Chi'llywood Logo And Naming Consistency

| Check | Result |
| --- | --- |
| Product name | `app.json`, app copy, legal pages, support copy, and route copy consistently use `Chi'llywood`. |
| Logo asset | No separate reusable `logo` or `wordmark` file was found by repo search. The icon/splash/adaptive assets appear to carry the app mark, but a standalone store wordmark source is not documented. |
| UI usage | Login uses text `CHI'LLYWOOD`; many app surfaces use text branding rather than a shared logo component. |
| Store risk | Feature graphic creation needs an approved high-resolution logo/wordmark source. Do not rebuild it from screenshots. |
| Next action | Design owner should identify or create the canonical Chi'llywood wordmark/logo source, then use it consistently for feature graphic, store screenshots, splash review, and future brand kit. |

### Default Expo / Template Asset Findings

| Asset | Current finding | Release recommendation |
| --- | --- | --- |
| `assets/images/react-logo.png` | Present; no active runtime reference found in `app`, `components`, or `_lib`. | Remove in a separate cleanup pass before final store packaging if no hidden workflow needs it. |
| `assets/images/react-logo@2x.png` | Present; no active runtime reference found. | Remove in a separate cleanup pass if unused. |
| `assets/images/react-logo@3x.png` | Present; no active runtime reference found. | Remove in a separate cleanup pass if unused. |
| `assets/images/partial-react-logo.png` | Present; no active runtime reference found. | Remove in a separate cleanup pass if unused. |
| Template modal route | Already hardened in earlier route-owner pass; no template modal UI remains as a launch surface. | Keep closed unless regression appears. |

Do not mix template asset cleanup into Play Console dashboard setup unless the release owner explicitly chooses to do a repo cleanup pass. These files are not currently a runtime brand leak, but they are avoidable launch-packaging clutter.

### Required / Recommended Asset Set

Recheck Play Console during submission, but prepare at least:

| Asset | Requirement/prep target | Current status |
| --- | --- | --- |
| App icon | 512 x 512 PNG/JPEG per Google Play preview asset guidance | Source exists at 1024 x 1024; Play export pending |
| Feature graphic | 1024 x 500 PNG/JPEG per Google Play preview asset guidance | Missing |
| Phone screenshots | At least the Play Console required minimum; prepare 6 to 8 high-quality phone screenshots | Missing |
| 7-inch tablet screenshots | Optional/recommended if targeting tablets; app config says iOS supports tablets, Android tablet support should be reviewed | Missing / Optional |
| 10-inch tablet screenshots | Optional/recommended if Play prompts or tablet distribution is desired | Missing / Optional |
| Promo video | Optional; do not add unless final video is policy-safe and does not overpromise later features | Not planned |
| Brand colors | Runtime uses premium dark/red/blue visual language | Present in app, no store palette guide |

### Screenshot Capture Plan

Use a preview or release-like Android build from current `main`, not a Metro-only session, for final store captures.

Capture clean demo data with no secrets, no test emails, no signed URLs, and no unapproved user content:

1. Home / discovery with platform titles and live entry points visible.
2. Public Profile + Channel showing the connected Profile/Channel identity.
3. Owner Channel Settings Content panel showing Upload/Manage Video if owner-only screenshots are acceptable for store use.
4. Creator video card opening standalone Player route `/player/[id]?source=creator-video`.
5. Premium standalone Player with a valid platform or creator video, no debug overlays.
6. Watch-Party Waiting Room or Party Room using normal content Watch-Party flow.
7. Live Stage / Live Watch-Party camera-room surface, captured only with consent and safe test identities.
8. Chi'lly Chat inbox/thread with official or demo account, no private messages.
9. Premium/Subscribe or Premium-required state if billing setup is ready and honest.
10. Settings/legal/support/account surfaces only if needed for policy or support proof, not primary marketing.

Screenshot safety checks:

- Use demo creator account names and public-safe content titles.
- Hide or avoid email addresses and internal ids.
- Avoid showing room codes in a way that could invite strangers into a live proof room.
- Do not show admin/operator screens in public store screenshots unless product owner intentionally wants an operator-facing app listing, which current doctrine does not.
- Do not show draft/private videos as public features.
- Do not show "coming soon" or placeholder cards as live features.
- Do not show unproved ads, payouts, VIPs, native game streaming, or paid creator media.

### Feature Graphic Direction

Create one 1024 x 500 store-safe feature graphic.

Recommended concept:

- Chi'llywood wordmark or name.
- Premium dark streaming background with a subtle Chicago/social-streaming visual cue.
- One simple value line such as "Profile. Channel. Watch together."
- No device screenshots with tiny unreadable text.
- No claims like "#1", "free movies", "earn money", "watch anything", or "game streaming".
- No Google Play badge inside the feature graphic.
- No legal or pricing claims.

Status: External Setup Pending.

## Content Rating Preparation

Do not self-assign the final rating. Google Play/IARC rating authorities assign ratings from the questionnaire responses.

Current app facts that must be considered:

| Topic | Current app truth | Guidance for questionnaire prep |
| --- | --- | --- |
| User-generated content | Creator-upload videos, profiles/channels, chat/messages, reports, rooms/live behavior | Answer yes where Play asks about UGC or user interaction. |
| Social features / chat | Chi'lly Chat direct threads and room/social surfaces exist | Disclose social/user interaction accurately. |
| Live video/camera/microphone | LiveKit/Live Stage uses camera and mic with permissions in `app.json` | Disclose camera/mic/live communication behavior. |
| Account creation | Supabase auth signup/signin exist | Disclose account creation/sign-in. |
| Purchases/subscriptions | RevenueCat/Play Billing packages and Premium UX exist; product setup pending | If Premium ships in release, disclose purchases/subscriptions. |
| Ads | No ad SDK or proved ad delivery found; ad planning fields exist and runtime ad placements are disabled by default | Do not claim ads live unless final release enables an ad SDK or ad serving. Confirm before questionnaire. |
| Location | No `expo-location` package or Android location permission found | Do not select precise/approximate location based on current repo feature evidence. Confirm SDK disclosures manually. |
| Gambling | No app-feature evidence | Answer no unless future content changes. |
| Alcohol/drugs/tobacco | No app-promoted feature evidence | Answer based on policy/content; UGC rules should prohibit unsafe illegal activity. |
| Violence/sexual content/hate/etc. | Not product-promoted, but UGC can violate rules | Answer according to UGC exposure and moderation policy, not just intended app theme. |
| Children/minors | Legal pages state service is intended for adults age 18+ | Target audience should likely exclude children; final owner must confirm Play target age and whether Restrict Minor Access should be enabled. |
| Data collection | Account/profile/uploads/chat/live/purchases/diagnostics/moderation data exist | Must align with Data Safety runbook; do not answer "no data collected". |

Potential target audience posture:

- Current bundled legal copy says Chi'llywood is intended for adults age 18 and older.
- If this remains true, Play target audience should be adult-only and the release owner should evaluate Google's Restrict Minor Access option.
- Do not include child-directed imagery, language, or characters in store assets if the app is not designed for children.

Status: External Setup Pending until Play Console questionnaire is completed and accepted.

## Data Safety And Privacy Consistency

Cross-check against:

- `docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md`
- `docs/PRODUCTION_ENV_SECRETS_RUNBOOK.md`
- Firebase Crashlytics/Performance runbook
- RevenueCat/Google Play Billing setup
- Supabase storage/auth/RLS setup
- LiveKit production runbook

Do not make these inconsistent claims:

| Bad claim | Why it is wrong for current app truth |
| --- | --- |
| "No user data collected" | App uses accounts, profiles, uploads, chat, rooms/live participation, reports, support, diagnostics, and possibly purchase entitlements. |
| "No user-generated content" | Creator uploads, profiles/channels, chat, rooms, and live participation are user-generated or user interaction surfaces. |
| "No camera/microphone" | `CAMERA` and `RECORD_AUDIO` are declared and Live Stage uses them. |
| "No purchases" | Premium/RevenueCat foundations exist; if Premium ships, purchases/subscriptions must be disclosed. |
| "No diagnostics" | Firebase Crashlytics/Performance helpers and config exist. If enabled, diagnostics/performance must be disclosed. |
| "No moderation needed" | Creator uploads, chat, and live rooms require UGC safety posture. |
| "Ads live" | No ad SDK/proved ad delivery exists for v1, despite planning/admin fields. |
| "Native game streaming live" | Native game streaming is later phase and must not appear as a live listing claim. |

Data Safety next action:

- Privacy/legal owner should use `docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md` plus current SDK disclosures to fill Play Console Data Safety.
- Store owner should keep listing copy consistent with those answers.

## UGC And Store Policy Readiness

Chi'llywood has UGC and user interaction. Store readiness must cover:

| Requirement area | Current repo truth | Status | Next action |
| --- | --- | --- | --- |
| Terms/user policy | `/terms` and `/community-guidelines` exist | Implemented / Proof Pending | Legal approval and Play-visible public URL proof. |
| UGC rules | Community Guidelines cover creator uploads, chat, rooms, Live Stage, and reporting | Implemented / Proof Pending | Confirm final policy copy and hosted URL. |
| Report abuse | Report sheet/moderation helper/player/admin foundation exists | Implemented / Proof Pending | Prove report writes and admin review on launch backend. |
| Blocking users | Audience/blocking foundations exist in docs and `channel_audience_blocks`; direct 1:1 block UX/proof is not fully proven | Partial / Proof Pending | Evaluate whether Play's UGC/direct interaction policy requires a visible block action before launch. |
| Admin moderation | `app/admin.tsx`, `safety_reports`, `videos.moderation_status` exist | Implemented / Proof Pending | Prove non-admin denial and admin hide/remove/restore. |
| DMCA/copyright | `/copyright` exists and names support path | Implemented / Proof Pending | Legal review and public hosted page/contact proof. |
| Account deletion/data deletion | `/account-deletion` and support handoff exist | External Setup Pending | Final deletion process/SLA and Play Console acceptance. |
| Minor safety | Legal pages state 18+ | External Setup Pending | Confirm target audience, age restriction, and policy copy in Play Console. |
| Terms acceptance at signup | Signup route does not visibly show legal/guidelines acceptance text or checkbox in current code | Gap / Review Required | Decide whether to add explicit acceptance/linking before store review. Do not mark UGC policy Done without this decision. |

Important UGC gap to resolve before final store submission:

- The current signup route creates an account with email/password and does not visibly present Terms, Privacy, or Community Guidelines acceptance copy in the inspected code. Because Chi'llywood has UGC and direct interaction, the release owner should decide whether Public v1 needs explicit signup legal acceptance UI or another documented acceptance path before Play submission.

## Manual Play Console Checklist

1. Open Play Console.
2. Create or select the app for package `com.chillywood.mobile`.
3. Confirm app name `Chi'llywood`.
4. Fill Main store listing:
   - short description
   - full description
   - app category
   - tags where available
   - support email
   - website URL if used
5. Upload app icon:
   - use a Play-ready 512 x 512 export derived from `assets/images/icon.png` or approved brand source.
6. Upload feature graphic:
   - create 1024 x 500 store-safe graphic.
7. Upload phone screenshots:
   - use release-like build screenshots from the capture plan.
8. Add tablet screenshots only if target/distribution strategy requires or benefits from them.
9. Enter Privacy Policy URL.
10. Complete App access instructions if sign-in/test account access is needed for review.
11. Complete Data Safety using `docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md`.
12. Complete Content Rating questionnaire accurately.
13. Complete Target audience and content.
14. Complete Ads declaration based on final release truth.
15. Complete account deletion section with final public deletion URL.
16. Confirm camera/microphone declarations match Live Stage behavior.
17. Confirm UGC/report/moderation/copyright/deletion policy answers match actual app behavior.
18. Configure internal or closed testing track.
19. Upload production-profile AAB later after release build proof.
20. Save proof notes/screenshots without private Play account details, then update repo docs only with non-secret facts.

## Status Matrix

| Area | Status | Reason | Next action |
| --- | --- | --- | --- |
| Listing metadata plan | Partial / External Setup Pending | Draft copy and category recommendation exist here, but not approved or entered in Play Console | Product/legal owner approves final copy |
| Short description | Draft Pending Approval | Draft exists, not final | Confirm final wording and Play length |
| Full description | Draft Pending Approval | Draft exists, not final | Legal/product review |
| App icon | Partial | Runtime icon source exists at 1024 x 1024 | Export/verify Play-ready 512 x 512 icon |
| Feature graphic | Missing / External Setup Pending | No 1024 x 500 Play feature graphic found | Create final store-safe feature graphic |
| Screenshots | Missing / Proof Pending | No store screenshot set found | Capture from release-like Android build |
| Category/tags | External Setup Pending | Recommendation exists, Play owner must select | Choose category in Play Console |
| Legal/support URLs | External Setup Pending | Routes/fallbacks exist, final URL/legal proof pending | Finalize URLs and support contact |
| Data Safety consistency | External Setup Pending | Data Safety runbook exists, Play form not completed | Fill Play Console after SDK/legal review |
| Content rating | External Setup Pending | Prep matrix exists, official questionnaire not completed | Complete Play content rating questionnaire |
| Target audience | External Setup Pending | Legal copy says 18+, Play target decision not entered/proved | Select accurate target age and consider Restrict Minor Access |
| UGC policy readiness | Partial / Proof Pending | Guidelines/report/admin/copyright surfaces exist, proof and explicit signup acceptance decision remain | Prove report/admin, decide legal acceptance UI/path |
| Store upload/submission | External Setup Pending | No upload/submission run in this lane | Upload AAB only after release proof |

## Exact Next Action

Product/legal owner should approve final store listing copy, finalize public URLs, and decide the explicit Terms/Privacy/Community Guidelines acceptance posture for signup. Release owner should then create a Play-ready 512 x 512 icon export, a 1024 x 500 feature graphic, and a sanitized screenshot set from a release-like Android build before entering the Content Rating, Target Audience, Data Safety, and UGC policy answers in Play Console.
