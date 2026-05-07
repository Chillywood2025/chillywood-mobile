# Chi'llywood Owner Admin + Rachi Control Implementation Spec

2026-05-06 current-route note: creator owner controls live in Channel Studio on `/channel-studio`; `/channel-settings` remains compatibility. Platform/operator controls live in Admin Command Center on `/admin`.

## 1. Purpose And Scope
This document defines Chi'llywood's owner-admin / admin-workflow / Rachi-control chapter.

It is implementation doctrine, not a promise that every admin or AI-ops control already exists.

It exists to:
- preserve clear authority boundaries between owner, staff admin, and Rachi
- define the bounded admin/control architecture using current route truth
- define what current repo truth already supports
- define what must remain owner-only
- define how future staff/admin roles and Rachi-control layers should expand without turning `/admin` into a messy god-panel

This chapter does not:
- rewrite public/product route doctrine
- let Rachi outrank owner authority
- pretend automation, emergency controls, or business tools are real when they are not
- put raw owner credentials in repo code, docs, or client bundles

## 2. Current Doctrine That Must Be Preserved

### 2.1 Locked Route Truth
| Route | Owner File | Doctrine |
| --- | --- | --- |
| `/admin` | `app/admin.tsx` | Canonical platform owner/operator Admin Command Center. |
| `/channel-studio` | `app/channel-studio/index.tsx` | Preferred creator control center, not the platform admin console. |
| `/channel-settings` | `app/channel-settings.tsx` | Compatibility route for older owner Studio links. |
| `/profile/[userId]` | `app/profile/[userId].tsx` | Canonical personal/social Profile route, including official-platform identities like Rachi. |
| `/channel/[userId]` | `app/channel/[userId].tsx` | Canonical public Channel route; must not expose platform admin controls. |
| `/chat`, `/chat/[threadId]` | `app/chat/index.tsx`, `app/chat/[threadId].tsx` | Canonical Chi'lly Chat routes, including official-platform thread continuity. |

Do not create route proliferation in this chapter.

### 2.2 Authority Rules
- Owner / Super Admin is above Rachi.
- Rachi is an internal AI operations layer, never the final authority.
- Creator-facing controls stay separate from admin-facing controls.
- Owner-only controls must not leak to general admins or creators.
- Meaningful admin and Rachi actions should remain auditable where current truth supports it.
- `/admin` stays bounded; deeper sections should remain current-route-compatible if added later.
- Do not create duplicate admin routes such as `/admin-command-center`.

### 2.3 Three-Mode Structure
Chi'llywood should preserve three distinct modes:

1. `User / Creator Mode`
   - public/product and creator/channel workflows
   - canonical owners remain `/profile/[userId]`, `/channel/[userId]`, `/channel-studio`, `/channel-settings` compatibility, title/player, chat, and room routes

2. `Admin Mode`
   - bounded staff/operator workflows
   - review, queue, content/config visibility, and platform operations that current truth really supports
   - current owner remains `/admin`

3. `Emergency / Super-Admin Mode`
   - highest-authority owner-only controls
   - reserved for emergency/system authority, Rachi overrides, and other irreversible or platform-wide actions
   - not currently implied by the existing operator/moderator model

## 3. Current Owner / Admin / Rachi Truth Already In Repo

### 3.1 Current Admin Truth
Current repo truth supports Admin Command Center V1A through:
- `app/admin.tsx`
- `_lib/moderation.ts`
- `platform_role_memberships`
- current app configuration and content-management controls already present in `/admin`

Currently real:
- role-aware access into `/admin`
- moderation queue visibility for active `operator` / `moderator` memberships
- privileged admin writes gated more tightly than simple admin visibility
- content/programming/config management already living on `/admin`
- creator monetization grant controls already living on `/admin`
- Admin Command Center presentation on the canonical `/admin` route
- Admin Home with Platform Snapshot and Needs Attention
- section tabs for Home, Reports, Content, Roles, Audit, Rachi, Users, Premium, Kill Switches, Usage, Ads, Revenue, Payouts, Networks, Sponsors, Fraud, and System
- Reports, Content, Roles, Audit, and Rachi backed behavior preserved
- Users, Premium, Kill Switches, Ads, Revenue, Payouts, Networks, Sponsors, Fraud, and portions of Usage/System presented as read-only or foundation-only where backing is not connected
- Ads Launch Foundation V1A/V1B/V1C status in Admin Ads as read-only/foundation: placeholder/not-connected provider, Home native/feed placeholder foundation, placeholder interstitial controller foundation, launch caps, forbidden contexts, AppLovin MAX future direction, Unity through AppLovin MAX future direction, no AdMob-only doctrine, and CTV future-only copy

