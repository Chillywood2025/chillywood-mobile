# Public V1 Readiness Checklist

Date: 2026-04-26

Purpose: track Public v1 launch readiness without treating static validation as runtime proof. Use this document with `CURRENT_STATE.md`, `NEXT_TASK.md`, `docs/FULL_APP_ROUTE_OWNER_BEHAVIOR_AUDIT.md`, `docs/PUBLIC_V1_AND_LATER_SYSTEMS_PLAN.md`, and `docs/EXTERNAL_SETUP_PUBLIC_V1_CHECKLIST.md`.

Status key:

- Done: implemented and proof completed for the relevant launch path.
- Implemented / Proof Pending: code or docs exist, but runtime, device, store, live Supabase, or two-device proof is still required.
- External Setup Pending: app-side behavior exists or is defined, but store, legal, account, or release-console setup must be completed outside this codebase.
- Later Phase: intentionally post-v1.
- Blocked: a known repo or runtime blocker prevents launch readiness.

## Launch Rules

- Do not mark a system Done when Android, two-device, store, live Supabase, or release proof is still pending.
- Do not fake Premium, billing, moderation, Watch-Party, creator upload, audience role, monetization, or notification support.
- Backend/RLS truth must enforce sensitive behavior. Hidden buttons are not security.
- Runtime proof must save screenshots/logs under `/tmp` and summarize facts in repo control files.
- Native game streaming, paid creator videos, subscriber-only videos, tips/coins, payouts, ads, comment media upload, full VIP/moderator roster, advanced creator studio, and automatic transcoding remain later.

## Checklist

