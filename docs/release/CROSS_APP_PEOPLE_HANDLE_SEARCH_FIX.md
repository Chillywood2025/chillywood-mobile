Cross-app people/handle search proof: Closed / Partial / Blocked.

Current verdict: Partial.

## Chi’lly Chat delete/hide conversation

Source status: fixed. Installed-app status: Pending until a Google Play internal build and actual user flow proof exercise the long-press hide path.

Root cause: the old Proof Normal / @user230456 row is a legitimate separate proof account/thread, not stale metadata for user230455, but the inbox lacked a production-safe way for a user to remove old proof/test conversations from their own view.

Files changed: `app/chat/index.tsx`, `_lib/chat.ts`, `supabase/database.types.ts`, `supabase/migrations/20260629063526_chat_thread_hide_from_inbox.sql`, `scripts/proof-chat-thread-hide-from-inbox.mjs`, `package.json`, and tracker/readiness docs.

Schema/RPC changes: `chat_thread_members.hidden_at` records a per-user inbox hide timestamp. `hide_chat_thread_from_inbox` updates only the caller’s membership row. `unhide_chat_thread_for_me` clears only the caller’s hidden state when the existing direct thread is reopened.

RLS behavior: authenticated RPC checks the signed-in caller and existing thread access before updating only that caller’s membership row. It does not hard-delete `chat_threads`, `chat_messages`, call events, call invites, or the other participant’s inbox copy.

Long-press action behavior: the inbox thread row keeps Open Thread, Open Profile, Voice Call, and Video Call, and adds Delete from my inbox. Confirmation copy: `This removes the conversation from your inbox. It does not delete it for the other person.`

Delete from my inbox is a per-user hide, not a hard delete. The other participant’s copy is not deleted. Message and call history are preserved. Hidden direct threads must not create duplicate direct threads. Profile/Search → Chi’lly Chat must reopen the existing direct thread. Do not hide identity bugs by deleting rows. Proof Normal / @user230456 is a legitimate separate proof account/thread and may be hidden from the tester inbox without renaming or merging.

Source fixed is not installed-app proof. Google Play internal install is not enough without actual user flow proof. installerPackageName must be com.android.vending. Sideloaded APK proof is not accepted. No logout, uninstall, reinstall, or clear-data happened. No auth/RLS/chat/account-status permission weakening happened. No service-role chat/social proof was counted. No provider/live-money mutation happened. liveMoneyEnabled remains OFF.

## Direct thread messaging UX restoration

Source status: fixed. Installed-app status: Closed for direct-thread messaging UX on Play-installed v63; Partial for stale identity closure.

Chi’lly Chat direct thread must remain a real messaging thread. Calls live inside the thread, but must not replace the thread. Actual chat content must remain primary. Call event rows must not dominate the direct thread. Thread status UI must not push real chat content out.

This direct-thread source fix does not change identity resolution. It keeps fresh profile identity source rules intact while restoring the message-first thread hierarchy in `app/chat/[threadId].tsx`.

Thread message list path reviewed: current profile/user identity still flows into rendered message authors through the shared thread member data.

Call event rendering path reviewed: call events now render as lightweight timeline rows inside the message body so they do not overpower user messages.

Composer path reviewed: composer and attachment behavior remain in place.

Proof result: source fixed and Play-installed v63 direct-thread UX proof passed. EAS Build `1c7c497e-805f-4a30-9f67-ff34ed945645` / EAS Submit `7f4bd948-3554-42e7-926f-b3659bde5a5a` delivered versionCode `63` from commit `82364c4dccffa1c60e66a5ee10bbb4ad186fa920` through Google Play internal testing. Both attached phones reported `installerPackageName=com.android.vending`. The `user230455` thread opened on the installed app with fresh header identity, Voice Call / Video Call actions, `MESSAGE THREAD`, `Chat stays primary`, compact recent-call rows, and the `Write a message` composer. Google Play internal install is not enough without actual user flow proof; this item has actual thread-flow proof. Sideloaded APK proof is not accepted. No logout, uninstall, reinstall, or clear-data happened. No auth/RLS/chat/account-status permission weakening happened. No service-role chat proof was counted. No provider/live-money mutation happened. `liveMoneyEnabled` remains OFF.

Cross-app people/handle search proof: Partial for actual-user installed-app closure.

