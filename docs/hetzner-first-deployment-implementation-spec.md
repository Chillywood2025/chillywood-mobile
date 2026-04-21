# Chi'llywood Hetzner-First Deployment Prep Spec

## 1. Purpose And Scope
This document defines Chi'llywood's first production-like Hetzner deployment plan.

It is infrastructure preparation only.

It exists to:
- audit the deployment and hosted-service assumptions that already exist in repo truth
- define the first honest Hetzner machine role without pretending anything is already provisioned
- record the current known first-host facts that already exist outside repo code
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

## 3. Current Known Hetzner Host Facts

The first Hetzner server already exists outside repo code:
- server name: `chillywood-prod-01`
- server IP: `87.99.145.160`

This document treats that as current infra truth only.

It does not imply:
- the server is fully configured
- LiveKit is installed there
- reverse proxy/TLS is installed there
- Chi'llywood production traffic is already using it
- any provider-side action was performed in this pass

### 3.1 SSH Bootstrap Expectation
The first connection path should be SSH-based host bootstrap.

Current doctrine for that bootstrap:
- use SSH for first access and host hardening
- verify host identity before applying any service config
- keep SSH keys or passwords outside repo files
- keep provider API tokens outside repo files
- do not embed raw provider credentials into client runtime env or committed docs

### 3.2 Verified Bootstrap State
Current host-bootstrap truth now includes:
- SSH access works
- the non-root deploy user is `chillywood`
- `chillywood` now has verified passwordless `sudo` for controlled infra automation
- the host has already taken an initial package-update pass
- the host may already have rebooted once as part of that update/hardening cycle
- `ufw` is active and currently allows only:
  - `22/tcp`
  - `80/tcp`
  - `443/tcp`
- `fail2ban` is installed and the `sshd` jail is active
- the base service/log layout now exists:
  - `/opt/chillywood`
  - `/opt/chillywood/bin`
  - `/opt/chillywood/env`
  - `/opt/chillywood/logs`
  - `/opt/chillywood/proxy`
  - `/var/log/chillywood`
  - `/var/log/chillywood/reverse-proxy`
  - `/var/log/chillywood/livekit`
- Caddy is installed as the first reverse-proxy baseline
- the real public hostname is now:
  - `live.chillywoodstream.com`
- DNS for `live.chillywoodstream.com` resolves to:
  - `87.99.145.160`
- the Cloudflare record remains DNS-only for this pass
- TLS is now live for `live.chillywoodstream.com`
- Caddy now serves a placeholder HTTPS surface on `:443`
- plain HTTP on `:80` now redirects to HTTPS

This still does not imply:
- LiveKit is installed
- app traffic has moved
- the machine is already serving production Chi'llywood traffic
- a real upstream app service is configured behind Caddy

### 3.3 Remaining Manual And DNS-Gated Items
The remaining first-host work is now narrower:
- keep the HTTPS placeholder honest until a real upstream exists
- prepare the LiveKit ingress topology behind the existing TLS edge
- keep LiveKit and any other upstream service unserved until their own cutover lane opens

### 3.4 Expected Filesystem Layout
The first host should standardize on:
- `/opt/chillywood` for owned service/runtime/config directories
- `/var/log/chillywood` for owned service logs

The next lane should create or verify subpaths such as:
- `/opt/chillywood/env`
- `/opt/chillywood/runtime`
- `/opt/chillywood/proxy`
- `/var/log/chillywood/reverse-proxy`
- `/var/log/chillywood/livekit`

This pass records the target layout only.
It does not claim those directories are already populated with live services.

### 3.5 Bootstrap Closeout Decision
Based on the verified host facts above, the first-host bootstrap state is complete enough to move to:
- narrow `Hetzner domain / TLS activation follow-up`

That means:
- base host access is no longer the blocker
- base hardening is no longer the blocker
- reverse proxy baseline is no longer the blocker
- real domain/DNS truth is now the exact next blocker

## 4. Hetzner-First Decision

### 4.1 First Machine Role
The first Hetzner machine should be a single:
- `realtime edge + ops ingress` host

That first machine is for:
- reverse proxy / TLS termination
- self-managed LiveKit later in the same cutover lane
- optional static status/legal/support hosting once those destinations are intentionally pointed there
- basic host-level monitoring and log retention

### 4.2 What This First Machine Is Not
This first machine is not:
- the primary database
- the auth provider
- the Supabase replacement
- the RevenueCat replacement
- the Firebase replacement
- the Expo/EAS replacement
- a general-purpose god-box for every future service

## 5. What Stays Local Or Hosted For Now

### 5.1 Stays Local / Dev-Owned
- Expo local development
- Metro / `expo start`
- local runtime validation
- local owner bootstrap execution
- Maestro/manual proof
- local preview verification work

### 5.2 Stays Hosted Outside Hetzner For Now
- Supabase database and auth
- Supabase Edge Functions
- Expo/EAS build and update flow
- Firebase analytics / Crashlytics / performance
- RevenueCat

### 5.3 Does Not Move In This Pass
- billing/payout infrastructure
- notification providers
- search/recommendation systems
- broader admin/support tooling

## 6. What Moves To Hetzner First

### 6.1 First-Move Service Boundary
The first honest Hetzner migration target is:
- realtime ingress

That means the first future production-like cutover should move:
- the LiveKit server endpoint
- the public reverse-proxy / TLS edge in front of that endpoint

### 6.2 Optional Early Add-On
Only if explicitly needed later, the same machine may also host:
- static legal/status/support pages

