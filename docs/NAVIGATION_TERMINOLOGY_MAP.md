# Navigation Terminology Map

## Purpose
This map records the current Chi'llywood app navigation and product language after the Modern Navigation IA, Public V1 burn-down, Home/Profile cleanup, and Home Continue Watching cleanup passes. It is a product map, not a route rewrite plan. Technical route names such as `/channel/[userId]` remain for compatibility when the user-facing concept is `Platform`.

## Final Terminology
- Profile = the user's social identity hub.
- Username/handle = public user handle displayed as `@username`; it is separate from email and supports public discovery.
- Platform = the public creator surface for uploads, videos, events, live context, and backed shelves.
- Platform Studio = the signed-in owner creator control center.
- Chi'lly Circle = mutual personal connection layer. Do not replace it with generic `friends` copy.
- Chi'lly Chat = standalone inbox/direct-thread messaging, direct voice/video call invites, missed/declined/ended call cards, and room-linked chat surfaces.
- Watch-Party Live = content/player-driven watch-together flow.
- Live Watch-Party = people-first live room / Live Stage flow.
- Party Room = canonical room shell after a Watch-Party Live room exists.
- Live Room / Live Stage = canonical live room route and in-room presentation state.
- Spectator = public-safe metadata/playback state surface; it does not grant original host/member controls.
- Money Center = creator money readiness in Platform Studio and owner/admin money controls in Admin.
- Rachi = official Chi'llywood presence, not a private-chat watcher or normal friend.

## Main App Mode Map
Viewer mode:
- Home: cinematic launch/feed surface with a branded hero by default and a `Continue Watching` hero only when real progress is backed, plus Live Now, Rachi Official Updates, Chi'llywood Originals, From Your Chi'lly Circle when backed, and Upcoming Events when backed. Home must not carry Top Picks, Browse, Favorites, or random title-detail hero jobs.
- Explore: backed browse/discovery surface for title search, public people/Profile discovery, public Platform discovery, public discovery feed rows, public creator videos, Rachi public-safe Originals, events, replays, and honest empty states.
- Live: bottom-nav entry point for choosing `Live Watch-Party`, entering a `Watch-Party Live` room code, or browsing titles before starting a content-first party.
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
- Home keeps launch/feed content only: cinematic branded/Continue Watching hero, Live Now, Rachi Official Updates, Chi'llywood Originals, From Your Chi'lly Circle, Upcoming Events, and the existing native ad slot.
- Home no longer promotes a latest/programmed title into a giant hero when Continue Watching is empty. The `Chicago Streets` issue came from the former `spotlightItem` fallback chain: missing Continue Watching fell through to `programmedHeroItem`, which could fall through to `latestTitles[0]`.
- The Home hero keeps the premium cinematic look. With no eligible progress, it shows neutral Chi'llywood branding instead of a title. With eligible progress, it becomes a `Continue Watching` title hero.
- Continue Watching hero eligibility requires real playback progress: position at or above `HOME_CONTINUE_MIN_POSITION_MILLIS` (`10_000` ms), and when duration is known the ratio must be below `HOME_CONTINUE_COMPLETION_THRESHOLD` (`0.94`). The selector also requires an available title row that is not unpublished/draft/scheduled/archived/deleted/private/restricted/ticketed, sorts by the merged watch-progress last-watched timestamp, and shows only the latest eligible item. Finished, not-started, saved/favorite, unavailable, and broad discovery titles are not eligible Home hero content.
- Saved/favorite/history ownership remains Library. Browse/discovery/top-pick ownership remains Explore. A future editorial Home hero would need a distinct backed source before it can be shown.
- Rachi Official Updates render identity with backed avatar or safe `R` fallback, `Rachi`, `Official Chi'llywood`, and backed timestamp text.
- Rachi Originals public cards keep backed Rachi-owned content but mask internal proof/fixture wording from normal Home copy.
- No fake Home rows, fake progress, fake Rachi posts, fake Rachi Originals, fake saved rows, fake live rooms, fake events, fake creator activity, or fake counts were added.