June 28, 2026 v60/v61 installed follow-up: `docs/release/GOOGLE_SIGNED_V60_DIRECT_CHAT_CALL_PROOF.md` proved Chi'lly Chat installed search can find `user230455` as `user230455` / `@user230455` on the Google Play-installed versionCode `60` build. The visible result opened the direct thread after live authenticated RPC ambiguity fixes. A later receiver readback migration also proved the real incoming call banner can open/join the readable direct thread, with both phones showing `2 in call`; v61 then proved the Android two-phone responsive video layout. Full call closure remains Partial because background push/ringing, decline/missed/background cleanup, user -> owner direction, and cross-platform responsive proof remain incomplete. Cross-app search/identity remains Partial because the full term matrix across `@user230455`, `User230455`, `user 230455`, display name, Explore People, Profile entry, direct-thread creation, Circle, Followers, Following, shared user cards, and role/platform surfaces has not been completed on a v62+ installed build.

## Scope

This lane fixes the shared source path for people and handle discovery across normal visible app surfaces. It covers Chi'lly Chat inbox people search/start-chat, Explore public People search and typeahead, Profile entry through search results, Chi'lly Circle people discovery, Followers/Following-style user rows that reuse the shared profile helper, Platform/owner/admin/moderator/creator identity surfaces where present, and the direct-message/internal invite recipient picker.

Owner standard: If Robert/testers cannot find the user by visible handle in the Play-internal installed app, this is not actual-user Closed. Source fixed is not installed-app proof.

Google Play internal install is not enough without actual user flow proof.

## Root Cause

People search was not using one shared normalization contract. The public search helper stripped a leading `@` and sent one raw query to `search_public_people`; Explore had its own local `getPublicSearchNeedle`; Chi'lly Chat thread filtering used raw lowercase `includes`; Chi'lly Circle and the invite sheet had separate local normalizers. As a result, a visible handle such as `chillywood92`, `@chillywood92`, `Chillywood92`, or `chillywood 92` could behave differently across Chat, Explore, Profile entry, and recipient pickers.

No RLS, auth, chat permission, profile visibility, account-status, staff permission, platform-owner, or First Owner permission weakening was used to fix this.

## Cross-surface stale identity metadata fix

Source status: fixed. Installed-app status: Partial after Play-installed v63 proof.

One user identity must render consistently across profile, chat, search, circle, followers, and following. Fresh remote profile must win over stale AsyncStorage. Settings/Profile/Chat must agree on the current handle. Circle/Followers/Following must not keep stale handle metadata as primary identity. Existing inbox rows must not show stale participant metadata as primary identity. Stale @user230456 is not Closed if it still appears as the primary inbox, circle, follower, following, or user-card identity.

Root cause: existing user-list and participant surfaces could let stale local options, denormalized member rows, or role/read-model identity labels win over the current remote `user_profiles` row. This is why Settings/Profile/Chat search could show fresh `@user230455` while an existing Chat inbox row still displayed stale `@user230456`.

June 28, 2026 v63 installed result: both physical phones updated through Google Play internal testing to versionCode `63` with `installerPackageName=com.android.vending`. Reached current surfaces now show fresh identity where expected: `R5CR120QCBF` Profile showed `user230455` / `@user230455`, `R3CXA0DS5JV` Chat inbox search/filter retained the `user230455` / `@user230455` thread, and the opened fresh direct-thread header showed `user230455` / `@user230455`. Circle was reachable but the target identity was not visible; Followers, Following, shared user-card, call/room identity, and platform/admin/moderator role surfaces were not closed in this rerun. Artifact: `/tmp/app-installed-stale-identity-closeout-proof-20260628-212601/`.

## Stale Proof Normal / @user230456 DB readback

June 29, 2026 sanitized DB readback classified the old `Proof Normal` / `@user230456` row. Play-installed v63 on `R3CXA0DS5JV` reproduced the row as a normal inbox row and as the direct-thread header after opening it. The stale-row artifact is `/tmp/app-stale-chat-identity-readback-20260629-010030/`.

Sanitized readback summary: the row points to a legitimate separate profile/thread. The old row's profile username is `user230456` and display name is `Proof Normal`. The expected current `user230455` profile is a different redacted user hash. The stale thread has two members, no duplicate thread for that pair, no missing readable profile row for the stale member, and no denormalized member/profile disagreement for the stale member. Root-cause classification: old/different user record that legitimately still exists.

Fix decision: no code, migration, RPC, or DB repair was applied. Do not hide or delete stale rows just to pass proof. Do not falsely merge separate users. Fresh remote profile must win over stale AsyncStorage and stale participant snapshots where the same user is involved, but this row is not the same user as `user230455`.