But that is secondary to the realtime edge role.

### 6.3 What Does Not Move In The First Cutover
The first cutover should not move:
- Supabase tables or auth
- the LiveKit token-signing logic out of `supabase/functions/livekit-token`
- app-store billing
- creator payouts
- analytics vendors

## 7. Secrets And Environment Requirements

### 7.1 Host-Side Private Secrets
The Hetzner host will need private values such as:
- ACME / TLS contact email
- Hetzner API token if later automation is ever used
- LiveKit API key
- LiveKit API secret
- canonical public realtime hostname

These must never be committed to source control.

Any currently known raw provider token must remain:
- out of repo docs
- out of committed env examples
- out of mobile runtime config
- out of terminal summaries when avoidable

### 7.2 Supabase Function Cutover Secrets
The existing `livekit-token` Supabase Edge Function remains part of the architecture for now.

Its server-side env must stay aligned with the Hetzner-hosted LiveKit endpoint:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_URL`

### 7.3 Mobile Runtime Public Config
The mobile runtime may need public override values after the realtime cutover:
- `EXPO_PUBLIC_LIVEKIT_URL`
- `EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT`
- optional legal/support URLs if those destinations later move to the Hetzner edge

## 8. Reverse Proxy And TLS Plan

### 8.1 Reverse Proxy Ownership
The first Hetzner machine should terminate TLS at a reverse proxy layer.

That proxy should own:
- public HTTPS ingress
- certificate renewal
- host-based routing for the realtime endpoint
- optional later static status/legal/support hosts

Current verified proxy baseline:
- Caddy is the chosen first proxy
- the active bootstrap config path is `/opt/chillywood/proxy/Caddyfile`
- `/etc/caddy/Caddyfile` points at that bootstrap config
- the current served surface is a placeholder HTTPS response on `live.chillywoodstream.com`
- the current HTTP behavior is redirect-only
- no production app upstream or LiveKit upstream is configured yet

### 8.2 Public Exposure Discipline
Public exposure should stay narrow:
- expose `80` and `443` only for web/TLS ingress
- keep service internals off public random ports where possible
- do not expose owner/admin dashboards directly from the first machine

### 8.3 TLS Discipline
TLS should be automatic and renewable.

Approved first-pass posture:
- Let's Encrypt or equivalent ACME-managed cert issuance
- one canonical realtime hostname
- no mixed HTTP/HTTPS production claims

## 9. Monitoring And Logging Plan

### 9.1 Keep Existing Client Observability
Current client observability remains valid and should stay in place:
- Firebase analytics
- Firebase Crashlytics
- Firebase performance

Hetzner-first work does not replace those systems.

### 9.2 New Host-Level Monitoring For The First Machine
The first Hetzner deployment should add only basic host/service monitoring:
- host CPU
- host RAM
- disk usage
- network saturation
- reverse proxy health
- LiveKit process health

### 9.3 Logging Boundaries
Logging should remain separated by owner:
- reverse proxy access/error logs on the Hetzner host
- LiveKit service logs on the Hetzner host
- Supabase Edge Function logs remain in Supabase
- mobile runtime errors remain in the app/mobile observability path

### 9.4 Alerting Posture
Start narrow:
- uptime alert for the public realtime hostname
- disk and memory pressure alerts
- repeated service restart alerts

Do not invent a larger observability program in this pass.

## 10. Deployment Order
From the current verified bootstrap, proxy, and TLS state, the next rollout should happen in this order:

1. keep `live.chillywoodstream.com` as the canonical realtime hostname
2. prepare the LiveKit host/service topology behind the existing TLS edge
3. wire the reverse-proxy host block to the real LiveKit upstream only after that upstream exists
4. verify the new realtime endpoint independently before mobile cutover
5. update Supabase Edge Function env so `livekit-token` signs against the Hetzner endpoint
6. update public mobile runtime config only after the new endpoint is healthy
7. verify through preview/internal builds before any broader production-like use

## 11. Rollback And Safety Notes

### 11.1 Rollback Rule
Do not remove or overwrite the current hosted realtime truth until the Hetzner path is verified.

### 11.2 Safe Rollback Path
If the Hetzner realtime cutover fails:
- restore the prior LiveKit URL in the Supabase function env
- restore the prior `EXPO_PUBLIC_LIVEKIT_URL` mobile runtime value
- keep the token endpoint path unchanged if possible
- do not widen the blast radius by moving unrelated services at the same time

### 11.3 Blast-Radius Discipline
The first Hetzner deployment should be:
- single-purpose
- reversible
- independent from auth/database migration

## 12. Why Docker Compose Templates Are Still Deferred In This Pass
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

## 13. OVH Later Add-On Plan
OVH is intentionally deferred.

It should be added later only as a second-provider layer for:
- DDoS-sensitive public edge backup
- failover or warm-standby realtime ingress
- later multi-provider resilience

OVH should not be introduced later as:
- the primary auth/database owner
- a rushed second copy of the whole app stack
- a justification for broader premature infrastructure sprawl

## 14. First Honest Follow-Up Lane
Once this prep is accepted, the first real infrastructure follow-up lane should be:
- narrow `LiveKit ingress deployment prep`

That later lane would prove, but not necessarily immediately deploy:
- the exact LiveKit service topology on this host
- the reverse-proxy upstream handoff behind the already-live TLS edge
- the precise cutover/rollback checklist for the Supabase token endpoint and mobile runtime values
