# Admin Live Cost Guard

Live Cost Guard is Chi'llywood's admin-only control plane for LiveKit and TURN runaway-cost protection.

It is not a public feature. Normal users should not see it, and it must not change Live Watch-Party, Watch-Party Live, Live Stage, Player, spectator playback, billing, payouts, or creator upload behavior unless an owner/operator explicitly enables a guarded mode after proof.

## Current Status

- Default mode: `observe_only`.
- Default enabled state: `false`.
- Admin visibility: owner/operator only.
- Backing tables: `admin_live_cost_guard_settings`, `admin_live_cost_guard_events`, `admin_live_cost_guard_actions`.
- Alertmanager webhook: scaffolded as `admin-live-cost-guard-webhook`.
- Manual admin action endpoint: scaffolded as `admin-live-cost-guard-action`.
- TURN cap behavior: request/runbook only. No SSH, Ansible, firewall, coturn, or host mutation is automated in this lane.
- Metrics status: not connected until Prometheus/Alertmanager are configured and proved.

## Why This Exists

TURN relay traffic can become expensive when a room or participant gets stuck, when network fallback pushes media through relay, or when a publisher floods traffic. Live Cost Guard gives operators a backed audit trail, conservative settings, and staged manual/automatic remediation hooks before any destructive action is allowed.

## Modes

- `observe_only`: logs events/actions only. It cannot kick, throttle, shorten token TTL, pause rooms, or request TURN caps.
- `manual_approval`: confirmed owner/operator actions may run through the server-side action endpoint and are audit logged.
- `auto_protect`: Alertmanager events may trigger staged server-side actions only when `enabled=true`.

## Staged Actions

- `shorten_token_ttl`: new Live Watch-Party and Watch-Party Live tokens can be shortened during a cooldown window.
- `restrict_publish`: target a room participant and remove publish permission through LiveKit server APIs when configured.
- `remove_participant`: remove a targeted participant through LiveKit server APIs for critical/emergency states.
- `pause_new_live_rooms`: pause new Live Watch-Party and Watch-Party Live token issuance during a cooldown window.
- `turn_bandwidth_cap_requested`: record an operator request only. Apply any TURN cap manually from the host runbook.
- `restore_normal_mode`: cancel cooldown-scoped guard actions for token issuance.

## Required Environment Variables

- `LIVE_COST_GUARD_ENABLED=false`
- `LIVE_COST_GUARD_MODE=observe_only`
- `LIVE_COST_GUARD_WEBHOOK_SECRET`
- `LIVE_COST_GUARD_PROMETHEUS_URL` optional
- `LIVE_COST_GUARD_ALERTMANAGER_URL` optional
- `LIVE_COST_GUARD_MAX_USD_PER_HOUR` optional

LiveKit remediation also requires the existing server-side LiveKit secrets to be present where the Edge Function runs:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Do not place any of these secrets in mobile code, repo docs, screenshots, logs, or committed files.

## Alertmanager Receiver Example

Point Alertmanager at the Supabase Edge Function URL for `admin-live-cost-guard-webhook` and add the shared secret header at a trusted proxy or webhook integration layer:

```yaml
receivers:
  - name: chillywood-live-cost-guard
    webhook_configs:
      - url: https://<project-ref>.functions.supabase.co/admin-live-cost-guard-webhook
        send_resolved: true
```

Required header:

```text
x-chillywood-live-cost-guard-secret: <server-side secret>
```

## Recommended Initial Thresholds

Use conservative observe-only thresholds until real production baselines exist:

- Warning Mbps: choose a value slightly above normal peak TURN relay usage.
- Critical Mbps: choose a value that requires immediate operator review.
- Emergency Mbps: choose a value that justifies pausing new live/watch-party tokens.
- Max USD/hour: leave unset until provider billing math is trusted.

Do not invent thresholds from fake metrics. The first production pass should collect and review real metrics before enforcement.

## Manual Test Procedure

1. Confirm Admin Live Cost Guard is visible only to owner/operator accounts.
2. Confirm settings read as `enabled=false`, `mode=observe_only`.
3. Log a test warning event from Admin.
4. Confirm an event row appears with source `manual`.
5. Request `shorten_token_ttl` in observe-only.
6. Confirm an action row is written but the action is not applied.
7. Send a webhook without the secret and confirm it is rejected.
8. Send a safe Alertmanager test payload with the secret and confirm it logs an event.
9. Keep `auto_protect` disabled until proof rooms and operator review are complete.

## Rollback

1. Set `enabled=false`.
2. Record `restore_normal_mode`.
3. Rotate `LIVE_COST_GUARD_WEBHOOK_SECRET` if needed.
4. Confirm new Live Watch-Party and Watch-Party Live token issuance uses normal TTL.
5. Preserve events/actions for audit history.

## What Is Not Live Yet

- Production Prometheus metric readout is not proved.
- Alertmanager production delivery is not proved until the webhook is deployed and tested.
- Automatic TURN caps are not live.
- SSH/Ansible/host mutation is not wired.
- No normal user sees Admin Live Cost Guard.
- No billing, payout, Player, Live Stage, Watch-Party Live UI, or spectator HLS behavior is changed by default.
