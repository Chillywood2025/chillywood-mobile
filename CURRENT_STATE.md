# CURRENT STATE

## Hot-Path Control Rule
This file is intentionally compact. Keep current truth here, keep detailed proof output in artifacts or `/tmp`, and do not load archived checkpoint history during normal preflight unless a historical reconciliation task explicitly asks for it.

Full checkpoint history through April 24, 2026 is preserved at `docs/archive/current-state-history-through-2026-04-24.md`. Later detailed proof history is available in git history and task artifacts; this hot-path file should carry only the current governing facts future sessions must not undo.

## Current Checkpoint
Current `main` is production-grade Public v1 hardening with the latest full live/watch-party Premium gate pushed. The newest access-gate correction is committed at `cbdd6c0a59ddc55ba0a41653fd930f34556a0086`.

Already pushed and to be preserved:

- Premium gate is pushed: all full live/watch-party access is Premium. Live First is no longer free; Live Watch-Party and Watch-Party Live remain Premium. Free users are blocked before full room/session/token/connect, receive no full LiveKit room/token/connect access, and no free preview mode was added. Premium users keep the existing full live/watch-party flows.
- Chi'lly Circle V1 is pushed: request, accept, decline, cancel, remove, My Chi'lly Circle management, Follow separation, and channel-audience block override.
- Chi'lly Circle profile privacy is pushed: Everyone, Chi'lly Circle Only, and Private, with backend/RLS tightening so locked-profile posts, comments, and attachments do not leak through old read paths.
- Channel Studio Phase 1 is pushed: Manage Channel was renamed and organized as Channel Studio.
- Channel Studio Phase 2A is pushed: `/channel-studio` is the preferred owner Studio shell with Home, Content, Live, Audience, Insights, and Brand tabs; `/channel-settings` remains a compatibility route.
- Channel Studio Home dashboard correction is pushed: compact dashboard-first Home, Today's Snapshot before Quick Actions, compact Quick Actions, Needs Attention, Latest Content, and minor Later/Roadmap at the bottom.
- Public Channel Phase 2B is pushed: `/channel/[userId]` is the public viewer-facing Channel route, Profile View Channel routes to `/channel/[userId]`, Studio Preview Channel routes to `/channel/[ownUserId]`, not-found/unavailable states exist, and the public Channel has hero, Featured, Latest Uploads, Live & Upcoming, and About sections.
- Public Channel visual polish and streaming-network visual correction are pushed: the public route is a media/network destination with a channel hero, backed Channel Pulse row, Featured spotlight, Latest Uploads shelf, programming-style Live & Upcoming, and final About card. Public Channel uses viewer-facing `Play`, not owner management labels, never exposes Upload/Edit/Publish/Unpublish/Delete to non-owners, never shows drafts/private/unpublished videos, and may show owner-only Open Channel Studio only to the channel owner.
- Centralized live/watch-party Premium access runs through the existing Premium access helper layer, including `canUseLiveFirst`, `canUseLiveWatchParty`, `canUseWatchPartyLive`, `requireLiveFirstPremium`, `requireLiveWatchPartyPremium`, and `requireWatchPartyLivePremium`. Strict live/watch-party gates ignore dev Premium bypass behavior where needed so free-user blocking can be proved.

## Product Truth
- Chi'llywood is production-grade now; future Codex prompts must be exact and scoped, not vague.
- Profile = person/social identity.
- Channel = public mini streaming platform/network.
- Channel Studio = owner-only creator operating system.
- Follow = channel audience.
- Chi'lly Circle = personal mutual friendship/connection.
- Subscribers = monetized channel supporters later.
- Keep Profile, Channel, Channel Studio, Chi'lly Circle, Follow, Subscribers, and Admin concepts separate.
- Public Channel must never show owner-only controls to non-owners.
- Public Channel must never show drafts, private videos, or unpublished content.
- Channel Studio is owner-only.
- `/channel/[userId]` is the public Channel route.
- `/channel-studio` is the preferred owner Studio route.
- `/channel-settings` remains compatibility and must continue to resolve.

## Locked Business Decisions
- Launch is planned as 18+.
- Free users see ads at launch.
- Premium users see no ads.
- Planned Premium price is `$9.99/month` and `$99/year`.
- Full live/watch-party access is Premium and must not be made free again without an explicit product decision.
- Free users do not get full Live First, Live Watch-Party, Watch-Party Live, or full LiveKit room/token/connect access.
- Free preview was not added. Any future live/watch-party preview must be a separate, explicitly scoped, limited, low-cost, separately gated pass.
- Ads support free browsing.
- Premium supports expensive live usage.
- RevenueCat remains the Premium subscription truth owner.
- AppLovin MAX is the primary ad mediation direction.
- Unity LevelPlay / Unity Ads may be added through AppLovin MAX later.
- Do not build an AdMob-only ad system.
- Ads launch cap: base active session allows 3 interstitial plus 1 native/feed; after 2 active browsing hours allow +2 interstitial plus +1 native/feed; daily cap is 6 interstitial plus 3 native/feed; Premium sees zero ads.
- Storage doctrine: Cloudflare R2 for public/high-download media; Hetzner Object Storage for source/original uploads, drafts, backups, archive, and private/held/deleted media; Hetzner/OVH boxes for LiveKit and real-time live/watch-party traffic.

## Prompt Standard
All future Codex prompts for Chi'llywood must be production-grade:

- exact product truth
- exact scope
- exact route/screen purpose
- exact UI layout
- exact buttons/actions
- exact data sources
- exact empty/loading/error states
- exact permissions/gates
- exact backend/RLS/storage limits
- exact forbidden areas
- exact validation/manual proof
- exact report format

Do not accept vague prompts such as "modernize", "polish", "add filters", "add route", or "improve dashboard" unless every behavior is spelled out.

## Current Next Action
Recommended next lanes, in order:

1. Admin Command Center V1: Revenue, Usage, Ads, Payouts foundation, Network Plans foundation, Sponsor Deals foundation, Fraud Holds, and Kill Switches.
2. Ads launch foundation: AppLovin MAX provider wrapper, placeholder provider until AppLovin IDs are ready, Unity LevelPlay / Unity Ads later through AppLovin MAX, no AdMob-only system, admin on/off, session/daily caps, and Premium no-ads enforcement.
3. 18+ age gate.
4. Upload/content lifecycle polish.
5. Security/compliance/moderation pass.

## Validation Truth
Latest pushed live access work was checked with `npm run typecheck` and `git diff --check` before commit/push. Free-user runtime proof showed the Home live entry displays the Premium sheet and does not route into `/watch-party`, generate a room code, or request/connect LiveKit; direct `/watch-party?mode=live` was blocked with the same Premium gate. Existing Premium paths were intentionally preserved, but a real entitlement-backed Premium account proof should still be done later when available.

## Staging Discipline
- Work on current `main` only.
- Keep unrelated local dirt out of the checkpoint.
- Never stage `artifacts/`.
- Never stage `supabase/.temp/`.
- Stage only task-pure files for the active lane.
