# Chi'llywood Hetzner-First Deployment Prep Spec

## 1. Purpose And Scope
This document defines Chi'llywood's first production-like Hetzner deployment plan.

It is infrastructure preparation only.

It exists to:
- audit the deployment and hosted-service assumptions that already exist in repo truth
- define the first honest Hetzner machine role without pretending anything is already provisioned
- separate what stays hosted or local from what may move to Hetzner first
- define the minimum secrets, cutover order, rollback posture, and monitoring plan for a future first deployment
- define when OVH should be added later and for what exact job

This document does not:
- purchase servers
- log into providers
- claim any infrastructure is already deployed
- replace current hosted services by fiat
- change app routes, schema, or UI

## 2. Current Infrastructure Truth Already In Repo

### 2.1 Mobile Build And Release Truth
Current app delivery truth is still Expo-first:
- `package.json` scripts are local Expo/TypeScript workflows
- `app.json`, `app.config.ts`, and `eas.json` already assume Expo/EAS build and update ownership
- `README.md` already documents EAS Update and manual release operations

This repo does not currently contain an app-owned production web backend or app-owned deployment stack.

### 2.2 Backend And Data Truth
Current backend truth is hosted Supabase:
- auth and data truth are in Supabase
- schema truth lives under `supabase/migrations/`
- server-side realtime token issuance already exists as:
  - `supabase/functions/livekit-token/index.ts`

Current repo truth therefore already depends on hosted backend infrastructure outside the local machine.

### 2.3 Realtime Truth
Current realtime/media truth is LiveKit-backed:
- `app.config.ts` includes a current deployed default `EXPO_PUBLIC_LIVEKIT_URL`
- `app.config.ts` also includes the current deployed default Supabase token endpoint for LiveKit access
- `supabase/functions/livekit-token/index.ts` expects:
  - `LIVEKIT_API_KEY`
  - `LIVEKIT_API_SECRET`
  - `LIVEKIT_URL`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

This means the strongest existing candidate for first Hetzner infrastructure is the realtime edge, not a full backend rewrite.

### 2.4 Hosted Third-Party Truth That Should Not Move First
Current repo truth also depends on hosted external systems:
- Firebase analytics / Crashlytics / performance instrumentation
- RevenueCat for subscription/entitlement client integration
- Expo/EAS for builds and OTA updates

These are not good first Hetzner migration targets in this pass.

### 2.5 Local And Dev Truth
Current local/dev truth includes:
- `.env.local` for local runtime values
- `scripts/validate-runtime.mjs`
- `scripts/validate-runtime-config.js`
- Expo local dev server
- local scripts such as `scripts/bootstrap-owner-admin.mjs`
- Maestro flows for manual proof

These remain local/developer-owned for now.

## 3. Hetzner-First Decision

### 3.1 First Machine Role
The first Hetzner machine should be a single:
- `realtime edge + ops ingress` host

That first machine is for:
- reverse proxy / TLS termination
- self-managed LiveKit later in the same cutover lane
- optional static status/legal/support hosting once those destinations are intentionally pointed there
- basic host-level monitoring and log retention

### 3.2 What This First Machine Is Not
This first machine is not:
- the primary database
- the auth provider
- the Supabase replacement
- the RevenueCat replacement
- the Firebase replacement
- the Expo/EAS replacement
- a general-purpose god-box for every future service

## 4. What Stays Local Or Hosted For Now

### 4.1 Stays Local / Dev-Owned
- Expo local development
- Metro / `expo start`
- local runtime validation
- local owner bootstrap execution
- Maestro/manual proof
- local preview verification work

### 4.2 Stays Hosted Outside Hetzner For Now
- Supabase database and auth
- Supabase Edge Functions
- Expo/EAS build and update flow
- Firebase analytics / Crashlytics / performance
- RevenueCat

### 4.3 Does Not Move In This Pass
- billing/payout infrastructure
- notification providers
- search/recommendation systems
- broader admin/support tooling

## 5. What Moves To Hetzner First

### 5.1 First-Move Service Boundary
The first honest Hetzner migration target is:
- realtime ingress

That means the first future production-like cutover should move:
- the LiveKit server endpoint
- the public reverse-proxy / TLS edge in front of that endpoint

### 5.2 Optional Early Add-On
Only if explicitly needed later, the same machine may also host:
- static legal/status/support pages

But that is secondary to the realtime edge role.

### 5.3 What Does Not Move In The First Cutover
The first cutover should not move:
- Supabase tables or auth
- the LiveKit token-signing logic out of `supabase/functions/livekit-token`
- app-store billing
- creator payouts
- analytics vendors

## 6. Secrets And Environment Requirements

### 6.1 Host-Side Private Secrets
The Hetzner host will need private values such as:
- ACME / TLS contact email
- LiveKit API key
- LiveKit API secret
- canonical public realtime hostname

