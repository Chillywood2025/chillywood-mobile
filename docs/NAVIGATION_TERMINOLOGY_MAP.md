# Navigation Terminology Map

## Purpose
This map records the current Chi'llywood app navigation and product language after the Modern Navigation IA, Public V1 burn-down, and Home/Profile cleanup passes. It is a product map, not a route rewrite plan. Technical route names such as `/channel/[userId]` remain for compatibility when the user-facing concept is `Platform`.

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
- Home: launch/feed surface for hero playback, Continue Watching when backed, Live Now, Rachi Official Updates, Chi'llwood Originals, From Your Chi'lly Circle when backed, and Upcoming Events when backed. Home must not carry Top Picks, Browse, or Favorites jobs.
- Explore: backed browse/discovery surface for title search, public discovery feed rows, public creator videos, Rachi public-safe Originals, events, replays, and honest empty states.
- Live: bottom-nav entry point for choosing `Live Watch-Party`, joining `Watch-Party Live` by code, or browsing content before starting a content-first party.
- Library: current saved-title list. Broader My Stuff sections are planned only when backed.
- top Profile/avatar entry: opens the signed-in user's social identity route from normal main tabs without duplicating Profile in the bottom nav.
- top Settings entry: opens Settings from normal main tabs; detail, Profile, Platform, Studio, Admin, Player, and room surfaces keep route-local controls.
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
- `components/navigation/main-tab-top-bar.tsx` provides shared top Profile/avatar and Settings controls for Explore, Live, and Library.
- Home keeps its route-local top controls with `accessibilityLabel="Open your Profile"` and routes to `/profile/[userId]`.

## Home Status
Current implementation:
- Home no longer renders Top Picks, Browse, Favorites, Platforms You Follow, or Latest Public Uploads sections.
- The removal is product scope, not a duplicate-bug claim: Explore covers browse/discovery work, and Library covers saved/favorites work.
- Home keeps launch/feed content only: hero playback, Continue Watching when backed, Live Now, Rachi Official Updates, Chi'llwood Originals, From Your Chi'lly Circle, Upcoming Events, and the existing native ad slot.
- Rachi Official Updates render identity with backed avatar or safe `R` fallback, `Rachi`, `Official Chi'llwood`, and backed timestamp text.
- Rachi Originals public cards keep backed Rachi-owned content but mask internal proof/fixture wording from normal Home copy.
- No fake Home rows, fake Rachi posts, fake Rachi Originals, fake saved rows, fake live rooms, fake events, fake creator activity, or fake counts were added.

Android proof:
- `/tmp/chillywood-home-profile-cleanup-proof-20260529/01-home-first-view.*` captures Home first view with top Profile/Settings, bottom nav, Rachi Official Updates, and no Top Picks/Browse/Favorites labels.
- `/tmp/chillywood-home-profile-cleanup-proof-20260529/02-home-rachi-originals.*` captures Rachi identity plus Chi'llwood Originals with sanitized public copy.

## Explore Status
Current implementation:
- Searches and filters `titles`.
- Reads `readPublicDiscoveryFeedItems({ surface: "home" })` for public Platform/live/replay/discovery rows where the existing feed already exposes them.
- Reads `readLatestPublicCreatorVideos` for public creator videos.
- Reads Rachi public-safe Originals through the official Rachi account without draft/private inclusion.
- Reads `readLatestPublicEventSummaries` for public event/replay summaries.
- Renders compact backed or honest-empty sections: Search, Live Now, Platforms, Creator Videos, Chi'llwood Originals, Events, Replays, and Titles.
- Uses backed hero/title imagery when present and falls back to the Chi'llwood branded background when no backed hero image is available.
- Does not invent trending rows, creator rows, Platform rows, live state, replays, events, Rachi content, counts, or protected/private content.

Recommended next Explore phase:
- Add purpose-built Explore read models if product wants ranked search across Platforms, live rooms, Watch-Party Live entries, Live Watch-Party rooms, events, replays, Chi'llwood Originals, and Rachi official content.
- Keep each section hidden or empty-state honest until backed rows exist.
- Avoid fake trending, fake recommendations, fake viewer counts, and protected/private content leakage.
- Add ranking/read models before adding recommendation claims. Do not use placeholder creator/platform/live rows.

## Library Status
Implemented status:
- `My List` is renamed to `Library` in the bottom nav and screen copy.
- Current backed sections are Saved, Continue Watching, and Platforms.
- Saved reads `readMyListIds` and resolves only real titles.
- Continue Watching reads `readMergedWatchProgress` and resolves only titles with real progress.
- Platforms reads `readFollowedChannelUserIds` and resolves only public profile read-back rows.
- Empty state says replays, events, and clips appear only when real saved rows exist.
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
- spectator child playback
- Watch-Party Live shared-player mode
- Live Watch-Party stage context
- Premium/Party Pass/direct-room access checks
- comments, reactions, report/share, and creator-video monetization messages where backed