Currently not real:
- full immutable admin audit logs
- user search, ban, suspend, restrict, upload-disable, live-disable, or entitlement-edit tools
- manual Premium toggles or subscription editing
- working runtime kill switches beyond current Premium access logic labels
- real ad SDKs, real ad IDs, real ad provider initialization, real ad rendering, CTV inventory, or ad revenue
- fake MRR, ARR, creator earnings, sponsor revenue, payout balances, invoices, network billing, or payout execution
- sponsor checkout/upload/approval or payout split execution
- working fraud holds, payout pauses, account restrictions, or risk scores
- bandwidth, LiveKit, participant-minute, storage billing, revenue-ledger, payout-ledger, network-invoice, sponsor-deal, or fraud-hold ledgers

### 3.2 Current Creator-Side Safety/Admin Truth
Current creator-side summary truth already exists in:
- `_lib/channelReadModels.ts`
- `app/channel-settings.tsx`

This truth is summary-only:
- creator safety/admin visibility
- role-aware recent queue summary
- audience/admin adjacent summaries

It is not:
- the platform admin queue
- the owner console

### 3.3 Current Rachi Truth
Current Rachi truth is real but narrow:
- `_lib/officialAccounts.ts` defines Rachi as the protected official platform account
- Rachi already lives on canonical profile and Chi'lly Chat surfaces
- moderation/access helpers already recognize `official_platform` as a distinct actor role
- current trust posture is identity-level and audit-minded, not automation-control-level

Current Rachi truth does not yet mean:
- a rule engine
- an automation queue
- domain pause/resume controls
- autonomous enforcement powers

## 4. Exact Authority Model

### 4.1 Owner / Super Admin
Owner authority is the highest platform authority in this chapter.

Owner-only truth should eventually control:
- platform-wide admin access authority
- staff-role assignment / revocation
- Rachi global enable/disable
- Rachi domain-level approval/pause state
- emergency mode
- irreversible overrides
- protected bootstrap and credential recovery flows

Owner authority must stay above:
- operator
- moderator
- creator/channel owner
- Rachi

### 4.2 Staff Admin
Staff admin is below owner and should split into bounded role layers over time.

Near-term honest roles:
- `operator`
- `moderator`

Future roles may expand later, but current doctrine should not pretend they already exist.

### 4.3 Rachi
Rachi is an internal AI operations layer and official platform identity.

Allowed maturity ladder:
- `Observe Only`
- `Assist / Recommend`
- `Limited Auto-Action`
- higher-trust automation later only if explicitly backed

Rachi must never become:
- final authority over owner decisions
- an unreviewed enforcement engine by default
- a hidden control plane with no audit trail

## 5. What Stays Owner-Only
- owner bootstrap and owner-role assignment
- staff-role assignment and revocation
- platform-wide Rachi enable/disable
- domain-level Rachi pause/resume
- emergency-mode entry/exit
- irreversible overrides
- owner-only audit visibility if future deeper audit trails land
- any cross-domain kill-switch behavior

These must not leak to:
- ordinary creators
- moderators
- general operators unless current truth explicitly permits it
- Rachi itself

## 6. Future Staff/Admin Roles And Boundaries

### 6.1 Current Honest Roles
- `operator`
  - can access `/admin`
  - can manage currently supported privileged admin writes
  - can review moderation queue where backed

- `moderator`
  - can review moderation queue where backed
  - should not implicitly inherit owner/system powers

### 6.2 Later-Phase Roles
Later only, unless future work proves otherwise:
- support staff
- monetization reviewers
- creator-review staff
- analytics staff
- owner delegates with partial system power

