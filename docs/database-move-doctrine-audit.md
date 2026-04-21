# Chi'llywood Database Move Doctrine Audit

## 1. Purpose And Scope
This document records whether moving any part of Chi'llywood's current backend/data layer off the current external stack is justified now.

It is doctrine and audit only.

It does not:
- move Supabase
- cut over auth
- copy live production data
- change route truth
- change production runtime ownership
- claim migration readiness unless the audit actually proves it

## 2. Current Architecture Summary

### 2.1 Current Live Source Of Truth
Supabase is still the current live source of truth for:
- auth and session ownership
- primary relational data and schema truth
- row-level access control behavior
- realtime channel/presence behavior used by current room/chat surfaces
- the current LiveKit token-signing server path

Hetzner currently owns only a bounded realtime edge:
- Caddy / TLS edge
- self-hosted LiveKit ingress

Hetzner does not currently own:
- app auth
- primary database truth
- the main app backend
- the main server-side function surface

### 2.2 Current Delivery / Runtime Split
Current repo/runtime ownership is split like this:
- Expo / EAS owns app build and delivery
- Supabase owns auth, primary data, RLS, and Edge Functions
- Hetzner owns the current LiveKit ingress host
- Firebase / RevenueCat remain external

### 2.3 Current Schema / Migration Truth
Current schema truth is still repo-owned through:
- `supabase/migrations/`
- `supabase/database.types.ts`

Current active migration set is already meaningful and multi-domain:
- baseline schema reconciliation
- audience relationships and visibility
- creator events
- notifications and reminders
- owner/admin role truth
- layout preset truth

Legacy migrations still carry earlier room/chat/safety/app-config evolution.

## 3. What Is Coupled To Supabase Today

### 3.1 Auth / Session Coupling
Current auth/session truth is tightly coupled to Supabase auth.

Primary owners include:
- `_lib/supabase.ts`
- `app/lib/_supabase.ts`
- `_lib/session.tsx`
- `app/(auth)/login.tsx`
- `app/(auth)/signup.tsx`
- `app/settings.tsx`

Additional helpers and surfaces repeatedly call:
- `supabase.auth.getSession()`
- `supabase.auth.getUser()`
- `supabase.auth.onAuthStateChange(...)`
- `supabase.auth.signInWithPassword(...)`
- `supabase.auth.signOut()`

This means auth migration is not a side-detail. It is a core application runtime dependency.

### 3.2 Primary Database / Schema Coupling
Current app behavior is tightly coupled to Supabase as the primary relational datastore.

There are direct Supabase client imports in 29 app/helper files across:
- titles/player/home/explore
- profile/channel
- watch-party room state
- live-stage state
- communication rooms
- chat threads/messages
- monetization
- moderation/admin
- notifications/reminders
- beta/support

Core helper owners with strong DB coupling include:
- `_lib/watchParty.ts`
- `_lib/communication.ts`
- `_lib/chat.ts`
- `_lib/userData.ts`
- `_lib/channelAudience.ts`
- `_lib/channelReadModels.ts`
- `_lib/moderation.ts`
- `_lib/monetization.ts`
- `_lib/liveEvents.ts`
- `_lib/notifications.ts`
- `_lib/appConfig.ts`

This is not a thin repository layer around a swappable DB. It is direct application coupling to Supabase data primitives.

### 3.3 Supabase Realtime / Channel Coupling
Current product behavior is also coupled to Supabase realtime channels, not only database tables.

Active realtime channel usage exists in:
- chat inbox/thread flows
- Party Room
- player-linked watch-party flows
- Live Stage
- communication room session hook

Current code directly uses:
- `supabase.channel(...)`
- `supabase.removeChannel(...)`
- `supabase.getChannels()`

This means a future database move cannot be treated as only a storage migration. It would also impact current room/chat realtime behavior unless those surfaces are deliberately re-architected first.

### 3.4 Supabase Functions / RPC Coupling
Current server-side logic is also coupled to Supabase-managed execution paths.

Current proven function / RPC usage includes:
- `supabase/functions/livekit-token/index.ts`
- `_lib/betaProgram.tsx` RPC calls:
  - `activate_beta_membership`
  - `acknowledge_beta_onboarding`

The current LiveKit path is especially important:
- the app gets an authenticated Supabase session
- the app calls the Supabase Edge Function
- the Edge Function verifies auth against Supabase
- the Edge Function uses the service role to read room/membership truth
- the Edge Function issues the LiveKit token

So even after Hetzner LiveKit ingress was landed, realtime authorization still depends on Supabase auth plus Supabase-managed function execution.

## 4. What Would Break First If A Move Started Too Early

If a database move started too early, the first likely break points would be:

### 4.1 Auth / Session Breakage
- login
- signup
- session bootstrap
- session refresh
- signed-in route gating
- admin/owner role checks
- all helpers that assume `supabase.auth.getSession()` or `getUser()`

