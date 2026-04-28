# Public V1 Smoothness Hardening Audit

Date: 2026-04-28

Repo root: `/Users/loverslane/chillywood-mobile`

Branch audited: `main`

HEAD at audit start: `b3b6a02e6e6a57414e9048433000e0844794bf9e`

Origin/main at audit start: `b3b6a02e6e6a57414e9048433000e0844794bf9e`

Initial local dirt: known untracked `supabase/.temp/` only.

Runtime truth: no Android device was attached, no Metro/Expo server was detected, no production build was run, and no Android/live/two-device proof was run. This was a repo static audit plus small Public v1 polish hardening pass.

## Executive Summary

Public v1 smoothness is mostly in place: major routes have loading, empty, access, and unavailable states, and the earlier room/non-room audits already fixed the highest-risk route ownership issues.

This pass made only scoped launch-readiness fixes:

- Home and Explore no longer surface raw Supabase error messages or developer-facing discovery copy.
- My List now has a branded empty/error card with retry and browse handoff instead of a bare line of text.
- Channel Settings creator videos now have a retry state when the owner library fails to load.
- Creator video file picking now gives honest cancel and unsupported-file feedback.
- Creator video save/publish/delete failures now use safer user-facing copy.
- Subscribe and Settings Premium copy is more public-facing while staying honest that store/setup can block access.
- Runtime error reporting and Crashlytics logging now redact common token, signed URL, API key, bearer, and JWT patterns before logs/analytics.

No new major system, monetization implementation, native AR SDK, later-phase feature, room layout redesign, or comments movement was introduced.

Recommendation: keep these changes, then run the final Android route smoke and release-log audit before marking Public v1 smoothness Done.

## Screens Audited

| Area | Loading | Empty | Error/retry | Notes |
| --- | --- | --- | --- | --- |
| Home | Present | Polished in this pass | Raw error copy replaced | Runtime smoke pending. |
| Explore | Present | Present | Raw error copy replaced | Header copy now user-facing. |
| My List | Present | Hardened in this pass | Retry card added for refresh failure | Saved-title runtime smoke pending. |
| Profile/Channel | Present | Present | Existing unavailable and owner/public states | Owner/non-owner proof pending. |
| Channel Settings | Present | Present | Creator video retry added | Upload/manage proof still pending for final lane. |
| Creator Media | Present | Present | Picker/save/publish/delete copy hardened | Storage API delete proof pending. |
| Player | Present | Present | Honest unavailable states from prior pass | Source smoke pending. |
| Title Detail | Present | Present | Honest title unavailable state | Route smoke pending. |
| Watch-Party waiting room | Present | Present | Prior no-source and invalid-source hardening | Two-device proof pending. |
| Party Room | Present | Present | Existing route/source guardrails | Layout proof pending; comments not moved. |
| Live Stage | Present | Present | Existing token/surface guardrails | Live proof pending; layout not changed. |
| Chat | Present | Present | Signed-out handoffs from prior pass | Send/thread smoke pending. |
| Settings | Present | Not applicable | Existing sign-out/link errors | Premium copy polished. |
| Subscribe | Present | Not applicable | Existing unavailable store state | Copy polished; no fake unlock. |
| Admin | Present | Present | Existing non-admin/admin states | Operator proof pending. |
| Legal/support/account deletion | Route content present | Not applicable | Existing support handoffs | Legal review pending. |

## Loading States

Status: Implemented / Proof Pending.

Most major screens already avoid blank white/black screens with activity indicators or loaded cards. This pass did not redesign loading surfaces. Runtime proof still needs to confirm perceived smoothness on smaller Android devices and release-like builds.

## Empty States

Status: Implemented / Proof Pending.

Fixed:

- Home empty copy now reads as a public lineup state instead of internal programming instructions.
- My List empty state now includes a title, helpful body copy, and Browse Titles handoff.

Still pending:

- Public Profile/Channel empty states need owner/non-owner proof.
- Admin/report empty states need operator proof.
- Full notification center/search empty states are later-phase because those routes are not v1 owners.

## Error, Retry, And Network States

Status: Implemented / Proof Pending.

Fixed:

- Home and Explore remote title read failures now show safe retry-oriented copy rather than raw backend messages.
- My List shows a retry card if saved remote titles cannot refresh and no local fallback is available.
- Channel Settings creator video load failures now show an owner-visible retry card.
- Creator video upload/manage errors now map common network, permission/RLS, storage, and unsupported-file failures to safer copy.

Still pending:

- Android route smoke for network-offline behavior.
- Release build log audit for native SDK warnings.
- LiveKit token failure and room access denial UX must be exercised in final runtime smoke.

## Permission-Denied And Picker States

Status: Implemented / Proof Pending.

Fixed:

- Video picker cancellation now tells the creator no video was selected.
- Unsupported creator video files now get explicit MP4/MOV/WebM/M4V guidance and do not become the selected upload.

Still pending:

- Android camera/mic permission denial proof for Live Stage.
- Android file picker unavailable/native-module unavailable proof.
- Notification permission proof is later unless push delivery is pulled into v1.

## Premium And Access Polish

Status: Implemented / External Setup Pending.

Fixed:

- `/subscribe` now speaks to users instead of implementation owners.
- Settings Premium account copy now says what Chi'llywood can verify and keeps purchase/restore blocked until store/offers are ready.

Still pending:

- RevenueCat/Google Play product setup.
- Purchase, restore, refund/revocation, expired entitlement, signed-out, and non-premium access proof.

## Creator Upload Polish

Status: Implemented / Proof Pending.

Fixed:

