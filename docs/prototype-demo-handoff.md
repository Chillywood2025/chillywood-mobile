# Chi'llywood Prototype Demo Handoff

## Prototype Completion Summary
- Core prototype paths now connect cleanly across Home live entry, waiting-room entry, room entry, player entry, title detail, and self profile/channel.
- Public naming is stable across the demo path: `Live Watch-Party`, `Live Waiting Room`, `Party Waiting Room`, `Live Room`, and `Party Room`.
- Room-code carryover, title context, profile entry, and Party-vs-Live flow splits are now consistent enough for a coherent single-user demo pass.
- The current build is demo-ready because the main surfaces read cleanly, avoid obvious internal/debug-looking copy, and preserve flow context from screen to screen.
- Latest 2-device validation result: no blocking issues, no major issues, and only two polish fixes were needed.
- Completed polish fixes from validation: removed the brief room participant `Guest` flash for the current host identity and tightened waiting-room summary card spacing.

## Known Unverified Items
- True 2-device / multi-user behavior is still not fully proven: join flow, presence updates, sync timing, and live-stage behavior with more than one real participant.
- Real participant behavior under shared load is still unverified: invite/code entry from another device, reconnect behavior, and cross-device room continuity.
- Full tactile acceptance beyond the current single-user pass is still unverified on real hardware: bottom-sheet dismissal, CTA hit areas, and smaller-screen overlap behavior.
- Remaining coming-soon actions are now honest, but they still require product decisions before they should become real systems.
- Until real login/account switching is available, use `docs/same-account-2-session-smoke-test.md` only as a limited same-account smoke pass, not as true multi-user proof.

## Demo Flow Checklist
- Home -> Live Watch-Party -> Live Waiting Room -> Live Room -> Go Live
  Confirm label correctness, room-code readiness, room entry, and Live Stage handoff.
- Explore -> Title Detail -> Player
  Confirm Explore opens titles cleanly, Title Detail resolves, and Player loads without context loss.
- Player -> Watch-Party Live -> Party Waiting Room -> Party Room
  Confirm title context carries through, room code stays consistent, and Party Room stays clean.
- Home avatar -> self profile/channel
  Confirm self profile opens, does not show self-follow behavior, and channel actions/copy read correctly.

## Next Build Priorities
- Run 2-device / multi-user verification before adding more surface polish.
- Stabilize real participant flows: join, presence, sync, reconnect, and shared-session truth.
- Decide MVP scope before converting more placeholders into working systems.
- Convert only the highest-value placeholders into real systems: access, follow/subscription, and participant moderation only where MVP truly needs them.
- Use demo feedback to cut scope, not expand it.

## Architecture Checkpoint
- Shared room behavior now lives behind the shared room helper layer: participant ordering, current-user fallback identity, host-control gating, waiting-room participant summary entries, selected-participant detail resolution, and locked public room labels/source constants.
- Room and Live Stage remain local wrappers for the behaviors that are actually different by mode: Room keeps sync/invite/playback surfaces, while Live Stage keeps stage canvas, comments, reactions, and lower-dock composition.
- Waiting-room create/join orchestration still lives locally in `app/watch-party/index.tsx`, but it now reads the locked naming/source primitives from the shared room layer instead of repeating them inline.

## Communication Layer Checkpoint
- The first in-app communication foundation now lives inside Chi'llywood with two dedicated routes: `app/communication/index.tsx` for local preview and room entry, and `app/communication/[roomId].tsx` for the active audio/video room.
- Communication reuses the current Chi'llywood identity path through `getSafePartyUserId()`, `readUserProfile()`, and channel-profile normalization. No second account or duplicate identity model was introduced.
- A lightweight `communication_rooms` room model now exists for room creation and join-by-code, while live membership and media signaling run through Supabase Realtime presence and broadcast events on `comm-room-${roomId}`.
- Current Step 4 coverage: local preview, create room, join by code, leave, camera on/off, mic mute/unmute, permission prompts, 1:1 support, and small-group mesh support up to four active participants.
- Current Step 5 coverage: watch-party room and live-stage surfaces can now open or join a linked communication room by party id, active linked call rooms are reused instead of duplicated, and leaving a linked call returns you to the originating watch-party surface.
- Still later, not current Step 4 scope: embedding directly into watch parties/live rooms, moderation, screen sharing, recording, large-room scaling, and auth-expanded multi-user role systems.
- Still later, not current Step 5 scope: richer in-room call controls, auto-preview before linked-room join, moderation parity between watch-party and communication rooms, screen sharing, recording, and large-room scaling.

