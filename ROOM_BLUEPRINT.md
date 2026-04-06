# ROOM BLUEPRINT

## Purpose
`ROOM_BLUEPRINT.md` is Chi'llywood's durable master room-feature and AI doctrine.

It does not replace `MASTER_VISION.md` or `ARCHITECTURE_RULES.md`. It makes them usable for future implementation by answering a more practical question: what belongs in each major room, what does not, and how should those rooms mature without drifting into each other.

This blueprint exists to stop:
- feature dumping into the nearest editable screen
- route drift between Live, Party, Player, Profile, and Chi'lly Chat
- vague "AI everywhere" thinking that adds clutter instead of product value
- accidental approval of later-phase ideas as if they were current-scope implementation work

## Locked Room Questions
Every major room or room-adjacent surface must answer:
1. Why am I here?
2. What can I do here that I cannot do elsewhere?
3. Who can see or control what here?
4. What AI help belongs here without getting in the way?

## Product-Wide Analysis Lenses
Before a feature or AI behavior belongs in a room, it should be tested against these lenses:
1. Does it fit the room's purpose?
2. Does it fit Chi'llywood's premium social-streaming direction?
3. Does it belong in MVP, near-term expansion, or later expansion?
4. Does it improve clarity, identity, moderation, monetization, engagement, or usability?
5. Would it create confusion, clutter, or overlap with another room?
6. Does it require permissions, safety, auditability, or role-aware control?
7. Does it truly need AI, or is normal product logic enough?

## Cross-Room Principles
- Keep locked naming and route doctrine intact. `Live Watch-Party`, `Watch-Party Live`, `Live First`, `Party Room`, `Live Room`, and `Chi'lly Chat` are not interchangeable.
- Preserve the Party / Live split. Party flow is `Player -> Watch-Party Live -> Party Waiting Room -> Party Room -> shared party player`, and Party Room must not hand off to Live Stage.
- Treat Live Room as the canonical live-session shell on `/watch-party/live-stage/[partyId]`, and treat Live Stage as the in-room presentation state inside that same route, not as a separate product or route.
- Treat Watch-Party Live / shared party player as a layer inside the Party flow, not a new top-level destination.
- Treat Standalone Player as solo-first and playback-first.
- Treat Profile / Channel and Chi'lly Chat as cross-room identity and communication layers, not replacement room systems.
- Keep Rachi on the canonical profile and Chi'lly Chat paths as the official platform-owned concierge and moderation-ready presence.

## Feature Maturity Model
- `Core features now`: practical MVP and near-term product behaviors that fit the current direction and can be implemented without rewriting the platform.
- `Future expansion features`: deeper premium layers, creator/community systems, and AI-heavy or monetization-heavy features that fit the long-term vision but should not be mistaken for current-scope requirements.
- If something only makes sense after more moderation, identity, monetization, or systems maturity exists, document it as future expansion rather than forcing it into the current build.

## AI Placement Model
- AI should be quiet by default, contextual, dismissible, and role-aware.
- Visible AI belongs where a user is making a decision, recovering from missed context, or coordinating with other people.
- Background AI belongs where the platform needs summarization, ranking, moderation assistance, quality checks, sync recovery, or recommendation logic without interrupting the room.
- AI must never invent authority over hosts, moderators, official accounts, rights, entitlements, or safety policy.
- AI should not create a second conversation layer on top of a room unless that room explicitly exists to communicate.

## Shared Systems That May Recur Across Rooms
Only use these where they actually fit the room:
- identity and profile data
- room presence, live state, and sync state
- moderation, report intake, and role-aware review
- analytics and product signals
- notifications and reminder delivery
- social graph and relationship signals
- subscriptions, entitlements, and monetization gates
- audit logs for official or moderation-sensitive actions
- AI services for summaries, suggestions, triage, or recovery
- anti-capture or capture-permission handling on sensitive media surfaces

## Relationship Map
- Home is the discovery layer for `Live Watch-Party`.
- Title detail and Standalone Player are the launch layer for `Watch-Party Live`.
- `app/watch-party/index.tsx` is the current waiting-room owner and prepares handoff into either Party Room or Live Room.
- Party Waiting Room leads into Party Room on `/watch-party/[partyId]`.
- Live Waiting Room leads into Live Room on `/watch-party/live-stage/[partyId]`.
- Live Stage is an in-room presentation mode inside Live Room.
- Party Room owns the social watch-together shell.
- Watch-Party Live / shared party player owns the synchronized playback layer inside the Party flow.
- Standalone Player owns solo playback and `Watch-Party Live` entry.
- Profile / Channel and Chi'lly Chat connect people, titles, rooms, and official presence across the product.
- Rachi is the official platform-owned presence that must remain canonical, protected, and moderation-ready.

## 1. Live Waiting Room
Relationship to other rooms: Live Waiting Room is the pre-entry layer for Live Room. It prepares handoff into `/watch-party/live-stage/[partyId]` and must not become a second Live Room, a Party Waiting Room clone, or a generic group page.

### A. Room purpose
- Live Waiting Room exists to orient users before a live session begins to demand full attention.
- It is distinct from Live Room because it is about readiness, trust, and choice, not active participation.
- It solves the "What am I joining, who is live, and should I enter now?" problem.
- Emotionally, it should feel like anticipation with confidence, not confusion or pressure.

### B. Entry path
- First-time users should most often encounter it from Home `Live Watch-Party`, where the product is inviting them into the live side of Chi'llywood.
- Repeat users should encounter it from invites, reminders, re-entry nudges, official announcements, or profile-linked live surfaces.
- Current flow ownership lives in `app/watch-party/index.tsx` before handoff to `/watch-party/live-stage/[partyId]`.
- Preconditions are a valid room context, user sign-in when required, and any applicable beta, entitlement, or audience-access checks.

### C. Exit path / transitions
- The main forward action is enter Live Room on `/watch-party/live-stage/[partyId]`.
- Back/close should return to the source surface, usually Home, profile context, or invite origin.
- Reminder/follow actions can keep the user out of the room while preserving future re-entry.
- It must never hand off incorrectly to Party Room, Standalone Player, or a fake `/communication` destination.

