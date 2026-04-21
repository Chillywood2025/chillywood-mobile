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

Current app-upstream readiness decision:
- `APP_UPSTREAM_READY = LATER_BOUNDED_SLICE`

That means:
- there is still no current deployable app-owned HTTP upstream for Caddy to front on Hetzner
- Expo/EAS mobile delivery remains the app-distribution owner
- the only later bounded non-realtime candidate currently grounded in repo truth is public legal-page hosting
- any future Hetzner app upstream still needs a separate export/deployment contract pass before deployment prep begins

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
- Caddy now reverse-proxies the public hostname to the on-host LiveKit service
- plain HTTP on `:80` now redirects to HTTPS
- Docker and Docker Compose are installed and enabled on-host
- the deploy user is in the `docker` group
- the LiveKit service layout now exists under:
  - `/opt/chillywood/livekit`
  - `/opt/chillywood/livekit/bin`
  - `/opt/chillywood/livekit/config`
  - `/opt/chillywood/livekit/data`
  - `/opt/chillywood/livekit/runtime`
- a protected host-only LiveKit env/config now exists under:
  - `/opt/chillywood/livekit/runtime/livekit.env`
  - `/opt/chillywood/livekit/config/livekit.yaml`
- the first LiveKit container is now actually running on-host
- the current public HTTPS response body now comes from the LiveKit upstream (`OK`) rather than the older placeholder edge page
- the current Supabase project secret state now includes:
  - `LIVEKIT_API_KEY`
  - `LIVEKIT_API_SECRET`
  - `LIVEKIT_URL`
- the current deployed-default mobile runtime now points to:
  - `wss://live.chillywoodstream.com`

This still does not imply:
- a broader app upstream is deployed on this host
- the machine serves the full Chi'llywood product
- databases or auth moved off Supabase
- app-store or Google Play release readiness is complete

### 3.3 Remaining Manual Items
The remaining first-host work is now narrower:
- keep the now-proved token-issuance path connected to the now-proved two-device authenticated join proof
- preserve the now-proved canonical Party Room deep-link path into the realtime verification target
- preserve the now-proved two-real-device `watch-party-live` handoff for room `XQBBRE`
- keep broader app hosting and non-realtime upstreams out of scope until their own lanes open
- treat app-upstream hosting as a separate later doctrine question, not an implied next step from the current LiveKit host state

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
- narrow `app upstream doctrine / readiness pass`

That means:
- base host access is no longer the blocker
- base hardening is no longer the blocker
- reverse proxy baseline is no longer the blocker
- real domain/DNS truth is no longer the blocker
- one Android client/session proof is no longer the blocker
- two-real-device authenticated `watch-party-live` proof is no longer the blocker
- the next unresolved infra question is whether any non-realtime Hetzner app upstream should exist at all, not whether the LiveKit ingress path works

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
- static legal pages

Still not justified yet in current repo truth:
- broader support hosting
- a public status host

Current legal-surface readiness decision:
- `LEGAL_SURFACE_READY = YES_BOUNDED_STATIC_SLICE`

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
- the current served surface is the real LiveKit upstream response on `live.chillywoodstream.com`
- the current HTTP behavior is redirect-only
- the public hostname now proxies to the on-host LiveKit service
- no broader production app upstream is configured yet

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
From the current verified bootstrap, proxy, TLS, and LiveKit-ingress state, the next rollout should happen in this order:

1. keep `live.chillywoodstream.com` as the canonical realtime hostname
2. keep the current on-host LiveKit service and Caddy upstream aligned and healthy
3. keep Supabase Edge Function env aligned so `livekit-token` signs against the Hetzner endpoint
4. keep public mobile runtime config aligned with the Hetzner endpoint
5. verify through preview/internal builds or other real client/session proof before any broader production-like use
6. only after that, open the next lane for broader realtime verification or app-upstream work

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

## 12. LiveKit-Only Service Scaffolding Boundary
This repo still does not prove a broader app-owned server topology.

What is now justified and already real is only a bounded LiveKit ingress slice:
- Docker and Docker Compose on the host
- `/opt/chillywood/livekit` service directories
- protected host-only LiveKit config and env
- repo-side `infra/hetzner/livekit.env.example`
- repo-side `infra/hetzner/docker-compose.livekit.yml`
- a running on-host LiveKit container
- Caddy proxying the public realtime hostname to that container
- Supabase signer env aligned to the Hetzner realtime hostname
- mobile runtime defaults aligned to the Hetzner realtime hostname

What is still intentionally deferred:
- a broader app-stack Compose topology
- any broader app upstream
- any database or auth migration
- any release-hardening or Google Play lane

Current app-upstream decision remains:
- `APP_UPSTREAM_READY = LATER_BOUNDED_SLICE`

The realtime boundary is now real enough that the next lane is doctrine for a bounded non-realtime slice, not more LiveKit scaffolding.

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

## 14. Current LiveKit Ingress Prep Scope
The current infrastructure follow-up lane is now:
- closed enough to move on from realtime verification

This lane now includes:
- preserving the already-proved signer/runtime alignment against the new host truth
- preserving the already-proved canonical Party Room deep-link path into `watch-party-live`
- preserving the now-proved two-real-device authenticated join boundary on `live.chillywoodstream.com`

This lane still does not include:
- broader app hosting on Hetzner
- database/auth migration
- OVH/failover work
- Google Play release hardening

## 15. Next Honest Follow-Up Lane
Once this prep chapter is accepted, the next real infrastructure follow-up lane should be:
- narrow `public legal-surface export prep`

That later lane should decide, but not overclaim:
- how the existing public legal owners become hostable static assets
- what public legal URLs and Caddy/static-file ownership they would use
- whether deployment is actually worth doing once the export artifact is defined