## Step 6 Backend-Hardening Checkpoint
- Room-wide truth is now split cleanly from per-user truth: `watch_party_rooms` and `communication_rooms` remain the canonical room records, while `watch_party_room_memberships` and `communication_room_memberships` now hold durable participant state, permissions, media flags, and reconnect timestamps.
- Presence is no longer treated as authoritative membership. Realtime presence and broadcast still power low-latency UI and WebRTC signaling, but room, role, mute, speaker/listener, lock, reactions-muted, and reconnect grace all now rehydrate from persisted room/member snapshots first.
- Current watch-party truth source: `getPartyRoomSnapshot()` in `_lib/watchParty.ts` returns the room row plus membership rows, and room/playback/moderation updates now write through the backend helpers instead of broadcast-only local state.
- Current communication truth source: `getCommunicationRoomSnapshot()` in `_lib/communication.ts` returns the room row plus communication membership rows, and the in-room session hook now refreshes membership truth before and during presence/WebRTC activity.
- Current role and permission truth source: room host identity plus membership rows, evaluated through `_lib/roomRules.ts`. Entitlement hooks now feed the access decision layer, but monetization flows themselves are still not activated or expanded.
- Current reconnect behavior: both watch-party and communication sessions heartbeat membership rows every 10 seconds, treat active/reconnecting rows inside a 25-second grace window as still present, and rebuild visible participant state from the snapshot before relying on fresh presence.
- Current moderation foundation: host lock state, reactions-muted state, mute state, speaker/listener state, and remove state now persist through backend room/member writes instead of existing only in local component maps.
- Current content/capture rule foundation: room rows now carry `content_access_rule` and `capture_policy`, and protected-session disclosure copy now reads from those policy hooks while still presenting capture protection as best-effort.
- Known remaining backend risk: presence and mesh signaling are still client-managed, so short network partitions can still cause temporary drift before snapshot refresh settles the room again. Large-room scaling, server-side moderation workflows, and stronger anti-abuse controls are still future work.

## Step 7 Configurability Checkpoint
- Global no-code presentation/config truth now lives in the singleton `app_configurations` row `global`, read through `_lib/appConfig.ts` and merged over `DEFAULT_APP_CONFIG` so missing or partial config always falls back to current-safe defaults.
- Creator-owned settings remain intentionally local in Step 7: self-profile now opens `app/channel-settings.tsx`, which persists display/tagline/channel-role and personal new-room defaults through `USER_PROFILE_KEY` / `readUserProfile()` / `saveUserProfile()`.
- Current global no-code surfaces: theme preset and background mode, homepage hero strategy, homepage rail order/visibility, browse label/query, top-picks source, bounded branding copy, feature toggles for watch-party/communication/favorites/continue-watching/creator-settings, and default room policy seeds for newly created watch-party and communication rooms.
- Current content truth is still the `titles` table, but title flags now drive more of the homepage curation path: hero-flag, featured, trending, and top-row metadata can all be used by the new global home-config selector layer without changing code.
- Current room truth remains the Step 6 persisted room/member model after creation. Step 7 config only seeds defaults into newly created rooms; once a room exists, its own persisted room row stays authoritative.
- Current branding/truth consumption: Home, tab bar shell, admin header copy, waiting-room labels, watch-party watch label, and communication entry surfaces now resolve from the merged app config instead of hardcoded strings only.
- Current creator/host setting surface: `Manage Channel` on self-profile is now a lightweight local settings form, not a backend-synced creator system. This keeps Step 7 aligned with the existing architecture and avoids prematurely expanding creator backend scope.
- Still intentionally code-driven after Step 7: arbitrary custom themes, freeform page-builder layouts, deep player/title/watch-party composition, cross-device creator-settings sync, admin RBAC, audit trails, rollout targeting, and the underlying Step 6 permission semantics.