### D. Core controls
- Required quick actions: `Join`, `Invite`, `Follow Host` or equivalent, and `Set Reminder` when entry is not immediate.
- Host controls: confirm session details, preview entry policy, share invite, and reopen or start pending live state.
- Viewer/user controls: confirm join intent, preview host/topic, inspect audience openness, and exit cleanly.
- Creator controls: if the creator is the host, adjust the session framing and entry policy, not the full live-stage composition.
- Owner/admin controls: official notice placement or access-state explanation only when truly relevant.
- Advanced actions should stay secondary, such as audio/video readiness, not dominant.

### E. Permissions / visibility / roles
- Public sessions can show host identity, session topic, and a broad audience signal before entry.
- Private or gated sessions should show only the information needed to decide whether the user can or should join.
- Hosts can see more entry-state detail than viewers.
- Moderation-sensitive warnings can appear here, but internal review state must not leak to ordinary users.
- Audit-minded actions matter only when official access gating or moderation-linked room policy is involved.

### F. AI behavior
- Visible AI now: smart join-mode suggestions, light readiness copy, and simple explanations for access or room state.
- Background AI now: mic/camera quality checks when relevant, readiness scoring, and join-friction detection.
- Host-facing AI now: "session looks ready" or "invite copy suggestion" style help, not full live coaching.
- User-facing AI now: "join now", "set reminder", or "this room is invite-only" style guidance.
- Admin-facing AI now: not primary here; background safety or abuse-risk hints only if warranted.
- Later AI: audience prediction, best-time-to-join signals, or personalized reminder timing.
- AI must not narrate the event, open a second chat layer, or interrupt the join path with decorative suggestions.

### G. Core features now
- room preview with host identity and live topic framing
- join flow with clear access-state messaging
- invite/share action
- presence/readiness indicators at an intentionally light level
- entitlement-aware or beta-aware access explanation
- simple reminder or follow-later behavior if entry is deferred

### H. Future expansion features
- scheduled live events and RSVP/reminder systems
- richer friend-presence preview
- backstage queueing or request-to-join flows for creator-led rooms
- premium access gates, reserved seats, or sponsor/event framing
- personalized "best entry mode" or "best time to join" recommendations

### I. Anti-patterns / what does NOT belong here
- full live participation
- dense comment history or thread-like communication
- long-form creator profile browsing
- broad admin tooling
- solo playback controls
- Party flow semantics

### J. Success test
- A user should understand in seconds what the live session is, who it is for, and whether they want to enter now.
- Joining should feel intentional and low-risk.
- Wrong-room and wrong-expectation entry should be rare.

### K. Data / systems dependencies
- room identity and presence state
- host identity/profile data
- access, entitlement, or beta state
- invite/share state
- light analytics for join conversion and abandonment
- optional AI readiness/quality checks

### L. Monetization / growth relevance
- Growth relevance is strong: follows, reminders, sharing, and re-entry behavior belong here.
- Monetization relevance is moderate and mostly later: premium live access, sponsored events, or reserved entry can fit here later.

### M. Accessibility / usability considerations
- join path must be obvious and fast
- status language must be legible and non-technical
- cognitive load should stay low; this is an orientation surface
- any mic/camera checks should be understandable, skippable, and non-blocking when possible

### N. Safety / abuse considerations
- private-room details should not leak before entry
- invite abuse and spam invites need throttling and reporting paths
- official or protected-room warnings must be clear without creating fear
- capture/privacy expectations should be surfaced when the live room has on-camera participation

## 2. Live Room
Relationship to other rooms: Live Room is the canonical live-session shell on `/watch-party/live-stage/[partyId]`. It owns live participation and room state. Live Stage is inside it, not beside it.

### A. Room purpose
- Live Room exists for real-time social presence around a host-led live session.
- It is distinct from Live Stage because it owns room state, participation, and policy, not just presentation.
- It solves the "How do we gather, participate, and stay coordinated in a live experience?" problem.
- Emotionally, it should feel alive, social, and controlled rather than chaotic.

### B. Entry path
- First-time users often arrive from Live Waiting Room or Home.
- Repeat users can arrive from invites, notifications, profile-linked entry, official announcements, or rejoin flows.
- Route ownership is `/watch-party/live-stage/[partyId]`.
- Preconditions are valid room state, sign-in, and any audience-access or safety constraints.

### C. Exit path / transitions
- Users can leave to the prior source surface, Home, or a related profile context.
- In-room transitions can move between `Live First` and `Live Watch-Party` without leaving the route.
- Post-session flows can point to Profile / Channel, Chi'lly Chat follow-up, or rejoin reminders.
- It must never hand off to Party Room or create a ghost communication destination.

### D. Core controls
- Required quick actions: leave, react, comment, inspect participants, and understand room mode.
- Host controls: go live, start/end session, manage audience interaction level, feature participants, mute/remove when policy allows, and adjust room state.
- Viewer/user controls: react, comment, inspect who is present, report harm, and leave safely.
- Creator controls: when the creator is the host, control room framing, participation policy, and how their live identity is presented.
- Owner/admin controls: minimal moderation intervention, official notices, or protected actions only when needed.
- Advanced actions can include speaker queue, audience permissions, and higher-trust moderation tools, but they should not overwhelm the base room.

### E. Permissions / visibility / roles
- Host authority governs live state, mode transitions, and room policy.
- Viewers can see and do only what the active room mode permits.
- Co-host or speaker-style roles can exist later, but role boundaries must stay visible and explicit.
- Public/private/gated visibility must remain clear before and during entry.
- Moderation roles can observe or act through the established platform-role and safety-report foundation.
- Audit logs matter for official interventions, removals, and policy-sensitive host or moderator actions.

### F. AI behavior
- Visible AI now: subtle live context, "what is happening now" guidance, or control explanations when the room state is non-obvious.
- Background AI now: moderation suggestions, quality anomaly detection, reaction summaries, and audience-energy patterning.
- Host-facing AI now: host prompt suggestions, speaker queue intelligence, or "room energy dipped" style coaching.
- User-facing AI now: simple late-join context, disabled-control explanation, or recap cues.
- Admin-facing AI now: safety escalation summaries or anomaly clustering, not public interventions.
- Later AI: post-event summaries, highlight package suggestions, creator coaching, and advanced moderation triage.
- AI must not speak into the live session as if it were a host or cover the room with permanent assistant chrome.