| Area | Status | Owner files/systems | Implemented truth | Still needs proof or setup | V1 or later | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| Auth / Session | Implemented / Proof Pending | `app/_layout.tsx`, `app/(auth)/*`, `_lib/session.tsx`, `_lib/supabase.ts` | Root auth gate protects tab shell; login/signup redirect support exists; Settings signs out through Supabase auth. | Final Android route smoke for signed-out/signed-in redirects, logout, and protected deep links. | V1 required | Include in final route smoke. |
| Profile / Channel | Implemented / Proof Pending | `app/profile/[userId].tsx`, `app/channel-settings.tsx`, `_lib/userData.ts`, `_lib/channelReadModels.ts` | Profile is person/social identity plus public Channel surface; owner controls route to Channel Settings; public viewers do not own management controls. | Owner vs non-owner Android proof for public videos, draft hiding, and public empty state. | V1 required | Continue Creator Media public/draft and non-owner proof. |
| Creator Media | Implemented / Proof Pending | `app/channel-settings.tsx`, `app/profile/[userId].tsx`, `app/player/[id].tsx`, `_lib/creatorVideos.ts` | Upload, metadata save, draft/public visibility model, owner management, Profile/Channel listing, and standalone Player handoff exist. | Public/draft visibility, edit, publish/unpublish, delete/unpublish, non-owner denial, Storage API delete/remove proof. | V1 required | Run focused Android and Supabase/Storage proof later. |
| Player | Implemented / Proof Pending | `app/player/[id].tsx`, `_lib/mediaSources.ts`, `_lib/watchPartyContentSources.ts` | Platform titles and creator videos share the premium standalone Player shell. Missing platform ids and missing creator sources show honest unavailable states. | Final smoke for valid platform title, invalid platform id, valid creator video, invalid creator video, and no sample fallback. | V1 required | Include in final route smoke. |
| Watch-Party platform titles | Implemented / Proof Pending | `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx`, `_lib/watchParty.ts` | Platform/admin title Watch-Party uses normal waiting room and Party Room, not Live Stage. | Premium/deep-link blocked-state proof and final platform room smoke. | V1 required | Prove signed-out/non-premium and valid Premium paths. |
| Creator-video Watch-Party | Implemented / Proof Pending | `app/player/[id].tsx`, `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx`, `_lib/watchParty.ts`, `_lib/watchPartyContentSources.ts` | Creator video Watch-Party linking is built; one-device Android proof passed for normal Party flow, creator-video source, and no Live Stage/sample/platform fallback. | Two-device join/rejoin, draft/private blocked state, hidden/removed blocked state, signed-out/non-premium blocked state. | V1 if proof completes | Run two-device creator-video Watch-Party proof later. |
| Live Stage / LiveKit | Implemented / Proof Pending | `app/watch-party/live-stage/[partyId].tsx`, `components/watch-party-live/livekit-stage-media-surface.tsx` | Current main preserves two-device Live First and Live Watch-Party proof; Live Stage remains separate from title/content Party Room. | Later sustained two-phone live/watch retention, audio, and route-stack cleanup if it becomes a blocker. | V1 required for live launch | Use bounded proof runner for future long video proof. |
| Chat | Implemented / Proof Pending | `app/chat/index.tsx`, `app/chat/[threadId].tsx`, `_lib/chat.ts` | Native Chi'lly Chat owns inbox/thread behavior; `/communication` redirects to `/chat` and no longer competes as a lobby. | Final signed-in inbox/thread send smoke and call-handoff compatibility proof if shipping call handoff. | V1 required | Include in final route smoke. |
| Premium / Access Gates | Implemented / Proof Pending | `_lib/monetization.ts`, `_lib/premiumEntitlements.ts`, components access sheet, `app/subscribe.tsx` | Backend entitlement model exists; route/access checks do not rely on local-only Premium rows; `/subscribe` now provides honest account-owned purchase/restore/status UX. | Store product configuration, real purchase path, restore path, expired/revoked proof, signed-out/non-premium/deep-link proof. | V1 required for Premium features | Run access-gate proof and store proof later. |
| Billing / Subscription Entitlement | External Setup Pending | `_lib/revenuecat.ts`, `_lib/monetization.ts`, `_lib/premiumEntitlements.ts`, `app/subscribe.tsx`, billing migrations | RevenueCat owner, subscription target, restore/manage calls, and backend entitlement table exist. UI blocks when store/offers are unavailable and does not grant Premium locally. | RevenueCat product IDs, store credentials, real purchase validation, restore validation, refund/revocation proof. | V1 required if Premium gates ship | Configure store/RevenueCat, then run store proof. |
| Moderation / Safety | Implemented / Proof Pending | `_lib/moderation.ts`, `components/safety/report-sheet.tsx`, `app/player/[id].tsx`, `app/admin.tsx` | Creator-video reports, reason picker, admin queue visibility, hide/remove/restore actions, and moderation status filters exist. | Report row proof, admin action proof, non-admin denial proof, hidden/removed public/player proof. | V1 required | Run creator-video report/admin safety proof later. |
| Admin / Operator | Implemented / Proof Pending | `app/admin.tsx`, `_lib/moderation.ts`, platform-role tables | Admin route gates by current platform role truth; platform title management, app config, creator grants, safety queue, and creator-video moderation controls exist. | Non-admin deep-link denial and backend-protected write proof. | V1 required | Include admin denial and operator write proof. |
| Supabase / RLS | Implemented / Proof Pending | Supabase migrations, `supabase/database.types.ts`, `_lib/supabase.ts` | Local and remote schema through `202604260004` is aligned for creator-video Watch-Party; local RLS proof covers key creator media, billing, moderation, event, notification, reminder, and room lanes. | Full live Supabase proof for public/draft/non-owner creator media, Storage API delete/remove, admin writes, and access gates. | V1 required | Run focused read/write proof later, no blind remote pushes. |
| Settings / Account | Implemented / Proof Pending | `app/settings.tsx`, `app/account-deletion.tsx`, `app/support.tsx` | Settings links to Profile, Channel Settings, Premium, legal/support, account deletion, and logout. Account deletion is an honest request/help path, not fake deletion completion. | Android proof for logout, Settings links, and account-deletion support flow. | V1 required | Include in final route smoke. |
| Legal / Support / Content Policy | External Setup Pending | `app/privacy.tsx`, `app/terms.tsx`, `app/account-deletion.tsx`, `app/community-guidelines.tsx`, `app/copyright.tsx`, `components/system/support-screen.tsx` | Bundled Privacy, Terms, Account Deletion, Community Guidelines, and Copyright/DMCA pages exist; Settings and Support link to them. | Final legal review, configured public URLs, support email confirmation, Play Store policy URL proof. | V1 required | Legal review and URL setup before release build. |
| Home / Discovery | Implemented / Proof Pending | `app/(tabs)/index.tsx`, `app/(tabs)/explore.tsx`, `app/(tabs)/my-list.tsx` | Home/Explore/My List show platform/admin titles and live Watch-Party signals; public empty states no longer expose developer setup copy. Profile/Channel remains creator-video discovery surface. | Final Home/Explore/My List route smoke still needed. Global creator-video discovery is later unless product scope changes. | V1 required, global creator discovery later | Keep v1 discovery scoped; do not fake search. |
| Search | Later Phase | No dedicated full-search route | Explore provides browse for platform titles. | Full user/title/channel/video search is not implemented. | Post-v1 unless required | Do not add fake search before source truth is designed. |
| Notifications / Reminders | Implemented / Proof Pending | `_lib/notifications.ts`, `_lib/liveEvents.ts`, `creator_events`, `notifications`, `event_reminders` | Notification and event-reminder helpers/tables exist; Profile and Channel Settings only surface real reminder-ready enrollment truth and explicitly say push delivery is later. | No push delivery proof and no notification center proof. Push delivery and a full notification center remain later unless pulled into scope. | Optional/non-blocking v1 | Keep surfaced controls honest; push notifications later. |
| Account Deletion | External Setup Pending | `app/account-deletion.tsx`, `app/settings.tsx`, support flow | Public information page and support handoff exist; Settings links to the deletion page or configured destination. | Final self-serve/legal URL or manual support process confirmation. | V1 required | Confirm legal/support process before store submission. |
| Support Feedback | Implemented / Proof Pending | `components/system/support-screen.tsx`, `_lib/betaProgram.tsx` | Signed-in support feedback route exists; signed-out users get sign-in prompt. | Proof that feedback lands in expected backend queue for public-v1 environment. | V1 required | Run support feedback proof later. |
| Android Release Build | Implemented / Proof Pending | `app.json`, `app.config.ts`, `eas.json`, package scripts | Android package, icon/splash, Firebase/RevenueCat/Supabase runtime config owners exist. | Production EAS build, runtime env validation, release route smoke, permissions review. | V1 required | Run release build proof after runtime proof lanes. |
| Store Readiness | External Setup Pending | Play Store console, runtime config, legal/support URLs | App-side policy pages and Premium UX are ready to point at configured store/legal surfaces. | Store listing, screenshots, support/legal URLs, privacy declarations, billing product setup. | V1 required | Complete outside-repo setup and prove in release build. |
| Production Logging | Implemented / Proof Pending | `_lib/logger.ts`, route/player/upload logs, `app/player/[id].tsx` | Player source/Watch-Party debug lines now use the dev-only logger, and creator-video upload logs stay dev-only without signed URL output. | Release build log audit for noisy native SDK logs, tokens, signed URLs, and production logging posture. | V1 required | Re-audit logs during release build proof. |
| Final Smoke Test | Implemented / Proof Pending | Whole app | Route ownership is documented; high-priority route hardening is already fixed. | Signed-out/signed-in/admin/premium/creator/live/chat/settings final smoke. | V1 required | Run after remaining proof lanes. |

