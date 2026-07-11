# LiveKit Autonomous Operator Runbook

## Scope

The LiveKit Autonomous Operator covers every Chi'llwood surface that depends on routed LiveKit token contracts:

- Live tab -> Live Stage.
- Watch-Party Live / Shared Player.
- Party Room live camera sidecar.
- Live Stage host/viewer/speaker.
- `chat-call` when it uses `livekit-token`.
- Any path using `prepareLiveKitJoinBoundary`, `livekit-token`, or the LiveKit router.

This is not a Live-tab-only operator.

## Safety Boundaries

The operator is limited to LiveKit health and recovery state. It must not mutate R2/media storage, Premium billing, RevenueCat or Google Play products, auth/RLS unrelated behavior, payouts, cashout, App Links, or unrelated Chat/native behavior.

The operator must never:

- Loosen `LIVEKIT_ROUTER_HEARTBEAT_STALE_SECONDS` to hide failures.
- Write fake heartbeat rows.
- Mark a LiveKit server healthy without real host proof.
- Print LiveKit API secrets, participant tokens, TURN secrets, service-role keys, DB URLs, SSH keys, or provider credentials.
- Execute Level 3/4 actions without owner approval.

## Components

- `_lib/livekitAutonomousOperator.ts`: pure health classification, recovery planning, auto-execution gating, and learning-state model.
- `_lib/livekitRenderTelemetry.ts`: redacted client render telemetry event helpers.
- `supabase/migrations/20260711043323_livekit_autonomous_operator.sql`: scoped operator tables with RLS enabled and client writes revoked.
- `supabase/functions/livekit-operator/index.ts`: token-gated Edge Function using `x-livekit-operator-token` and `LIVEKIT_OPERATOR_TOKEN_SHA256`.
- `scripts/livekit-operator-cli.mjs`: CLI wrapper for status, probe, plan, safe recovery, report, surface health, and learning report.
- `ops/livekit-operator/`: disabled-by-default host-agent notes.

## Health States

Core states:

- `healthy`
- `degraded`
- `stale_heartbeat`
- `no_eligible_server`
- `token_issuer_unavailable`
- `function_blob_missing`
- `websocket_unreachable`
- `host_service_down`
- `heartbeat_monitor_down`
- `capacity_counter_stale`
- `capacity_full`
- `render_surface_flicker`
- `render_contract_missing`
- `render_identity_mismatch`
- `camera_track_missing`
- `unknown_requires_review`

## Safe Recovery Levels

Level 0 is read/report only.

Level 1/2 actions may be autonomous when scoped, token-gated, audited, and backed by host/router proof:

- Run the legitimate heartbeat monitor.
- Report and plan known Edge Function blob redeploy.
- Restart heartbeat monitor service only from a trusted host agent when service-stopped proof exists.
- Refresh capacity counters through the heartbeat monitor path.
- Record affected-surface pause recommendations.
- Recover the client UI to a stable LiveKit bubble shell when a renderable contract is valid.
- Write audit/recovery events.

Level 3/4 actions require owner approval:

- Secret rotation.
- TURN credential changes.
- Routing policy/cutoff/capacity threshold changes beyond approved bounds.
- Provider/server replacement.
- Deleting LiveKit records.
- Destructive DB migration.
- Billing/provider changes.
- Host rebuild or broad infrastructure change.

## Watch-Party Live Fallback Smoothing

Shared Player no longer swaps immediately to the separate roster placeholder while LiveKit is connecting, refreshing authority, or preserving a same-room non-expired renderable contract. It keeps `LiveKitStageMediaSurface` mounted when a renderable contract exists, and otherwise shows a stable in-surface `Connecting LiveKit` shell for `1200-2000ms` before the separate roster fallback is allowed. Hard failures such as room errors, expired contracts, or room mismatch still fall back safely.

Approved host/speaker bubbles without a camera track show `Camera preparing`; they must not disappear, borrow another participant's track, or claim a fake camera feed.

## Audit And Learning

Operator writes are scoped to:

- `livekit_operator_events`
- `livekit_operator_recovery_actions`
- `livekit_surface_health_snapshots`
- `livekit_operator_learning_state`

The learning state counts repeated incidents by surface/state/reason/action, tracks success/failure counts, stores confidence, and recommends safer future actions. It never learns from secrets and never upgrades Level 3/4 actions into autonomous actions.

## Proof Commands

```bash
npm run proof:livekit-autonomous-operator
npm run proof:livekit-surface-health
npm run proof:watch-party-live-fallback-smoothing
npm run guard:livekit-autonomous-operator-policy
```

Live status requires operator function URL and token in the local operator shell:

```bash
LIVEKIT_OPERATOR_FUNCTION_URL="https://PROJECT.functions/v1/livekit-operator" \
LIVEKIT_OPERATOR_TOKEN="$LIVEKIT_OPERATOR_TOKEN" \
npm run livekit-operator:status
```

Do not paste the token into chat or docs.

Current deployment posture: the `livekit-operator` Edge Function is deployed and the schema migration is applied, but the long-lived operator token is intentionally disabled unless an owner-held token is stored outside git and `LIVEKIT_OPERATOR_TOKEN_SHA256` is rotated to its hash. This preserves fail-closed behavior: missing or invalid operator calls deny with `401 operator_token_required`, and no broad operator access exists by default.