Existing direct-thread matches appear under Threads by design. Source commit `8938356` updates the People panel copy to `Already in your threads. Open the matching thread below.`, but source fixed is not installed-app proof; Google Play internal install is not enough without actual user flow proof. `installerPackageName` must be `com.android.vending`, and sideloaded APK proof is not accepted. No logout, uninstall, reinstall, or clear-data happened. No auth/RLS/chat/account-status permission weakening happened. No service-role chat/social proof was counted as actual-user proof. No provider/live-money mutation happened. `liveMoneyEnabled` remains OFF.

Source fixes made:

- `_lib/userData.ts` now makes fresh remote profile display name, username/handle, active avatar, and tagline win inside `buildUserChannelProfile()`.
- `_lib/userData.ts` now refreshes the signed-in user's `chat_thread_members`, `communication_room_memberships`, and `watch_party_room_memberships` display snapshots after a successful remote profile save.
- `_lib/chat.ts` now enriches existing inbox rows from current `user_profiles` and reloads the inbox when any readable thread member metadata changes.
- `_lib/communication.ts` now builds call/room identity from the full current profile instead of a username-only fallback.
- `components/chat/internal-invite-sheet.tsx` now prefers fresh search results over existing thread snapshots when merging user cards.
- `_lib/adminReadModels.ts`, `_lib/moderation.ts`, and `_lib/platformIdentity.ts` now prefer fresh profile display/handle for Platform owner, First Owner-visible, Admin, Moderator, Creator, and role-roster identity labels where the surface has a profile user id.

Platform/owner/admin/moderator/creator surfaces must use the same fresh profile identity source as Chat/Profile/Search/Circle/Followers. Role badges may show role/status, but they must not cause stale handle/name/avatar metadata to win. The app must not confuse role identity with profile identity. A user can have a platform role, but their visible handle must still refresh from the current remote profile. Platform-owner paths must not be used to bypass normal user identity/RLS/chat/social rules. First Owner permissions and ownership rules were not changed in this lane. Role surfaces not present or not reachable are Not inspected, not Closed.

Supabase RPC / migration changes: none. The fix uses the authenticated app client with existing RLS; no service-role chat/social proof was counted.

## Search Surfaces Audited

| Surface | Before | After | Status |
| --- | --- | --- | --- |
| Chi'lly Chat inbox people search/start-chat | Called public people search with one trimmed query; local thread filtering did raw lowercase matching. | Uses shared people-search normalization for public results and thread filtering. | Source fixed |
| Explore public people search | Used separate `getPublicSearchNeedle` and one public search query. | Uses shared candidates for People result fetch, typeahead ranking, and public text matching. | Source fixed |
| Profile navigation entry | Opens from Chat/Explore people result cards. | Continues to use public result `userId` only after visible search result selection; no raw private data is shown. | Source fixed |
| Creator/user discovery search | Explore People/Platform result flow now shares handle candidates. | Source fixed |
| Direct-message recipient picker | Used `searchChatPeople` and local lowercase matching. | Uses shared handle candidates and no-results copy. | Source fixed |
| Chi'lly Circle people discovery | Used local lowercase title-only suggestion filtering. | Uses shared handle/name matching against title and subtitle, preserving handle matches. | Source fixed |
| Followers list | Reads or builds user rows from `user_profiles` / shared profile helpers. | Fresh remote profile must win before installed proof can call this Closed. | Source fixed / installed proof pending |
| Following list | Reads or builds user rows from `user_profiles` / shared profile helpers. | Fresh remote profile must win before installed proof can call this Closed. | Source fixed / installed proof pending |
| Shared user cards / invite picker | Could merge existing thread snapshots over fresh search results. | Fresh search result identity now wins over stale existing thread snapshots. | Source fixed |
| Platform owner / Admin / Moderator / Creator role surfaces | Could display role/read-model identity labels separately from current profile identity. | Fresh profile identity now wins where profile fields are available; role/status remains a separate badge. | Source fixed / installed proof pending |

## Normalization Behavior

Handle search must work with and without @. People search must be consistent across Chat, Explore, and Profile entry.

Shared helper: `_lib/peopleSearchNormalization.ts`.

Inputs now produce safe candidates that lower-case, trim, strip a leading `@`, remove unsupported punctuation without stripping meaningful numbers, preserve display-name-like spacing, and produce compact/separator variants.

Expected examples:

| Input | Candidate behavior |
| --- | --- |
| `chillywood92` | Includes `chillywood92`, `chillywood 92`, `chillywood.92`, `chillywood_92`, `chillywood-92`. |
| `@chillywood92` | Same handle candidates as `chillywood92`. |
| `Chillywood92` | Lower-cases to the same handle candidates. |
| `chillywood 92` | Includes display form and compact `chillywood92`. |
| Display name search | Keeps display-name-ish candidate while also checking compact variants. |