Do not pretend these are already real.

## 7. Rachi Domains
Rachi domains should remain separable at minimum:
- Moderation
- Support
- Monetization Review
- Creator Review
- Live Room Risk

Current doctrine:
- domain separation is approved
- real domain controls must not appear until backing truth exists

## 8. Current Source-Of-Truth Already In Repo
- `app/admin.tsx` for current bounded admin/operator surface
- `_lib/moderation.ts` for moderation access, queue, actor-role, and review truth
- `_lib/officialAccounts.ts` for canonical Rachi identity truth
- `app/profile/[userId].tsx` and `app/chat/*` for canonical official-platform route continuity
- `platform_role_memberships` for current staff-role membership truth
- `_lib/channelReadModels.ts` and Channel Studio (`app/channel-settings.tsx` implementation, `app/channel-studio/index.tsx` route) for creator-side admin/safety summary truth
- `app/admin.tsx` for Admin Command Center V1A section structure and foundation-only copy
- Ads V1A foundation source files: `_lib/ads/adConfig.ts`, `_lib/ads/adEligibility.ts`, `_lib/ads/adProvider.ts`, `_lib/ads/providers/placeholder.ts`, `_lib/ads/adSession.ts`, `hooks/useAdEligibility.ts`, and `hooks/useActiveBrowsingTime.ts`
- Ads V1B source files: `components/ads/NativeAdSlot.tsx`, Home placement in `app/(tabs)/index.tsx`, native/feed cap proof support in `_lib/ads/adSession.ts`, and read-only/foundation Admin Ads copy in `app/admin.tsx`
- Ads V1C source files: `components/ads/InterstitialController.tsx`, root mount in `app/_layout.tsx`, and read-only/foundation Admin Ads copy in `app/admin.tsx`
- Admin Usage Metering Foundations 37-39 source files: `_lib/platformUsage.ts`, read-only Admin Usage copy in `app/admin.tsx`, and local migration `supabase/migrations/202605070003_platform_usage_metering_foundation.sql`
- Ledger Systems 4A-4D finance foundation source files: `_lib/platformFinance.ts`, read-only Admin Revenue/Payouts/Networks/Sponsors/Fraud copy in `app/admin.tsx`, and local migration `supabase/migrations/202605070004_platform_finance_ledger_foundation.sql`
- Admin V1B2A source files: `app/(auth)/signup.tsx` and read-only/foundation Admin Kill Switches copy in `app/admin.tsx`; New Accounts is enforced on signup only
- Admin V1B2B source files: `app/channel-settings.tsx` and read-only/foundation Admin Kill Switches copy in `app/admin.tsx`; Uploads is enforced on new creator-video upload submit only

## 9. Missing Truth That Still Needs To Be Built
- explicit owner / super-admin role truth
- safe owner bootstrap path
- owner-only gate truth
- additional Admin V1B kill switches backed by schema/config/enforcement and real reads from affected app surfaces; current real enforcement is limited to `new_accounts_enabled` on signup and `uploads_enabled` on new creator-video upload submit
- audit-log structure beyond current moderation/report context
- real Rachi-control state and domain controls
- real emergency/system controls
- real user search and user restriction tools
- real Admin Ads write controls backed by schema/config/enforcement and real app-surface reads
- real AppLovin MAX integration after external account/app/ad-unit setup
- real revenue, payout, network billing, sponsor-deal, fraud-hold, bandwidth, storage, LiveKit, and participant-minute ledger systems

## 10. Safe Owner Bootstrap Doctrine
- raw owner credentials must not be committed to source, docs, screenshots, or client code
- test admin credentials may remain active for future proof sessions, but must never be stored, printed, logged, hard-coded, or committed
- bootstrap must happen only through:
  - a safe server-side/admin bootstrap path
  - or a clearly isolated local setup path that reads credentials from ephemeral input or environment
- if first-login password rotation can be supported honestly, it should be wired
- if it cannot be supported yet, the exact manual follow-up must be documented outside committed secrets
- no client-bundled owner bootstrap path is allowed

## 11. Exact Surface Areas For This Chapter

