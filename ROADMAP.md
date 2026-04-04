# ROADMAP

## Phase Order
Chi'llywood should advance in structure-safe phases that keep product truth stable while deeper platform systems are added.

## Phase 1: Foundation and Stability
- auth and runtime config correctness
- build reliability
- stable title discovery and playback
- critical route stability

## Phase 2: Canonical Room Architecture
- Party Room locked on `/watch-party/[partyId]`
- Live Room locked on `/watch-party/live-stage/[partyId]`
- Party Room does not hand off to Live Stage; the separate Live flow enters Live Room from Live Waiting Room
- `/communication` reduced to compatibility-only behavior
- Player kept playback-only
- room communication rooted inside canonical room surfaces

## Phase 3: Naming and Product-Truth Lock-In
- lock distinct meanings for `Live First`, `Live Watch-Party`, `Watch-Party Live`, and `Chi'lly Chat` while keeping Party Room and Live Room structurally separate
- hard-lock runtime config so core product labels do not drift
- keep Home title cards resolving to real title/player destinations

## Phase 4: Standalone And Messenger-First Chi'lly Chat MVP
- establish Chi'lly Chat as Chi'llywood's built-in messenger layer, not just an in-room side panel and not a separate second app
- standalone inbox on `/chat`
- direct threads on `/chat/[threadId]`
- direct-thread MVP contract with header, messages, composer, timestamps, optimistic sending, realtime updates, and mark-read on open/focus
- `chat_threads`, `chat_thread_members`, and `chat_messages` as the MVP data model
- persistent direct messages
- realtime message updates
- thread-based voice and video call entry using existing communication-room primitives
- inbox-first and thread-first messenger UX upgrades on `/chat`
- room-linked conversations inheriting from the same Chi'lly Chat system without replacing canonical room routes
- room-linked conversations and direct conversations sharing message primitives and visual language, while embedded room surfaces stay distinct from the target standalone messenger reference
- direct-messaging-first MVP that expands later into broader social/community communication
- profile/channel surfaces as native social identity hubs instead of simple account pages
- the authenticated user's own profile opening their own channel/profile surface on `/profile/[userId]`
- viewing another user's profile supporting direct Chi'lly Chat thread creation/opening
- profile-first social identity rails for likes, shares/reposts, and public activity
- photos/videos, saved movies/videos, creator/channel identity, and community interaction as approved profile/channel expansion
- reusable rights-aware content-action primitives for like/share/download/cast
- standalone-player cast / TV handoff direction for allowed content

### Current Phase 4 / Stage 4 Checkpoint
- Phase 4 / Stage 4 is completed/proved on the current build
- Flow 08 is completed/proved on the current build because current terminal/workflow output proved it on the current build
- cloud Flow 08 is now completed/proved on the latest cloud rerun
- the corrected Party / Live split is completed/proved on the current build
- Flow 09 is completed/proved on the current build
- the final cloud rerun `019d4809-ba44-75d1-a3bb-39bb8c16663c` finished green on commit `14b45f5bd0e00ce73a8e5c9a6b3bbbb347c14e91`
- cloud artifact inspection plus a bounded local 320x640-style replay proved the earlier Flow 09 cloud issue was a patched below-the-fold shares-entry proof-path problem, not a product regression
- there is no remaining automated blocker in Stage 4
- no final human verification pass is planned for this checkpoint
- Phase 5 can begin from the now-green Stage 4 baseline

## Phase 5: Multi-User Validation
- cross-account/device proof for room-native communication
- cross-account/device proof for Chi'lly Chat messaging and thread-based calls
- reconnect, background/foreground, and access-gate validation

## Phase 6: Creator, Moderation, and Platform Depth
- creator tooling
- admin and CMS systems
- moderation and safety operations
- analytics and lifecycle systems

## Phase 7: Monetization, Notifications, and Launch Hardening
- entitlements and premium enforcement
- notification surfacing where safe
- performance, edge-case cleanup, and launch readiness
