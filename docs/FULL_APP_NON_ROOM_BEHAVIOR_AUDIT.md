# Full App Non-Room Behavior Audit

Date: 2026-04-28

Repo root: `/Users/loverslane/chillywood-mobile`

Branch audited: `main`

HEAD at audit start: `327ee3c5d8d786cd261d5cb0127381c55c5660ae`

Origin/main at audit start: `327ee3c5d8d786cd261d5cb0127381c55c5660ae`

Initial local dirt: known untracked `supabase/.temp/` only.

Runtime truth: no Android devices were attached, no Metro/Expo server was detected on port 8081, and no Android/live proof or production build was run. This was a repo static audit plus small code hardening pass.

## 1. Executive Summary

The non-room app surface is mostly aligned with the product doctrine:

- Auth owns account entry and legal acceptance copy.
- Home, Explore, and My List own platform-title discovery and saved content.
- Profile is the person/social identity and public channel surface.
- Channel Settings is the owner control center for channel settings and creator media.
- Creator Media owns uploaded-video metadata, storage handoff, Profile/Channel display, Player handoff, and moderation status.
- Player owns standalone premium playback and must keep platform title and creator-video sources explicit.
- Title Detail owns platform title detail, access, report, and Watch-Party Live entry.
- Chi'lly Chat owns inbox/thread behavior outside rooms.
- Settings, Subscribe, Legal, Support, Account Deletion, and Admin each have distinct route ownership.

The audit found a few proven non-room issues and fixed only those:

- Creator videos can no longer be opened by accidental platform Player fallback. `/player/[id]` now stays platform-title only unless `source=creator-video` is explicit.
- Signup now has a direct Sign In handoff for users who land on signup with an existing account.
- Signed-out Chat inbox/thread states now offer a direct Sign In handoff with redirect context.
- JS string literals no longer render `&apos;` literally in Chat, Support, or the internal invite sheet.

Follow-up smoothness note: `docs/PUBLIC_V1_SMOOTHNESS_HARDENING_AUDIT.md` now records the Public v1 polish pass for loading, empty, error, picker, Premium-copy, and logging/privacy states. That pass kept non-room route ownership unchanged and only tightened Home/Explore/My List copy, Channel Settings creator-video states, Settings/Subscribe Premium copy, and runtime/Crashlytics redaction.

No monetization implementation, paid creator content, payout/tip/coin/ads work, native AR, native game streaming, major redesign, destructive account deletion, database migration, Android proof, or long live proof was performed.

Recommendation: keep the fixes, run the next route smoke on Android, and keep the remaining Public v1 work focused on Creator Media public/draft proof, Premium/access proof, moderation proof, and release readiness.

## 2. Non-Room Route Owner Map