Audit result:
- Player now has a scoped `PlayerSurfaceMode` resolver and presentation labels for title, creator video, Spectator child playback, Watch-Party Live shared Player, and Live Watch-Party stage contexts.
- `docs/PLAYER_SURFACE_DECOMPOSITION.md` records the mode split and the deferred extraction guardrails.
- Player correctly labels its content-first room path as `Watch-Party Live`.
- `Audio Mix` remains inside Watch-Party Live shared-player controls and was not moved to Live Watch-Party, Party Room, or the Live Hub.
- Player route-gate copy distinguishes rooms that belong to Live Watch-Party from Watch-Party Live.
- `Open Party Room` remains a compatibility action only when a direct room route is appropriate.
- No full Player rewrite happened in the burn-down pass; a future Player lane can extract components only after preserving Premium gates, public/draft/private visibility, comments/reactions, report/share controls, Spectator safety, and Watch-Party Live ownership.

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
- Rachi posts/content should show a visible identity row when the card design has author identity: avatar or official fallback, `Rachi`, official label, timestamp where backed, and public-safe body/content.
- Rachi Official Updates and Chi'llwood Originals stay backed-only; no fake posts, fake Originals, fake followers, fake likes, or fake engagement are allowed.

## Profile Header And Feed Empty State
Implemented status:
- Normal main tabs show top Profile/avatar and Settings access.
- Own Profile, public Profile/Platform, Platform Studio, Admin, Player/detail, and room surfaces keep route-local controls instead of duplicate global Profile/Settings controls.
- Profile bottom nav remains hidden.
- Profile top owner action still provides Platform access.
- The Profile feed empty state no longer says `Your feed is ready when you are`.
- Owner empty state says `No posts yet`, explains that updates or photos start the Profile feed, and uses `Create Post` only to focus the existing composer.
- Viewer empty state says `No public posts yet` and does not show owner composer controls.
- The feed empty state no longer shows a random Platform CTA; Platform is already available through Profile top actions.

Android proof:
- `/tmp/chillywood-home-profile-cleanup-proof-20260529/03-explore-top-controls.*`, `04-library-top-controls.*`, and `05-live-top-controls.*` capture top controls on main tabs.
- `/tmp/chillywood-home-profile-cleanup-proof-20260529/07-profile-feed-empty-state.*` captures the cleaned owner empty state.
- `/tmp/chillywood-home-profile-cleanup-proof-20260529/08-settings-from-profile.*` and `09-platform-route-reachable.*` capture Settings and Platform reachability.

## Host Preflight Status
Implemented status:
- `app/watch-party/index.tsx` now shows a lightweight `HOST PREFLIGHT` card when a real waiting-room context exists, including title-linked Watch-Party Live entries.
- Preflight rows are Room type, Audience, Mic / Camera, Source / Content, Who can speak, Safety controls, Paid / Free status, and Start.
- The card clarifies existing state only. It does not create rooms, issue tokens, verify source rights, grant Premium, or change Party Room / Live Stage ownership.
- Android proof for a title-linked Watch-Party Live entry is `09-host-preflight-details.*` in `/tmp/chillywood-public-v1-blocker-burndown-proof-20260529/`.

Remaining preflight work:
- A fuller Live Watch-Party host preflight can be added only inside the existing `/watch-party?mode=live` owner and must preserve LiveKit token issuance, Premium gates, room creation, and old-room handling.

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
| Path | User-facing label | Access | Query params | Known ignored/deferred params |
| --- | --- | --- | --- | --- |
| `/(tabs)/index` | Home | viewer signed-in/signed-out where route allows | none required | discovery ranking params deferred |
| `/(tabs)/explore` | Explore | viewer | search text is local state | global search/ranking params deferred until read models exist |
| `/(tabs)/live` | Live | viewer; full room entry still Premium/runtime gated | none required | room-owner params are forwarded only through existing actions |
| `/(tabs)/my-list` | Library | signed-in/device-backed saved/progress state | none required | replay/event/clip anchors deferred until saved rows exist |
| `/(tabs)/profile` | hidden Profile compatibility route | signed-in; hidden from bottom nav | none required | must stay `href: null` in bottom nav |
| `/profile/[userId]` | Profile | owner, viewer, signed-out public-safe view where allowed | `userId` path param | raw storage/media params ignored |
| `/channel/[userId]` | Platform | owner/viewer/signed-out public-safe view | `preview=public` hides owner controls | technical route name remains `/channel` for compatibility |
| `/channel-studio` | Platform Studio | owner/creator | `tab`, `focus`, legacy money anchors | unsupported tabs should route to safe defaults |
| `/channel-settings` | Platform Studio compatibility | owner/creator | `tab` where supported | should keep mapping into Studio instead of becoming a new product route |
| `/player/[id]` | Player | entitlement/source/visibility gated | `partyId`, `source`, `liveMode`, `spectator`-style source params where existing owners send them | no generic fake playback/proof params |
| `/watch-party` | Watch-Party waiting room | signed-in; Premium/runtime gates before full entry | `mode=live`, `titleId`, `source`, `sourceType`, `sourceId`, `roomCode`, `roomId`, `partyId` | source eligibility remains server-owned; rights UI params ignored |
| `/watch-party/[partyId]` | Party Room | room member/host; Premium/runtime gated | `partyId` path param | Live Stage params must not retarget this route |
| `/watch-party/live-stage/[partyId]` | Live Watch-Party / Live Stage | live room member/host; Premium/runtime/LiveKit gated | `partyId` path param | Watch-Party Live shared-player params must not retarget this route |
| `/spectate/[itemId]` | Spectator | public-safe viewer metadata/playback, child-room starts require sign-in/Premium where policy requires | `itemId` path param | original token, host/member/control params must be ignored/blocked |
| `/admin` | Admin | backend-role protected owner/admin/operator | `tab`, including `tab=money-center` | normal viewer nav must not expose this |
| `/money-center` or Studio/Admin money anchors | Money Center | creator owner or Admin depending entry | creator/admin legacy `tab`/`focus` anchors | no checkout/live-money params activate behavior |

