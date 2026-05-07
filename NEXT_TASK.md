# NEXT TASK

## Exact Next Recommended Lane
Implement Ads Launch Foundation.

Product direction:

- AppLovin MAX is the primary ad mediation direction.
- Use a placeholder provider until AppLovin IDs are ready.
- Unity LevelPlay / Unity Ads may be added through AppLovin MAX later.
- Do not build an AdMob-only ad system.
- Free users see ads at launch; Premium users see zero ads.
- Ads must never appear inside forbidden contexts: active LiveKit rooms, active video playback, typing/commenting, upload, subscribe/payment screens, or immediately at app launch.
- Admin V1A already records Ads as foundation only; future ads work must wire real config and enforcement instead of fake toggles.

Required proof for that lane:

- provider wrapper stays disabled or placeholder-backed until real IDs/config exist
- Premium users see no ads
- free-user ad caps match the launch policy
- forbidden contexts suppress ads
- no SDK IDs, secret keys, or provider credentials are committed
- no AdMob-only system is introduced
- existing `/admin`, `/channel-studio`, `/channel-settings`, `/channel/[userId]`, Profile, Player, Watch-Party, and Live Stage behavior remains intact

## Current Product Lane Order
1. Ads Launch Foundation:
   - AppLovin MAX provider wrapper
   - placeholder provider until AppLovin IDs are ready
   - Unity LevelPlay / Unity Ads later through AppLovin MAX
   - no AdMob-only system
   - real admin on/off config
   - active-session and daily caps
   - Premium sees zero ads
   - no ads in forbidden contexts
2. 18+ age gate:
   - account creation confirms user is 18 or older
   - store confirmation safely
3. Upload/content lifecycle polish:
   - upload progress
   - processing/failed states if backed
   - thumbnail handling
   - draft/published status clarity
   - retry only if backed
4. Security/compliance/moderation pass:
   - Terms
   - Privacy Policy
   - Community Guidelines
   - DMCA/copyright policy
   - sponsorship disclosure rules
   - UGC moderation/admin review hardening
5. Admin V1B Kill Switches:
   - only after a dedicated schema/config/enforcement plan
   - switches must be real and read by affected app surfaces
6. Usage metering / ledger systems later:
   - bandwidth
   - participant-minutes
   - storage
   - revenue ledger
   - payout ledger
   - network invoices
   - sponsor deals
   - fraud holds

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
- Admin Command Center V1A is pushed at `/admin`.
- `/admin` is the canonical platform owner/operator route; do not create duplicate admin routes like `/admin-command-center`.
- Admin is separate from Channel Studio, Profile Settings, Public Channel, Chi'lly Circle, and future Room Control.
- Admin remains protected by existing signed-in plus beta/platform-role/backend permission checks. Route access, report visibility, and privileged-write boundaries were preserved, and no production admin bypass was added.
- Admin V1A sections are Home, Reports, Content, Roles, Audit, Rachi, Users, Premium, Kill Switches, Usage, Ads, Revenue, Payouts, Networks, Sponsors, Fraud, and System.
- Admin V1A keeps Reports, Content, Roles, Audit, and Rachi backed behavior working. Users, Premium, Kill Switches, Ads, Revenue, Payouts, Networks, Sponsors, Fraud, and parts of Usage/System are foundation or read-only where not backed.
- Admin V1A must not be expanded with fake money, fake usage, fake payouts, fake sponsor revenue, fake network invoices, fake fraud holds, fake ad provider state, fake kill switches, or hard-coded credentials.

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
- `/admin` is the only Admin Command Center route.
- Admin must not expose Supabase service-role keys, LiveKit secrets, RevenueCat secrets, app-store keys, provider secret keys, or any other secret.
- Test admin credentials must never be stored, printed, logged, hard-coded, or committed.

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
- Ads must not appear inside active LiveKit rooms, during active video playback, while typing/commenting, during upload, on subscribe/payment screens, or immediately at app launch.
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
