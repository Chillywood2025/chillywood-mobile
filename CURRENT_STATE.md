# CURRENT STATE

## Hot-Path Control Rule
This file is intentionally compact. Keep current truth here, keep detailed proof output in artifacts or `/tmp`, and do not load archived checkpoint history during normal preflight unless a historical reconciliation task explicitly asks for it.

Full checkpoint history through April 24, 2026 is preserved at `docs/archive/current-state-history-through-2026-04-24.md`. Later detailed proof history is available in git history and task artifacts; this hot-path file should carry only the current governing facts future sessions must not undo.

## Current Checkpoint
Current `main` is production-grade Public v1 hardening with Admin Command Center V1A pushed. The Admin V1A checkpoint is committed at `2690367912e4f10309d09d08433be25662028ed3`.

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
- Admin Command Center V1A is pushed on the canonical `/admin` route. Do not create duplicate admin routes such as `/admin-command-center`. Admin is platform owner/operator authority and must remain separate from Channel Studio, Profile Settings, Public Channel, Chi'lly Circle, and future Room Control.
- Admin remains protected by existing signed-in plus beta/platform-role/backend permission checks. Route access, report visibility, and privileged-write boundaries were preserved. Admin V1A did not add a production admin bypass.
- `/admin` now presents as `Admin Command Center` with Home, Reports, Content, Roles, Audit, Rachi, Users, Premium, Kill Switches, Usage, Ads, Revenue, Payouts, Networks, Sponsors, Fraud, and System sections. Home includes Platform Snapshot and Needs Attention.
- Existing backed admin areas remain real: Reports uses the existing safety report/admin moderation surfaces; Content preserves creator-video moderation, title programming, and admin content behavior; Roles preserves platform role visibility; Audit is an audit summary, not a full immutable audit-log system; Rachi identity/admin display remains present, but Rachi does not grant operator permissions.
- Admin V1A foundation areas must stay honest: Users search is not connected yet; Premium is read-only/foundation and RevenueCat remains Premium truth; Kill Switches lists foundation rows only; Usage shows DB-estimate live/watch-party/upload signals where available and says bandwidth, LiveKit, and participant-minute metering are not connected yet; Ads is foundation only with AppLovin MAX direction and no SDK/ad IDs/provider init/rendering; Revenue, Payouts, Networks, Sponsors, and Fraud must not show fake money, fake balances, fake invoices, fake sponsor revenue, fake network billing, fake holds, or working payout/sponsor/fraud flows.
- Test admin account access may remain active for future proof sessions, but credentials must never be stored, printed, logged, hard-coded, or committed. Admin must never expose Supabase service-role keys, LiveKit secrets, RevenueCat secrets, app-store keys, provider secret keys, or any other secret.

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
- `/admin` is the canonical platform owner/operator Admin Command Center route.
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
- Ads must not appear inside active LiveKit rooms, during active video playback, while typing/commenting, during upload, on subscribe/payment screens, or immediately at app launch.
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

1. Ads Launch Foundation: AppLovin MAX provider wrapper, placeholder provider until AppLovin IDs are ready, Unity LevelPlay / Unity Ads later through AppLovin MAX, no AdMob-only system, real admin on/off config, session/daily caps, Premium no ads, and no ads in forbidden contexts.
2. 18+ age gate: account creation confirms the user is 18 or older and stores that confirmation safely.
3. Upload/content lifecycle polish: upload progress, backed processing/failed states, thumbnail handling, draft/published clarity, and retry only where backed.
4. Security/compliance/moderation pass: Terms, Privacy Policy, Community Guidelines, DMCA/copyright policy, sponsorship disclosure rules, and UGC moderation/admin review hardening.
5. Admin V1B Kill Switches: only after a dedicated schema/config/enforcement plan; switches must be real and read by affected app surfaces.
6. Later usage metering and ledger systems: bandwidth, participant-minutes, storage, revenue ledger, payout ledger, network invoices, sponsor deals, and fraud holds.

## Validation Truth
Latest pushed live access work was checked with `npm run typecheck` and `git diff --check` before commit/push. Free-user runtime proof showed the Home live entry displays the Premium sheet and does not route into `/watch-party`, generate a room code, or request/connect LiveKit; direct `/watch-party?mode=live` was blocked with the same Premium gate. Existing Premium paths were intentionally preserved, but a real entitlement-backed Premium account proof should still be done later when available.

Admin Command Center V1A was checked with `npm run typecheck` and `git diff --check`, then runtime-smoked on Android. Proof passed for signed-out denial, admin/operator access through backend membership, default Home, all Admin V1A tabs opening, foundation-only honesty, no fake money/action systems, System not exposing secrets in UI, and route smoke for Channel Studio, Channel Settings, public Channel, Profile, Player, Watch-Party, and Live Stage. Separate non-admin denial proof with a known non-admin account remains pending.

## Staging Discipline
- Work on current `main` only.
- Keep unrelated local dirt out of the checkpoint.
- Never stage `artifacts/`.
- Never stage `supabase/.temp/`.
- Stage only task-pure files for the active lane.
