# Navigation Terminology Map

## Purpose
This map records the current Chi'llywood app navigation and product language after the Modern Navigation IA and Remaining UX Blocker Production Pass. It is a product map, not a route rewrite plan. Technical route names such as `/channel/[userId]` remain for compatibility when the user-facing concept is `Platform`.

## Final Terminology
- Profile = the user's social identity hub.
- Platform = the public creator surface for uploads, videos, events, live context, and backed shelves.
- Platform Studio = the signed-in owner creator control center.
- Chi'lly Circle = mutual personal connection layer. Do not replace it with generic `friends` copy.
- Chi'lly Chat = standalone inbox/direct-thread messaging plus room-linked chat surfaces.
- Watch-Party Live = content/player-driven watch-together flow.
- Live Watch-Party = people-first live room / Live Stage flow.
- Party Room = canonical room shell after a Watch-Party Live room exists.
- Live Room / Live Stage = canonical live room route and in-room presentation state.
- Spectator = public-safe metadata/playback state surface; it does not grant original host/member controls.
- Money Center = creator money readiness in Platform Studio and owner/admin money controls in Admin.
- Rachi = official Chi'llywood presence, not a private-chat watcher or normal friend.

## Main App Mode Map
Viewer mode:
- Home: discovery, live-now rails, Rachi official updates, public uploads, Originals, upcoming events, and continue watching.
- Explore: current title search/filtering. Unified creator/live/event/upload search is planned and must not fake results.
- Live: bottom-nav entry point for choosing `Live Watch-Party`, joining `Watch-Party Live` by code, or browsing content before starting a content-first party.
- Library: current saved-title list. Broader My Stuff sections are planned only when backed.
- top Profile/avatar entry: opens the signed-in user's social identity route without duplicating Profile in the bottom nav.
- Chi'lly Chat: canonical message inbox/thread route.
- Chi'lly Circle: canonical social-circle route.

Creator mode:
- Platform Studio: `/channel-studio`, with `/channel-settings` as compatibility.
- Content: uploads, drafts, published creator videos, and Clip Studio entry.
- Live tools: event scheduling and existing Live Watch-Party / Watch-Party Live handoffs.
- Brand Studio: Platform branding, separate from Profile photo/background.
- Clip Studio: creator clip production; complete for now.
- Money Center: creator money readiness, provider status, balances/payout readiness, and audit details where safe.
- Moderation/Safety: creator-facing audience and safety controls only; admin enforcement stays in Admin.

Owner/Admin mode:
- Admin Command Center: `/admin`, backend-role protected.
- Owner Security: owner-trusted device and emergency controls.
- Money Controls: consolidated Owner/Admin Money Center.
- Reports/Moderation: safety, DMCA, legal intake, and content review.
- Legal: public policy/evidence/control surfaces.
- System: canary checks, runtime controls, usage, networks, Live Ops, and ops guardrails.
- Live Ops: reliability incidents and safe remediation proxy surfaces.

## Bottom Navigation
Implemented bottom navigation:
- Home
- Explore
- Live
- Library

Rationale:
- `Profile` is no longer duplicated in the bottom tab bar. It remains reachable through the Home top avatar/profile entry, direct `/profile/[userId]` route, Settings, and Profile/Platform actions.
- `Live` is one tap away without changing canonical room routes.
- `Library` replaces the narrow `My List` label while still showing only backed saved titles.
- Creator tools stay out of normal viewer bottom navigation. Platform Studio remains a Profile/Platform owner action.
- Platform Studio stays out of normal viewer bottom navigation.
- Admin never appears in normal bottom navigation.

Source truth:
- `app/(tabs)/_layout.tsx` registers `profile` with `href: null` so the compatibility tab route file remains but the bottom bar renders only Home / Explore / Live / Library.
- Home owns the visible top Profile/avatar affordance with `accessibilityLabel="Open your Profile"` and routes to `/profile/[userId]`.