### G. Core features now
- stable live state with clear host/viewer distinction
- visible reactions/comments
- participant presence awareness
- report flow and policy-aware interventions
- share/invite continuity
- mode-aware room shell for `Live First` and `Live Watch-Party`
- bounded moderation hooks

### H. Future expansion features
- co-host and backstage roles
- hand raises and speaker queue surfaces
- ticketed live sessions
- creator monetization modules such as boosts, gifts, or paid access
- richer audience segmentation and live event templates
- post-event summaries and highlight reels

### I. Anti-patterns / what does NOT belong here
- solo-player behavior as the primary identity
- Party Room sync semantics
- full creator studio settings
- inbox-style persistent direct messaging
- broad dashboard/admin sprawl

### J. Success test
- Users should understand immediately that they are inside a live social room, who controls it, and how they can participate.
- The room should feel energetic and premium without feeling unsafe or unstructured.

### K. Data / systems dependencies
- live room state and presence
- participant identity data
- moderation/report and role state
- analytics for participation and retention
- notifications for follow/rejoin/live state
- optional entitlement state for gated entry
- AI services for summaries, moderation suggestions, and quality insight

### L. Monetization / growth relevance
- Growth relevance is high: follows, shares, rejoin behavior, and audience retention belong here.
- Monetization relevance is medium now and high later: paid live access, creator boosts, sponsored sessions, and premium room templates fit later.

### M. Accessibility / usability considerations
- room mode and host authority must be obvious
- reactions and comments must not block core viewing
- participant controls must remain legible on smaller screens
- live context should be easy to recover for late joiners

### N. Safety / abuse considerations
- harassment, dogpiling, and spam reactions/comments are primary risks
- host-role abuse and moderator-role abuse need bounded controls and auditability
- on-camera privacy and capture risks matter when participation is visible
- emergency report and exit paths must remain easy to find

## 3. Live Stage
Relationship to other rooms: Live Stage is the in-room presentation layer inside Live Room. It makes the same live route feel meaningfully different based on whether the room is in `Live First` or `Live Watch-Party`.

### A. Room purpose
- Live Stage exists to turn a live room into a clear, cinematic, and mode-aware experience.
- `Live First` is the creator-led mode focused on host presence, audience energy, and live performance.
- `Live Watch-Party` is the mode where a shared viewing moment becomes part of the live room.
- It solves the "What kind of live moment am I inside right now?" problem.
- Emotionally, it should feel like the premium front of the live experience.

### B. Entry path
- First-time users enter it by entering Live Room; they should not need to understand a separate product boundary.
- Repeat users may re-enter expecting the last or current stage mode to be restored or clearly shown.
- Route ownership remains `/watch-party/live-stage/[partyId]`; stage mode is route state or room state, not a new route.
- Preconditions are successful Live Room entry and a valid stage mode determined by host or room state.

### C. Exit path / transitions
- Users can move between `Live First` and `Live Watch-Party` inside the same room.
- Leaving the stage means leaving the room or returning focus to the Live Room shell, not navigating elsewhere.
- It must never hand off to Party Room or masquerade as a standalone player flow.

### D. Core controls
- Required quick actions: react, comment, understand current stage mode, and keep track of the active focal point.
- Host controls in `Live First`: spotlight self or others, manage stage emphasis, and guide audience participation.
- Host controls in `Live Watch-Party`: switch into shared viewing emphasis and keep the stage context aligned with the watch moment.
- Viewer/user controls: follow stage focus, react, comment, and understand whether the emphasis is performer-led or watch-led.
- Creator controls: presentation style, stage composition, and mode framing.
- Owner/admin controls: minimal intervention tools for moderation or official disruption management.
- Advanced actions can include stage templates, multi-speaker focus, or richer scene layouts later.

### E. Permissions / visibility / roles
- Host authority governs stage mode.
- Viewers should always know which mode they are seeing and why.
- Participant visibility can differ by mode, feature state, or role.
- Official or moderator actions should be rare, explicit, and auditable.
- The stage must not hide room-policy boundaries behind purely visual changes.

### F. AI behavior
- Visible AI now in `Live First`: host prompt suggestions, speaker queue hints, and reaction summaries if they reduce load without clutter.
- Visible AI now in `Live Watch-Party`: late-join recaps, spoiler-safe "what is happening" summaries, and low-noise mood or engagement cues.
- Background AI now: moment detection, reaction clustering, speaking-order intelligence, and quality anomaly detection.
- Host-facing AI now: "bring in the audience now", "energy is spiking", or "slow down for new joiners" style prompts.
- User-facing AI now: subtle recap or mode explanation.
- Admin-facing AI now: moderation anomaly summaries and coordinated abuse detection.
- Later AI: scene/moment highlights, clip suggestions, premium stage layouts, and post-event highlight packaging.
- AI must not become a constant co-host, should not invent commentary, and should not blur the meaning of the active mode.

### G. Core features now
- clear stage-mode identity
- strong stage focus and featured-participant logic
- reactions/comments as additive stage behavior
- visible distinction between `Live First` and `Live Watch-Party`
- participant emphasis that feels intentional on mobile

### H. Future expansion features
- creator scene presets and branded stage templates
- multi-camera or multi-pane stage layouts
- highlight markers and auto-packaged recap moments
- richer audience participation mechanics tuned by mode
- sponsor or event-layer stage skins when appropriate

### I. Anti-patterns / what does NOT belong here
- a separate URL identity
- Party sync logic
- broad creator settings or channel management
- inbox or direct-thread behavior
- a permanent AI presenter taking over the room

### J. Success test
- A viewer should instantly understand whether the live room is in `Live First` or `Live Watch-Party`.
- The stage should feel premium and intentional, not like random UI pasted on top of live presence.

### K. Data / systems dependencies
- live room mode state
- participant focus and visibility state
- reaction/comment stream
- moderation and report context
- analytics for mode engagement and drop-off
- AI services for highlights, recaps, and prompt suggestions

### L. Monetization / growth relevance
- Growth relevance is medium now through engagement and session retention.
- Monetization relevance is higher later through premium stagecraft, sponsored events, branded layouts, and creator live products.