| Area | Route | Owner file | System owner | Owns | Must not own | Access behavior | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Auth login | `/(auth)/login` | `app/(auth)/login.tsx` | Auth | Email/password sign-in and `redirectTo` | Profile setup, entitlement truth | Signed-out primary; signed-in redirected by root gate | Correct |
| Auth signup | `/(auth)/signup` | `app/(auth)/signup.tsx` | Auth | Account creation, legal acceptance copy, legal links, Sign In handoff | Channel setup, paid features | Signed-out primary; signed-in redirected by root gate | Fixed |
| Home | `/(tabs)` index | `app/(tabs)/index.tsx` | Home/discovery | Premium home rails, title cards, live entry, shortcuts | Room ownership, upload management | Protected tab route | Correct / proof pending |
| Explore | `/(tabs)/explore` | `app/(tabs)/explore.tsx` | Discovery | Platform-title browse | Creator upload management, fake search | Protected tab route | Correct / proof pending |
| My List | `/(tabs)/my-list` | `app/(tabs)/my-list.tsx` | Saved content | Saved platform titles | Creator upload management | Protected tab route | Correct / proof pending |
| Profile / Channel | `/profile/[userId]` | `app/profile/[userId].tsx` | Profile + public channel | Identity, public creator videos, owner/public channel state, profile actions | Upload/edit/delete logic | Protected route; owner and public viewer controls differ | Correct / proof pending |
| Channel Settings | `/channel-settings` | `app/channel-settings.tsx` | Channel owner controls | Channel fields, creator upload/manage, creator events, audience summaries | Public channel display, Player playback | Signed-in/beta route, owner-side controls | Correct / proof pending |
| Creator Media management | `/channel-settings` Content panel | `app/channel-settings.tsx`, `_lib/creatorVideos.ts` | Creator Media | Choose file, metadata, draft/public, edit, publish/unpublish, delete | Paid media, transcoding, fake upload success | Owner-only UI; backend/RLS proof still required | Correct / proof pending |
| Standalone Player | `/player/[id]` | `app/player/[id].tsx` | Player | Platform-title playback, creator-video playback when source is explicit, report, Watch-Party entry | Upload management, source guessing | Protected route plus access gate | Fixed / proof pending |
| Title Detail | `/title/[id]` | `app/title/[id].tsx` | Platform title detail | Title metadata, play, favorite/list, report, Watch-Party Live CTA | Creator-video detail | Protected route plus access gate | Correct / proof pending |
| Chat inbox | `/chat` | `app/chat/index.tsx` | Chi'lly Chat | Inbox, search, starter thread/profile actions | Room media | Signed-out state now has Sign In handoff | Fixed / proof pending |
| Chat thread | `/chat/[threadId]` | `app/chat/[threadId].tsx` | Chi'lly Chat | Thread loading, send, profile/report/call actions | Room playback | Signed-out state now has Sign In handoff | Fixed / proof pending |
| Settings | `/settings` | `app/settings.tsx` | Account settings | Profile, Channel, Premium, Support, Legal, deletion links, logout | Entitlement writes | Protected route | Correct / proof pending |
| Subscribe | `/subscribe` | `app/subscribe.tsx` | Premium account surface | Honest status, purchase/restore/manage handoff | Fake purchase success, backend entitlement grants | Signed-in actions; unavailable store state is blocked honestly | Correct / external setup pending |
| Legal | `/terms`, `/privacy`, `/community-guidelines`, `/copyright` | Legal route files | Legal/policy | Public policy pages | Runtime policy enforcement | Public legal paths | Correct / legal review pending |
| Support | `/support`, `/beta-support` | `app/support.tsx`, `components/system/support-screen.tsx` | Support | Support categories and signed-in feedback handoff | Legal adjudication, destructive account actions | Public with richer signed-in feedback | Fixed copy / proof pending |
| Account Deletion | `/account-deletion` | `app/account-deletion.tsx` | Legal/support | Request-based deletion instructions | Destructive automated deletion | Public legal path | Correct / external setup pending |
| Admin | `/admin` | `app/admin.tsx` | Admin/operator | Platform title admin, config, creator grants, reports, creator-video moderation | Public controls, hidden-button-only security | Signed-in/beta/admin role gate | Correct / proof pending |
| Notifications/reminders | No dedicated route | `_lib/notifications.ts`, Profile/Channel event surfaces | Notifications/reminders | Event reminder rows and readiness copy where surfaced | Push notification claims | Helper-backed only | Honest foundation / later route |
| Search | No dedicated route | Explore/Home surfaces | Discovery | Browse platform titles | Full global search | Not implemented as route | Later phase |
| Legacy/helper | `/communication`, `/communication/[roomId]`, `app/modal.tsx` | Compatibility route files | Compatibility | Redirect or guarded compatibility | New non-room product ownership | Legacy only | Correct from prior audit |

## 3. Button/Tap Behavior Map

