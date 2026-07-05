# LiveKit Server Heartbeat Recovery Watch-Party Live / Live Stage Proof

Date: 2026-07-05

Verdict: Partial.

Artifact folder: `/tmp/livekit-server-heartbeat-recovery-watch-party-live-stage-proof-20260705-162020/`.

## Executive Summary

Premium remains Closed and Watch-Party Party Room remains Closed. The current Watch-Party Live sidecar and Live Stage failures are now classified as LiveKit infrastructure/runtime liveness. `chillywood-prod-01` is still registered as `active`, but its heartbeat is stale beyond the router's 120-second cutoff, leaving production with zero eligible LiveKit servers. A health-checked heartbeat monitor and durable watchdog templates were added, deployed, and validated, but the monitor currently returns `livekit_public_endpoint_unreachable` and correctly refuses to write a fake heartbeat.

## Root Cause

The LiveKit router rejects servers with stale heartbeats. Supabase readback showed `chillywood-prod-01` marked active with `wss://live.chillywoodstream.com`, but `last_heartbeat_at` was stale by roughly 300k seconds during final readback. Recent app symptoms mapped to token routing failure:

- Watch-Party Live: `Live feed unavailable`
- Watch-Party Live: `Live video is temporarily unavailable. Try again in a moment.`
- Routing/token layer: no eligible LiveKit server while the only production active server heartbeat is stale

This is not a Premium entitlement failure, not a Watch-Party Party Room failure, and not a Chi'lly Chat/native call failure.

## What Was Broken

The existing host heartbeat helper could post supplied metrics, but it did not independently verify the real public LiveKit endpoint/API health before updating `last_heartbeat_at`. If the heartbeat reporter stops or the LiveKit host becomes unreachable, the router correctly fails closed after `staleHeartbeatSeconds = 120`, but there was no durable self-healing/watchdog path in repo to keep the heartbeat alive or fail loudly.

## What Changed

Source changes:

- Added `supabase/functions/livekit-heartbeat-monitor/index.ts`.
- Added `scripts/check-livekit-routing-health.mjs`.
- Added `scripts/guard-livekit-heartbeat-monitor-policy.mjs`.
- Added `ops/livekit-registry/systemd/livekit-heartbeat-monitor.service`.
- Added `ops/livekit-registry/systemd/livekit-heartbeat-monitor.timer`.
- Updated `ops/livekit-registry/heartbeat-livekit.sh` to verify the public endpoint before posting in non-dry-run mode.
- Updated `ops/livekit-registry/README.md` with the health-checked monitor and LiveKit upgrade policy.
- Registered the Edge function in `supabase/config.toml`.
- Added npm scripts for the guard and health check.

The monitor:

- runs outside the mobile app,
- requires server-side secrets,
- verifies the public LiveKit endpoint before updating registry state,
- calls the LiveKit API with server credentials,
- counts rooms, participants, and publishers,
- inserts `livekit_server_heartbeats`,
- updates `livekit_servers.last_heartbeat_at` only after health checks pass,
- logs redacted non-secret diagnostics,
- fails closed when public/API health checks fail.

## Self-Healing / Watchdog

`ops/livekit-registry/systemd/livekit-heartbeat-monitor.service` is the preferred durable watchdog shape. It is designed to run from the LiveKit host or a trusted backend runner with secrets in `/etc/chillywood/livekit-heartbeat-monitor.env`, invokes the health-checked monitor on an interval, and uses `Restart=always` so crashes are supervised. A timer template is included for environments that prefer timer-driven activation, but the long-running service is the primary documented path.

This lane did not install the service on the LiveKit host because host SSH/network access was unavailable from the repo environment. The next operator action is to install and enable it on the trusted LiveKit host/backend runner after the host/container/network is reachable.

## Auto-Update / Upgrade Policy

Production LiveKit must not be blindly auto-upgraded. The runbook now documents:

- pin the LiveKit server/container version,
- use Renovate/Dependabot-style PRs for proposed version changes,
- run pre-upgrade and post-upgrade health checks,
- keep rollback instructions to the previous pinned version,
- never auto-deploy a LiveKit server upgrade without health checks and rollback.

## Backend Health Readback

Final `npm run check:livekit-routing-health` readback:

- `eligibleServerCount=0`
- `staleHeartbeatCount=5`
- `disabledServerCount=4`
- `staleHeartbeatSeconds=120`
- `chillywood-prod-01.status=active`
- `chillywood-prod-01.publicWsUrl=wss://live.chillywoodstream.com`
- `chillywood-prod-01.heartbeatAgeSeconds=300222`
- `chillywood-prod-01.rejectionReasons=["stale_heartbeat"]`

The script failed intentionally with:

- `chillywood-prod-01 heartbeat is stale: 300222s > 120s`

Monitor invocation proof:

- result: `livekit_public_endpoint_unreachable`
- HTTP status: `503`
- heartbeat update: not written

## Watch-Party Live Token / Routing Audit Result

No successful current Watch-Party Live token routing was proved after this fix because the backend still has zero eligible LiveKit servers. The expected post-recovery result is a `room_assigned` or `assignment_reused` routing audit row plus a `watch-party-live` token request success with `room_join=true` and `can_subscribe=true`.

## Live Stage Token / Routing Audit Result

No successful current Live Stage token routing was proved after this fix because the backend still has zero eligible LiveKit servers. The expected post-recovery result is a `live-stage` token request success with `room_join=true`.

## R5 / R3 Installed-Device Proof Result

Installed mobile proof was not rerun in this lane. Running the Play-installed v79 Watch-Party Live or Live Stage flows while the router still has zero eligible servers would only reproduce `Live feed unavailable` / `Live video is temporarily unavailable. Try again in a moment.`

Previous installed truth remains:

- Premium: Closed.
- Watch-Party Party Room: Closed.
- Watch-Party Live sidecar: Partial pending backend LiveKit liveness recovery and current playback proof.
- Live Stage: Partial pending backend LiveKit liveness recovery and current Stage / `2 in room` proof.
- Chi'lly Chat/native calls: separate stack, unchanged.

## Validation

Passed:

- `deno check supabase/functions/livekit-heartbeat-monitor/index.ts`
- `npm run guard:livekit-heartbeat-monitor-policy`
- `npm run guard:premium-sandbox-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run validate:runtime`
- `npm run guard:route-contracts --if-present`
- `npx tsc --noEmit`
- `git diff --check`
- `git diff --cached --check`

Backend health proof:

- `npm run check:livekit-routing-health` ran and failed as intended while backend health is still bad.

## Safety Confirmation

No Premium entitlement logic, Chi'lly Chat call stack, native call stack, LiveKit stale heartbeat cutoff, routing eligibility bypass, fake/manual heartbeat proof, live money, payout/cashout, provider billing, auth/RLS, mobile sideload, `adb install`, reinstall, token printing, secret exposure, or production provider mutation happened.

No LiveKit API keys, participant tokens, Supabase service-role keys, auth tokens, TURN credentials, private environment values, signed URLs, or private identifiers are committed in this doc.

## Issues Fixed

- Added a health-checked heartbeat monitor that can keep a healthy LiveKit server eligible without trusting invented metrics.
- Added a health readback/guard command that fails loudly when production has zero eligible servers.
- Added watchdog templates and runbook guidance.
- Updated the old heartbeat helper to fail closed on public endpoint reachability failure.
- Reclassified the current sidecar/Live Stage blocker as LiveKit backend liveness instead of Premium.

## Issues Still Open

- The real LiveKit host/container/network for `wss://live.chillywoodstream.com` is still unreachable to the health monitor.
- `chillywood-prod-01` still has a stale heartbeat and remains ineligible.
- Watch-Party Live sidecar playback and Live Stage / `2 in room` installed proof remain Partial until backend liveness is restored.
- The systemd watchdog template still needs to be installed/enabled on the LiveKit host or trusted backend runner by an operator with host access.