Android proof:
- `/tmp/chillywood-home-continue-watching-proof-20260529/01-home-first-view.*` captures Home first view with the cinematic branded hero, top Profile/Settings, bottom nav, no giant `Chicago Streets` hero, and no Top Picks/Browse/Favorites labels.
- `/tmp/chillywood-home-continue-watching-proof-20260529/02-explore-discovery.*` captures Explore still reachable for discovery.
- `/tmp/chillywood-home-continue-watching-proof-20260529/03-library-saved.*` captures Library showing `Chicago Streets` as a real Saved item with `0` Continue Watching.
- `/tmp/chillywood-home-continue-watching-proof-20260529/04-player-opens-title.*` captures the title opening from Library/Player route instead of Home hero.
- `/tmp/chillywood-home-continue-watching-proof-20260529/05-home-originals-section.*` captures Rachi Official Updates and Chi'llywood Originals still visible after the Home cleanup.
- `/tmp/chillywood-home-profile-cleanup-proof-20260529/01-home-first-view.*` captures Home first view with top Profile/Settings, bottom nav, Rachi Official Updates, and no Top Picks/Browse/Favorites labels.
- `/tmp/chillywood-home-profile-cleanup-proof-20260529/02-home-rachi-originals.*` captures Rachi identity plus Chi'llywood Originals with sanitized public copy.

## Explore Status
Current implementation:
- Explore owns public people discovery. Profile remains the current user's identity and social feed surface, not global user search.
- Public identity rows use display name plus `@username` where backed.
- Search scopes are All, Content, People, Platforms, Originals, Live, and Events.
- Search input uses debounced typeahead/autocomplete after two characters, grouped by backed public scope with compact suggestion rows and a clear search action.
- Searches and filters `titles`.
- Reads `search_public_people` for public People/Profile results.
- Reads `readPublicDiscoveryFeedItems({ surface: "home" })` for public Platform/live/replay/discovery rows where the existing feed already exposes them.
- Reads `readLatestPublicCreatorVideos` for public creator videos.
- Reads Rachi public-safe Originals through the official Rachi account without draft/private inclusion.
- Reads `readLatestPublicEventSummaries` for public event/replay summaries.
- Renders compact backed or honest-empty sections: Search, People, Live Now, Platforms, Creator Videos, Chi'llywood Originals, Events, Replays, and Titles.
- Uses backed hero/title imagery when present and falls back to the Chi'llywood branded background when no backed hero image is available.
- Does not invent trending rows, creator rows, Platform rows, live state, replays, events, Rachi content, counts, or protected/private content.
- Public People search supports username, display name, and the current public Platform name source. It does not support email, phone, private account identifiers, private roles, or staff/security/system metadata.
- Username search is backed by canonical lowercase `user_profiles.username`; handles are displayed with `@` but stored without it.
- The Modern Username Handle System migration `20260602032030_modern_username_handle_system.sql` enforces unique case-insensitive usernames, safe format, reserved names, blocked-word protection, and username audit. See `docs/USERNAME_HANDLE_SYSTEM.md`.
- Remote-applied migration `202605290003_public_people_search_operator_proof_hardening.sql` keeps the public `search_public_people` RPC returning only public-safe fields: user id, display name, username, active avatar URL, official flag/label, public Platform flag/id, and short public bio.
- Public People search reuses `can_view_profile_content`, so private Profiles and blocked relationships stay hidden according to the existing profile policy.
- Owner/operator/moderator/security/support/system/proof/service accounts and proof/operator display markers are excluded from public People search unless they are an explicitly public official account. Rachi is the allowed explicit official result and appears as `Official Chi'llywood`.
- Owner/Admin email lookup remains an Admin/staff-only boundary. Public Explore does not add exact or partial email lookup.
- Public Explore typeahead does not expose Admin, Money, provider readiness, reports, legal requests, audit rows, or private operational data.

