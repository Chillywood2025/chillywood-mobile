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

Currently not real:
- full immutable admin audit logs
- user search, ban, suspend, restrict, upload-disable, live-disable, or entitlement-edit tools
- manual Premium toggles or subscription editing
- working runtime kill switches beyond current Premium access logic labels
- ad SDKs, ad IDs, ad provider initialization, ad rendering, or ad revenue
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

## 9. Missing Truth That Still Needs To Be Built
- explicit owner / super-admin role truth
- safe owner bootstrap path
- owner-only gate truth
- Admin V1B kill switches backed by schema/config/enforcement and real reads from affected app surfaces
- audit-log structure beyond current moderation/report context
- real Rachi-control state and domain controls
- real emergency/system controls
- real user search and user restriction tools
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
2. Ads Launch Foundation is the next recommended lane.
3. Admin V1B Kill Switches only after a dedicated schema/config/enforcement plan.
4. Usage metering and ledger systems later: bandwidth, participant-minutes, storage, revenue ledger, payout ledger, network invoices, sponsor deals, and fraud holds.
5. Real Rachi-control state and domain controls later only when backed.
6. Advanced owner/super-admin controls only if justified by real backing and proof.

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