### M. Accessibility / usability considerations
- current stage mode must be unmistakable
- focus changes should be understandable and not disorienting
- overlays must not hide essential live context
- late-join context should be recoverable without blocking the stage

### N. Safety / abuse considerations
- on-stage harassment and visible participant abuse are key risks
- featured visibility can amplify harm if moderation is weak
- clip/highlight features later will need tighter moderation and consent logic
- live doxxing, impersonation, and raid patterns need fast detection and escalation

## 4. Party Waiting Room
Relationship to other rooms: Party Waiting Room is the pre-entry layer for Party Room and the title-driven `Watch-Party Live` flow. It should feel like the social bridge between solo playback intent and shared viewing.

### A. Room purpose
- Party Waiting Room exists so users can confirm the title, party identity, access state, and social context before joining a synchronized room.
- It is distinct from Live Waiting Room because it is title-first and playback-first.
- It solves the "Which party am I joining, what are we watching, and can I get in?" problem.
- Emotionally, it should feel like warm social anticipation, not procedural friction.

### B. Entry path
- First-time users most often arrive from Standalone Player `Watch-Party Live`.
- Repeat users may arrive from invites, room-code entry, reminders, or title-linked rejoin paths.
- Current flow ownership lives in `app/watch-party/index.tsx` before handoff to `/watch-party/[partyId]`.
- Preconditions are selected title or valid room code plus any access, entitlement, or beta state.

### C. Exit path / transitions
- Main forward action is join Party Room on `/watch-party/[partyId]`.
- Back should return to Player or title context when the user came from `Watch-Party Live`.
- Reminder/share behavior can keep the user outside the room while preserving intent.
- It must never hand off to Live Room or Live Stage.

### D. Core controls
- Required quick actions: `Join`, `Create`, `Enter Code`, `Invite`, and `Preview Title`.
- Host controls: create room, circulate invite, review entry state, and set basic access mode if supported.
- Viewer/user controls: accept invite, join by code, inspect title and room owner, or exit.
- Creator controls are not primary here unless the creator is also the host; room-host logic matters more than creator identity.
- Owner/admin controls are limited to access explanation or safety notices.
- Advanced actions should remain secondary, such as room privacy detail or device-readiness notes.

### E. Permissions / visibility / roles
- Users should see only the title and room information appropriate to their access level.
- Private rooms should not leak participant identity or party detail beyond what is necessary to decide on entry.
- Hosts can see more creation and invite state than ordinary joiners.
- Entitlement-aware controls matter here because title access can affect whether party entry makes sense.
- Auditability matters if access denial, protected content rules, or official interventions are involved.

### F. AI behavior
- Visible AI now: smart join suggestions, concise title context, and invite or access explanations.
- Background AI now: entitlement checks, room-code quality checks, and join-friction detection.
- Host-facing AI now: invite copy suggestions or "best join posture" hints for their guests.
- User-facing AI now: "watch now", "join later", or "you need title access first" style help.
- Admin-facing AI now: not primary, aside from background anomaly or abuse flags.
- Later AI: friend-presence-based suggestions, best-device recommendations, and personalized rejoin prompts.
- AI must not spoil the content, flood the room entry with trivia, or talk over the main decision to join.

### G. Core features now
- room-code and invite-based join flow
- clear title preview
- host preview and room identity
- access-state explanation
- create/join split that feels intentional
- simple readiness or device suitability hints

### H. Future expansion features
- schedule or countdown awareness
- richer friend-presence preview
- private premieres, reserved seats, or premium admission
- AI-powered "best way to join" or "join with friends" suggestions
- smoother resume or re-entry patterns after interrupted party joins

### I. Anti-patterns / what does NOT belong here
- long-lived chat history
- dense participant social feed behavior
- full synchronized playback
- Live Stage semantics
- broad creator profile exploration

### J. Success test
- Users should know exactly which title and which room they are entering.
- Entry decisions should feel clear and low-risk.
- Failed joins should explain themselves without feeling like dead ends.

### K. Data / systems dependencies
- title identity and availability data
- room identity and access state
- invite and room-code systems
- entitlement or monetization checks
- analytics for join/drop-off funnels
- optional AI join guidance

### L. Monetization / growth relevance
- Growth relevance is strong through sharing and coordinated joining.
- Monetization relevance is meaningful where title access or premium room access affects entry.

### M. Accessibility / usability considerations
- title and room identity must be unmistakable
- create vs join choices must be easy to scan
- error states should be plain-language and actionable
- device-readiness hints must not overcomplicate the flow

### N. Safety / abuse considerations
- invite spam and fake room-code abuse need reporting and rate limiting
- title access rules must be enforced clearly to reduce confusion and piracy pressure
- private-party secrecy must be preserved
- users need an easy way to back out if the room feels suspicious or mismatched

## 5. Party Room
Relationship to other rooms: Party Room is the canonical watch-together room on `/watch-party/[partyId]`. It owns the social watch session and must stay distinct from Live Room even when both feel energetic.

### A. Room purpose
- Party Room exists so people can watch the same title together with shared timing, visible presence, and social coordination.
- It is distinct from the shared party player because it is the social shell around playback.
- It solves the "How do we watch together as a room instead of just watching alone with comments?" problem.
- Emotionally, it should feel communal, synchronized, and slightly celebratory.

### B. Entry path
- First-time users typically arrive from Party Waiting Room or a title/player invite path.
- Repeat users can re-enter via invite, room code, recent session, or follow-up prompt.
- Route ownership is `/watch-party/[partyId]`.
- Preconditions are valid room identity, title context, and room access.

### C. Exit path / transitions
- Users can leave back to Player, title detail, Home, or invite origin depending on entry context.
- The room can deepen into the shared party player without losing party identity.
- Post-room follow-up can move into Chi'lly Chat or Profile / Channel.
- It must never hand off to Live Stage.

### D. Core controls
- Required quick actions: react, comment, inspect participants, invite, report, and understand who is hosting the room.
- Host controls: synchronized playback authority, room lock/open state, participant policy, and party-state management.
- Viewer/user controls: react, comment, follow the shared experience, inspect who is present, and leave.
- Creator controls: when a creator is hosting, present the room as a creator-led social watch without turning it into Live Room.
- Owner/admin controls: bounded moderation, official notices, or protected interventions only when warranted.
- Advanced actions can include co-host permissions, party polls, or structured interaction later.