No-results is not the same as search unavailable. Empty results now use: `No public profile found for that search. Try the full handle or display name.` Backend/read failures use a separate unavailable message.

## Code Files Changed

- `_lib/peopleSearchNormalization.ts`
- `_lib/publicPeopleSearch.ts`
- `_lib/chat.ts`
- `app/chat/index.tsx`
- `app/(tabs)/explore.tsx`
- `app/chilly-circle.tsx`
- `components/chat/internal-invite-sheet.tsx`
- `_lib/userData.ts`
- `_lib/communication.ts`
- `_lib/adminReadModels.ts`
- `_lib/moderation.ts`
- `_lib/platformIdentity.ts`
- `scripts/guard-public-user-search-policy.mjs`
- `scripts/proof-cross-app-people-handle-search-fix.mjs`
- `scripts/guard-cross-app-people-handle-search-policy.mjs`

## Proof-Account Searchability Result

Proof-account searchability remains actual-user Partial in this lane because the Play-internal installed app was not updated and rerun through Robert/tester visible search paths after this source fix.

The required actual-user check is:

1. Open the Play-internal installed app.
2. Search `chillywood92`, `@chillywood92`, `Chillywood92`, and `chillywood 92` in Chi'lly Chat and Explore People.
3. Tap the matching visible result.
4. Open the profile or Chi'lly Chat.
5. Create/open the direct thread.
6. Start Voice/Video Call from the normal visible path.

Service-role repair is not actual-user proof. If a proof/test account lacks a public/reachable `user_profiles` row, username/handle, display name, or profile visibility, that is a proof-account readiness blocker that must be repaired through an owner-approved proof-account path and then proved through the installed UI.

## Chat Search Result

Source result: Chat search now normalizes handle/name search through `_lib/peopleSearchNormalization.ts`, calls public people search with normalized candidates, filters existing threads with the same matching, and shows distinct no-results versus unavailable copy.

Installed-app result: Partial until Robert/testers verify the Play-internal app can find the intended user by visible handle and start Chat from that result.

## Explore People Search Result

Source result: Explore People result fetch, typeahead, and local public text matching now use shared people-search normalization. The People prompt explicitly says to try username, handle, or display name.

Installed-app result: Partial until the Play-internal app is updated and a tester can find the intended person by visible handle.

## Profile Entry Result

Source result: Profile entry remains reachable from Chat and Explore people result cards. This lane does not count a raw profile deep-link or pre-created thread as proof.

Installed-app result: Partial until tester-visible search result selection opens the expected profile or direct Chat path.

## Direct Thread Creation Result

Source result: Chi'lly Chat search suggestions and the direct-message recipient picker now use the same normalized candidates before `getOrCreateDirectThread` is invoked.

Installed-app result: Partial until the normal visible search result creates/opens the direct thread between the intended users.

## Cross-Lane Issues Found

The visible Chat Call actual-user proof cannot be considered Closed while users cannot find each other through normal visible handle/name search or while stale primary identity remains in existing inbox, Circle, Followers, Following, shared user-card, or platform/role surfaces. Source fixed is not installed-app proof.

## Remaining Blockers

1. Deliver this JS/TS source fix to the installed Play-internal runtime by the approved Google Play internal path.
2. Rerun actual-user installed-app search in Chi'lly Chat, Explore People, Profile entry, and direct thread creation.
3. Rerun Settings/Profile/Chat/Search/Thread/Inbox/Circle/Followers/Following/shared user-card/platform-role handle comparison for `@user230455` versus stale `@user230456`.
4. Confirm the two intended tester accounts have public/reachable profile rows and handles without using service-role repair as proof.
5. Rerun the actual-user Chat Call initiation/ringing path only after visible people search and existing user-list identity agree.

## Safety Confirmation

No auth/RLS/chat/profile/account-status permission weakening happened. No auth/RLS/chat/account-status permission weakening happened. No private user data was exposed. No private email, phone, raw auth ID, provider ID, token, signed URL, raw IP, password, or service-role key was committed or artifacted. No service-role setup was counted as actual-user proof. No service-role chat/social proof was counted. No provider mutation happened. No live-money, payout, cashout, Stripe production, payable balance, purchase, refund, Play production submission, sideload, uninstall, reinstall, logout, or clear-data action happened. Current First Owner was not touched. No provider/live-money mutation happened. liveMoneyEnabled remains OFF. Sideloaded APK proof is not accepted. installerPackageName must be com.android.vending.
