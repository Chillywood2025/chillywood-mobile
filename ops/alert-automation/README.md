# Chi'llywood Ops Alert Automation Safety Gate

This package is a standalone backend ops service for Prometheus Alertmanager webhooks. It receives alerts, validates them, creates persistent jobs, records JSONL audit events, and plans safe actions.

It is not a mobile app feature. It does not change Watch-Party Live, Live Stage, Player, Supabase migrations/functions, Hetzner HLS, creator upload/player flows, or any user-facing route.

## Safety Model

- `DRY_RUN=true` by default.
- `ALLOW_LIVE_ACTIONS=false` by default.
- `ALLOW_NET_SHAPING=false` by default.
- Webhook receipt never runs destructive actions.
- Every destructive or network-changing action requires a recorded approval first.
- Approved LiveKit admin actions still block unless `ALLOW_LIVE_ACTIONS=true` and `DRY_RUN=false`.
- Approved network shaping still block unless `ALLOW_NET_SHAPING=true` and `DRY_RUN=false`.
- Alert labels never become arbitrary shell commands.
- LiveKit API secrets, webhook secrets, approval tokens, and provider secrets must stay outside git.

## Endpoints

- `GET /healthz`
- `POST /webhook/alert`
- `GET /jobs/:id`
- `POST /jobs/:id/approve`
- `POST /jobs/:id/deny`

When `OPS_WEBHOOK_SECRET` is set, webhook requests must include:

```text
X-Ops-Signature: sha256=<hex hmac over raw JSON body>
```

Approval and denial require:

```text
X-Ops-Approval-Token: <OPS_APPROVAL_TOKEN>
```

Optional:

```text
X-Ops-Approved-By: <operator id>
```

## Allowed Alert Actions

| Alertname | Planned action | Real execution gate |
| --- | --- | --- |
| `TurnAllocationSurge` | TURN cap script and optional network shaping | approval + `ALLOW_NET_SHAPING=true` + `DRY_RUN=false` |
| `RoomZombieStuck` | LiveKit `DeleteRoom` for `labels.room` | approval + `ALLOW_LIVE_ACTIONS=true` + `DRY_RUN=false` |
| `PublisherFlood` | LiveKit `RemoveParticipant` for `labels.room` and `labels.identity` | approval + `ALLOW_LIVE_ACTIONS=true` + `DRY_RUN=false` |
| `LiveKitHighEgress` | Network throttle proposal | approval + `ALLOW_NET_SHAPING=true` + `DRY_RUN=false` |
| `ServerCpuMemoryPressure` | Observe/log only | never destructive |

Unknown alert names are recorded as no-op and do not fail the webhook.

## Local Development

```bash
cd ops/alert-automation
npm install
npm run typecheck
npm run test
npm run build
```

Run locally:

```bash
DRY_RUN=true \
ALLOW_LIVE_ACTIONS=false \
ALLOW_NET_SHAPING=false \
OPS_APPROVAL_TOKEN=test-approval-token \
npm run dev
```

## Curl Proof

Create a Turn allocation job:

```bash
curl -sS -X POST http://127.0.0.1:8080/webhook/alert \
  -H 'Content-Type: application/json' \
  -d '{
    "receiver":"local",
    "status":"firing",
    "alerts":[{
      "status":"firing",
      "labels":{"alertname":"TurnAllocationSurge"},
      "startsAt":"2026-05-12T00:00:00Z",
      "fingerprint":"turn-local-proof"
    }]
  }'
```

Create a stuck-room job:

```bash
curl -sS -X POST http://127.0.0.1:8080/webhook/alert \
  -H 'Content-Type: application/json' \
  -d '{
    "receiver":"local",
    "status":"firing",
    "alerts":[{
      "status":"firing",
      "labels":{"alertname":"RoomZombieStuck","room":"ops-proof-room"},
      "startsAt":"2026-05-12T00:00:00Z",
      "fingerprint":"room-local-proof"
    }]
  }'
```

Approval without a token should fail:

```bash
curl -sS -X POST http://127.0.0.1:8080/jobs/<job-id>/approve
```

Approval with a token while `ALLOW_LIVE_ACTIONS=false` should be blocked by safety:

```bash
curl -sS -X POST http://127.0.0.1:8080/jobs/<job-id>/approve \
  -H 'X-Ops-Approval-Token: test-approval-token' \
  -H 'X-Ops-Approved-By: local-proof'
```

Read the audit log:

```bash
tail -n 20 ./data/audit.log
```

## Deployment

1. Build the package:
   ```bash
   npm install
   npm run build
   ```
2. Copy the package to `/opt/chillywood/ops/alert-automation`.
3. Create `/etc/chillywood/ops-alert-automation.env` from `systemd/ops-alert-automation.env.example`.
4. Set only the required secret values on the server. Do not commit env files.
5. Install the systemd unit from `systemd/ops-alert-automation.service`.
6. Keep `DRY_RUN=true`, `ALLOW_LIVE_ACTIONS=false`, and `ALLOW_NET_SHAPING=false` until a bounded production approval run is explicitly authorized.

## Alertmanager Wiring

Use `alertmanager/alertmanager.example.yml` as a starting point. If `OPS_WEBHOOK_SECRET` is enabled, add HMAC signing at a trusted proxy or sidecar because Alertmanager webhook receivers do not natively compute request HMAC signatures.

Prometheus example rules are in `prometheus/alert-rules.example.yml`. They are examples only and not production thresholds.

## Rollback

For network shaping, the rollback script is:

```bash
RUN_OPS_SCRIPT=1 DRY_RUN=0 sudo ./scripts/net-throttle-rollback.sh <interface>
```

The service-level rollback is:

```bash
systemctl stop ops-alert-automation
```

Keep the audit log and job store for incident review unless retention policy says otherwise.

## Audit Logs

Audit entries are JSONL and include event type, timestamp, job id, alert name, action type, dry-run status, operator marker when supplied, and reason. They must not contain LiveKit API secrets, webhook secrets, approval tokens, provider credentials, or raw private keys.