## Explore Status
Current implementation:
- Searches and filters `titles` only.
- Shows backed title metadata, featured/trending/top-row flags, and live-now title-room cues where available.
- The header now separates `Available now` from `Next discovery phase` so users see the backed scope without fake global discovery.
- Explore uses backed hero/title imagery when present and falls back to the Chi'llwood branded background when no backed hero image is available.
- Does not invent creator, upload, event, live-room, or Rachi results.

Recommended next Explore phase:
- Add backed sections for Platforms, public uploads, live rooms, Watch-Party Live entries, Live Watch-Party rooms, events, Chi'llwood Originals, and Rachi official content.
- Keep each section hidden or empty-state honest until backed rows exist.
- Avoid fake trending, fake recommendations, fake viewer counts, and protected/private content leakage.
- Add read models before adding result cards. Do not use placeholder creator/platform/live rows.

## Library Status
Implemented status:
- `My List` is renamed to `Library` in the bottom nav and screen copy.
- Current backed content remains saved titles only.
- Header scope pills show saved-title count and future My Stuff scope.
- Empty state says other Library sections appear only when real saved items exist.
- The Library route uses the Chi'llwood branded background behind the compact saved-title surface.

Recommended Library/My Stuff phase:
- Saved titles.
- Followed Platforms.
- Upcoming watch parties and reminders.
- Saved replays.
- Continue watching.
- Liked/saved clips.
- Offline/downloads only if rights and entitlement support it later.

## Live Naming Map
- Home and the Live bottom tab may open `Live Watch-Party` through `/watch-party?mode=live`.
- Title, Player, and creator-video paths own `Watch-Party Live`.
- `/watch-party` without `mode=live` remains the waiting-room/code path for Party Room / Watch-Party Live.
- `/watch-party/[partyId]` remains Party Room.
- `/watch-party/live-stage/[partyId]` remains Live Room / Live Stage.
- Party Room must not be renamed to Live Stage.
- Live Watch-Party must not be routed into Party Room except through the approved waiting-room behavior.
- Watch-Party Live must not be routed into Live Stage.
- Audio Mix belongs only to Watch-Party Live shared player controls.

## Player Consistency Audit
Current modes seen in `app/player/[id].tsx`:
- normal title playback
- creator video playback
- public Platform video playback
- Watch-Party Live shared-player mode
- Premium/Party Pass/direct-room access checks
- comments, reactions, report/share, and creator-video monetization messages where backed

Audit result:
- Player correctly labels its content-first room path as `Watch-Party Live`.
- `Audio Mix` remains inside Watch-Party Live shared-player controls and was not moved to Live Watch-Party, Party Room, or the Live Hub.
- Player route-gate copy distinguishes rooms that belong to Live Watch-Party from Watch-Party Live.
- `Open Party Room` remains a compatibility action only when a direct room route is appropriate.
- No Player code was rewritten in the completion pass; a future Player lane should split or simplify the multi-mode UI only after preserving Premium gates, public/draft/private visibility, comments/reactions, report/share controls, and Watch-Party Live ownership.

## Live Hub UI Density
Implemented status:
- The Live tab at `app/(tabs)/live.tsx` is a modern compact launcher.
- It uses these named patterns: Hero header, Compact action cards, Action rows, Status pills, Choice chips, Progressive disclosure, Collapsible details, Empty state, Primary CTA, and Secondary CTA.
- It renders over the Chi'llwood branded background so the Live route does not fall back to a plain black shell.
- Main cards use one-sentence copy: `Live Watch-Party` is people-first, `Watch-Party Live` is for room codes/content watch-together, and `Find Content` starts from content discovery.
- Long technical copy such as route ownership and waiting-room internals is removed from the main cards.

Route map:
- `Open Live` keeps the existing Premium/runtime preflight, then opens `/watch-party?mode=live`.
- `Enter Code` opens `/watch-party` for the existing Watch-Party Live waiting-room/code path.
- `Browse` opens Explore.
- Party Room remains `/watch-party/[partyId]`.
- Live Room / Live Stage remains `/watch-party/live-stage/[partyId]`.
- Player remains `/player/[id]` and is deferred for a later scoped pass.
- Spectator remains `/spectate/[itemId]`.

