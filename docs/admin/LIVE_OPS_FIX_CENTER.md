# Live Ops Fix Center Runbook

Owner/Admin Live Ops Fix Center is an approval surface for Live Stage, Watch-Party Live, and Chi'lly Chat call reliability incidents. It is additive to Admin Command Center and does not redesign Live Stage, Watch-Party Live, Chi'lly Chat, audio/video call UI, room layouts, Premium gates, participant rendering, call permissions, or token grants.

## Sources

- Alertmanager posts real alerts to `ops/alert-automation`.
- The ops service classifies only supplied labels/annotations and mirrors sanitized cards to `admin_live_ops_incidents`.
- The mobile Admin tab reads through `admin-live-ops-fix-center`, which re-checks owner/operator role membership server-side.
- Missing metrics stay missing. The UI must not show fake participants, fake stats, fake TURN bytes, fake room health, or sample incident cards.
- Chi'lly Chat calls use the existing canonical LiveKit token surface `chat-call`; `chat-video-call` and `chat-audio-call` are incident display categories derived from `active_call_type`/alert labels, not new token grants.

## Diagnosis Rules

- High join failures plus token/signaling errors means likely token/signaling issue.
- Joined users plus blank feeds plus low relay bytes means likely TURN/media path issue.
- Joined users plus blank feeds plus normal relay bytes means likely client render/subscription issue.
- One unhealthy LiveKit node means drain the bad node and route new rooms away after approval.
- Cellular-only failures mean TURN/cellular proof failure.
- Android-only failures mean app/client build or LiveKit SDK path issue.
- Chat-call token issue failed means token issuer/config problem.
- Chat-call signaling failed means LiveKit signaling/server problem.
- Caller joined but callee did not means call invite, membership, signaling, or client wake/join issue.
- Both chat users joined but no remote media plus low relay bytes means TURN/media path problem.
- Both chat users joined but blank video plus normal relay bytes means client render/subscription problem.
- Chat audio-only, camera publish, or microphone publish failures mean device permission, app build, or LiveKit SDK publish-path issue.
- Ended call still joinable means call lifecycle/security issue.
- Stale active call or cleanup failed means cleanup/expiration issue.

## Approved Actions

- GitHub issue creation for code-level fixes.
- Draft PR creation only from an existing fix branch; never merge or deploy.
- Failed GitHub Actions job rerun only by explicit job id.
- LiveKit server draining or maintenance status to keep new rooms away from an unhealthy server.
- Fresh-heartbeat standby activation when a standby is already registered.
- Stale assignment clearing only after server-side stale/inactive/member checks pass.
- Chi'lly Chat stale call cleanup only after dry-run and approval prove the communication room is ended/expired and no fresh active/reconnecting membership remains.
- LiveKit restart and infra rollback only through protected allowlisted scripts, explicit approval, `ALLOW_INFRA_ACTIONS=true`, and `DRY_RUN=false`.

## Required Protections

- Default `DRY_RUN=true`.
- Keep `ALLOW_GITHUB_ACTIONS=false`, `ALLOW_LIVE_OPS_REGISTRY_ACTIONS=false`, and `ALLOW_INFRA_ACTIONS=false` until an owner/operator approves a bounded proof.
- Never put `OPS_APPROVAL_TOKEN`, service-role keys, LiveKit API secrets, SMTP credentials, provider credentials, raw HLS URLs, or device tokens in client code, alerts, email, or logs.
- Every action requires an idempotent ops job, owner/operator authorization, server-side proxy execution, rate-limit checks, and audit rows.
- No automatic production code merge, deploy, restart, rollback, room migration, fake health, or fake participants.
- Do not force-end active calls, delete chat history, silently change call state, or expose ops tokens to the mobile app.

## Manual Proof Still Needed

- Deploy the migration and Supabase function.
- Configure `OPS_AUTOMATION_BASE_URL`, `OPS_APPROVAL_TOKEN`, and optional `OPS_ADMIN_READ_TOKEN` as Supabase function secrets.
- Configure ops mirroring with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Configure `LIVE_OPS_STALE_CHAT_CALL_MIN_AGE_SECONDS` if the default one-hour stale-call safety window is not appropriate for production proof.
- Configure GitHub token/repository only if issue/PR/job rerun actions are desired.
- Prove production Prometheus/Grafana/LiveKit exporter labels before enabling example rules.
- Prove real chat-call alert labels (`affected_purpose=chat-call`, safe `thread_id`/`call_id`, platform, server, call mode) before claiming production call coverage.
- Prove standby routing only after a standby server has a fresh heartbeat.
- Prove restart/rollback scripts on a protected operator host before enabling `ALLOW_INFRA_ACTIONS`.
