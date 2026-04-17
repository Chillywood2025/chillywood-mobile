# Chi'llywood Backend Owner/Admin/Rachi Current-Structure Spec

## Purpose And Scope
This document saves the supplied owner/admin/Rachi backend blueprint in repo-aligned terms without changing Chi'llywood's current structure.

It is doctrine and implementation-spec text only.

It does not:
- redesign the app tree
- invent `app/studio/*`
- invent `app/admin/*`
- promote `/communication` into canonical room architecture
- replace the canonical `/profile/[userId]`, `/chat`, `/chat/[threadId]`, `/watch-party/[partyId]`, or `/watch-party/live-stage/[partyId]` surfaces

It works alongside:
- `MASTER_VISION.md` for identity-level product truth
- `ARCHITECTURE_RULES.md` for canonical route, ownership, and structure rules
- `PRODUCT_DOCTRINE.md` for cross-cutting profile/channel-platform and monetization truth
- `docs/public-v1-blueprint.md` for Public v1 surface scope and proof lanes
- `CURRENT_STATE.md` and `NEXT_TASK.md` for checkpoint and active-lane bookkeeping

This document exists to:
- restate the supplied backend blueprint in repo terms
- separate clean-main truth from later-phase target design
- preserve current canonical owners while defining the backend control model Chi'llywood should grow into
- make it explicit which backend pieces already exist, which are code-referenced but not clean-main migration truth yet, and which are still not landed

## Governing Truth Carried Forward
- Chi'llywood remains one premium social streaming platform with locked Party / Live / Profile / Chi'lly Chat semantics.
- `app/profile/[userId].tsx` remains the canonical public profile/channel owner.
- `app/channel-settings.tsx` remains the current creator-settings and studio-equivalent owner.
- `/chat` and `/chat/[threadId]` remain the canonical Chi'lly Chat routes.
- `/watch-party/[partyId]` and `/watch-party/live-stage/[partyId]` remain the canonical Party / Live room routes.
- `/communication` remains compatibility-only and is not promoted here.
- Rachi remains a protected official platform account inside the canonical profile/channel and Chi'lly Chat architecture. This document does not move Rachi to a separate user-facing control route.
- The bounded admin owner remains `app/admin.tsx`. This document does not split admin into a new route tree.
- The backend must remain the authority for permissions, review, moderation, admin actions, Rachi controls, overrides, and emergency state. Frontend visibility is presentation only.

## Core Backend Rule
Do not build Chi'llywood platform control around one sloppy `is_admin = true` flag.

The supplied doctrine is correct:
- identity
- roles
- permissions and scopes
- audit and override controls

That is the long-term model Chi'llywood needs if:
- owner authority must outrank ordinary internal admins
- staff help later without over-permissioning
- Rachi acts as a controlled internal actor rather than a magical invisible process
- admin, moderation, monetization, and room controls stay accountable

The repo already leans in this direction. Clean `origin/main` does not use a single `is_admin` flag as the whole model. It already carries:
- role-aware moderation access through `_lib/moderation.ts`
- `public.platform_role_memberships`
- `public.has_platform_role(...)`
- protected official-account identity via `_lib/officialAccounts.ts`
- bounded admin visibility on `app/admin.tsx`

But clean `origin/main` is still only at the beginning of that backend doctrine. It does not yet have the full role/permission/scope/audit/control stack.

## Three-Layer System Model
The supplied three-layer model is the right backend doctrine for this repo too.

### 1. Account System
This is the base user identity.

Repo-aligned meaning today:
- Supabase auth and session are the current base account truth
- the social identity layer currently flows through `_lib/userData.ts`
- the canonical public identity surface remains `/profile/[userId]`
- Rachi is a protected official account inside that same identity architecture

### 2. Access-Control System
This decides what an identity is allowed to do.

Repo-aligned meaning today:
- clean-main platform moderation access is currently the first landed slice of this layer
- `public.platform_role_memberships` and `public.has_platform_role(...)` are the only checked-in role foundation on clean `origin/main`
- `_lib/moderation.ts` turns those checks into role-aware admin/review capability on the client side

### 3. Operational Control System
This is where admin actions, review queues, Rachi actions, overrides, audit, and emergency controls should live.