Owner/Admin search:
- Owner/Admin search is permission-gated inside `/admin` and never appears in public Explore or Profile.
- Admin user search can inspect username, display name, user id, and email only inside `/admin` where already allowed.
- Admin `Search Admin` typeahead searches already-loaded Admin sources only: staff/user role roster, safety reports, DMCA cases, Money Audit events, kill switches, provider readiness, Rachi posts/Originals, Live Cost Guard/Live Ops, legal requests, and immutable audit rows.
- Email lookup stays Owner/Admin-only. Admin result rows mask email identity, and public Explore never accepts email lookup or displays email.
- Admin search opens existing Admin tabs/details where backed; it does not add a new public RPC, bypass RLS, expose provider secrets/raw payloads, activate money, or change LiveKit/Watch-Party/Premium behavior.
- Query-level Admin search audit writing is now implemented through `write_admin_search_audit`. Search queries, email-shaped lookups, denied attempts, and result opens write immutable Admin audit events with search scope, query type, masked query preview, result count, status, and no raw email/plain query storage in metadata.
- Normal users cannot access the Admin Search UI or audit data. The latest proof used API/RLS denial for the non-staff proof account; Android runtime denial for the new panel remains unclaimed until a safe normal-user device session can be switched in without losing the owner/admin proof session.

Recommended next Explore phase:
- Add purpose-built Explore read models if product wants ranked search across Platforms, live rooms, Watch-Party Live entries, Live Watch-Party rooms, events, replays, Chi'llywood Originals, and Rachi official content.
- Keep each section hidden or empty-state honest until backed rows exist.
- Avoid fake trending, fake recommendations, fake viewer counts, and protected/private content leakage.
- Add ranking/read models before adding recommendation claims. Do not use placeholder creator/platform/live rows.

Android proof:
- `/tmp/chillywood-admin-search-audit-denial-spectator-profile-proof-20260529/` captures Admin Search audit writing, safe masked email lookup audit, public Explore email-blocked UI, compact Profile Photo sheet, and the safe Chi'llywood picker asset. It also records that normal-user Admin Search denial was proved through API/RLS rather than Android runtime for this lane.
- `/tmp/chillywood-explore-typeahead-admin-search-proof-20260529/` captures the Explore typeahead/Admin search production pass.
- `/tmp/chillywood-explore-typeahead-admin-search-proof-20260529/00-home-bottom-nav.*` captures the unchanged Home / Explore / Live / Library bottom nav and top controls.
- `/tmp/chillywood-explore-typeahead-admin-search-proof-20260529/01-explore-initial.*` captures Explore with public typeahead scopes.
- `/tmp/chillywood-explore-typeahead-admin-search-proof-20260529/02-explore-typeahead-content.*` captures backed content plus People suggestions and confirms the previously visible `Admin Proof` style fixture is filtered out.
- `/tmp/chillywood-explore-typeahead-admin-search-proof-20260529/03-explore-typeahead-rachi.*` captures Rachi public official/Originals search with no email visible.
- `/tmp/chillywood-explore-typeahead-admin-search-proof-20260529/04-explore-typeahead-email-blocked.*` captures public email-shaped query no-result behavior.
- `/tmp/chillywood-explore-typeahead-admin-search-proof-20260529/05-admin-search-initial.*` captures the owner/admin-only Search Admin panel.
- `/tmp/chillywood-explore-typeahead-admin-search-proof-20260529/06-admin-search-rachi.*` captures Admin search over gated operational data with masked identity display.
- `/tmp/chillywood-explore-people-search-proof-20260529/01-explore-search-scopes.*` captures Explore with public search scopes and bottom nav Home / Explore / Live / Library.
- `/tmp/chillywood-explore-people-search-proof-20260529/02-explore-people-rachi-result.*` captures the Rachi public official People result with no email visible.
- `/tmp/chillywood-explore-people-search-proof-20260529/03-people-result-profile-route.*` captures View Profile from the People result.
- `/tmp/chillywood-explore-people-search-proof-20260529/04-people-result-platform-route.*` captures View Platform from the People result.
- `/tmp/chillywood-explore-people-search-proof-20260529/05-email-query-empty.*` captures public email-query no-result behavior.
- `/tmp/chillywood-explore-people-search-proof-20260529/06-content-search-still-works.*` captures title/content search still working.
- Runtime People-result proof uses the explicit public Rachi official account; a separate normal public user/creator result should be captured only when a safe public fixture exists.