### E. Permissions / visibility / roles
- Host authority governs room state and shared playback direction.
- Viewers should know what they can influence directly and what follows the host.
- Public, private, invite-only, or premium room visibility must be explicit.
- Moderation and role-aware review must use the established safety-report and platform-role systems.
- Audit logs matter for removals, locks, premium access changes, and official interventions.

### F. AI behavior
- Visible AI now: sync recovery prompts, late-join recap, and simple reaction summary when it reduces confusion.
- Background AI now: sync anomaly detection, sentiment clustering, moderation suggestions, and session-energy analysis.
- Host-facing AI now: pause-point suggestions, reaction summary, or lightweight crowd-management cues.
- User-facing AI now: "catch up to room" or "you joined during a discussion pause" style context.
- Admin-facing AI now: abuse pattern summaries and escalation hints.
- Later AI: scene-based polls, trivia, moment highlights, clip suggestions, and post-party recap packages.
- AI must not run constant commentary, spoil scenes, or overwhelm the room with gamified prompts.

### G. Core features now
- clear host/viewer distinction
- synchronized room state
- reactions and comments
- invite/share continuity
- report flow and role-aware moderation hooks
- visible participant presence
- simple late-join or sync-recovery assistance

### H. Future expansion features
- co-host and temporary control delegation
- scene-based trivia or polls
- party highlights and recap cards
- clip suggestions or room-memory artifacts
- ticketed or premium event rooms
- richer creator-hosted watch experiences and brand partnerships

### I. Anti-patterns / what does NOT belong here
- Live Room or Live Stage semantics
- fully solo-player behavior
- inbox-first messaging as the dominant identity
- creator dashboard functions
- arbitrary community features with no room-specific purpose

### J. Success test
- A room should feel like a real shared watch session, not a solo player with some extra buttons.
- Users should never be confused about whether they are in Party or Live.
- Re-entry, discussion, and sync should feel stable enough for real use.

### K. Data / systems dependencies
- room presence and playback sync state
- participant identity and role data
- report/moderation systems
- analytics for party join, dwell, and drop-off
- notifications for invites and rejoin
- entitlement/access data
- AI services for sync recovery and summaries

### L. Monetization / growth relevance
- Growth relevance is high via invites, recurring party behavior, and social retention.
- Monetization relevance is meaningful through party access products, creator-hosted premieres, premium rooms, or sponsored co-watch events.

### M. Accessibility / usability considerations
- host authority and room state should be obvious
- controls must stay readable during video-centric interaction
- sync cues should be simple and actionable
- late joiners should recover context quickly without excessive text

### N. Safety / abuse considerations
- harassment, dogpiling, spam reactions, and room raiding are key risks
- piracy pressure and anti-capture concerns matter more here than in text-first rooms
- host or moderator misuse of room controls must remain auditable
- reporting and leave-room escape must stay easy

## 6. Watch-Party Live / Shared Party Player
Relationship to other rooms: Watch-Party Live is the title/player-driven social handoff label, and the shared party player is the synchronized playback canvas inside the Party flow. It is not a new top-level destination.

### A. Room purpose
- This surface exists to turn a chosen title into a synchronized shared viewing experience.
- It is distinct from Party Room because it is the media canvas, not the full social shell.
- It is distinct from Standalone Player because host authority and room state shape the timeline.
- It solves the "How do we actually watch the same scene together right now?" problem.
- Emotionally, it should feel immersive and socially charged, but still media-first.

### B. Entry path
- First-time users reach it from Standalone Player `Watch-Party Live`.
- Repeat users reach it from inside Party Room or by rejoining a current party state.
- It inherits route or session context from Party flow rather than owning a new route identity.
- Preconditions are an active party context plus a selected title.

### C. Exit path / transitions
- Users should be able to return to Party Room context without losing social continuity.
- Exiting the shared player can return the user to title/player or room shell depending on the active experience.
- It must not launch users into Live Stage or a fake messaging surface.

### D. Core controls
- Required quick actions: play/pause feedback, sync state, reactions/comments, and return-to-room awareness.
- Host controls: authoritative playback control and limited room-synced media actions.
- Viewer/user controls: social reactions, comments, and passive sync-following, not silent desync of the shared timeline.
- Creator controls: not primary here except when a creator is the party host.
- Owner/admin controls: indirect and minimal, typically through moderation/report paths rather than overt player takeover.
- Advanced actions can later include richer overlays, co-host sync, or group-specific interactive moments.

### E. Permissions / visibility / roles
- Host authority governs the shared timeline.
- Viewers should understand that they are following room sync, not solo playback freedom.
- Overlay visibility should depend on room policy and device constraints.
- Protected or restricted titles must keep rights-aware controls and anti-capture expectations intact.
- Audit logs matter for sync-critical host actions and protected content handling if escalations occur.

### F. AI behavior
- Visible AI now: sync recovery help, late-join recap, and optional scene context when requested.
- Background AI now: sync drift detection, moment importance detection, and overlay load balancing.
- Host-facing AI now: suggested pause points, "room is desynced", or reaction-summary cues.
- User-facing AI now: "catch up to live point" and low-noise recap.
- Admin-facing AI now: protected-content anomaly detection or abuse-signal clustering in the background.
- Later AI: scene/moment highlights, clip suggestions, scene-based trivia/polls, and post-session highlight reels.
- AI must not narrate the movie, obscure controls, or become an unwanted second-screen commentator.

### G. Core features now
- reliable synced playback state
- clear host authority over timeline
- reaction/comment overlays that stay secondary to media
- obvious connection back to Party Room identity
- rights-aware and entitlement-aware behavior
- simple sync recovery

### H. Future expansion features
- richer co-watch overlays and perspective modes
- scene-based engagement prompts
- highlight markers and recap cards
- clip suggestions subject to rights and moderation policy
- second-screen TV handoff patterns for party use

### I. Anti-patterns / what does NOT belong here
- a separate top-level route identity
- Live Stage semantics
- profile browsing as a dominant behavior
- long-form messaging or inbox behavior
- decorative AI that competes with playback