Repo-aligned meaning today:
- clean-main has only the first bounded moderation intake/review slice of this layer
- `public.safety_reports` is the main checked-in backend object here
- `app/admin.tsx` is the bounded surface that currently exposes moderation-aware admin visibility
- full audit logs, override actions, system controls, and Rachi action history are not yet landed on clean `origin/main`

## Current Clean-Main Repo Truth Already Landed

### Official Platform Identity Foundation
Already landed on clean `origin/main`:
- `_lib/officialAccounts.ts` defines Rachi as a protected official platform account
- Rachi has explicit official markers, a stable `auditOwnerKey`, and canonical starter-thread/profile identity
- `app/profile/[userId].tsx`, `app/chat/index.tsx`, and `app/chat/[threadId].tsx` are already the intended canonical Rachi surfaces

Why this matters for the supplied backend blueprint:
- Rachi is already treated as a first-class protected internal actor at the identity layer
- future admin, moderation, and control behavior should extend this same official identity foundation
- this repo should not invent a second public-facing Rachi architecture

### Safety Reporting Foundation
Already landed on clean `origin/main`:
- `supabase/migrations/202603270007_create_safety_reports.sql`
- `public.safety_reports`
- `_lib/moderation.ts` helpers for safety-report context, ingestion, and review reads
- report entry points are already wired on title/profile/chat/party/live surfaces

Current clean-main truth:
- safety reporting is the first real backend moderation object
- reporters can insert their own reports
- reviewers can read the broader queue only through the platform-role gate added later

### Platform Role Foundation
Already landed on clean `origin/main`:
- `supabase/migrations/202604050003_create_platform_role_memberships.sql`
- `public.platform_role_memberships`
- `public.has_platform_role(required_roles text[])`
- checked-in role values are currently only `operator` and `moderator`

Current clean-main truth:
- this is not full RBAC yet
- it is a narrow platform moderation-role gate
- it already proves the repo should use structured membership checks instead of a single global admin boolean

### Bounded Admin Owner
Already landed on clean `origin/main`:
- `app/admin.tsx` is the current bounded admin owner
- it already consumes moderation access, platform-role memberships, app config helpers, and creator-permission helpers
- it already contains a bounded review surface rather than a full multi-route admin console

Current clean-main truth:
- the repo already has one bounded admin owner
- this document keeps that owner in place
- future admin depth should grow behind that owner until route doctrine is intentionally changed

### Runtime Operator Allowlist Bridge
Already landed on clean `origin/main`:
- `_lib/runtimeConfig.ts` exposes `isBetaOperatorIdentity(...)`
- `_lib/moderation.ts` uses it when computing `ModerationAccess`

Current clean-main truth:
- this is a runtime/operator bridge, not a full backend permission system
- it should not become the final authority model
- it is still part of current repo truth and must be described honestly

## Current Clean-Main Mismatches That Must Be Called Out
Some backend concepts from the broader product direction already appear in code or older handoff docs, but they are not all checked-in clean-main migration truth.

That distinction matters.

### Code-Referenced Or Doc-Referenced, But Not Checked-In Clean-Main Migration Truth
These concepts are referenced on clean `origin/main` code or docs:
- `public.app_configurations` through `_lib/appConfig.ts` and `app/admin.tsx`
- `public.creator_permissions` through `_lib/monetization.ts`, `app/admin.tsx`, and `app/channel-settings.tsx`
- `public.user_profiles` through `_lib/userData.ts`

But clean `origin/main` checked-in migration history in this repo currently includes only:
- `202603270007_create_safety_reports.sql`
- `202604050003_create_platform_role_memberships.sql`

So the repo currently has an important truth split:
- some backend tables are already treated as runtime truth in code and older handoff docs
- but their create-table migrations are not present in clean checked-in migration history on `origin/main`

This document preserves that honesty.
It does not pretend those backend objects are fully landed clean-main foundation when their checked-in migration history is not there yet.

### Not Yet Landed On Clean `origin/main`
The following supplied-backend objects are not landed on clean `origin/main`:
- `roles`
- `permissions`
- `role_permissions`
- `user_roles`
- `audit_logs`
- `override_actions`
- `system_controls`
- `system_agents`
- `agent_domain_permissions`
- `agent_rules`
- `agent_actions`
- `agent_escalations`
- `staff_profiles`
- `creator_monetization_profiles`
- `room_roles`
- `room_permissions`
- a true owner role that outranks all other internal roles
- a full scope-aware permission system