| Button/tap | Location | Expected behavior | Actual repo behavior | Status |
| --- | --- | --- | --- | --- |
| Sign In submit | Login | Supabase sign-in and redirect | Calls auth helper, handles loading/errors, honors redirect | Real |
| Sign Up submit | Signup | Supabase signup with legal acceptance copy visible | Calls auth helper, legal links visible | Real |
| Signup legal links | Signup | Open Terms, Privacy, Guidelines | Route links exist | Real |
| Signup Sign In | Signup | Route existing users to login | Added in this pass | Fixed |
| Logout | Settings | Supabase sign out | Calls auth sign out and leaves protected routes to auth gate | Real / proof pending |
| Edit/manage profile | Profile/Settings | Owner opens Channel Settings | Owner-only handoff exists | Real |
| Manage Channel | Profile/Settings | Route to Channel Settings | Owner/account handoff exists | Real |
| Upload Video / Choose Video File | Channel Settings | Open Android picker and show selected file | `expo-document-picker` flow exists; runtime proof from earlier upload lane exists, final non-room route smoke pending | Real / proof pending |
| Save/upload | Channel Settings | Save metadata/storage or show error | Upload/loading/error/success states exist; no fake success | Real / proof pending |
| Edit video | Channel Settings | Edit metadata in owner lane | Existing code path present | Real / proof pending |
| Publish/unpublish | Channel Settings | Toggle draft/public honestly, blocked by moderation when needed | Existing code path and moderated blocked copy present | Real / proof pending |
| Delete video | Channel Settings | Confirm then remove owner video | Confirmation/code path exists; Storage API delete proof pending | Real / proof pending |
| Open Player | Profile/Channel Settings | Open creator video with explicit source | Routes to `/player/[id]?source=creator-video` | Real |
| Report video | Player | Create/report through safety helper | Creator/video report path exists | Real / proof pending |
| Report profile/user | Profile/Chat | Open report path where present | Existing report paths remain route-local | Real / proof pending |
| Follow/audience actions | Channel Settings/Profile | Use backed audience helpers only | Owner/audience summaries and actions use helpers; full roster later | Real foundation / later expansion |
| Message/chat | Profile | Open/direct Chi'lly Chat | Routes to `/chat` or thread helpers | Real / proof pending |
| Subscribe/Premium | Subscribe/access surfaces | Honest status or real purchase handoff | Blocks if RevenueCat/offers unavailable; no local fake premium grant | Real / external setup pending |
| Restore purchase | Subscribe | Restore through RevenueCat helper or honest unavailable state | Helper-backed, blocked when not configured | Real / external setup pending |
| Settings links | Settings | Open Profile, Channel, Premium, Support, Legal, Deletion | Links exist | Real / proof pending |
| Support links | Support/Settings | Open support categories and auth handoff | Existing route; copy fixed | Real / proof pending |
| Legal links | Settings/Signup/Support | Open bundled policy pages | Links exist | Real / legal review pending |
| Account deletion request | Account deletion/Support | Request-based support path | Honest request flow; no destructive delete | Real / external setup pending |
| Admin title actions | Admin | Admin-gated create/edit/publish where present | Admin route gates role and writes through helpers | Real / proof pending |
| Admin moderation actions | Admin | Hide/remove/restore creator videos | Helper-backed UI present | Real / proof pending |
| Home cards | Home | Route platform titles/player/live entry correctly | Title/player/live handoffs exist | Real / proof pending |
| Explore cards | Explore | Route to title detail | Routes `/title/[id]` | Real / proof pending |
| My List cards | My List | Route saved platform titles | Routes `/title/[id]` | Real / proof pending |
| Title play/watch | Title Detail | Open Player and Watch-Party Live through normal party flow | Routes exist; room proof handled separately | Real / proof pending |
| Player controls | Player | Standalone playback controls and honest unavailable states | Source ownership hardened; no creator fallback without source param | Fixed / proof pending |
| Search input | Chat inbox, discovery surfaces where present | Search backed local route data only | Chat thread search is real; full app search route absent | Real / later |
| Notifications/reminders | Profile/Channel event surfaces | Only show backed reminder readiness | Helper-backed; no push delivery claim | Honest foundation |

## 4. Auth/Signup/Legal Acceptance Findings

Status: Implemented / Proof Pending.

Signup visibly includes Terms, Privacy, and Community Guidelines acceptance copy before account creation. The legal links route to bundled public policy pages. Login and signup both use redirect-aware auth flows. Protected tabs and protected non-room routes are gated by the app shell/session behavior.

Fix made: added a direct Sign In handoff on the signup screen for existing users.

Proof pending: final Android route smoke for signup, login, signed-out protected deep links, legal-link taps, auth error display, and logout.

## 5. Profile/Channel Findings

Status: Implemented / Proof Pending.

Profile acts as the person/social identity and public channel surface. Channel Settings acts as the owner management/control center. Owner controls are not shown to public viewers in the audited code path. Public creator-video reads use `_lib/creatorVideos.ts`, which filters by visibility and moderation status; owner reads can include drafts.

No separate public `/channel/[id]` route is required for v1. A later channel alias can be considered only if product navigation needs it.

Proof pending: owner/non-owner Android proof for owner controls, public empty states, public videos, hidden drafts, and non-owner denial.

## 6. Creator Media Findings

Status: Implemented / Proof Pending.

Channel Settings owns creator upload/manage. The current lane has file selection, selected file state, title requirement, optional description/thumbnail URL, draft/public state, upload loading state, notices/errors, edit metadata, publish/unpublish, delete confirmation, and moderated-status blocking copy.

Presentation update: creator videos now use a shared media-first card in Channel Settings and Profile/Channel. The card shows real thumbnails from `thumb_url` / `thumb_storage_path` when available, a branded fallback preview when not, Play overlay, visibility and moderation badges, file size/date metadata where present, and owner controls only in owner surfaces.

No fake paid/subscriber media, transcoding, payout, or advanced creator studio controls were added.

Engagement truth: creator-video Report is backed in Player, public creator-video Share uses the app route/deep link, and creator-video likes/comments/saves/counts are not backed or shown. Title-only engagement remains title-only.