Validation:
- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:navigation-terminology-policy`
- `npm run guard:profile-production-policy`
- `npm run guard:rachi-official-policy`
- `npm run guard:public-user-search-policy`
- `npm run guard:admin-search-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run guard:refresh-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:provider-readiness-policy`
- `npm run guard:money-center-policy`
- `npm run guard:clip-studio-policy`
- `npm run guard:platform-brand-studio-policy`
- `npm run guard:spectator-child-room-policy`
- `npm run guard:content-rights-policy`
- `npm run guard:vod-quality-policy`
- `supabase db push --dry-run`
- `supabase db lint --linked --schema public --fail-on error`
- targeted source proofs for no public email search/display, staff/system exclusion, Rachi official public behavior, content search continuity, no user-facing Mini Platform/friends wording in Explore, no LiveKit/Watch-Party/Premium/Money diffs, and whitespace checks

## Library Status
Implemented status:
- `My List` is renamed to `Library` in the bottom nav and screen copy.
- Current backed sections are Saved, Continue Watching, and Platforms.
- Saved reads `readMyListIds` and resolves only real titles.
- Continue Watching reads `readMergedWatchProgress` and resolves only titles with real progress.
- Platforms reads `readFollowedChannelUserIds` and resolves only public profile read-back rows.
- Empty state says replays, events, and clips appear only when real saved rows exist.
- The Library route uses the Chi'llywood branded background behind the compact saved-title surface.

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
- It renders over the Chi'llywood branded background so the Live route does not fall back to a plain black shell.
- Main cards use one-sentence copy: `Live Watch-Party` is the primary people-first live-room path, `Enter Watch-Party Code` is the room-code utility for content-first Watch-Party Live rooms, and `Browse Titles` starts from content discovery.
- Long technical copy such as route ownership and waiting-room internals is removed from the main cards.

Route map:
- `Open Live` keeps the existing Premium/runtime preflight, then opens `/watch-party?mode=live`.
- `Enter Code` opens `/watch-party` for the existing Watch-Party Live waiting-room/code path.
- `Browse Titles` opens Explore.
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
- Implementation note: `/channel-studio` is the preferred owner-facing route; `app/channel-studio/index.tsx` is a thin wrapper over the existing `ChannelStudioScreen` implementation in `app/channel-settings.tsx` so legacy deep links keep resolving without creating a second product surface.
- Profile `View Platform` and Platform Studio `Preview Platform` map to `/channel/[userId]` with public-preview safeguards.
- Brand Studio edits Platform branding, not Profile photo/background.
- Settings and support copy should say Platform when the product means the public creator surface.

## Chi'lly Circle / Chat / Rachi Check
- Primary social-circle copy uses `Chi'lly Circle`; internal helper names may still use friend/friendship for compatibility.
- Messaging copy uses `Chi'lly Chat`.
- Rachi remains `Official Chi'llywood`, appears through canonical public-safe surfaces, and is not positioned as a private-chat watcher.
- Rachi posts/content should show a visible identity row when the card design has author identity: avatar or official fallback, `Rachi`, official label, timestamp where backed, and public-safe body/content.
- Rachi Official Updates and Chi'llywood Originals stay backed-only; no fake posts, fake Originals, fake followers, fake likes, or fake engagement are allowed.

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
- Route contract guard now pins core route doctrine: Party Waiting Room to Party Room, Live Waiting Room to Live Stage, Player/Title content-first Watch-Party Live handoff, paid room-ticket buyers staying out of Live Stage, preferred Platform Studio route vs compatibility wrapper, Chi'lly Chat canonical routes, and Premium separation from creator purchases.
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
- `npm run guard:route-contracts`
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