## Step 8 Monetization Checkpoint
- Monetization truth now has explicit backend anchors instead of prototype-only local checks: `user_subscriptions` holds free vs premium plan state, `watch_party_pass_unlocks` holds Party Pass room unlocks, `creator_permissions` holds creator monetization grants, and `titles` now carry `content_access_rule`, `ads_enabled`, `sponsor_placement`, and `sponsor_label`.
- `_lib/monetization.ts` is now the shared foundation for entitlement and creator-control decisions. It preserves the existing local plan fallback, but reads/writes the backend tables when available, evaluates title access, resolves room/title monetization access, and suppresses sponsor/ad hooks for premium users and premium content.
- Step 6 room rules remain authoritative for room truth. Step 8 plugs into that layer by routing `party_pass_required` and `premium_required` through the shared entitlement helpers in `_lib/roomRules.ts`, so room gating and content gating now share one access-decision path instead of diverging product logic.
- Current creator control truth is `creator_permissions`, edited from the admin surface and consumed in both admin title editing and creator-facing room-default settings. Creators without the right grant now fall back to `open` room/content settings or `none` sponsor placement instead of persisting paid-only options.
- Current working entitlement flows: premium title playback gating on title detail/player, Party Pass or premium room-entry retry flows from watch-party and communication entry points, linked room gating reuse via the same access key, and on-demand unlock UX through a single shared access sheet instead of ambient paywall surfaces.
- Current sponsor/ad hooks are intentionally subtle and foundation-level only: free/open standalone title detail and player surfaces can show existing placeholder banner and mid-roll markers when both title metadata and runtime config allow them. Room, live, and communication surfaces stay clear of ad clutter.
- Still foundation-only after Step 8: there is no payment processor, checkout, subscriber CRM, payout system, ad network, campaign delivery, analytics/segmentation, or public-launch billing stack. The business logic paths now exist, but the commercial operations layer is still future work.

## Step 9 Production-Readiness Checkpoint
- Closed beta now uses a signed-in posture for sensitive flows. Watch-party create/join, communication create/join, monetization writes, channel settings, and admin all require an authenticated session, while browsing surfaces can still render without auth.
- Supabase runtime truth now comes from Expo runtime config instead of hardcoded client values. `app.config.ts` injects `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_BETA_OPERATOR_ALLOWLIST`, and `EXPO_PUBLIC_BETA_ENVIRONMENT`, `_lib/runtimeConfig.ts` validates them, and `_lib/supabase.ts` is now the single client shared across the app.
- Step 9 backend setup is partially verified in the current environment: `202603270007_create_safety_reports.sql` has been applied successfully, the `safety_reports` table/policies now exist in Supabase, and the local runtime-config break was fixed by restoring the required Expo public Supabase env values.
- Root app survivability is now stronger: `app/_layout.tsx` wraps the router in a root error boundary, runtime-config guard, session provider, route analytics bridge, and the existing dev debug overlay. Missing runtime config now fails loudly in development and degrades to a safe unavailable screen in beta.
- Current auth/session truth source is `_lib/session.tsx`, which bootstraps the Supabase session once, feeds debug/auth state, and identifies or clears the analytics user identity on auth changes. `/admin` is additionally guarded by the runtime-config beta operator allowlist instead of being treated as an ordinary route.
- Current analytics status: `_lib/analytics.ts` defines the beta event contract (`identifyUser`, `clearUser`, `trackScreen`, `trackEvent`) with a no-op sink by default. High-value auth, room, communication reconnect, playback, monetization unlock, moderation, and fatal-boundary events now instrument through that shared layer without choosing a vendor yet.
- Current moderation/reporting baseline: Step 6 host moderation remains the in-room authority, and the persisted safety-report backend path now exists for titles, rooms/sessions, and participants through the new `safety_reports` table and `_lib/moderation.ts`.
- Current verification block: signed-in app-side safety-report verification is not fully complete yet because the active test build is temporarily bypassing login for easier testing and goes straight into the app. Do not mark title, participant, or room/session report submission as fully verified until sign-in is re-enabled and the flow is re-run with a real beta account.
- Current reconnect handling is more beta-safe: watch-party and communication sessions now mark reconnecting on background/channel interruption, refresh persisted snapshots on foreground return, and avoid booting protected room side effects when the user is only seeing a sign-in gate.
- Current privacy/capture trust posture: protected-session copy now explicitly frames capture rules as best-effort policy rather than guaranteed DRM, and the self-profile copy no longer claims entitlements are “not active yet” when beta entitlement hooks are already present.
- Current release-readiness foundation: `README.md` is now a beta operations guide, `docs/beta-readiness-checklist.md` records the pre-build and smoke-test checklist, and the manual preview workflow now validates runtime config before lint, typecheck, and EAS preview build.
- Still intentionally deferred after Step 9: full admin RBAC, external analytics vendor wiring, account-level block lists, push notifications, large-room/server-side RTC arbitration, and public-launch automation remain out of scope for this closed-beta readiness pass.