### J. Success test
- The room should feel truly synchronized and socially alive.
- Playback should remain the center of gravity.
- Users should understand that this is shared viewing, not solo viewing with extra chrome.

### K. Data / systems dependencies
- playback state and sync
- party membership and role state
- title rights/entitlement data
- moderation/report hooks
- analytics for viewing behavior and sync recovery
- optional AI services for recap and highlights
- anti-capture handling where supported

### L. Monetization / growth relevance
- Monetization relevance is moderate now through entitlement enforcement and room-access logic.
- It becomes stronger later through premium co-watch layers, premium rooms, and sponsored watch experiences.
- Growth relevance is high because good shared playback increases repeat room behavior.

### M. Accessibility / usability considerations
- overlays must not overwhelm playback
- sync status must be plain-language
- join-late recovery should be fast and humane
- media controls must remain discoverable on small screens

### N. Safety / abuse considerations
- piracy and capture concerns are high
- spoiler risk is high for late joiners
- overlay spam can ruin usability
- abusive or misleading room-control behavior should remain reportable and auditable

## 7. Standalone Player
Relationship to other rooms: Standalone Player is the solo playback route and the launch surface for `Watch-Party Live`. Social viewing is a deliberate escalation from here, not the default state.

### A. Room purpose
- Standalone Player exists for focused solo playback.
- It is distinct from Party Room because it does not assume social coordination.
- It is distinct from Live Room because it is not a presence-first surface.
- It solves the "I want to watch now" problem.
- Emotionally, it should feel calm, premium, and under the user's control.

### B. Entry path
- First-time users reach it from Home rails, title detail, and discovery.
- Repeat users reach it from resume history, continue watching, or deep links.
- Route ownership is `/player/[id]`.
- Preconditions are a valid title and any required entitlement or rights state.

### C. Exit path / transitions
- Users can return to title detail, Home, continue watching context, or launch `Watch-Party Live`.
- Casting or TV handoff remains a playback extension, not a room transition.
- It must not hand off to Live Stage, and it must not pretend to already be a room.

### D. Core controls
- Required quick actions: play/pause, scrub, fullscreen, and resume.
- Host controls are not primary here; it is solo-first.
- Viewer/user controls: speed, progress, captions when available, cast where allowed, and rights-aware like/share/save/download behavior.
- Creator controls are not primary here.
- Owner/admin controls: limited to bounded safety or reporting behavior and protected-content restrictions.
- Advanced actions can include speed selection, zoom, up-next, cast, and richer playback tools.

### E. Permissions / visibility / roles
- Entitlement and rights state control which actions appear.
- The user should understand when a control is unavailable because of policy, access, or device capability.
- Party context must be explicit if it is present; solo assumptions should not be silently overridden.
- Auditability matters for protected-content events or official escalations, not as a visible default layer.

### F. AI behavior
- Visible AI now: resume intelligence, low-noise recap on request, and entitlement-aware explanations.
- Background AI now: watch history/resume intelligence, up-next ranking, cast/watch-on-TV recommendations, and content/context summaries when useful.
- Host-facing AI: not primary here.
- User-facing AI now: "continue where you left off", "cast to TV", or "good for Watch-Party Live" suggestions.
- Admin-facing AI now: not a visible concern here outside protected-content anomaly support.
- Later AI: scene search, richer context summaries, highlight markers, personalized viewing guidance, and accessibility-aware recommendations.
- AI must not nag users into social rooms, narrate playback constantly, or obscure the media.

### G. Core features now
- reliable solo playback
- watch history and resume behavior
- `Watch-Party Live` entry
- rights-aware content actions
- up-next or continue-watching intelligence
- cast or handoff behavior where allowed
- protected-content behavior that does not break playback clarity

### H. Future expansion features
- richer TV handoff and second-screen patterns
- advanced playback accessibility tools
- scene search and contextual summaries
- better content-aware recommendations
- premium playback perks or viewing modes

### I. Anti-patterns / what does NOT belong here
- Party Room governance
- Live Room presence behavior
- inbox or thread UI as a dominant layer
- creator dashboard or profile-management logic
- nonstop AI commentary

### J. Success test
- A user should be able to watch alone with zero ambiguity and still understand when and how to move into `Watch-Party Live`.
- The player should feel stable, premium, and unobtrusive.

### K. Data / systems dependencies
- title metadata and media sources
- watch history/progress
- entitlement and rights state
- content-action primitives
- analytics for engagement and completion
- optional AI services for recap, ranking, and recommendations
- cast or device-capability detection

### L. Monetization / growth relevance
- Monetization relevance is high because entitlement-aware access lives close to playback.
- Growth relevance is medium through resume, up-next quality, and frictionless transition into social rooms.

### M. Accessibility / usability considerations
- playback controls must remain legible and reachable
- action availability should be obvious without jargon
- resume and up-next behavior should reduce memory burden
- overlay load must stay light on smaller screens

### N. Safety / abuse considerations
- capture and piracy concerns are meaningful here
- restricted content actions must stay policy-aware
- autoplay or recommendation behavior should not feel manipulative
- users need safe exits and clear reporting for broken or misleading media states

## 8. Profile / Channel
Relationship to other rooms: Profile / Channel is the canonical identity hub across content, rooms, and communication. It is not itself a live room, party room, or inbox, but it connects all of them.

### A. Room purpose
- Profile / Channel exists as Chi'llywood's social identity hub and mini network surface.
- It is distinct from settings because it is about identity, content, rooms, and social presence.
- It is distinct from rooms because it explains who someone is across rooms rather than becoming the room itself.
- It solves the "Who is this person or network, and how do their rooms, content, and messaging connect?" problem.
- Emotionally, it should feel like someone's home base inside the platform.

### B. Entry path
- First-time users reach it from avatars, participant taps, official Rachi entry, or creator discovery.
- Repeat users reach it from room follow-ups, Chi'lly Chat profile opens, self-profile entry, and channel revisits.
- Route ownership is `/profile/[userId]`.
- Preconditions are valid identity data and enough context to distinguish self, other-user, or official-platform behavior.

### C. Exit path / transitions
- Users can move from profile into Chi'lly Chat, linked live/party surfaces when real room context exists, or self-only management surfaces.
- Self profile can open owner-specific controls such as channel settings while preserving canonical profile identity.
- It must not fork into a separate creator app or impersonate the active room.

