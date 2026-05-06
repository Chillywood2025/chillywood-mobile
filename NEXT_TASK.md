# NEXT TASK

## Exact Next Recommended Lane
Implement the Free vs Premium live gate update.

Product decision:

- all full live/watch-party access becomes Premium
- Live First is no longer free full access
- free users do not receive a full LiveKit token
- free preview is allowed only if the prompt explicitly specifies the safe preview behavior, duration, UI copy, token restrictions, and proof
- Premium remains backed by RevenueCat / backend entitlement truth, not local-only cache
- do not change Player controls, Watch-Party layout, Live Stage layout, creator comments, Channel Studio, public Channel, Chi'lly Circle, profile privacy, ads, billing/payout systems, storage, RLS, or migrations unless the prompt explicitly scopes and proves the change

Required proof for that lane:

- signed-out live/watch-party deep links are blocked or redirected according to existing auth behavior
- signed-in free users cannot enter full Live First, Live Watch-Party, or Watch-Party Live
- signed-in Premium users can enter the full allowed live/watch-party paths
- no free full LiveKit token is minted
- any free preview, if built, cannot become full room access by deep link, stale state, or hidden button
- existing `/channel-studio`, `/channel-settings`, `/channel/[userId]`, Profile View Channel, and Studio Preview Channel routes still work

## Next Product Lanes After Live Gate
1. Admin Command Center V1:
   - Revenue
   - Usage
   - Ads
   - Payouts foundation
   - Network Plans foundation
   - Sponsor Deals foundation
   - Fraud Holds
   - Kill Switches
2. Ads launch foundation:
   - AppLovin MAX provider wrapper
   - placeholder provider until AppLovin IDs are ready
   - admin on/off
   - active-session and daily caps
   - Premium sees zero ads
3. 18+ age gate.
4. Upload/content lifecycle polish.
5. Security/compliance/moderation pass.
6. Public Channel streaming-network visual correction only if a later proof identifies remaining issues.

## Current Pushed Truth To Preserve
- Premium gate foundation is pushed.
- Chi'lly Circle V1 is pushed.
- Chi'lly Circle profile privacy is pushed.
- Channel Studio Phase 1 rename/organization is pushed.
- Channel Studio Phase 2A shell is pushed at `/channel-studio`.
- `/channel-settings` compatibility is preserved.
- Channel Studio Home dashboard correction is pushed.
- Public Channel Phase 2B is pushed at `/channel/[userId]`.
- Public Channel visual polish and streaming-network correction are pushed.
- Profile View Channel routes to `/channel/[userId]`.
- Studio Preview Channel routes to `/channel/[ownUserId]`.

## Product Truth To Preserve
- Profile = person/social identity.
- Channel = public mini streaming platform/network.
- Channel Studio = owner-only creator operating system.
- Follow = channel audience.
- Chi'lly Circle = personal mutual friendship/connection.
- Subscribers = monetized channel supporters later.
- Public Channel must not leak owner-only controls to non-owners.
- Public Channel must not show drafts/private/unpublished content.
- Channel Studio is owner-only.
- Admin is platform/operator authority, not creator/channel owner authority.

## Locked Business Decisions
- Launch planned as 18+.
- Free users see ads at launch.
- Premium users see no ads.
- Planned Premium price: `$9.99/month` and `$99/year`.
- Full live/watch-party access becomes Premium in the next gate lane.
- Ads support free browsing.
- Premium supports expensive live usage.
- RevenueCat remains Premium subscription truth.
- AppLovin MAX is primary ad mediation direction; Unity LevelPlay / Unity Ads may come through AppLovin MAX later.
- Do not build AdMob-only ads.
- Ads launch cap: base active session 3 interstitial + 1 native/feed; after 2 active browsing hours +2 interstitial + 1 native/feed; daily cap 6 interstitial + 3 native/feed; Premium sees zero ads.
- Storage doctrine: Cloudflare R2 for public/high-download media; Hetzner Object Storage for source/original uploads, drafts, backups, archive, private/held/deleted media; Hetzner/OVH boxes for LiveKit and real-time live/watch-party traffic.

## Prompt Standard
Future Chi'llywood prompts must be production-grade and include exact product truth, exact scope, route/screen purpose, UI layout, buttons/actions, data sources, empty/loading/error states, permissions/gates, backend/RLS/storage limits, forbidden areas, validation/manual proof, and report format.

Do not proceed from vague prompts like "modernize", "polish", "add filters", "add route", or "improve dashboard" unless every behavior is spelled out.

## Validation Baseline
Use the lane-specific prompt for validation. Default baseline remains:

- `git status --short`
- branch and HEAD
- scoped diff check
- `npm run typecheck` for app/runtime code changes
- `git diff --check`
- targeted Android/manual proof when UI, routing, gates, or device behavior changed

## Staging Discipline
- Do not stage `artifacts/`.
- Do not stage `supabase/.temp/`.
- Stage only task-pure files.
- Before commit, show `git diff --cached --name-only` and confirm no unrelated files are staged.
