# Chi'llywood Ops Alert Automation Safety Gate

This package is a standalone backend ops service for Prometheus Alertmanager webhooks. It receives alerts, validates them, creates persistent jobs, records JSONL audit events, and plans safe actions.

It is not a mobile app feature. It does not change Watch-Party Live, Live Stage, Player, Supabase migrations/functions, Hetzner HLS, creator upload/player flows, or any user-facing route.

## Safety Model

- `DRY_RUN=true` by default.
- `ALLOW_LIVE_ACTIONS=false` by default.
- `ALLOW_NET_SHAPING=false` by default.
- Optional ops email notifications are disabled by default and notify only.
- Webhook receipt never runs destructive actions.
- Every destructive or network-changing action requires a recorded approval first.
- Approved LiveKit admin actions still block unless `ALLOW_LIVE_ACTIONS=true` and `DRY_RUN=false`.
- Approved network shaping still block unless `ALLOW_NET_SHAPING=true` and `DRY_RUN=false`.
- Alert labels never become arbitrary shell commands.
- LiveKit API secrets, webhook secrets, approval tokens, and provider secrets must stay outside git.

## Endpoints

- `GET /healthz`
- `POST /webhook/alert`
- `GET /jobs`
- `GET /jobs/:id`
- `POST /jobs/:id/approve`
- `POST /jobs/:id/deny`

`GET /jobs` supports `status` and `limit` query params and returns sanitized recent jobs only.
`GET /jobs` and `GET /jobs/:id` require `X-Ops-Admin-Token` when `OPS_ADMIN_READ_TOKEN` is configured.
Neither read endpoint returns approval tokens, LiveKit secrets, SMTP credentials, raw headers, raw HLS URLs, provider secrets, raw device tokens, or arbitrary annotations.

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

Admin job reads, when `OPS_ADMIN_READ_TOKEN` is set, require:

```text
X-Ops-Admin-Token: <OPS_ADMIN_READ_TOKEN>
```

## Optional Email Notifications

Email is notification-only. It cannot approve, deny, or execute actions.

Set these values only on the server or deployment secret store:

```text
OPS_EMAIL_ENABLED=false
OPS_EMAIL_PROVIDER=smtp
OPS_EMAIL_FROM=
OPS_ADMIN_EMAILS=
OPS_SMTP_HOST=
OPS_SMTP_PORT=465
OPS_SMTP_USER=
OPS_SMTP_PASS=
OPS_SMTP_SECURE=true
OPS_ADMIN_PANEL_BASE_URL=
OPS_EMAIL_TEST_MODE=false
```

When `OPS_EMAIL_ENABLED=true`, the service sends one sanitized email for each newly created actionable job that has a valid plan and requires approval.
It does not email for unknown no-op alerts, resolved no-op alerts, invalid action plans, or duplicate/idempotent alerts.
Email failures are audited as `email_failed` and do not crash webhook handling or run actions.
Automated tests and local proof use `OPS_EMAIL_TEST_MODE=true`; production should keep that false and configure real SMTP values externally.

## Admin Panel Visibility

The Chi'llywood Admin Command Center includes an Ops Alerts tab that documents the safety gate and secure-proxy blocker.
The mobile Admin panel does not call the ops service directly in this lane and does not store `OPS_APPROVAL_TOKEN`.
Approve/Deny controls remain disabled there until a trusted server-side admin proxy owns the approval token server-side.
Active approval/denial remains available only through the backend ops service endpoints protected by `X-Ops-Approval-Token`.

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
OPS_EMAIL_ENABLED=true \
OPS_EMAIL_PROVIDER=smtp \
OPS_ADMIN_EMAILS=test@example.com \
OPS_EMAIL_FROM=ops@example.com \
OPS_ADMIN_PANEL_BASE_URL=http://localhost:3000/admin/ops-alerts \
OPS_EMAIL_TEST_MODE=true \
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

Expected email-proof audit events for a new actionable job are `email_queued` then `email_sent` when local test mode is enabled.
Duplicate actionable alerts should produce `email_skipped_duplicate` and no second `email_sent`.
Unknown alerts should produce no email event.

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

Audit entries are JSONL and include event type, timestamp, job id, alert name, action type, dry-run status, operator marker when supplied, and reason. Email-specific events are `email_queued`, `email_sent`, `email_failed`, `email_skipped_duplicate`, and `email_skipped_disabled`. Audit logs must not contain LiveKit API secrets, webhook secrets, approval tokens, SMTP credentials, provider credentials, raw HLS URLs, raw device tokens, or raw private keys.