### D. Core controls
- Required quick actions: open Chi'lly Chat, inspect profile/channel views, and navigate relevant content or room links.
- Host controls are only relevant when the profile owner is also a room host.
- Viewer/user controls: open thread, inspect channel home, view identity, and follow linked room context when valid.
- Creator controls: manage channel, curate channel presentation, and understand creator-facing room identity without leaving the profile system.
- Owner/admin controls: self-only controls for the owner, plus protected official-account handling where relevant.
- Advanced actions later can include channel programming, uploads, lists, and richer creator tools.

### E. Permissions / visibility / roles
- Self, other-user, and official-platform profiles must behave differently and clearly.
- Self profile can show owner-only controls.
- Other-user profile must not leak owner-only surfaces.
- Official Rachi profile must remain protected from claim/edit drift.
- Visibility of linked live or party actions depends on real room context.
- Audit-sensitive official actions should remain platform-role-bound.

### F. AI behavior
- Visible AI now: curation suggestions, "what to do next" guidance, and identity-aware help when the surface would otherwise feel sparse.
- Background AI now: channel curation support, ranking of surfaced content or activity, and creator/owner insight preparation.
- Host-facing AI now: not primary unless the owner is using creator-facing channel controls later.
- User-facing AI now: light guidance into rooms, content, or Chi'lly Chat.
- Admin-facing AI now: official identity protection or moderation-risk signals in the background where applicable.
- Later AI: creator/owner insights, channel programming suggestions, clip or post suggestions, community engagement prompts, and channel-summary generation.
- AI must not ghostwrite someone's identity publicly by default or fabricate community sentiment.

### G. Core features now
- self vs other-user vs official distinction
- channel-home framing
- direct Chi'lly Chat handoff
- official markers for Rachi
- linked room actions only when context exists
- room/content identity coherence
- near-term social relationship surfaces such as likes, saves, and public activity where policy allows

### H. Future expansion features
- uploads, clips, lists, and public activity
- creator analytics and owner insights
- channel programming and featured collections
- community modules and richer fan activity
- monetization and partnership surfaces for creators

### I. Anti-patterns / what does NOT belong here
- settings-only identity
- inbox-first behavior as the dominant mode
- fake room ownership without real room context
- a parallel creator app disconnected from canonical profile routes
- over-automated AI identity that hides the real person or official source

### J. Success test
- Users should quickly understand who someone is, what their channel identity means, and how to move into content, rooms, or messaging from there.
- Self profile should feel empowering; other-user profile should feel actionable; official profile should feel trusted.

### K. Data / systems dependencies
- identity/profile data
- content relationship data such as likes, saves, and public activity where allowed
- social graph or follow-like relationship primitives
- room-link context
- analytics for discovery and conversion
- AI services for curation and insight preparation

### L. Monetization / growth relevance
- Growth relevance is high through identity, follows, creator discovery, and room follow-up.
- Monetization relevance is high later through creator tools, channel merchandising, partnerships, and fan-community products.

### M. Accessibility / usability considerations
- self vs other-user behavior must be unmistakable
- official markers must be clear without being noisy
- channel navigation should not require deep mental model rebuilding
- content and room actions must be legible and context-aware

### N. Safety / abuse considerations
- impersonation and fake-official identity are major risks
- creator harassment and unwanted contact need clear moderation hooks
- public/private activity boundaries must be respected
- official accounts need stronger protection than ordinary users

## 9. Chi'lly Chat
Relationship to other rooms: Chi'lly Chat is the native messaging and calling layer on `/chat` and `/chat/[threadId]`. It spans the platform but must not replace room-native interaction.

### A. Room purpose
- Chi'lly Chat exists so people can communicate directly before, during, and after rooms.
- It is distinct from embedded room chat because it is persistent, thread-first, and not locked to one room session.
- It solves the "How do we keep talking once we are not looking at the same room?" problem.
- Emotionally, it should feel native, trusted, and continuous.

### B. Entry path
- First-time users often reach it from self-profile, other-user profile, or Rachi's official starter presence.
- Repeat users reach it from `/chat`, `/chat/[threadId]`, room follow-up prompts, profile opens, and notification taps.
- Route ownership is `/chat` for inbox and `/chat/[threadId]` for direct threads.
- Preconditions are signed-in identity and valid thread membership when required.

### C. Exit path / transitions
- Users can move from inbox to thread, thread to profile, thread to in-thread voice/video call, and back to prior product context.
- Chi'lly Chat can support room follow-up without becoming the room.
- It must never take over Party Room or Live Room semantics, and it must not adopt `/communication` as its route identity.

### D. Core controls
- Required quick actions: open thread, write/send, read timestamps, mark context as caught up, open profile, and start voice/video call.
- Host controls are not the governing model here; thread membership is.
- Viewer/user controls: message, call, follow up from a room, react to messages where supported, and report abuse.
- Creator controls: coordinate with fans or collaborators through canonical thread behavior rather than a special creator-only messenger.
- Owner/admin controls: bounded official or moderation-aware follow-up only where needed.
- Advanced actions later can include thread search, pinned items, summaries, and room-linked continuity.

### E. Permissions / visibility / roles
- Direct-thread membership defines who can read or act inside the conversation.
- Active call state is visible to thread participants, not the entire platform.
- Official Rachi threads must keep protected official-account semantics.
- Moderation review must stay role-aware and auditable.
- Embedded room-chat inheritance should not leak standalone thread history to users who do not belong there.

### F. AI behavior
- Visible AI now: smart reply suggestions when explicitly enabled and truly helpful.
- Background AI now: spam/abuse support, notification ranking, and lightweight thread-state awareness.
- Host-facing AI: not primary.
- User-facing AI now: smart replies where it fits the current thread and call state.
- Admin-facing AI now: moderation triage summaries and abusive-thread clustering, kept behind role boundaries.
- Later AI: thread summaries, missed-message recaps, support triage routing, and translation or coordination help.
- AI must not auto-send messages, impersonate the other participant, or dominate the thread UI.

### G. Core features now
- inbox and direct threads
- composer, timestamps, optimistic sending, realtime updates, mark-read
- profile-to-thread handoff
- thread-based voice/video entry
- report flow
- official Rachi starter presence
- optional smart replies under flags where product fit is proven