### 4.2 Realtime Authorization Breakage
- authenticated LiveKit token issuance
- room membership checks in the signer
- watch-party/live-stage join behavior
- communication room call/session behavior

### 4.3 Product Realtime Breakage
- chat inbox/thread channels
- Party Room state channels
- Live Stage state channels
- player-linked party sync / social channels
- communication room presence channels

### 4.4 Data Integrity / Policy Breakage
- RLS-backed read/write assumptions
- direct table writes in helpers
- upserts for watch history, my list, monetization, audience, reminders, and moderation
- existing migration / types alignment

### 4.5 Release / Rollback Breakage
- difficult rollback if auth and data move together
- dual-write / parity drift risk
- higher blast radius than the current bounded LiveKit ingress move

## 5. Migration Justification Analysis

### 5.1 Is A Database Move Justified Now?
No. Not now.

### 5.2 What Problem Would A Later Move Solve?
A later move could potentially solve:
- tighter backend ownership beyond vendor-managed execution
- lower long-term vendor concentration
- more control over service topology and backend observability
- a cleaner path to future service extraction if Chi'llywood outgrows the current hosted split

### 5.3 What New Risk Would It Create?
It would create major new risk in:
- auth stability
- data integrity
- realtime behavior
- rollback complexity
- release safety
- engineering scope and maintenance burden

### 5.4 Does Current Hetzner / LiveKit Progress Change The Answer?
Only slightly, and not enough to justify a move now.

What Hetzner / LiveKit progress proves:
- a bounded service can be self-hosted safely
- a phased edge/service extraction is possible in principle

What it does not prove:
- auth can move safely
- primary relational data can move safely
- current RLS behavior can be replaced safely
- Supabase realtime dependencies are already abstracted enough to move

So the LiveKit progress strengthens the case for future phased service extraction, but it does not materially justify a database move now.

### 5.5 Current Doctrine Decision
Database move status should be treated as:
- `not now`
- `later only with prerequisites`
- `its own major future chapter if ever approved`

## 6. Recommended Doctrine For A Later Migration

If migration is ever justified later, the safest model is phased and split, not a big-bang cutover.

### 6.1 Auth Should Stay On Supabase Longer Than Data
Auth is the highest-risk coupling.

Safest doctrine:
- keep auth/session truth on Supabase longer than any data move
- do not start with auth migration
- do not combine auth cutover with early data cutover

### 6.2 Functions Should Stay On Supabase Longer Than Data
The current LiveKit signer depends on:
- authenticated Supabase session verification
- service-role room/membership reads

Safest doctrine:
- keep current Supabase function execution longer than any early data move
- do not move token-signing first

### 6.3 Safest Phased Migration Model

#### Phase A — App Upstream / Service-Boundary Doctrine
Before any data move:
- define whether Chi'llywood will own an app upstream at all
- define which backend services should be first-class app-owned services
- keep Supabase as live truth

#### Phase B — Selected Service Extraction
Extract only bounded service logic first:
- app-owned service layer if needed
- no database cutover yet
- Supabase still remains live data/auth truth

#### Phase C — Data Mirror / Read Shadow
Only after service boundaries are stable:
- mirror one low-risk, non-auth, non-room-critical domain
- start with read shadow / parity checks
- do not start with chat, room membership, session, or auth tables

#### Phase D — Controlled Domain Cutover
Only after parity is proved:
- move one bounded domain at a time
- keep rollback path live
- avoid simultaneous auth + data + realtime cutover

#### Phase E — Auth Reconsideration Last
Only if later justified:
- evaluate whether auth should ever move at all
- treat auth migration as separate from initial data migration

## 7. Hard Do-Not-Do-Yet Items

Do not do these yet:
- do not move Supabase auth first
- do not move chat/thread data first
- do not move room membership / room state first
- do not move the LiveKit signer first
- do not do a big-bang database copy and cutover
- do not dual-write critical domains without parity and rollback tooling
- do not claim self-hosted backend readiness from the current LiveKit progress alone

## 8. Exact Prerequisites Before Any Future Migration Implementation

Before any real migration work begins, all of these should be true:
- device-backed authenticated realtime join verification is complete
- app-upstream doctrine/spec is explicit if app-owned services are part of the target model
- a full dependency inventory exists for:
  - auth/session
  - tables
  - RLS policies
  - realtime channels
  - Edge Functions
  - RPC usage
- rollback and parity doctrine is written first
- one low-risk first migration domain is explicitly chosen
- observability and incident response are strong enough to survive partial cutover failure
- migration is approved as its own future chapter rather than being smuggled into infra cleanup

## 9. Current Recommendation
Current recommendation:
- keep Supabase as the live source of truth
- keep database migration deferred
- do not create an implementation lane for migration now
- treat any future database move as a separate major chapter only after the prerequisites above are complete
