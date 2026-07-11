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
- `_lib/livekit/livekitRenderTelemetry.ts`: redacted client render/token telemetry event helpers.
- `_lib/livekitRenderTelemetry.ts`: compatibility re-export for older proof imports.
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
- `fallback_flash_regression`
- `renderable_contract_regression`
- `surface_mount_regression`
- `roster_render_regression`
- `app_token_validation_regression`
- `token_time_skew_blocker`
- `backend_router_regression`
- `heartbeat_regression`
- `deployment_regression`
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

## Client Render And Token Telemetry

The app emits sanitized telemetry to `livekit-operator` through `render_event_ingest`. This path requires an authenticated app user but does not require the operator token because it cannot execute recovery or write arbitrary health state. It stores only sanitized, rate-limited events through service-owned operator tables. Client telemetry cannot directly trigger recovery.

Covered event classes include:

- `livekit_token_received`
- `livekit_token_nbf_future_grace_used`
- `livekit_token_nbf_rejected`
- `livekit_token_expired_rejected`
- `livekit_renderable_contract_set`
- `livekit_renderable_contract_preserved`
- `livekit_renderable_contract_cleared`
- `livekit_surface_mount_attempt`
- `livekit_surface_mounted`
- `livekit_fallback_roster_shown`
- `livekit_fallback_roster_suppressed`
- `livekit_camera_preparing`
- `livekit_camera_track_present`
- `livekit_bubble_grid_rendered`
- `livekit_connection_state_changed`

Token timing is bucketed. Participant tokens, LiveKit secrets, TURN secrets, auth sessions, API keys, signed URLs, provider credentials, and raw token payloads are not sent.

This catches the July 11 app-side regression class: a backend-issued token with `nbf` about one second in the future is classified as normal bounded grace, while a materially future token is classified as `token_time_skew_blocker`. If a valid renderable contract is cleared or a fallback roster appears while the contract is valid, the operator records `renderable_contract_regression` or `fallback_flash_regression`.

## Activation Mode

Current mode: `limited_scheduled_safe_recovery_active_systemd_timer`.

Scheduler option audit:

- GitHub Actions: preferred when available, but the current `gh` token has `gist`, `read:org`, and `repo` scopes only. It cannot create or update `.github/workflows` without `workflow` scope, so the GitHub workflow remains a template at `ops/livekit-operator/github-actions/livekit-operator-reliability-loop.yml`.
- Supabase scheduled function / `pg_cron`: not selected. The installed Supabase CLI is `2.75.0` and exposes no scheduler command in this workspace. A database cron path would add more database-scheduler state and token-storage decisions than the selected host timer path.
- Cloudflare Cron Trigger: not active. The Worker template `chillywood-livekit-operator-scheduler` has `workers_dev=false`, no public routes, cron `*/5 * * * *`, a public function URL var, and a single secret `LIVEKIT_OPERATOR_TOKEN`, but live cron attachment failed with Cloudflare error `10063` because the account needs a Workers subdomain before schedules can be installed.
- Host systemd timer: selected and active. `chillywood-livekit-operator-watch-once.timer` runs every five minutes on `chillywood-prod-01`, uses a root-readable env file at `/etc/chillywood/livekit-operator.env`, and executes only the scoped `watch_once` operator call with systemd privilege restrictions.
- Manual CLI: remains available through `livekit-operator:watch-once`, but is no longer the only active path.

The deployed `livekit-operator` Edge Function accepts manual and scheduled `watch_once` calls with the narrow operator token. `LIVEKIT_OPERATOR_ENABLE_SAFE_RECOVERY=true` allows only Level 1/2 scoped actions inside the operator function. The active systemd timer calls `watch_once` every five minutes and the operator writes an audit event for each run. The host timer does not use service-role keys, does not mutate LiveKit routing policy or server registry state directly, and redacts long token-like output before journaling.

Live proof for activation returned:

- `healthState=healthy`
- `reason=eligible_server_available`
- `eligibleServerCount=1`
- `plannedAction=audit_only`
- `executionStatus=not_executed`

Fail-closed checks:

- missing operator token -> `401 operator_token_required`
- unauthenticated render telemetry -> `401 authenticated_user_required`

## Proof Commands

```bash
npm run proof:livekit-autonomous-operator
npm run proof:livekit-surface-health
npm run proof:livekit-render-telemetry
npm run proof:livekit-operator-recovery-loop
npm run proof:watch-party-live-fallback-smoothing
npm run guard:livekit-autonomous-operator-policy
```

Live status requires the operator function URL and token to already be present in
the local operator shell:

```bash
npm run livekit-operator:status
```

Do not paste the token into chat or docs.

Current deployment posture: the `livekit-operator` Edge Function is deployed, the schema migration is applied, a narrow operator token hash is active in Supabase, and the matching token is stored only in the host env file for `chillywood-livekit-operator-watch-once.timer`. Missing or invalid operator calls still deny with `401 operator_token_required`, app telemetry requires app auth, and no broad operator access exists. GitHub Actions remains a prepared template until `.github/workflows/livekit-operator-reliability-loop.yml` can be added with a GitHub credential that has workflow-file permission. The Cloudflare Cron Worker template remains inactive until the Workers subdomain prerequisite is satisfied and a schedule run is proved.