## Current Non-Proof Closeout Classification

Category A, completed now without runtime proof or external setup:

- Checklist status taxonomy now uses only Done, Implemented / Proof Pending, External Setup Pending, Later Phase, and Blocked.
- Public discovery empty states no longer expose developer setup instructions.
- Player route/source and Watch-Party handoff diagnostics now use the dev-only logger instead of raw production console output.
- Home/Discovery, Notifications/Reminders, Production Logging, Android Release Build, and Final Smoke Test rows now have exact launch statuses instead of vague Partial or Proof Pending-only states.

Category B, requires Android/runtime, two-device, live Supabase, or release proof later:

- Auth/session redirects, logout, and protected deep links.
- Profile/Channel public-vs-owner behavior.
- Creator Media public/draft visibility, owner/non-owner denial, edit, publish/unpublish, delete, and Storage API remove.
- Player source smoke for valid and invalid platform/creator-video routes.
- Platform title Watch-Party and creator-video Watch-Party two-device join/rejoin.
- Live Stage/LiveKit sustained proof.
- Chat inbox/thread send smoke.
- Premium/access blocked-state proof.
- Admin/operator denial and moderation write proof.
- Settings/support/legal route smoke.
- Android release build and final route smoke.

Category C, requires store/legal/account/release setup outside this pass:

- RevenueCat product IDs, offerings, store credentials, purchase validation, restore validation, refund/revocation proof, and Play Store billing setup.
- Final public URLs and legal review for Privacy, Terms, account deletion, Community Guidelines, Copyright/DMCA, and support.
- Store listing, screenshots, privacy declarations, support URL, and account-deletion URL.
- Release runtime environment confirmation for Supabase, LiveKit, RevenueCat, Firebase, support, and legal links.

Category D, later phase by product decision:

- Full global search across users, channels, creator videos, and platform titles.
- Push notification delivery and a full notification center.
- Native game/video streaming.
- Paid creator videos, subscriber-only media, tips, coins, payouts, ads, tax/KYC, and earnings ledgers.
- Full Audience Role Roster, VIPs, channel moderators, creator teams, and durable co-host roles.
- Comment media upload, advanced creator studio, and automatic transcoding.

## External Setup Pending

- External setup details, dashboard/manual owners, proof requirements, and exact next actions now live in `docs/EXTERNAL_SETUP_PUBLIC_V1_CHECKLIST.md`.
- RevenueCat products, offerings, public SDK keys, and store-side subscription setup.
- Google Play listing metadata, policy declarations, screenshots, support URL, privacy URL, terms URL, and account-deletion URL.
- Final legal review of bundled policy pages and public hosted URLs.
- Release runtime environment values for Supabase, LiveKit, legal, support, RevenueCat, and Firebase.

## Runtime Proof Pending

- Creator Media public/draft and owner/non-owner proof.
- Creator-video two-device Watch-Party join/rejoin proof.
- Draft/private and hidden/removed creator-video Watch-Party blocked-state proof.
- Signed-out/non-premium Premium gate proof.
- Store purchase/restore proof if Premium ships live.
- Admin/operator denial and creator-video moderation write proof.
- Storage API delete/remove proof for creator videos.
- Settings/logout/legal/support route smoke.
- Final Android release build and route smoke.

## Later-Phase Items

- Native game/video streaming.
- Paid creator videos and subscriber-only media.
- Tips, coins, creator payouts, ads, tax/KYC, and earnings ledgers.
- Full Audience Role Roster, VIPs, channel moderators, creator teams, and durable co-host roles.
- Comment media upload.
- Full search across users, channels, creator videos, and platform titles.
- Push notification delivery and notification center.
- Advanced creator studio and automatic transcoding.