### 11.1 Must Stay Public/Product
- `/profile/[userId]`
- `/channel-settings`
- title/player
- room routes
- `/chat`

These must not become admin consoles.

### 11.2 Canonical Admin Surface
- `/admin`

`/admin` should grow in bounded sections, not into an undifferentiated all-powerful page.

Target section families for phased rollout:
- Home
- Reports
- Content
- Roles
- Audit
- Rachi
- Users
- Premium
- Kill Switches
- Usage
- Ads
- Revenue
- Payouts
- Networks
- Sponsors
- Fraud
- System

Admin V1A already presents these sections, but many are foundation-only. Current doctrine does not imply every section is active or backed.

## 12. Exact Phased Implementation Order
1. Admin Command Center V1A is pushed: canonical `/admin`, backed admin behavior preserved, and missing business systems shown honestly as foundation-only.
2. Ads Launch Foundation V1A is pushed: provider-neutral config, eligibility, placeholder provider, active browsing time, session/daily caps, and read-only/foundation Admin Ads status; no SDK, real ad IDs, provider initialization, real rendering, CTV inventory, or fake revenue.
3. Ads V1B Native/feed placeholder placement is pushed: one labeled placeholder/native slot on Home only, respecting Premium no ads, V1A eligibility/caps, and forbidden contexts, with normal runtime hidden because `ads_enabled=false`.
4. Ads V1C Interstitial controller is pushed: placeholder interstitial first, safe transitions only, no app-launch ad, 180-second first delay, 600-second spacing, session/daily caps, forbidden contexts, no SDK, no real IDs, no real rendering, and no fake revenue.
5. Real AppLovin MAX integration later only after external setup is ready; keep provider wrapper architecture and no AdMob-only path.
6. Admin V1B Kill Switches only after a dedicated schema/config/enforcement plan.
7. Admin Usage Metering Foundations 37-39 is pushed: local schema/helper/read-only Admin Usage foundation for future `bandwidth_bytes`, `participant_minutes`, and `storage_bytes` metering, with storage shown only as metadata estimate, participant-minutes shown only as DB estimate, and bandwidth still `Not connected yet` unless future real metering rows exist. The local migration was not applied remotely in the foundation pass.
8. Usage remote migration/type refresh and event writers later only under a separately authorized Supabase/app-surface prompt.
9. Ledger Systems 4A-4D finance foundation is pushed: local schema/helper/read-only Admin foundation for future finance ledger events, creator payout ledger entries, network billing accounts, network invoice records, sponsor deal records, and platform fraud holds. No remote finance migration, generated type edit, provider integration, payout execution, invoice action, sponsor checkout, payout split execution, or fraud enforcement is active.
10. Finance remote migration/type refresh and provider/event writers later only under a separately authorized Supabase/provider prompt.
11. Real Rachi-control state and domain controls later only when backed.
12. Advanced owner/super-admin controls only if justified by real backing and proof.

## 13. What Not To Do
- do not build a messy god-panel
- do not let Rachi outrank owner authority
- do not fake queue processing, rule-engine powers, or emergency switches
- do not hardcode raw owner credentials into code or docs
- do not store, print, log, hard-code, or commit test admin credentials
- do not expose Supabase service-role keys, LiveKit secrets, RevenueCat secrets, app-store keys, provider secret keys, or any other secret
- do not bypass RLS or weaken `platform_role_memberships`
- do not expose owner-only controls to ordinary admins
- do not collapse creator routes into admin routes
- do not create `/studio*` or other route sprawl
- do not create duplicate admin routes such as `/admin-command-center`

## 14. Current Doctrine Vs Later-Phase Ideas

### 14.1 Current Doctrine
Current doctrine supports:
- bounded `/admin`
- current operator/moderator role truth
- official Rachi identity on canonical profile/chat surfaces
- creator-side safety/admin summary truth
- audit-minded moderation context

### 14.2 Later-Phase Ideas
Later only, unless future work proves otherwise:
- super-admin emergency system tools
- real Rachi automation queues and approvals
- richer audit logs
- staffed support operations
- refund/dispute flows
- deeper monetization review tools
- broader role hierarchy
