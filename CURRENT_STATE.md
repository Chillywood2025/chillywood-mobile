# CURRENT STATE

## Current Checkpoint
Stage 4 remains completed/proved on the current build. Current JS via Expo Go / Metro proved Home, Player, Profile, Chi'lly Chat, Live Waiting Room, Party Waiting Room, Live Room, Party Room, and Live Stage behavior as described below.

The latest proof passes fixed three real current-build issues: `app/player/[id].tsx` now resolves bundled assets through `expo-asset` before passing them to `expo-av`, `app/watch-party/live-stage/[partyId].tsx` now removes any existing room channel with the same topic before the stage subscribes, and `app/_layout.tsx` now identifies the signed-in Supabase user to PostHog before reloading feature flags so the runtime requests flag values for the real current user. Typecheck passed afterward. PostHog env wiring is present locally and the current Expo runtime proof below now confirms both remote default-off stability and remote on-state delivery for the gated chat flags.

## Current-Build Proved Items
- Home: `Continue Watching` proved at the top by temporarily seeding `watch_history` for `Chicago Streets` and then clearing it; `Browse` / `Top Rated` cards show title, info line, and `Added` date; the lower Home area is reserved for `Chi'llywood Originals`
- Player: the bundled Android asset-path playback bug was fixed in `app/player/[id].tsx` by resolving the bundled asset via `expo-asset` `localUri` before `expo-av` `Video`, and the current JS player route showed a real video frame while retaining the `Watch-Party Live` CTA
- Own profile: owner/control page proved with `Manage Channel`, `Chi'lly Chat`, and the owner/channel toggle
- Other-user profile: basic profile plus channel-home behavior proved through the `Proof User` route
- Chi'lly Chat: inbox, quick actions (`Open Thread`, `Open Profile`, `Voice Call`, `Video Call`), direct thread, composer, voice/video buttons, and profile-to-thread handoff proved
- Live Waiting Room and Party Waiting Room: both proved with correct labels when the deep-link query params were quoted correctly for `adb shell`
- Live Room: proved with `Live Room` + `Go Live` and no watch-party-only CTA visible
- Party Room: proved with `Party Room` + tailored `Watch-Party Live` copy + `Watch-Party Live` CTA, not `Go Live`
- Live Stage: visible current-build proof now covers `Live-First`, `Live Watch-Party`, `PROTECTED LIVE SESSION`, `LIVE FIRST FOCUS`, and `TAILORED LIVE WATCH-PARTY`; analytics logs also showed `/watch-party/live-stage/QNBQLU` rendering in `mode=hybrid`, so both in-screen live modes are proved on the stage owner

## PostHog And Flags
- The current Expo session on `8084` loaded `.env.local` and exported `EXPO_PUBLIC_POSTHOG_API_KEY` plus `EXPO_PUBLIC_POSTHOG_HOST`; the served Android `node_modules/expo-router/entry.bundle` also contained those injected values and the two active chat flag keys
- Default-off stability is now proved on the PostHog-enabled runtime for `chilly_chat_expanded_v1` and `ai_chat_suggestions_v1`: `/chat` still opened on the current build, `/chat/[threadId]` still opened on the current build, and the thread surface kept `Proof User`, `Direct thread`, voice/video actions, `Attach`, `React`, `Write a message`, and `Send` while `AI SMART REPLIES` and `PostHog gated` remained absent
- `app/_layout.tsx` now mounts a signed-in PostHog bridge inside `SessionProvider`, identifies the authenticated Supabase user, and immediately reloads feature flags so current-runtime flag evaluation is no longer limited to the anonymous client
- Remote on-state delivery was re-run on April 5, 2026 after rollout targeting was updated in PostHog. A fresh live `POST https://us.i.posthog.com/flags/?v=2` check for distinct id `4b5e7761-5bf1-4e18-9eb7-d6037a0eb32f` returned both `chilly_chat_expanded_v1` and `ai_chat_suggestions_v1` as `enabled: true` with reason `condition_match`
- Current-runtime on-state delivery is now proved: after a fresh Expo Go reload, Home reopened cleanly, own profile reopened cleanly, and `/chat/[threadId]` reopened cleanly with the gated card visible in-app
- The proved on-state thread markers are `AI SMART REPLIES`, `PostHog gated`, and the visible smart-reply chips `Hey Proof, I'm here`, `Let's do a voice call`, and `Send me the details`
- Remote PostHog on-state delivery for `chilly_chat_expanded_v1` and `ai_chat_suggestions_v1` is therefore now closed on the current runtime
- The active chat-thread flag consumers are only `chilly_chat_expanded_v1` and `ai_chat_suggestions_v1`
- Waiting-room and live flags are probe-only in `app/_layout.tsx` and are not wired to active UI owners

