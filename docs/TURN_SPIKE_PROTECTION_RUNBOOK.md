# TURN Spike Protection Runbook

Date: 2026-05-14

Purpose: give Chi'llywood operators a practical, non-user-facing response path for LiveKit/TURN bandwidth spikes without changing Live Stage, Live Watch-Party, Watch-Party Live, Player, creator media, Supabase content, billing, payouts, or Hetzner Object Storage.

## Current Status

- Admin Live Cost Guard exists as an owner/operator-only observe-first control plane.
- Default Admin Live Cost Guard settings are `enabled=false` and `mode=observe_only`.
- The guard records settings, events, and action audit rows.
- Production Prometheus/Alertmanager metrics are not claimed live until configured and proved.
- Production TURN firewall/coturn caps are not claimed live.
- The scripts in `scripts/infra/` are repo-side operator helpers only. They do not apply production firewall or service changes by themselves.

## What TURN Is For

TURN relays media when users cannot connect peer/media paths directly because of strict NAT, firewalls, mobile carrier networks, enterprise networks, or other network restrictions. For Chi'llywood, TURN can be necessary for Live Watch-Party and Watch-Party Live users to stay connected when direct UDP/media paths are blocked.

TURN is useful, but it can become expensive because relayed media egress is real network traffic leaving the server. A stuck room, publishing loop, high-bitrate sender, unexpected fallback-to-relay behavior, or abuse can create a fast bandwidth spike.

## Why TURN Egress Can Create Runaway Cost

- Relay traffic may carry audio/video for multiple participants.
- A room behind difficult networks can push more traffic through TURN than normal.
- A broken client loop can reconnect or republish repeatedly.
- A malicious or compromised participant can attempt high-volume relay traffic.
- Provider egress billing may continue while the incident is being investigated.

Use current provider billing/pricing pages for cost math. Do not treat old estimates, script defaults, or another provider's pricing as truth.

## Severity Levels

Thresholds must be calibrated after real baseline traffic. Until then, keep them as placeholders and use operator judgment.

| Severity | Placeholder trigger | Expected posture |
| --- | --- | --- |
| WARN | TURN egress exceeds normal baseline or first alert fires | Confirm the spike, estimate burn, and watch top rooms/users/IPs. |
| HIGH | Sustained spike or projected hourly cost is materially above normal | Prepare token pauses/caps; preserve evidence; alert operators. |
| CRITICAL | Runaway egress, abuse suspicion, or unacceptable projected cost | Stop new token issuance if needed, apply a TURN cap, and consider relay shutdown as last resort. |

## Minimum Production Metrics

Production monitoring should capture at least:

- TURN egress bytes/sec.
- Total relay bandwidth.
- Active TURN allocations/sessions.
- LiveKit room count.
- Top rooms by bandwidth if available.
- Top users/participants by bandwidth if available.
- Top source IPs if logs allow and privacy/security review permits.
- Host network egress.
- Estimated cost burn per hour.

Recommended Alertmanager thresholds:

- WARN threshold: `<calibrate_after_baseline>`.
- HIGH threshold: `<calibrate_after_baseline>`.
- CRITICAL threshold: `<calibrate_after_baseline>`.

Do not enable automated production enforcement from placeholder thresholds.

## Exact Triage Order

A. Confirm spike.

- Check provider network graphs, host counters, LiveKit metrics, TURN metrics, and Admin Live Cost Guard events.
- Run `scripts/infra/turn-egress-snapshot.sh` on the host if available.

B. Estimate GiB/hour and projected $/hour.

- Convert the current spike into GiB/hour.
- Run `scripts/infra/turn-burn-rate-estimator.sh <gib_per_hour> <cost_per_gib>`.
- Use current vendor billing/pricing for `cost_per_gib`.

C. Identify top rooms/users/IPs if logs allow.

- Review LiveKit room metrics, TURN allocation/session metrics, and safe logs.
- Avoid publishing private IPs, tokens, or user data into public tickets.

D. Stop new token issuance if needed.

- Use Admin -> Live Cost Guard to request or record `pause_new_live_rooms` only after operator confirmation.
- This affects new Live Watch-Party and Watch-Party Live token issuance only when the guard is explicitly enabled outside observe-only.
- Existing rooms are not automatically disconnected by this step.

E. Apply TURN cap.

- Use `scripts/infra/turn-emergency-cap.sh cap` for dry-run guidance.
- To proceed, require `DRY_RUN=0 CONFIRM_TURN_EMERGENCY=YES`.
- The script still prints operator commands/steps and does not silently modify firewall/service state.

