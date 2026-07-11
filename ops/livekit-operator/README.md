# LiveKit Autonomous Operator Host Agent

This folder documents a disabled-by-default host-side helper for `chillywood-prod-01`.
It also contains scheduler templates:

- `github-actions/` is not live until copied to `.github/workflows/` with
  credentials that can update workflow files, committed, pushed, and proved by a
  scheduled run.
- `systemd/` is the currently active host timer path for
  `chillywood-prod-01`. It calls only the scoped `watch_once` operator action.
- `workers/livekit-operator-scheduler/` is a Cloudflare Cron template. It is not
  currently active because cron attachment was blocked by Cloudflare Workers
  subdomain setup.

The mobile app must never SSH into the host or run provider operations. The backend
operator can report a recommended host action, and an operator may install a host
agent only on a trusted LiveKit host with secrets stored outside the repo.

Allowed checks:

- Docker service status.
- `chillywood-livekit` container status.
- Caddy/proxy status.
- Public websocket/HTTPS reachability for `live.chillywoodstream.com`.
- Existing `ops/livekit-registry/heartbeat-livekit.sh` heartbeat helper.
- `livekit-heartbeat-monitor.service` status.

Allowed safe repairs:

- Restart `livekit-heartbeat-monitor.service` when host proof shows only the monitor is stopped.
- Run the existing heartbeat helper/monitor path to refresh counters and heartbeat after host proof.

Owner approval required:

- LiveKit API/TURN secret rotation.
- Routing policy or stale-cutoff changes.
- Provider/server replacement.
- Caddy/LiveKit config rewrites.
- LiveKit/Caddy restarts unless service-down proof exists and no safer fix exists.
- Destructive database or provider changes.

No secrets, participant tokens, TURN credentials, API secrets, service-role keys,
SSH keys, or provider values may be printed or committed.
