# LiveKit Registry One-Box Operations

This folder holds server/operator helper material for the LiveKit Server Registry + Room Router + Drain Mode lane.

Current production reality:

- Chi'llywood has one Hetzner LiveKit box today: `chillywood-prod-01`.
- Public connect URL: `wss://live.chillywoodstream.com`.
- The registry/router does not create, buy, autoscale, migrate, delete, or drain rooms by itself.
- New RTC rooms can use `chillywood-prod-01` only while that server is `active`, recently heartbeating, and under capacity.
- Existing assigned rooms remain pinned to their assigned server. Draining prevents new rooms only.

## Function Actions

The operator function is `livekit-registry`. It expects a JSON body with one of these actions:

- `list`: owner/operator-only registry, assignment, and routing-audit readout.
- `upsert_server`: owner/operator-only server registration/update.
- `set_status`: owner/operator-only status changes for `active`, `draining`, `maintenance`, `disabled`, `standby`, or `offline`.
- `heartbeat`: server heartbeat. This can use `X-LiveKit-Registry-Heartbeat-Token` with the server-side `LIVEKIT_REGISTRY_HEARTBEAT_SECRET`, or owner/operator auth.

Do not place the heartbeat secret, Supabase service role key, LiveKit API secret, or internal API URLs in mobile code or docs.

## Register The Current Hetzner Box

The migration seeds `chillywood-prod-01` with `status=active`, provider `hetzner`, region `operator-set`, and `public_ws_url=wss://live.chillywoodstream.com`.

After remote migration/function deployment, set the real operator-provided region and capacity:

```bash
curl -fsS -X POST "$LIVEKIT_REGISTRY_FUNCTION_URL" \
  -H "Authorization: Bearer $OWNER_OR_OPERATOR_SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "action": "upsert_server",
    "server_id": "chillywood-prod-01",
    "display_name": "Chi'\''llwood Hetzner LiveKit 01",
    "provider": "hetzner",
    "region": "operator-set",
    "public_ws_url": "wss://live.chillywoodstream.com",
    "status": "active",
    "max_rooms": 100,
    "max_participants": 1000,
    "max_publishers": 100,
    "weight": 100
  }'
```

Replace `operator-set` with the operator-approved region label when it is known. Do not invent provider geography in code.

## Heartbeat

`heartbeat-livekit.sh` posts heartbeat data but does not invent metrics. For non-dry-run, provide real current counts from LiveKit/host monitoring:

```bash
# Export LIVEKIT_REGISTRY_HEARTBEAT_SECRET from the server secret store first.
LIVEKIT_REGISTRY_FUNCTION_URL="https://PROJECT.supabase.co/functions/v1/livekit-registry" \
LIVEKIT_SERVER_ID="chillywood-prod-01" \
LIVEKIT_ACTIVE_ROOMS="1" \
LIVEKIT_ACTIVE_PARTICIPANTS="8" \
LIVEKIT_ACTIVE_PUBLISHERS="2" \
LIVEKIT_CPU_PERCENT="35" \
LIVEKIT_RAM_PERCENT="62" \
LIVEKIT_MEMORY_USED_MB="4096" \
LIVEKIT_MEMORY_TOTAL_MB="8192" \
LIVEKIT_DISK_USAGE_PERCENT="44" \
LIVEKIT_NETWORK_RX_BPS="125000" \
LIVEKIT_NETWORK_TX_BPS="250000" \
LIVEKIT_NODE_STATUS="healthy" \
LIVEKIT_TURN_STATUS="proof_pending" \
LIVEKIT_METRICS_SOURCE="operator-monitoring" \
DRY_RUN=0 \
./ops/livekit-registry/heartbeat-livekit.sh
```

Supported non-secret metrics fields:

- Counts: `LIVEKIT_ACTIVE_ROOMS`, `LIVEKIT_ACTIVE_PARTICIPANTS`, `LIVEKIT_ACTIVE_PUBLISHERS`
- Percentages: `LIVEKIT_CPU_PERCENT`, `LIVEKIT_RAM_PERCENT`, `LIVEKIT_DISK_USAGE_PERCENT`, `LIVEKIT_PACKET_LOSS_PERCENT`
- Network: `LIVEKIT_BANDWIDTH_IN_MBPS`, `LIVEKIT_BANDWIDTH_OUT_MBPS`, `LIVEKIT_NETWORK_RX_BPS`, `LIVEKIT_NETWORK_TX_BPS`
- Memory: `LIVEKIT_MEMORY_USED_MB`, `LIVEKIT_MEMORY_TOTAL_MB`
- Safe status labels: `LIVEKIT_NODE_STATUS` (`healthy`, `degraded`, `unavailable`, `offline`, `unknown`) and `LIVEKIT_TURN_STATUS` (`configured`, `not_configured`, `unavailable`, `proof_pending`, `unknown`)
- Source/time: `LIVEKIT_METRICS_SOURCE`, `LIVEKIT_METRICS_COLLECTED_AT`

Do not put LiveKit API secrets, TURN credentials, internal URLs, database passwords, heartbeat secrets, or participant tokens into any metrics field. Missing metrics should be left unset/null; they must not be invented to justify higher capacity claims.

Dry-run is default:

```bash
LIVEKIT_REGISTRY_FUNCTION_URL="https://PROJECT.supabase.co/functions/v1/livekit-registry" \
LIVEKIT_SERVER_ID="chillywood-prod-01" \
DRY_RUN=1 \
./ops/livekit-registry/heartbeat-livekit.sh
```

## Drain Mode

Drain the current box before maintenance:

```bash
curl -fsS -X POST "$LIVEKIT_REGISTRY_FUNCTION_URL" \
  -H "Authorization: Bearer $OWNER_OR_OPERATOR_SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "action": "set_status",
    "server_id": "chillywood-prod-01",
    "status": "draining",
    "reason": "planned maintenance"
  }'
```

While draining:

- Existing assigned rooms still resolve to `chillywood-prod-01`.
- New rooms return a safe no-eligible-server response because there is no standby production box today.
- No participants are disconnected and no rooms are deleted by this lane.

Reactivate after maintenance and a fresh heartbeat:

```bash
curl -fsS -X POST "$LIVEKIT_REGISTRY_FUNCTION_URL" \
  -H "Authorization: Bearer $OWNER_OR_OPERATOR_SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "action": "set_status",
    "server_id": "chillywood-prod-01",
    "status": "active",
    "reason": "maintenance complete"
  }'
```

## Safe Failure

If `chillywood-prod-01` is `draining`, `offline`, `maintenance`, `disabled`, `standby`, stale, or full, new room token issuance must fail safely instead of silently falling back to a hardcoded LiveKit URL. There is no full autoscaling or standby activation in this lane.

## Remote Proof Status

Remote activation proof has passed for the current one-box production path:

- Remote migration `202605120004_livekit_server_registry_router.sql` is applied.
- `livekit-registry` and the routed `livekit-token` functions are deployed.
- `LIVEKIT_REGISTRY_HEARTBEAT_SECRET` is set server-side by name only.
- `chillywood-prod-01` is active with a fresh heartbeat.
- `watch-party-live`, `live-stage`, and `chat-call` token requests route through the registry and return `wss://live.chillywoodstream.com`.
- Repeated same-room requests reuse the existing assignment.
- Draining blocks new assignments while existing assigned rooms still resolve.
- Dummy standby/offline/full/stale records were proof-only and are disabled after proof.
- No autoscaling, provisioning, active-room migration, room deletion, participant disconnect, D7F spectator token change, or user-facing UI change was added.

## Metrics Readback Proof

Run the local deterministic proof after schema/function changes:

```bash
npm run proof:livekit-server-metrics
npm run guard:livekit-server-metrics-policy
```

If an owner/operator access token is available in the shell, the proof script can also read the deployed registry without printing the token:

```bash
LIVEKIT_REGISTRY_FUNCTION_URL="https://PROJECT.supabase.co/functions/v1/livekit-registry" \
LIVEKIT_REGISTRY_OPERATOR_ACCESS_TOKEN="$OWNER_OR_OPERATOR_SUPABASE_ACCESS_TOKEN" \
npm run proof:livekit-server-metrics
```

This proof is a metrics-readback proof only. It does not prove 10 passive viewers, higher active camera/mic seats, TURN allocation, or real host CPU/RAM/bandwidth unless those values were collected from the production host by an approved operator.