Proof pending: public/draft visibility, thumbnail/fallback visual smoke, edit, publish/unpublish, delete/storage remove, report row creation, admin hide/remove/restore, and non-owner denial.

## 7. Player/Title Findings

Status: Fixed / Proof Pending.

Title Detail remains the platform title detail owner. Player remains the standalone premium watch surface. Creator videos are valid only through explicit creator-video source routes.

Fix made: removed the non-creator Player fallback that allowed `/player/[id]` to resolve a creator video by id without `source=creator-video`. This keeps platform title routes from becoming creator-video routes by accident.

Expected behavior now:

- Valid platform id opens platform Player.
- Invalid platform id shows Title unavailable.
- Valid creator video requires `/player/[id]?source=creator-video`.
- Invalid creator-video source shows Creator video unavailable.
- Creator-video source does not fall back to platform/sample media.
- Creator-video Player hides title-only save/like/share relationship controls, keeps backed Report, and exposes only route-safe native Share for public shareable creator videos.

Proof pending: Android smoke for all valid/invalid source cases and release log audit for signed URL exposure.

## 8. Home/Explore/My List Findings

Status: Implemented / Proof Pending.

Home, Explore, and My List are modern enough for the current v1 scope and route platform titles to Title Detail or Player as intended. Creator-video global discovery is not currently a v1 route owner; Profile/Channel is the creator-video discovery surface.

No fake full-search engine or global creator-video recommendation surface was added.

Proof pending: final route smoke for Home cards, Explore cards, My List cards, empty/loading/error states, and signed-out protected tab behavior.

## 9. Chat Findings

Status: Fixed / Proof Pending.

Chat inbox and thread routes open outside room proof. Profile message paths route into Chi'lly Chat, and the old `/communication` lane remains compatibility instead of competing with Chat.

Fixes made:

- Signed-out Chat inbox now has a Sign In button with redirect back to `/chat`.
- Signed-out Chat thread now has a Sign In button with redirect back to the thread when possible.
- JS string literals were cleaned so `&apos;` does not render literally.

Proof pending: signed-in inbox/thread open, message send, profile-to-chat route, thread unavailable state, and any call-handoff compatibility proof chosen for v1.

## 10. Settings/Subscribe Findings

Status: Implemented / External Setup Pending.

Settings links to Profile, Channel Settings, Premium, Support, legal pages, account deletion, and logout. Subscribe is honest: it reads configured monetization helpers, blocks purchase/restore when store setup is unavailable, and does not grant Premium locally.

No monetization implementation was started. Paid creator content, tips, coins, payouts, ads, and subscriber-only media remain later.

Proof pending: Android route smoke for Settings links/logout and store/RevenueCat dashboard proof before live purchase claims.

## 11. Legal/Support/Account Deletion Findings

Status: Implemented / External Setup Pending.

Terms, Privacy, Community Guidelines, Copyright/DMCA, Account Deletion, and Support are serious mobile-readable draft pages. Account deletion is request-based and does not claim destructive automated deletion. Support copy is honest and points users to sign in where account-specific support is needed.

Fix made: cleaned a literal apostrophe entity in Support signed-out copy.

External setup pending: attorney/legal approval, final public URLs, DMCA/contact process, support process, Play policy URL proof, and Data Safety acceptance.

## 12. Admin Findings

Status: Implemented / Proof Pending.

Admin is protected by signed-in/beta/admin role gates. The route owns platform title programming, app config, creator grants, reports, and creator-video moderation controls. Admin actions were not exposed to public viewers during static audit.

Proof pending: non-admin deep-link denial, admin write proof, report queue proof, and creator-video hide/remove/restore behavior against live backend truth.

## 13. Notifications/Reminders Findings

Status: Honest Foundation / Later Route.

Notification and event-reminder helpers and tables exist, and Profile/Channel Settings surface reminder readiness only where backed. There is no full notification center route and no push delivery claim.

Recommendation: keep push delivery and a notification inbox as later-phase unless Public v1 launch requirements change.

## 14. Backend Dependency Findings