Guardrails:
- No LiveKit token issuer or permission behavior changed.
- No Party Room, old-room handling, Premium gate, Spectator child-room, Player, fake live room, fake event, fake viewer count, or fake activity behavior changed.

## Profile / Platform / Studio Separation
- Profile is personal/social identity.
- Public Platform is viewer-facing creator surface at `/channel/[userId]`.
- Platform Studio is owner-only creator management at `/channel-studio`.
- `/channel-settings` stays compatibility only.
- Profile `View Platform` and Platform Studio `Preview Platform` map to `/channel/[userId]` with public-preview safeguards.
- Brand Studio edits Platform branding, not Profile photo/background.
- Settings and support copy should say Platform when the product means the public creator surface.

## Chi'lly Circle / Chat / Rachi Check
- Primary social-circle copy uses `Chi'lly Circle`; internal helper names may still use friend/friendship for compatibility.
- Messaging copy uses `Chi'lly Chat`.
- Rachi remains `Official Chi'llywood`, appears through canonical public-safe surfaces, and is not positioned as a private-chat watcher.
- Rachi Official Updates and Chi'llwood Originals stay backed-only; no fake posts, fake Originals, fake followers, fake likes, or fake engagement are allowed.

## Host Preflight Recommendation
Current backing exists across waiting-room/live-stage/player flows, but the product would benefit from one clearer preflight moment before the host enters:
- Room type.
- Audience and access.
- Mic/camera readiness.
- Paid/free status and Premium/access gates.
- Who can speak.
- Safety controls.
- Source/content eligibility.
- Start or schedule action.

This pass did not build a full preflight because it would touch room behavior and LiveKit-adjacent flow. The correct future location is the existing waiting-room owner before handoff into Party Room or Live Room.

## Platform Studio Density
Current state:
- Platform Studio has a useful Home, Today, Needs Attention, tabs, quick actions, and collapsible groups.
- The remaining issue is density, not missing systems.

Recommendation:
- Keep the current tabs for route compatibility.
- Put the creator's next step first.
- Keep detailed proof, provider, audit, and technical language behind collapsed sections.
- Keep Profile settings, Platform branding, and Admin controls clearly separate.

## Money Center Top Layer
Current state:
- Money Center is consolidated and kill-switch/provider-readiness backed.
- Creator details and event drilldowns are available without activating money.

Recommendation:
- First view should stay simple: active, locked, next step.
- Detailed provider/audit rows should remain collapsed.
- No fake earnings, balances, payouts, tips, paid content, merch, checkout, or live money.

## Route And Deep Link Notes
- `/(tabs)/index`: Home bottom tab.
- `/(tabs)/explore`: Explore bottom tab.
- `/(tabs)/live`: Live bottom tab.
- `/(tabs)/my-list`: Library bottom tab.
- `/(tabs)/profile`: hidden compatibility tab route; it should not render in the bottom nav and redirects/hands off to the signed-in user's Profile.
- `/profile/[userId]`: Profile social identity.
- `/channel/[userId]`: Public Platform, route name retained for compatibility.
- `/channel-studio`: preferred Platform Studio route.
- `/channel-settings`: compatibility route into Platform Studio.
- `/player/[id]`: Player / playback-first route; owns content-first Watch-Party Live entry.
- `/chat`: Chi'lly Chat inbox.
- `/chat/[threadId]`: direct Chi'lly Chat thread.
- `/chilly-circle`: Chi'lly Circle.
- `/watch-party`: waiting room / code entry / live mode preparation.
- `/watch-party/[partyId]`: Party Room.
- `/watch-party/live-stage/[partyId]`: Live Room / Live Stage.
- `/spectate/[itemId]`: Spectator metadata/playback eligibility.
- `/admin`: Admin Command Center, backend-role protected.
- `/admin?tab=money-center`: Admin Money Center where supported.
- `/monetize`, `/revenue`, `/payouts`: compatibility redirects into Money Center.