## Repo-Aligned Restatement Of The Supplied Backend Blueprint
The supplied blueprint is directionally correct for Chi'llywood.

The repo-aligned version is:

### 1. Keep One Identity System
Do not split the product into:
- one social profile system
- one totally separate creator identity system
- one totally separate official-account system

Repo-aligned rule:
- one account identity
- one canonical `/profile/[userId]` public profile/channel surface
- one canonical Chi'lly Chat system
- one official-account foundation for Rachi inside that same architecture

If backend depth grows later, it should strengthen this same identity system rather than inventing a second app or second identity tree.

### 2. Grow From Platform Roles Into Real RBAC
Clean-main already has the first narrow role gate:
- `operator`
- `moderator`

The supplied direction is still right:
- later add explicit roles
- later map permissions to roles
- later add scope-aware assignments
- later separate owner-only powers from ordinary powerful internal admins

But repo-aligned truth today is:
- do not pretend full RBAC is already landed
- do use the existing `platform_role_memberships` foundation as the first seed

### 3. Keep The Admin Surface Bounded
The supplied blueprint imagines large admin/platform control depth.

Repo-aligned rule:
- do not create a new admin route tree in this spec
- `app/admin.tsx` remains the bounded current admin owner
- backend depth should expand behind the existing bounded owner first

### 4. Keep Rachi Publicly On Canonical Profile/Chat, Privately On Controlled Backend Rails
The supplied blueprint is correct that Rachi should be a controlled backend actor, not a magical background ghost.

Repo-aligned rule:
- public-facing Rachi stays on canonical `/profile/[userId]` and `/chat/[threadId]`
- backend Rachi control later belongs in internal tables and admin/backend controls
- do not invent a second public-facing Rachi architecture

### 5. Make Backend The Authority For Sensitive Actions
The supplied doctrine is correct:
- frontend checks are presentation only
- sensitive actions must be server-authorized
- audit and override behavior must be backend-owned

Repo-aligned truth today:
- clean-main already does this partially for moderation review through `has_platform_role(...)`
- the rest of the sensitive-action backend stack still needs to be built

## Current-Structure Mapping Of Major Backend Domains

### Identity And Profile/Channel
Current canonical user-facing owners:
- `app/profile/[userId].tsx`
- `app/channel-settings.tsx`
- `_lib/userData.ts`
- `_lib/officialAccounts.ts`

Repo-aligned backend truth today:
- auth/session is current base account truth
- `user_profiles` is already code-referenced but not clean-main migration-backed here
- Rachi is already protected at the identity layer

Current-structure rule:
- do not invent a second profile model
- do not invent a separate public channel app
- if later backend objects like `profiles` or `channels` land, they must still feed the same canonical profile/channel route structure

### Moderation And Admin
Current canonical owners:
- `app/admin.tsx`
- `_lib/moderation.ts`
- report entry on title/profile/chat/party/live surfaces

Repo-aligned backend truth today:
- `public.safety_reports`
- `public.platform_role_memberships`
- `public.has_platform_role(...)`

Current-structure rule:
- bounded admin stays in `app/admin.tsx`
- moderation review truth stays backend-gated
- full operator/trust-safety/support console sprawl is later

### Rachi
Current canonical owners:
- `_lib/officialAccounts.ts`
- `app/profile/[userId].tsx`
- `app/chat/index.tsx`
- `app/chat/[threadId].tsx`

Repo-aligned backend truth today:
- official protected identity exists
- starter-presence and official markers exist
- no clean-main backend Rachi control-plane tables exist yet

Current-structure rule:
- keep public Rachi on canonical profile/chat
- add backend agent-control tables later without creating a second public Rachi app

### Config And Monetization Permissions
Current canonical owners:
- `app/admin.tsx`
- `app/channel-settings.tsx`
- `_lib/appConfig.ts`
- `_lib/monetization.ts`

Repo-aligned truth today:
- code and older handoff docs already treat `app_configurations` and `creator_permissions` as backend truth
- clean checked-in migration history on `origin/main` does not yet include those create-table migrations