| Feature | Backend/storage dependencies | Audit finding |
| --- | --- | --- |
| Profiles/channel | `user_profiles`, profile helpers, channel read models | Route code uses profile/channel helpers; runtime owner/public proof pending. |
| Channel audience | `channel_followers`, `channel_subscribers`, `channel_audience_requests`, `channel_audience_blocks` | Backed summaries/actions exist; full roster/VIP/mod roles later. |
| Creator videos | `videos`, `creator-videos` storage, creator-video migrations/RLS | App integration exists; live public/draft/storage delete proof pending. |
| Platform titles | `titles`, media-source helpers, content engagement tables | Title Detail/Player/Home/Explore use platform title owner; invalid platform fallback already hardened in prior room pass and Player source hardening completed here. |
| Reports/moderation | `safety_reports`, `videos.moderation_status`, platform role tables | UI/helper foundation exists; admin/report runtime proof pending. |
| Premium/access | `user_entitlements`, `billing_events`, RevenueCat helpers | Backend truth exists; store setup and proof pending. |
| Chat | `chat_threads`, `chat_thread_members`, `chat_messages` | Inbox/thread helpers exist; send/access proof pending. |
| Notifications/reminders | `notifications`, `creator_events`, `event_reminders` | Helper-backed foundation; push/inbox later. |
| Admin/operator | `platform_role_memberships`, admin helper reads/writes | Route gate exists; backend denial proof pending. |
| Legal/support | Support/beta feedback helpers and configured URLs | Bundled pages exist; external URL/legal proof pending. |

No destructive SQL, migration push, storage mutation, or production backend command was run in this pass.

## 15. Missing Route Recommendations

| Possible route | Recommendation | Phase | Reason |
| --- | --- | --- | --- |
| Dedicated Creator Media manager | Later unless Channel Settings becomes too crowded | Post-v1 or small v1 polish | Current Channel Settings can safely own v1 upload/manage. |
| Public `/channel/[id]` alias | Later | Post-v1 | Profile currently owns public channel truth without route drift. |
| Report/safety center | Later | Post-v1 | Contextual report sheets plus Admin moderation are enough for v1 proof. |
| Admin reports route | Later | Post-v1 | `/admin` already owns operator queue foundation. |
| Account deletion request form | Later/external setup | V1 external process first | Current route is honest request-based info; backend/legal process must be approved before automation. |
| Support ticket/contact route | Later | Post-v1 | Existing Support route and feedback handoff are enough for v1. |
| Search route | Later | Post-v1 | Explore handles platform browse; global search needs source design. |
| Notification center | Later | Post-v1 | Helpers/tables exist, but no push/inbox proof. |
| Premium manage subscription route | Later | After store setup | `/subscribe` is enough until live billing proof exists. |
| Friends/social graph route | Later | Post-v1 | Chat/profile handoffs are enough for current scope. |
| Creator dashboard | Later | Post-v1 | Channel Settings is the current owner control center. |

No new routes were added.

## 16. Fixes Made

- `app/player/[id].tsx`: removed creator-video fallback from the non-creator route path. Creator videos now require `source=creator-video`.
- `app/(auth)/signup.tsx`: added an existing-account Sign In handoff that preserves `redirectTo`.
- `app/chat/index.tsx`: added signed-out Sign In handoff and cleaned literal apostrophe entities in JS strings.
- `app/chat/[threadId].tsx`: added signed-out Sign In handoff with thread redirect and cleaned literal apostrophe entities.
- `components/system/support-screen.tsx`: cleaned literal apostrophe entity in signed-out support copy.
- `components/chat/internal-invite-sheet.tsx`: cleaned literal apostrophe entity in fallback display copy.

## 17. Remaining Proof-Pending Items

- Android smoke for signup, login, logout, legal links, and protected deep links.
- Android smoke for Home, Explore, My List, Title Detail, Player, Profile, Channel Settings, Chat, Settings, Support, Subscribe, Admin denied state, and Account Deletion.
- Creator Media public/draft owner/non-owner proof.
- Creator-video edit, publish/unpublish, delete/storage remove proof.
- Creator-video report row and admin moderation proof.
- Player valid/invalid platform and creator-video source proof.
- Premium/access signed-out, missing entitlement, active entitlement, restore, expired/revoked proof.
- Legal/support/account-deletion public URL and external review proof.
- Release log audit for secrets, signed URLs, tokens, and noisy production logs.

## 18. Recommended Next Order

1. Keep this non-room fix set scoped and validated.
2. Run final Android route smoke for auth, discovery, profile/channel, player/title, chat, settings, legal/support, subscribe, admin denied state, and account deletion.
3. Finish Creator Media public/draft and owner/non-owner proof.
4. Prove report/admin moderation and Storage API delete/remove behavior.
5. Prove Premium/access gates and RevenueCat/store setup only after external dashboard configuration is ready.
6. Continue release readiness: production env validation, Play Store assets, legal URLs, support process, Firebase proof, and final release-route smoke.
7. Keep native game streaming, real Chi'llyfects AR processing, paid creator media, tips/coins/payouts, ads, global search, push notification delivery, and advanced creator studio in later phases.
