# NEXT TASK

## Exact Next Recommended Lane
Implement Admin Command Center V1.

Product direction:

- Admin is platform/operator authority, not creator/channel owner authority.
- Admin Command Center V1 should focus on Revenue, Usage, Ads, payout/network-plan/sponsor-deal foundations, Fraud Holds, and Kill Switches.
- Keep it backend-authorized and operator-only.
- Do not blur Admin with Channel Studio, Profile, Chi'lly Circle, public Channel, Premium entitlement ownership, or creator payout systems unless the prompt explicitly scopes and proves the change.

Required proof for that lane:

- signed-out and non-operator users are denied by backend/platform-role truth
- operator users see only backed controls
- no fake revenue, payout, ad, sponsor, or network-plan data appears
- sensitive mutations have confirmation and audit posture where backed
- existing `/channel-studio`, `/channel-settings`, `/channel/[userId]`, Profile View Channel, Studio Preview Channel, Player, Watch-Party, and Live Stage routes still work

## Current Product Lane Order
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
   - AppLovin MAX primary/provider wrapper
   - placeholder provider until AppLovin IDs are ready
   - Unity LevelPlay / Unity Ads later through AppLovin MAX
   - no AdMob-only system
   - admin on/off
   - active-session and daily caps
   - Premium sees zero ads
3. 18+ age gate.
4. Upload/content lifecycle polish.
5. Security/compliance/moderation pass.

## Current Pushed Truth To Preserve
- Premium gate is pushed.
- Free vs Premium full live/watch-party gate is pushed: all full Live First, Live Watch-Party, and Watch-Party Live access is Premium.
- Free users are blocked before full room/session/token/connect and receive no full LiveKit room/token/connect access.
- No free live/watch-party preview mode was added.
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
- Full live/watch-party access is Premium and must not be made free again without an explicit product decision.
- Free users may only get live/watch-party preview in a separate future pass if explicitly designed safely; no preview mode exists now.
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
