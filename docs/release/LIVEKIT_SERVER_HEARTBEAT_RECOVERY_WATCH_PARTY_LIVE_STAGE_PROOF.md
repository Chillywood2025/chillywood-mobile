# LiveKit Server Heartbeat Recovery Watch-Party Live / Live Stage Proof

Date: 2026-07-05

Verdict: Closed for backend LiveKit routing/heartbeat recovery. Installed Watch-Party Live sidecar and Live Stage smoke remain separate current-v79 product proof lanes.

Artifact folder: `/tmp/livekit-server-heartbeat-recovery-watch-party-live-stage-proof-20260705-162020/`.

## Executive Summary

Premium remains Closed and Watch-Party Party Room remains Closed. The Watch-Party Live sidecar and Live Stage backend failure was LiveKit infrastructure/runtime liveness: `chillywood-prod-01` was registered as `active`, but its heartbeat was stale beyond the router's 120-second cutoff, leaving production with zero eligible LiveKit servers. The health-checked heartbeat monitor and durable watchdog templates were added, deployed, validated, and then installed on the LiveKit host after Hetzner unblocked the endpoint. Current backend readback now shows an eligible healthy server, fresh host heartbeat, reachable WSS endpoint, and successful `watch-party-live` / `live-stage` token routing.

## July 10/11 Global Router Eligibility Recovery

Follow-up installed debugging found the same global failure class again: the app-side Live Stage render fallback and Premium gate were fixed, but `livekit-token` returned `503 no_eligible_livekit_server`, so routed LiveKit surfaces could not receive usable token contracts. This was not caused by R2, object storage, Premium, or the Live tab button itself.

Production router readback showed `chillywood-prod-01` was still the only real active server, with `wss://live.chillywoodstream.com`, normal capacity counters, and no CPU/RAM/packet-loss/bandwidth rejection. The exact rejection was `stale_heartbeat`: `last_heartbeat_at` was older than the 120-second cutoff. Host proof showed the server was reachable, Docker was active, Caddy was active, the `chillywood-livekit` container was running, and the public HTTPS/WSS host was reachable. The host heartbeat monitor service was active, but its function call returned `NOT_FOUND_FUNCTION_BLOB` for `livekit-heartbeat-monitor`, so legitimate heartbeat updates stopped.

Repair action was limited to redeploying the existing `livekit-heartbeat-monitor` Edge Function source and invoking the legitimate host monitor path once from `chillywood-prod-01`. No LiveKit stale cutoff was loosened, no fake heartbeat rows were inserted, no server was marked healthy without host proof, no LiveKit server restart was required, and no secrets or participant tokens were printed. Post-repair readback showed fresh `livekit-heartbeat-monitor` heartbeats, heartbeat age under cutoff, router eligibility restored for `chillywood-prod-01`, and no fresh `no_eligible_livekit_server` blocker.

Installed proof on Play-installed `R5CR120QCBF` renewed Premium through the approved Google Play / RevenueCat sandbox flow, entered Live Stage, received a `live-stage` host contract with `room_join=true`, `can_subscribe=true`, and `can_publish=true`, and rendered a visible local camera surface with `shouldRenderLiveKitStage=true` and `publishLocalStageCamera=true`. Fresh installed two-device Watch-Party Live / Party Room camera sidecar proof was not rerun in this lane; historical `watch-party-live` and `chat-call` token audit rows remain successful, and those surfaces share the repaired router eligibility path.

## July 5 Retry Closure

Retry artifact folder: `/tmp/livekit-hetzner-recheck-20260705-retry2/`.

Current repaired state:

- Hetzner server `chillywood-prod-01`: `running`.
- IPv4 `87.99.145.160`: `Blocked: no`.
- IPv6 `2a01:4ff:f0:7064::/64`: `Blocked: no`.
- No Hetzner Cloud firewall is attached.
- Docker is active on the host.
- Caddy is active and serves `https://live.chillywoodstream.com`.
- `chillywood-livekit` container is running.
- LiveKit listens on the expected host/container ports.
- `livekit-heartbeat-monitor.service` is installed on the host, active/enabled, and supervised with `Restart=always`.
- The heartbeat monitor secret is stored in Supabase/host secret storage by name only and is not printed or committed.
- The systemd unit template now uses a valid `Documentation=file:/...` URL.

Final backend health:

- `npm run check:livekit-routing-health` passes without `LIVEKIT_HEARTBEAT_MONITOR_INVOKE`.
- `eligibleServerCount=1`.
- `noEligibleServerCountRecent=0`.
- `staleHeartbeatSeconds=120`.
- `chillywood-prod-01.status=active`.
- `chillywood-prod-01.publicWsUrl=wss://live.chillywoodstream.com`.
- `chillywood-prod-01.heartbeatAgeSeconds=11` on final readback.
- `livekitNodeStatus=healthy`.
- `metricsSource=livekit-heartbeat-monitor`.
- `rejectionReasons=[]`.

Endpoint/token proof:

- A raw WebSocket handshake to `wss://live.chillywoodstream.com/rtc` opened successfully with an in-memory token; no token was printed.
- Fresh `watch-party-live` token requests succeeded for host and viewer proof roles with `error_code=null`, `room_join=true`, `can_subscribe=true`, and server host `live.chillywoodstream.com`.
- Fresh `live-stage` token requests succeeded for host and viewer proof roles with `error_code=null`, `room_join=true`, `can_subscribe=true`, and server host `live.chillywoodstream.com`.
- Fresh routing audit rows show `room_assigned` and `assignment_reused` for `chillywood-prod-01`.
- Fresh routing audit rows show no `no_eligible_server`.

This closes the backend `no_eligible_livekit_server` blocker. Current installed Watch-Party Live sidecar playback and Live Stage / `2 in room` proof remain separate product smoke lanes and should be rerun only if requested.

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

## Original Backend Health Readback Before Retry

Original `npm run check:livekit-routing-health` readback before Hetzner unblock and host monitor install:

- `eligibleServerCount=0`
- `staleHeartbeatCount=5`
- `disabledServerCount=4`
- `staleHeartbeatSeconds=120`
- `chillywood-prod-01.status=active`
- `chillywood-prod-01.publicWsUrl=wss://live.chillywoodstream.com`
- `chillywood-prod-01.heartbeatAgeSeconds=300222`
- `chillywood-prod-01.rejectionReasons=["stale_heartbeat"]`

At that time, the script failed intentionally with:

- `chillywood-prod-01 heartbeat is stale: 300222s > 120s`

Original monitor invocation proof:

- result: `livekit_public_endpoint_unreachable`
- HTTP status: `503`
- heartbeat update: not written

## Watch-Party Live Token / Routing Audit Result

Retry closure proved successful current Watch-Party Live token routing. Fresh redacted token audit rows showed `watch-party-live` outcomes `success`, `error_code=null`, `room_join=true`, and `can_subscribe=true`; fresh routing audit rows showed `room_assigned` / `assignment_reused` to `chillywood-prod-01`.

## Live Stage Token / Routing Audit Result

Retry closure proved successful current Live Stage token routing. Fresh redacted token audit rows showed `live-stage` outcomes `success`, `error_code=null`, `room_join=true`, and `can_subscribe=true`; fresh routing audit rows showed `room_assigned` / `assignment_reused` to `chillywood-prod-01`.

## R5 / R3 Installed-Device Proof Result

Installed mobile proof was not rerun in this backend retry lane. The backend `no_eligible_livekit_server` blocker is closed; current Play-installed v79 Watch-Party Live sidecar playback and Live Stage / `2 in room` proof remain separate product smoke lanes.

Previous installed truth remains:

- Premium: Closed.
- Watch-Party Party Room: Closed.
- Watch-Party Live sidecar: Partial pending current playback proof now that backend LiveKit liveness is restored.
- Live Stage: Partial pending current Stage / `2 in room` proof now that backend LiveKit liveness is restored.
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

- Play-installed v79 Watch-Party Live sidecar playback still needs a current product smoke rerun after backend recovery.
- Play-installed v79 Live Stage / `2 in room` still needs a current product smoke rerun after backend recovery.
- Broader public-production LiveKit hardening still needs load/reconnect/cellular/TURN/metrics proof before public production claims.

## July 5 Production Endpoint Repair Follow-Up

Follow-up host/provider inspection narrowed the unreachable endpoint to a Hetzner primary IP block:

- DNS: `live.chillywoodstream.com` resolves to `87.99.145.160`.
- Hetzner server: `chillywood-prod-01` is `running`.
- Hetzner IPv4 primary IP `87.99.145.160`: `Blocked: yes`.
- Hetzner IPv6 primary IP `2a01:4ff:f0:7064::/64`: `Blocked: yes`.
- Hetzner Cloud firewall list: empty; no firewall is attached.
- Public probes: SSH and service ports time out.
- Traceroute: reaches Hetzner and then `blocked.hetzner.com`.

This provider-block state is now superseded by the July 5 retry closure above. It remains documented as the earlier failure state, not the current blocker.