## Repo And Harness Reconciliation
- `SESSION_START_PROTOCOL.md` now exists and locks the control-file-first preflight plus checkpoint-bookkeeping order
- `ROADMAP.md`, `CURRENT_STATE.md`, and `NEXT_TASK.md` now agree on the preserved checkpoint truth: Stage 4 closed, PostHog default-off closed, and PostHog on-state closed
- `maestro/` now records the active baseline smoke lane explicitly, uses shared `CHILLYWOOD_APP_ID` / `EXPO_URL` contracts instead of the stale `8081` hardcode, and replaces the missing auth-subflow / dead-id flow 09 path with an optional authenticated self-profile owner-rails flow
- No app logic changed in this reconciliation pass; the unrelated Supabase/media/screenshot worktree noise remains outside this checkpoint
- Expo Go surfaced intermittent Android ANR dialogs plus `Unable to activate keep awake` during the PostHog-enabled proof sessions, but the underlying Home/chat/profile routes still rendered and both default-off plus on-state proof completed
- with reconciliation now closed, the next active lane is EAS Update readiness / rollout work

## What Was Fixed In This Pass
- `app/player/[id].tsx` now resolves bundled assets through `expo-asset` `localUri` before `expo-av` `Video`, which fixed the real Android preview/current-JS playback bug
- `app/watch-party/live-stage/[partyId].tsx` now removes any existing room channel with the same topic before the stage subscribes, which fixed the `cannot add presence callbacks after joining a channel` runtime error
- `app/_layout.tsx` now identifies the signed-in Supabase user to PostHog and reloads feature flags inside the current provider tree, which fixed the missing identified-user flag-request path during the remote on-state proof lane
- `SESSION_START_PROTOCOL.md`, `ROADMAP.md`, and the active `maestro/` docs/flows were reconciled so repo truth, checkpoint truth, and proof-harness truth now describe the same closed Stage 4 + PostHog baseline without changing app behavior

## What Is Proved In Repo
- Party Room is canonical on `/watch-party/[partyId]`
- Live Room is canonical on `/watch-party/live-stage/[partyId]`
- Party Waiting Room routes into Party Room, while Live Waiting Room routes into Live Room
- Party Room must not hand off to Live Stage
- `/communication` and `/communication/[roomId]` remain compatibility-only room redirects
- Home `Top Rated` and `Browse` title cards route through `app/(tabs)/index.tsx` into `app/title/[id].tsx`
- Title Detail resolves by exact `id`, then exact `title`, then local fallback, so valid titles such as `Chicago Streets` do not fall through from the Home rails without exhausting real resolution paths
- `Live Watch-Party`, `Watch-Party Live`, `Live First`, and `Chi'lly Chat` are locked in the repo control files alongside the corrected Party / Live route split
- runtime/admin config cannot rename locked product labels such as `watchPartyLabel`, `liveRoomTitle`, or `partyRoomTitle`
- standalone Chi'lly Chat exists on `/chat` and `/chat/[threadId]`
- self-profile entry opens the canonical `/profile/[userId]` channel/profile surface, while the in-profile Chi'lly Chat action opens `/chat` for the authenticated user
- another profile resolves or creates a direct Chi'lly Chat thread and opens `/chat/[threadId]`
- room-native communication copy in Party Room and Live Room uses Chi'lly Chat-native wording instead of `In-Room Call`
- repo control files explicitly lock Chi'lly Chat as a messenger-first system, profiles as social identity hubs, and like/share/download/cast as reusable rights-aware content primitives
- repo control files explicitly lock Chi'lly Chat as Chi'llywood's built-in messenger layer, with `/chat` inbox, `/chat/[threadId]` direct threads, the `chat_threads` / `chat_thread_members` / `chat_messages` MVP data model, and shared communication-room primitives for thread calls
- repo control files explicitly lock profiles as native social identity hubs that grow toward each user's mini streaming platform / creator channel
