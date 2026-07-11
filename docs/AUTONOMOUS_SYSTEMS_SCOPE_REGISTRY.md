# Chi'llywood Autonomous Systems Scope Registry

Last updated: 2026-07-11

This registry is the protected top-level contract for Chi'llywood autonomous systems. The source registry lives in `_lib/autonomousSystemsRegistry.ts`; this document is the operator-facing mirror. Future autonomous scope must be added through explicit registry entries with approval level, read/write bounds, guard, proof, rollback, emergency-stop/fallback, and owner/admin approval requirements. In short, future scope can be added only through registry entries.

## Current Systems

### `media_automation`

Status: bounded source/CLI automation with object-storage shutdown readiness closed.

Activation modes:
- `off`
- `dry_run`
- `manual_cli`
- `bounded_run`
- `limited_scheduled_if_approved`

Current activation: `bounded_run`

Scheduler status: no daemon, cron, or queue processor enabled.

Allowed surfaces:
- media scan
- catalog readiness
- auto-detect planning
- source-aware rendition ladder
- transcode worker
- `media_renditions` audit
- R2 public/free playback
- Premium protected HD rows
- object-storage R2 migration/readiness
- backup/restore

Allowed writes:
- scoped `media_transcode_jobs`
- scoped `media_renditions`
- scan result writes through trusted scanner authority
- migration audit/resolution metadata
- private backup/export artifacts

Forbidden:
- private/Premium/original public exposure
- unscanned/moderation-blocked processing
- broad uncapped backfill
- fake audit pass
- deleting private source objects without approval
- billing/Premium/auth/RLS/payout changes

Required gates:
- backup/restore
- scan/moderation
- audit before trust
- rollback/quarantine
- kill switch/emergency stop
- fallback
- secret scan

Required proofs/guards:
- `proof:media-automation-controller`
- `proof:media-automation-cli`
- `proof:media-object-storage-zero-hetzner`
- `guard:autonomous-operating-model`
- `guard:media-delivery-architecture`
- `guard:media-object-storage-migration`
- `guard:vod-quality-policy`

Level 3 media expansion example: broad media backfill or a new scheduler requires an approval request before execution.

### `livekit_operator`

Status: `limited_scheduled_safe_recovery_active_systemd_timer`.

Activation modes:
- `manual_cli`
- `limited_scheduled_probe`
- `limited_scheduled_safe_recovery`

Current activation: `limited_scheduled_safe_recovery`

Scheduler status: `chillywood-livekit-operator-watch-once.timer` every five minutes.

Allowed surfaces:
- `live_stage`
- `watch_party_live`
- `party_room_live_sidecar`
- `chat_call`
- `livekit_token`
- `livekit_router`
- `heartbeat_monitor`
- `host_agent`
- `render_telemetry`

Allowed writes:
- `livekit_operator_events`
- `livekit_surface_health_snapshots`
- `livekit_operator_recovery_actions`
- `livekit_operator_learning_state`
- legitimate heartbeat monitor invocation
- scoped safe recovery audit

Forbidden:
- fake heartbeat
- stale cutoff loosening
- broad DB mutation
- marking unhealthy server active without host proof
- secret rotation
- TURN credential changes
- provider/server replacement
- Premium bypass
- R2/media writes
- auto-source OTA without policy gate

Required gates:
- narrow token
- constant-time token validation
- RLS/client-write deny
- audit every action
- safe recovery only
- learning cannot override Level 3/4 owner approval
- scheduler status must match actual installed systemd/GitHub/Cloudflare state

Required proofs/guards:
- `proof:livekit-autonomous-operator`
- `proof:livekit-surface-health`
- `proof:livekit-render-telemetry`
- `proof:livekit-operator-recovery-loop`
- `guard:livekit-autonomous-operator-policy`
- `guard:livekit-heartbeat-monitor-policy`
- `guard:watch-party-livekit-camera`

Level 4 LiveKit expansion example: secret rotation, TURN changes, server replacement, or provider replacement requires owner approval plus external provider confirmation.

## Expansion Contract

Any new autonomous system, surface, action, scheduler, write path, or recovery action must add an explicit registry entry with:

- system id
- action/surface id
- activation mode
- allowed read scope
- allowed write scope
- forbidden scope
- approval level
- proof script
- guard script
- rollback/quarantine behavior
- kill switch/fallback behavior
- owner/admin approval requirement for Level 3/4

High-risk domains may not be listed as Level 0/1/2:

- auth/RLS
- billing/provider
- Premium entitlement
- payout/cashout
- destructive DB
- public/private exposure
- app store/public release
- provider plan/add-on

## Owner/Admin Approval Path

Level 3/4 actions create `autonomous_approval_requests` and immutable request events through trusted service/operator authority only. Client writes are denied by default. The request must include a risk summary, proposed action, allowed write scope, forbidden scope, rollback plan, kill switch plan, proof plan, validation plan, expiration, and redacted metadata.

Approval execution is live through `platform_role_memberships` owner/super-admin authority and the canonical `/admin` command center. Trusted operator markers use `AUTONOMOUS_APPROVAL_REQUEST_TOKEN_SHA256` when configured or the existing server-side `OPS_APPROVAL_TOKEN` fallback; neither secret is client-bundled or printed. Rachi may request or recommend, but Rachi cannot approve itself and never outranks the owner. Autonomous operators cannot approve their own Level 3/4 requests. Approved requests expire, and approval does not execute automatically: the operator must re-run fresh preflight, match the approved system/action/write scope exactly, verify no emergency stop is active, and write execution audit before closure.

Owner/super-admin review is bounded to the approval framework. It does not create manual Premium toggles, provider billing controls, payout/cashout controls, broad auth/RLS mutation, R2/media behavior changes, LiveKit routing-policy changes, or destructive DB authority. Those remain governed by their registry approval level and external confirmation requirements.

Do not deploy a new scheduler, daemon, worker, broad DB mutation path, public/private exposure change, payment/provider change, or secret rotation from this registry without the required approval path.
