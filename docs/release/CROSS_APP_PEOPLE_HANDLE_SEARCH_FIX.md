Cross-app people/handle search proof: Closed / Partial / Blocked.

Current verdict: Partial.

Cross-app people/handle search proof: Partial for actual-user installed-app closure.

June 28, 2026 v60 installed follow-up: `docs/release/GOOGLE_SIGNED_V60_DIRECT_CHAT_CALL_PROOF.md` proved Chi'lly Chat installed search can find `user230455` as `user230455` / `@user230455` on the Google Play-installed versionCode `60` build. The visible result opened the direct thread after live authenticated RPC ambiguity fixes. A later receiver readback migration also proved the real incoming call banner can open/join the readable direct thread, with both phones showing `2 in call`; full call closure remains Partial because installed v60 recorded a false missed-call event after end and the cleanup source fix is not installed yet. Cross-app search remains Partial because the full term matrix across `@user230455`, `User230455`, `user 230455`, display name, Explore People, Profile entry, and direct-thread creation from every visible surface was not completed, and an existing Chat inbox row still displayed stale `@user230456` before the fresh search/open path.

## Scope

This lane fixes the shared source path for people and handle discovery across normal visible app surfaces. It covers Chi'lly Chat inbox people search/start-chat, Explore public People search and typeahead, Profile entry through search results, Chi'lly Circle people discovery, and the direct-message/internal invite recipient picker.

Owner standard: If Robert/testers cannot find the user by visible handle in the Play-internal installed app, this is not actual-user Closed. Source fixed is not installed-app proof.

## Root Cause

People search was not using one shared normalization contract. The public search helper stripped a leading `@` and sent one raw query to `search_public_people`; Explore had its own local `getPublicSearchNeedle`; Chi'lly Chat thread filtering used raw lowercase `includes`; Chi'lly Circle and the invite sheet had separate local normalizers. As a result, a visible handle such as `chillywood92`, `@chillywood92`, `Chillywood92`, or `chillywood 92` could behave differently across Chat, Explore, Profile entry, and recipient pickers.

No RLS, auth, chat permission, profile visibility, account-status, or staff permission weakening was used to fix this.

## Search Surfaces Audited

| Surface | Before | After | Status |
| --- | --- | --- | --- |
| Chi'lly Chat inbox people search/start-chat | Called public people search with one trimmed query; local thread filtering did raw lowercase matching. | Uses shared people-search normalization for public results and thread filtering. | Source fixed |
| Explore public people search | Used separate `getPublicSearchNeedle` and one public search query. | Uses shared candidates for People result fetch, typeahead ranking, and public text matching. | Source fixed |
| Profile navigation entry | Opens from Chat/Explore people result cards. | Continues to use public result `userId` only after visible search result selection; no raw private data is shown. | Source fixed |
| Creator/user discovery search | Explore People/Platform result flow now shares handle candidates. | Source fixed |
| Direct-message recipient picker | Used `searchChatPeople` and local lowercase matching. | Uses shared handle candidates and no-results copy. | Source fixed |
| Chi'lly Circle people discovery | Used local lowercase title-only suggestion filtering. | Uses shared handle/name matching against title and subtitle, preserving handle matches. | Source fixed |
| Admin/moderator/support user search | Not changed in this lane; admin search has separate privacy/governance guards and should not be mixed with public people search. | Human review if the same user-facing handle discovery issue is reported there. | Human review |

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

The visible Chat Call actual-user proof cannot be considered Closed while users cannot find each other through normal visible handle/name search. No additional small safe UI issue outside this search path was changed in this lane.

## Remaining Blockers

1. Deliver this JS/TS source fix to the installed Play-internal runtime by the approved delivery path.
2. Rerun actual-user installed-app search in Chi'lly Chat, Explore People, Profile entry, and direct thread creation.
3. Confirm the two intended tester accounts have public/reachable profile rows and handles without using service-role repair as proof.
4. Rerun the actual-user Chat Call initiation/ringing path only after visible people search finds the receiver.

## Safety Confirmation

No auth/RLS/chat/profile/account-status permission weakening happened. No private user data was exposed. No private email, phone, raw auth ID, provider ID, token, signed URL, raw IP, password, or service-role key was committed or artifacted. No service-role setup was counted as actual-user proof. No provider mutation happened. No live-money, payout, cashout, Stripe production, payable balance, purchase, refund, Play production submission, sideload, uninstall, reinstall, or clear-data action happened. Current First Owner was not touched.