F. Disable relay traffic only as last resort.

- Relay shutdown may degrade Live Watch-Party and Watch-Party Live for users behind strict NAT, carrier networks, enterprise firewalls, or other relay-dependent networks.
- Use `scripts/infra/turn-emergency-cap.sh disable-relay` only when cost/security risk is worse than relay degradation.

G. Preserve evidence.

- Save sanitized timestamps, graphs, event ids, room names where safe, participant identities where appropriate, provider counters, and action audit rows.
- Do not commit raw private logs, IP exports, tokens, secrets, signed URLs, or user reports.

H. Restore gradually.

- Remove temporary caps in stages.
- Record `restore_normal_mode` in Admin Live Cost Guard.
- Watch metrics for at least one cooldown window.
- Confirm Live Watch-Party and Watch-Party Live can mint tokens normally after the incident.

## Emergency Communication Template

Subject: Chi'llywood LiveKit/TURN cost incident - `<severity>` - `<timestamp UTC>`

Summary:

- Severity: WARN / HIGH / CRITICAL
- Current estimated egress: `<GiB/hour or Mbps>`
- Estimated burn: `<$/hour>`
- Impact: `<none / new live token pause / TURN relay degraded / under investigation>`
- Active mitigation: `<observe / token pause / cap requested / relay disabled>`
- Next update by: `<timestamp UTC>`

Operator notes:

- Do not include secrets, tokens, private IP exports, raw reports, or credential material.
- If relay is capped or disabled, state that strict-NAT/firewalled users may see degraded Live Watch-Party or Watch-Party Live connectivity.

## Finance / Audit Evidence Checklist

- Incident start/end timestamps in UTC.
- Provider egress graph or sanitized summary.
- GiB/hour estimate and cost-per-GiB source.
- Admin Live Cost Guard event ids.
- Admin Live Cost Guard action ids.
- Room names or participant identities only where operationally necessary.
- Operator name/id for manual actions.
- Before/after settings snapshots.
- Confirmation that no billing, payout, or live-money action was triggered by this incident response.

## Rollback / Restore Checklist

1. Confirm cost spike is below WARN threshold for at least one cooldown window.
2. Remove any temporary host cap manually if one was applied.
3. Restore TURN relay service/config only if it was changed.
4. Record `restore_normal_mode` in Admin Live Cost Guard.
5. Confirm new Live Watch-Party and Watch-Party Live token issuance uses normal TTL.
6. Confirm Live Stage and Player behavior were not changed.
7. Preserve sanitized audit notes and do not commit private logs.

## Relation To Admin -> Live Cost Guard

Admin -> Live Cost Guard is the repo-backed visibility and audit layer. It can store settings, manual events, webhook events, and action requests. In `observe_only`, it logs only and must not kick users, throttle publishers, pause rooms, shorten tokens, or mutate TURN/firewall state.

This runbook is the operational host-side response guide. The runbook and scripts support operators during an incident, but they are not proof that production TURN caps or Alertmanager automation are active.

## Operator Scripts

- `scripts/infra/turn-egress-snapshot.sh`: read-only host/network snapshot.
- `scripts/infra/turn-burn-rate-estimator.sh`: cost estimate helper.
- `scripts/infra/turn-emergency-cap.sh`: dry-run emergency action guide.

Run them from a trusted operator shell. Do not run them from the mobile app, public web site, or client runtime.

## Credential / Token Notes

- LiveKit token issuance reads `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, and related server values from Supabase Edge Function environment variables.
- The mobile app does not mint LiveKit room tokens locally.
- The current repo also supports optional client-visible communication ICE/TURN config through `EXPO_PUBLIC_COMMUNICATION_*`; those values must not contain privileged long-lived TURN secrets.
- No TURN username/password/API secret is hardcoded in repo code.
- If production TURN credentials are issued outside this repo, deployment must apply least-privilege/short-lived credential rules and operator monitoring there.

## Known Limitations

- Production Prometheus and Alertmanager wiring is pending until configured and proved.
- DKIM/email deliverability is separate from TURN cost protection.
- Automatic TURN firewall/coturn mutation is not implemented.
- No SSH/Ansible action is wired here.
- No Android/device proof is required for this runbook lane.
- This lane does not change Live Stage UI, Watch-Party Live UI, Player UI, creator media, billing, payouts, Supabase content, or Hetzner Object Storage.