Deferred route work:
- Make Explore global only after backed read models exist.
- Add richer Library sections only after saved/followed/reminder/replay read models are backed.
- Avoid a bottom-tab Chat route until it can delegate to `/chat` without duplicate route ownership.
- Normalize legacy route params in a scoped deeplink lane without changing LiveKit, Premium, Party Room, Live Stage, Player, Profile, or Admin ownership.

## Implemented In This Pass
- Home/Profile cleanup removed Home Top Picks/Browse/Favorites because Explore/Library cover those jobs, added shared top Profile/Settings controls to Explore/Live/Library, improved Rachi identity display, cleaned Profile feed empty states, and updated guards for those boundaries.
- Public V1 burn-down kept bottom nav at Home / Explore / Live / Library and verified Profile remains top-avatar/direct-route only.
- Explore now renders backed title search, public discovery feed rows, creator videos, Rachi public-safe Originals, event summaries, replay rows where backed, and honest empty states.
- Library now renders backed Saved, Continue Watching, and Platforms sections only.
- Player now has scoped mode labels/resolution without a full component rewrite.
- Watch-Party waiting room now has a UI-only host preflight for title-linked Watch-Party Live entries.
- Navigation terminology guard now pins backed Explore/Library readers, Player mode labels, host preflight copy, bottom nav, top Profile entry, and no obvious fake/mock/sample/dummy rows in Explore/Library.
- Android proof was captured on `R5CR120QCBF` at `/tmp/chillywood-public-v1-blocker-burndown-proof-20260529/`.

## Deferred
- Full ranked/global Explore beyond existing public feed/title/creator/Rachi/event read models.
- Library replays, events, clips, downloads/offline, and reminders until saved rows/read models exist.
- Full Player component extraction.
- Full Live Watch-Party host preflight if needed inside the existing waiting-room owner.
- Risky route/deeplink query rewrites.
- Profile avatar/background runtime proof: owner route and edit trigger were visible, but the edit sheet did not open from tap/long-press in this dev-client session and no safe non-private gallery asset/read-back proof was available.
- Spectator remaining runtime proof: no fresh Live Watch-Party / Reaction fixture was available; previous Watch-Party Live and replay child-room proof remains current.
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

Public V1 burn-down proof path: `/tmp/chillywood-public-v1-blocker-burndown-proof-20260529/`.

Claimed Public V1 burn-down screenshots:
- `04-explore-current.png` / `.xml`: rebuilt Explore with backed sections and bottom nav Home / Explore / Live / Library.
- `05-library-backed-sections.png` / `.xml`: Library with Saved, Continue Watching, and Platforms backed sections or honest empty states.
- `06-player-normal-mode.png` / `.xml`: normal title Player with `CHI'LLYWOOD · PLAYER` and `Title Player` mode label.
- `09-host-preflight-details.png` / `.xml`: title-linked Watch-Party Live host preflight rows.
- `10-home-bottom-nav-top-avatar.png` / `.xml`: Home bottom nav plus `Open your Profile` top avatar entry.
- `11-top-avatar-profile-route.png` / `.xml`: top avatar opened canonical Profile.

Unclaimed captures in that folder:
- `01-*` and `02-*` are stale-bundle/dev-menu misses.
- `12-*` and `13-*` show the owner Profile avatar edit trigger still visible after tap/long-press attempts, but no edit sheet; they are blocker evidence, not proof of avatar/background save.