Current-structure rule:
- do not broaden this into a new admin or studio tree here
- treat these as current code-level/backend-direction truth with clean-main migration mismatch that still needs formal reconciliation

## Recommended Current-Structure Table/Object Map
The supplied blueprint is larger than clean-main truth. The repo-aligned way to save it is to split it into:
- already-landed clean-main foundations
- code-referenced or doc-referenced backend objects
- later-phase target objects

### Already-Landed Clean-Main Foundations
| Object | Clean-Main Status | Repo-Aligned Meaning |
| --- | --- | --- |
| Supabase auth/session | already in use | current base account identity anchor |
| `public.safety_reports` | landed | moderation/report intake foundation |
| `public.platform_role_memberships` | landed | first narrow internal role foundation |
| `public.has_platform_role(...)` | landed | backend role gate for review/admin reads |
| Rachi official account model | landed in code | protected official platform identity foundation |
| bounded admin owner `app/admin.tsx` | landed | current admin owner, not a full admin route tree |

### Referenced In Clean-Main Code Or Docs, But Not Fully Landed In Clean-Main Migration History Here
| Object | Current Truth | Repo-Aligned Note |
| --- | --- | --- |
| `public.user_profiles` | code-referenced in `_lib/userData.ts` | identity/profile backend direction exists, but clean checked-in migration file is not present on `origin/main` here |
| `public.app_configurations` | code-referenced in `_lib/appConfig.ts` and `app/admin.tsx` | config backend direction exists, but clean checked-in migration file is not present on `origin/main` here |
| `public.creator_permissions` | code-referenced in `_lib/monetization.ts`, `app/admin.tsx`, and `app/channel-settings.tsx` | monetization-permission backend direction exists, but clean checked-in migration file is not present on `origin/main` here |

### Later-Phase Target Objects From The Supplied Blueprint
These are approved direction, not clean-main landed truth yet:
- `roles`
- `permissions`
- `role_permissions`
- `user_roles`
- `audit_logs`
- `override_actions`
- `system_controls`
- `system_agents`
- `agent_domain_permissions`
- `agent_rules`
- `agent_actions`
- `agent_escalations`
- `staff_profiles`
- `creator_monetization_profiles`
- `room_roles`
- `room_permissions`
- any future scoped channel-level or room-level moderator tables beyond the current narrow moderation foundations

## Repo-Aligned Role And Permission Strategy

### Clean-Main Truth
Current clean-main role truth is narrow:
- `operator`
- `moderator`

That is not the final role stack, but it is the first real foundation and should be preserved.

### Supplied Direction, Restated For This Repo
The long-term direction is still correct:

Public/product roles later:
- `user`
- `creator`
- `premium_creator`
- `monetized_creator`
- `channel_moderator`
- `cohost`

Internal roles later:
- `platform_moderator`
- `support_admin`
- `monetization_reviewer`
- `trust_safety_admin`
- `super_admin`
- `owner`

Repo-aligned rule:
- `owner` should remain distinct from `super_admin` if true founder/platform override must be preserved
- this belongs in backend role/permission tables later
- it does not require a new user-facing route tree

### Scopes
The supplied scope model is correct and should be preserved later:
- platform scope
- channel scope
- room scope

Repo-aligned truth today:
- clean-main does not yet have a general `scope_type` / `scope_id` assignment system
- if added later, it should extend the existing backend truth without changing user-facing route ownership

## Repo-Aligned Rachi Control Doctrine
The supplied backend blueprint is correct that Rachi should be a first-class controlled system actor.

Repo-aligned restatement:
- public-facing Rachi identity is already landed
- backend Rachi control is not yet landed
- when backend depth is added later, Rachi should get structured internal control objects such as:
  - `system_agents`
  - `agent_domain_permissions`
  - `agent_rules`
  - `agent_actions`
  - `agent_escalations`

But current repo truth must stay:
- no special public Rachi app
- no second public route tree
- canonical Rachi profile and thread remain the same

### Domain Control
The supplied domain-permission idea is especially important for this repo.

When Rachi backend control lands later, the key questions should be:
- what domain is Rachi touching
- what mode is allowed there
- whether approval is required
- who changed those permissions

That is more important than pretending Rachi just has one giant admin permission bag.