Query params currently known:
- `/watch-party?mode=live` opens Live Watch-Party waiting-room flow.
- `/channel/[userId]?preview=public` opens public Platform preview without owner controls.
- `/channel-studio?tab=monetization&focus=...` opens Money Center sections.
- `/admin?tab=money-center` and old admin money params map into Admin Money Center sections.
- Some route params are intentionally documented rather than rewritten in this pass; risky router rewrites should wait for a scoped route/deeplink lane.

Deferred route work:
- Make Explore global only after backed read models exist.
- Add richer Library sections only after saved/followed/reminder/replay read models are backed.
- Avoid a bottom-tab Chat route until it can delegate to `/chat` without duplicate route ownership.

## Implemented In This Pass
- Bottom nav changed from the previous Home / Explore / Live / Library / Profile state to Home / Explore / Live / Library.
- Hid the Profile tab with `href: null` while preserving the Profile tab route file and direct `/profile/[userId]` route.
- Verified the Home top avatar/profile entry remains the signed-in Profile path.
- Added a Live tab that routes into existing Live Watch-Party and Watch-Party Live paths through existing Premium/runtime preflight and without changing room ownership.
- Modernized the Live tab into a compact Live Hub launcher with the UI density patterns above.
- Preserved the hidden Profile tab compatibility route so direct tab access still hands off to the signed-in user's canonical Profile.
- Renamed visible `My List` copy to `Library` while keeping saved-title behavior only.
- Updated Explore copy to state current title-search scope, list the backed-now discovery scope, and document the planned future discovery scope without fake results.
- Added Library scope pills for saved-title-only truth and future My Stuff scope without fake rows.
- Audited Player naming and pinned the source proof in the navigation guard without rewriting Player behavior.
- Replaced several user-facing `Channel` labels with `Platform` where the product means public creator surface.
- Added `guard:navigation-terminology-policy`.

## Deferred
- Full unified Explore.
- Full Library/My Stuff.
- Host preflight build.
- Platform Studio structural rewrite.
- Player route decomposition.
- Full Explore and Library backing beyond current saved-title/title-search data.
- Risky route/deeplink query rewrites.
- Profile avatar/background runtime proof.
- Remaining Spectator runtime proof.
- Watch-Party Live two-device audio ducking proof until another safe device/account is available.

## Validation
Run:
- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:navigation-terminology-policy`
- `npm run guard:refresh-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:provider-readiness-policy`
- `npm run guard:money-center-policy`
- `npm run guard:clip-studio-policy`
- `npm run guard:platform-brand-studio-policy`
- `npm run guard:profile-production-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run guard:spectator-child-room-policy`
- `npm run guard:rachi-official-policy`
- `npm run guard:content-rights-policy`
- `npm run guard:vod-quality-policy`
- targeted grep proof for no user-facing Mini Platform
- targeted proof that bottom nav hides Profile while Profile route/top entry remain
- targeted grep proof for Live naming separation
- `git diff --check`
- `git diff --cached --check`

## Android Proof
Target device: `R5CR120QCBF`.

Navigation proof path: `/tmp/chillywood-navigation-terminology-proof-20260528/`.
Live Hub density proof path: `/tmp/chillywood-live-hub-density-proof-20260528/`.
IA completion proof path: `/tmp/chillywood-nav-ia-completion-proof-20260528/`.
Modern Navigation IA proof path: `/tmp/chillywood-modern-nav-ia-proof-20260528/`.

Current Modern Navigation IA screenshots:
- bottom navigation with Home / Explore / Live / Library only
- top Profile/avatar entry visible
- top Profile/avatar route handoff to Profile
- Settings Profile and Platform Studio actions
- Platform Studio from Profile/Settings
- Public Platform from Platform Studio
- Explore title-search scope copy
- Library saved-title-only scope copy
- unchanged compact Live Hub first view
- Player Watch-Party Live entry
- Money Center simple first view
- Admin absent from normal bottom nav