These must never be committed to source control.

### 6.2 Supabase Function Cutover Secrets
The existing `livekit-token` Supabase Edge Function remains part of the architecture for now.

Its server-side env must stay aligned with the Hetzner-hosted LiveKit endpoint:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_URL`

### 6.3 Mobile Runtime Public Config
The mobile runtime may need public override values after the realtime cutover:
- `EXPO_PUBLIC_LIVEKIT_URL`
- `EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT`
- optional legal/support URLs if those destinations later move to the Hetzner edge

## 7. Reverse Proxy And TLS Plan

### 7.1 Reverse Proxy Ownership
The first Hetzner machine should terminate TLS at a reverse proxy layer.

That proxy should own:
- public HTTPS ingress
- certificate renewal
- host-based routing for the realtime endpoint
- optional later static status/legal/support hosts

### 7.2 Public Exposure Discipline
Public exposure should stay narrow:
- expose `80` and `443` only for web/TLS ingress
- keep service internals off public random ports where possible
- do not expose owner/admin dashboards directly from the first machine

### 7.3 TLS Discipline
TLS should be automatic and renewable.

Approved first-pass posture:
- Let's Encrypt or equivalent ACME-managed cert issuance
- one canonical realtime hostname
- no mixed HTTP/HTTPS production claims

## 8. Monitoring And Logging Plan

### 8.1 Keep Existing Client Observability
Current client observability remains valid and should stay in place:
- Firebase analytics
- Firebase Crashlytics
- Firebase performance

Hetzner-first work does not replace those systems.

### 8.2 New Host-Level Monitoring For The First Machine
The first Hetzner deployment should add only basic host/service monitoring:
- host CPU
- host RAM
- disk usage
- network saturation
- reverse proxy health
- LiveKit process health

### 8.3 Logging Boundaries
Logging should remain separated by owner:
- reverse proxy access/error logs on the Hetzner host
- LiveKit service logs on the Hetzner host
- Supabase Edge Function logs remain in Supabase
- mobile runtime errors remain in the app/mobile observability path

### 8.4 Alerting Posture
Start narrow:
- uptime alert for the public realtime hostname
- disk and memory pressure alerts
- repeated service restart alerts

Do not invent a larger observability program in this pass.

## 9. Deployment Order
The first production-like Hetzner rollout should happen in this order:

1. lock the public hostname(s) and DNS ownership
2. harden the Hetzner machine:
   - SSH access
   - firewall
   - OS patching
   - non-root deploy posture
3. provision host env from the Hetzner env template
4. stand up reverse proxy and TLS first
5. bring up LiveKit on the Hetzner host
6. verify the new realtime endpoint independently before mobile cutover
7. update Supabase Edge Function env so `livekit-token` signs against the Hetzner endpoint
8. update public mobile runtime config only after the new endpoint is healthy
9. verify through preview/internal builds before any broader production-like use

## 10. Rollback And Safety Notes

### 10.1 Rollback Rule
Do not remove or overwrite the current hosted realtime truth until the Hetzner path is verified.

### 10.2 Safe Rollback Path
If the Hetzner realtime cutover fails:
- restore the prior LiveKit URL in the Supabase function env
- restore the prior `EXPO_PUBLIC_LIVEKIT_URL` mobile runtime value
- keep the token endpoint path unchanged if possible
- do not widen the blast radius by moving unrelated services at the same time

### 10.3 Blast-Radius Discipline
The first Hetzner deployment should be:
- single-purpose
- reversible
- independent from auth/database migration

## 11. Why Docker Compose Templates Are Deferred In This Pass
This repo does not yet prove a broader app-owned server topology.

A concrete Compose stack would currently force guesses about:
- exact service topology
- certificate flow
- domain naming
- which optional static surfaces are actually being hosted

So this pass intentionally stops at:
- the Hetzner-first spec
- env templates

Compose or provider-run service manifests should be added only when the realtime cutover lane is actually opened.

## 12. OVH Later Add-On Plan
OVH is intentionally deferred.

It should be added later only as a second-provider layer for:
- DDoS-sensitive public edge backup
- failover or warm-standby realtime ingress
- later multi-provider resilience

OVH should not be introduced later as:
- the primary auth/database owner
- a rushed second copy of the whole app stack
- a justification for broader premature infrastructure sprawl

## 13. First Honest Follow-Up Lane
Once this prep is accepted, the first real infrastructure follow-up lane should be:
- narrow `Hetzner realtime edge cutover prep`

That later lane would prove, but not necessarily immediately deploy:
- the exact realtime hostname
- the reverse proxy choice
- the first LiveKit host topology
- the precise cutover/rollback checklist for the Supabase token endpoint and mobile runtime values