- Selected file cancel/unsupported states are clearer.
- Creator video library load failure has retry.
- Upload/manage failure notices avoid raw storage/RLS messages.
- Creator video cards now lead with thumbnail or branded fallback preview instead of developer-looking text records.
- Owner/public cards show clear visibility and moderation badges, and public cards only expose route-safe Share when the video is public and shareable.

Still pending:

- Publish/unpublish proof.
- Edit/delete proof.
- Public/draft and owner/non-owner proof.
- Thumbnail-present and no-thumbnail fallback visual proof on Android.
- Storage API delete/remove proof.
- Moderation-hidden public/player blocking proof.
- Creator-video comments, likes, saves/My List, generated thumbnails, duration, and engagement counts remain unimplemented rather than faked.

## Moderation And Report Polish

Status: Implemented / Proof Pending.

No code changes were needed in the report sheet or Admin moderation surface during this pass. The existing surfaces remain helper-backed and proof-pending.

Still pending:

- Creator-video report row proof.
- Admin hide/remove/restore proof.
- Non-admin denial proof.
- Hidden/removed video public/player proof.

## Chat Polish

Status: Implemented / Proof Pending.

The prior non-room pass already added signed-out Chat Sign In handoffs and cleaned literal entity copy. No further code changes were made in Chat during this pass.

Still pending:

- Signed-in inbox/thread open proof.
- Message send failure/retry proof.
- Missing/blocked thread proof.

## Logging And Privacy Polish

Status: Implemented / Proof Pending.

Fixed:

- `_lib/logger.ts` redacts common bearer tokens, JWTs, signed URL query values, API keys, participant tokens, secrets, and auth fields before dev logs, runtime analytics payloads, and Crashlytics handoff.
- `_lib/firebaseCrashlytics.ts` applies the same redaction before Crashlytics log lines, meta serialization, and recorded non-fatal error objects.

Still pending:

- Release build log audit for native SDK logs, signed URLs, LiveKit tokens, RevenueCat receipts, and noisy production diagnostics.

## Accessibility And Mobile Basics

Status: Implemented / Proof Pending.

No major layout redesign was performed. Existing major buttons already use reasonable minimum heights in the audited surfaces. My List now has a larger empty-state card/action. Full small-screen visual proof remains pending.

## Brand And Copy Consistency

Status: Implemented / Proof Pending.

Fixed:

- Removed developer-facing Home/Explore discovery text from public routes.
- Reworded Premium account copy to be honest and product-facing.
- Preserved existing names: Chi'llywood, Chi'lly Chat, Chi'llyfects, Live Watch-Party, Watch-Party Live, Profile, Channel, Channel Settings, and Premium.

## Android Quality Readiness Notes

Status: External Setup Pending / Runtime Proof Pending.

Before Public v1 launch, finish:

- Android route smoke on a physical device.
- Play pre-launch report review.
- Crashlytics non-fatal receipt proof from preview/release-like build.
- Android vitals monitoring plan for crashes, ANRs, frozen frames, and slow rendering.
- Permission denial checks for camera, mic, and file picker.
- Battery/performance observation for LiveKit rooms.
- UGC moderation readiness proof for reports and admin actions.

## Fixes Made

- `app/(tabs)/index.tsx`: safe Home refresh error and public empty-state copy.
- `app/(tabs)/explore.tsx`: safe title-load error and public Explore header copy.
- `app/(tabs)/my-list.tsx`: branded empty/error card, Retry, and Browse Titles handoff.
- `app/channel-settings.tsx`: creator video retry state, file cancel/unsupported feedback, and safer upload/manage failure notices.
- `app/subscribe.tsx`: Premium copy polished without changing purchase logic.
- `app/settings.tsx`: Premium account copy and labels polished.
- `_lib/logger.ts`: runtime error/dev log/analytics redaction.
- `_lib/firebaseCrashlytics.ts`: Crashlytics message/meta/error redaction.

## Remaining Proof-Pending Items

- Final Android route smoke for Home, Explore, My List, Auth, Profile, Channel Settings, Player, Title Detail, Chat, Settings, Subscribe, Admin, Legal, Support, and Account Deletion.
- Creator Media public/draft, owner/non-owner, edit, publish/unpublish, delete, report, moderation, and Storage API proof.
- Watch-Party and Live Stage runtime proof without changing locked layouts or comments placement.
- Premium/access blocked-state proof.
- Release build log audit.

## External Setup Pending

- RevenueCat and Google Play billing setup.
- Firebase dashboard receipt proof.
- Legal review and final public URLs.
- Support/account deletion operational process.
- Play Store listing, content rating, Data Safety, screenshots, and policy declarations.
- Production runtime environment verification.

## Later Phase

- Real Chi'llyfects AR processing and native AR SDKs.
- Native game/video streaming.
- Paid creator videos, subscriber-only media, tips, coins, payouts, ads, tax/KYC, and earnings ledgers.
- Full global search, push notification delivery, notification center, full audience role roster, comment media uploads, advanced creator studio, and automatic transcoding.

## Exact Next Runtime Proof Order

1. Android non-room route smoke: Auth, Home, Explore, My List, Profile, Channel Settings, Player, Title Detail, Chat, Settings, Subscribe, Legal/Support/Deletion, and Admin denial.
2. Creator Media proof: owner upload/manage, public/draft visibility, non-owner denial, publish/unpublish, edit/delete, report row, moderation hide/remove/restore, and Storage API remove.
3. Premium/access proof: signed-out, non-premium, active entitlement, expired/revoked entitlement, purchase/restore unavailable, and configured store proof when ready.
4. Room proof: platform Watch-Party, creator-video Watch-Party, Live Stage, deployed `livekit-token` route behavior, and locked layout/comments checks.
5. Preview/release-like Android build smoke plus Crashlytics/Performance and release log audit.