## Step 10 Closed-Beta Rollout Checkpoint
- Invite-only tester truth now lives in `beta_access_memberships`, activated through the new `activate_beta_membership()` path and exposed in-app through `_lib/betaProgram.ts`. Sensitive beta surfaces now require active beta membership, not just raw sign-in.
- Closed-beta product feedback truth now lives in `beta_feedback_items`. This is separate from `safety_reports`: safety reports remain moderation/safety intake, while beta feedback is the learning-and-fix queue for bugs, onboarding issues, and product notes.
- Current onboarding/support entry points: invited testers now get a one-time beta welcome prompt, `/beta-support` is the in-app hub for what to test and how to submit feedback, the self-profile surface now exposes `Beta Support`, and the root error boundary can open a crash-oriented beta feedback sheet when an invited tester is signed in.
- Current beta issue categorization system: feedback items are bucketed by `feedback_type`, `category`, `severity`, `status`, and `fix_window`, with manual operator review handled through the new `docs/closed-beta-rollout-support.md` playbook instead of a full admin ticket console.
- Current must-watch beta flows remain sign-in/invite activation, Home -> Title -> Player, watch-party create/join -> room -> live stage, communication create/join, premium / Party Pass retry, reconnect, signed-in safety reports, and beta feedback submission.
- Current verification blockers remain explicit: if temporary no-login test mode is still active, invite-only gating is not proven yet and signed-in title/participant/room safety-report verification is still incomplete. Do not mark closed-beta rollout support as fully verified until auth is restored and re-tested with real invited and non-invited accounts.
- Still intentionally deferred after Step 10: public invite codes, a public-facing waitlist, an admin ticket console, external support tooling, automated cohort rollout, and any broader public-launch system stay out of scope.

## Step 11 Public-V1 Release Prep Checkpoint
- Public v1 now has an explicit runtime posture: `public-v1` is a first-class environment value, while `closed-beta` remains supported only when chosen intentionally in runtime config.
- Auth restoration is a hard launch blocker for public v1. The repo still uses `_lib/session.tsx` as the single auth truth source, and the sensitive routes continue to gate on signed-in state, but the actual launch build must still be re-verified to confirm real sign-in is active and no temporary no-login behavior remains.
- Public support now reuses the existing Step 10 feedback backend instead of inventing a second system. `/support` is the public route, `/beta-support` remains as a compatibility alias, and feedback still lands in `beta_feedback_items`.
- `beta_feedback_items` is still the feedback truth source, but public-v1 now needs the Step 11 feedback-policy migration so signed-in public users can write support items without active beta membership.
- Public-facing copy no longer needs to present Chi'llywood as a beta-only product by default. Auth, support, safety reports, room gates, and capture disclosure should read as public-facing while still preserving invite-only messaging in `closed-beta`.
- Profile/channel surfaces now need to avoid fake consumer actions for launch. Public v1 should keep real identity, room-linked navigation, self-only channel management, and support entry while trimming placeholder follow/subscriber dead ends.
- Android-first packaging is now the release target. `app.json`, `eas.json`, the new public-v1 release checklist, and the new Android public-build workflow are the packaging foundation, while iOS public packaging stays explicitly post-v1.
- Public-v1 launch gate remains strict: signed-in safety-report verification, distinct-account two-device watch-party and communication verification, zero open `blocking` items, and zero `before_public` items must all be completed before calling v1 ready.

Assumption: the current baseline is accepted as prototype-complete for a single-user demo pass, and the next phase is validation and MVP shaping, not new feature development.
