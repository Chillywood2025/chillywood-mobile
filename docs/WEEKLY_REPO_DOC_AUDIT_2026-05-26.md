# Weekly Repo Doc Audit - 2026-05-26

## Scope
This audit reconciled repo documentation against commits from May 19, 2026 through May 26, 2026.

- Commit range audited: `9ceef6e` through `47fd431`
- Total commits in range: 90
- Branch at audit start: `main...origin/main`
- Untracked folders intentionally left untouched: `artifacts/`, `supabase/.temp/`

## Areas Covered
- Live Stage, Watch-Party Live, LiveKit, old-room handling, and shared-player hardening
- Admin Command Center, owner controls, legal/DMCA, Reports, Roles, Audit, and security-context proof
- Trusted network proof proxy and runtime function routing
- Settings/Premium UI, Platform Studio, Brand Studio, Clip Studio, Profile, social attachments, and Profile media
- Provider readiness, creator monetization, Money Center, Stripe/RevenueCat/Google Play readiness copy
- Spectator child-room relay, Android fixture proof, replay fixture proof, and remaining true live-stage fixture gap

## Documents Checked
- `CURRENT_STATE.md`
- `NEXT_TASK.md`
- `ROADMAP.md`
- `ROOM_BLUEPRINT.md`
- `MASTER_VISION.md`
- `PRODUCT_DOCTRINE.md`
- `ARCHITECTURE_RULES.md`
- `README.md`
- `docs/PUBLIC_V1_READINESS_CHECKLIST.md`
- `docs/EXTERNAL_SETUP_PUBLIC_V1_CHECKLIST.md`
- `docs/PUBLIC_V1_AND_LATER_SYSTEMS_PLAN.md`
- `docs/public-v1-blueprint.md`
- `docs/MONEY_CENTER_PRODUCT_POLICY.md`
- `docs/CREATOR_MONETIZATION_SYSTEMS_FOUNDATION.md`
- `docs/PROVIDER_LINK_READINESS_RUNBOOK.md`
- `docs/SPECTATOR_CHILD_ROOM_FLOW.md`
- `docs/CLIP_STUDIO.md`
- `docs/PLATFORM_BRAND_STUDIO.md`
- `docs/PROFILE_CHANNEL_PRODUCT_CONTRACT.md`
- `docs/PROFILE_CHANNEL_CONTENT_AUDIT.md`
- `docs/FULL_APP_ROUTE_OWNER_BEHAVIOR_AUDIT.md`
- `docs/FULL_APP_NON_ROOM_BEHAVIOR_AUDIT.md`
- `docs/AUDIENCE_ROLE_ROSTER_SYSTEM.md`
- `docs/legal/CREATOR_PAYOUTS_POLICY.md`
- `docs/admin/SECURITY_CONTEXT_IP_AUDIT.md`
- `docs/admin/OWNER_ADMIN_CONTROL_TOOLS.md`
- `docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md`
- Active route-owner implementation specs, release runbooks, and safety/search/audience docs that refer to Profile, Public Platform, Platform Studio, or Money Center ownership

## Findings And Updates
- Current hot-path docs already covered the major May 19-26 implementation/proof lanes: Money Center, Spectator replay fixture, Profile media, Provider readiness, Clip Studio, Brand Studio, Admin/security/legal, Settings/Premium, and LiveKit room hardening.
- Active doctrine/checklist docs still had some stale pre-consolidation creator-studio, public-surface, and old monetization framing.
- Updated active docs to the current product language:
  - `Platform Studio` is the owner creator command center.
  - `Public Platform` is the viewer-facing creator surface on `/channel/[userId]`.
  - `/channel-studio` remains the owner route and `/channel-settings` remains compatibility.
  - Money Center is the creator-facing monetization source of truth.
  - Public docs should not reintroduce retired public-surface labels as product copy.
- Route-owner specs and release/legal runbooks now keep legacy table/helper/route names as technical compatibility while using current Platform wording for product surfaces.
- Historical/archive-style docs and older proof notes were not rewritten unless they were active governance/checklist documents. Older commit history remains the detailed historical source for old wording.

## Current Remaining Gaps
- Spectator Live Watch-Party / Reaction Room success still needs a true public-safe live-stage-compatible fixture.
- RevenueCat/Google Play provider proof remains the next Money Center provider-readiness blocker; live money remains off.
- Profile avatar/background and blocked/private second-account visual proof still needs safe runtime fixtures/current native build where required.
- Public v1 release smoke, Play listing/Data Safety/account-deletion acceptance, and attorney/legal approval remain external/release blockers.

## Validation
Commands run for this audit:

- `git log --since='2026-05-19 00:00:00'`
- active-doc terminology greps for stale creator-studio, public-surface, old monetization, and related wording
- broad route-language grep across active markdown docs, excluding historical guard/proof references to forbidden copy checks
- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:money-center-policy`
- `npm run guard:spectator-child-room-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:provider-readiness-policy`
- `npm run guard:profile-production-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `git diff --check`
- `git diff --cached --check`