### H. Future expansion features
- group threads and room-linked continuity
- missed-message recap and thread summaries
- translation and richer productivity support
- creator-fan coordination patterns
- official support triage and structured help flows

### I. Anti-patterns / what does NOT belong here
- full shared playback
- replacing room-native interaction as the only social layer
- treating Chi'lly Chat as just an in-room side panel
- using it as a bucket for random admin tooling

### J. Success test
- Users should be able to move naturally from profile or room context into a direct thread and keep that conversation alive over time.
- Calling and messaging should feel native to Chi'llywood, not bolted on.

### K. Data / systems dependencies
- thread, member, and message data
- profile identity data
- call-room primitives
- moderation/report and abuse-detection systems
- analytics for open, reply, and retention behavior
- notifications for thread and call activity
- AI services for replies, summaries, and triage

### L. Monetization / growth relevance
- Direct monetization relevance is low in MVP.
- Growth and retention relevance is very high because ongoing communication increases room return and creator/fan continuity.
- Later monetization can emerge through creator coordination, premium communities, or official support tiers, but it is not the primary purpose.

### M. Accessibility / usability considerations
- unread state and call state should be obvious
- composer and core actions must be reachable with minimal friction
- long-thread recovery should become easier over time
- AI suggestions must never crowd out the basic thread interaction model

### N. Safety / abuse considerations
- harassment, spam, scams, and unwanted calling are core risks
- official-account impersonation risk matters if trust signals are weak
- users need clear block/report/leave-call behavior
- moderation and abuse summaries must stay private to authorized reviewers

## 10. Rachi As Official Platform Concierge / Admin / Moderation Presence
Relationship to other rooms: Rachi is a protected official platform-owned presence that works through canonical Profile / Channel and Chi'lly Chat surfaces and may later appear in room-adjacent official roles without becoming a separate product.

### A. Room purpose
- Rachi exists so Chi'llywood has a trusted official presence for onboarding, help, guidance, and moderation-ready follow-up.
- Rachi is distinct from a normal user, from a generic chatbot, and from a hidden admin-only shell.
- It solves the "Where does trusted platform help live?" problem.
- Emotionally, it should feel credible, calm, and clearly official.

### B. Entry path
- First-time users should often encounter Rachi through the official starter thread or protected official profile.
- Repeat users may encounter Rachi through support follow-up, official announcements, safety escalation, or future room-adjacent official prompts.
- Current route ownership stays canonical: `/profile/[userId]` and `/chat/[threadId]`.
- Preconditions are the protected official-account foundation and platform-role ownership behind the scenes.

### C. Exit path / transitions
- Users can move from Rachi profile into official Chi'lly Chat, from thread into guided support, and back into the product context that created the need.
- Future official follow-up can point into moderation or platform help without inventing a second persona system.
- It must never fork into a fake special admin app or non-canonical support route.

### D. Core controls
- Required quick actions: open official thread, view official profile, understand official status, and act on guided next steps.
- Host controls are not the right model here; protected platform-role control is.
- Viewer/user controls: contact Rachi, follow official guidance, read trusted announcements, and resolve onboarding/support needs.
- Creator controls: not primary, though creators may later receive official guidance through Rachi.
- Owner/admin controls: reserved for authorized platform roles operating the protected official identity, announcements, and moderation follow-up.
- Advanced actions later can include structured case follow-up, official notice types, or guided escalation flows.

### E. Permissions / visibility / roles
- Rachi must always read as official and platform-owned.
- Users can contact Rachi, but they cannot impersonate or administer Rachi.
- Only authorized platform roles can control official behavior and messaging posture.
- Official announcements, moderation follow-up, or admin-sensitive actions must remain auditable.
- Room-adjacent visibility later must remain intentional and policy-backed rather than ambient and confusing.

### F. AI behavior
- Visible AI now: concierge/onboarding guidance, support triage hints, and clear policy explanation when users open the official thread.
- Background AI now: support triage preparation, moderation summary preparation, and official help routing.
- Host-facing AI: not primary.
- User-facing AI now: trusted help, onboarding, and "what should I do next" guidance.
- Admin-facing AI now: moderation note drafting, escalation summaries, and queue-shaping support for authorized operators.
- Later AI: official announcement drafting assistance, deeper support routing, and moderation follow-up summaries tied to audit requirements.
- AI must not make unreviewed enforcement claims, pretend to be human when policy needs explicit platform ownership, or act like a random mascot account.

### G. Core features now
- protected official markers
- canonical profile and direct-thread entry
- official starter presence in Chi'lly Chat
- onboarding/help messaging
- protected non-claimable behavior
- future-safe moderation-ready identity foundation

### H. Future expansion features
- official announcements and release updates
- room-adjacent official notices where context makes sense
- structured support triage and moderation follow-up
- creator-support coordination
- richer onboarding flows across the product lifecycle

### I. Anti-patterns / what does NOT belong here
- a fake mascot persona disconnected from platform trust
- a separate support app or special route
- silent AI enforcement without human or policy review
- using Rachi as an excuse to avoid proper moderation tooling

### J. Success test
- Users should immediately recognize where official help lives and trust that it is the real platform presence.
- Moderation, onboarding, and announcement work should feel like extensions of this same canonical official identity, not a second system.

### K. Data / systems dependencies
- protected official-account identity data
- platform-role membership and permission systems
- direct-thread and profile systems
- moderation/report and audit-log systems
- notifications and announcement delivery
- AI services for triage, summaries, and guided help

### L. Monetization / growth relevance
- Direct monetization relevance is low.
- Growth and retention relevance are high because trusted onboarding and reliable support reduce churn.
- Longer-term creator and premium-community health can benefit indirectly from official trust and moderation continuity.

### M. Accessibility / usability considerations
- official markers must be unmistakable
- help pathways should be short and clear
- language should feel trustworthy rather than robotic or vague
- escalation steps should be obvious and non-intimidating

### N. Safety / abuse considerations
- impersonation is the primary risk
- over-automation can damage trust if AI appears to make human judgments without review
- official follow-up touching moderation needs auditability
- users must not confuse Rachi with a normal social account or an unofficial helper bot