## Audit, Override, And Emergency Doctrine
The supplied doctrine is correct:
- all high-value admin and Rachi actions should be logged
- owner overrides should be formal, not informal
- emergency/platform control should be centralized, not scattered booleans in code

Repo-aligned clean-main truth:
- audit-minded context already exists in smaller ways, such as `auditOwnerKey`, moderation report context, and official-platform identity markers
- but clean-main does not yet have checked-in `audit_logs`, `override_actions`, or `system_controls`

Repo-aligned future rule:
- if those land later, they should be backend-first and server-authoritative
- they should not require a user-facing structure redesign to become real

## Owner Protection Doctrine
The supplied owner-protection rules are correct for Chi'llywood.

Repo-aligned restatement:
- founder/owner authority should remain distinct from ordinary powerful internal admins
- Rachi should never be allowed to lock out or silently overrule the owner
- lower roles should not be able to suspend or strip owner authority
- if owner-only controls later land, they belong in backend permission tables and internal control objects, not in ad hoc frontend booleans

Clean-main truth today:
- this protection stack is not fully landed yet
- but the repo already signals the need for protected official identities and role-aware review instead of a flat admin model

## Recommended Backend Rollout Order For This Repo
The supplied rollout sequence is directionally correct. The repo-aligned version is:

### Phase 1: Formalize Clean-Main Foundations
- preserve the current canonical route structure
- reconcile clean checked-in backend migration history with the already code-referenced backend objects
- keep moderation/report and platform-role foundations intact

This means:
- safety-report foundation remains first-class
- narrow role-gated moderation review remains first-class
- code-referenced backend objects such as `app_configurations`, `creator_permissions`, and `user_profiles` should be formally reconciled with clean checked-in migration truth before the repo pretends full control-plane depth exists

### Phase 2: Access-Control Foundation
Later backend objects:
- `roles`
- `permissions`
- `role_permissions`
- `user_roles`
- `audit_logs`

Repo-aligned reason:
- the repo needs real role/permission/audit depth before it grows broader admin, owner, or Rachi control

### Phase 3: Platform Control Foundation
Later backend objects:
- `creator_monetization_profiles`
- `room_roles`
- `room_permissions`
- `system_controls`
- `override_actions`

Repo-aligned reason:
- these expand platform control without changing the public route map

### Phase 4: Rachi Control Foundation
Later backend objects:
- `system_agents`
- `agent_domain_permissions`
- `agent_rules`
- `agent_actions`
- `agent_escalations`

Repo-aligned reason:
- Rachi backend control should be built on top of real permissions, not before them

### Phase 5: Staff And Advanced Operations
Later backend objects:
- `staff_profiles`
- deeper support/dispute models
- broader analytics objects
- finer rule tuning layers

Repo-aligned reason:
- this is later operational scale work, not current clean-main foundation

## Blunt Repo-Aligned Truth
The supplied backend doctrine is the right long-term direction for Chi'llywood:
- not one admin flag
- not one invisible AI process
- not frontend-trusted permissions
- not scattered emergency booleans

The repo-aligned truth today is:
- Rachi official identity is already real
- moderation intake is already real
- narrow platform-role review gating is already real
- bounded admin ownership is already real
- some deeper backend objects are already referenced in code and older docs
- but clean `origin/main` does not yet carry the full checked-in backend control stack

So the correct doctrine is:
- preserve the current canonical profile/chat/admin structure
- preserve Rachi on canonical profile/chat surfaces
- preserve `app/admin.tsx` as the bounded admin owner
- grow toward a true role-and-scope backend with owner-only powers, audit logs, override actions, Rachi domain control, and centralized emergency/system controls
- do not pretend that full backend platform-control depth is already landed on clean main when it is not

## No-Change Structure Check
This document does not change:
- the canonical `/profile/[userId]` route
- the canonical `/chat` and `/chat/[threadId]` routes
- the canonical `/watch-party/[partyId]` and `/watch-party/live-stage/[partyId]` routes
- the bounded `app/admin.tsx` owner
- the current `app/channel-settings.tsx` owner
- the rule that `/communication` stays compatibility-only

It also does not invent:
- `app/studio/*`
- `app/admin/*`
- a second public Rachi app
- a second public profile model
- a separate public channel tree

That is the correct repo-aligned way to save the supplied backend owner/admin/Rachi blueprint today.
