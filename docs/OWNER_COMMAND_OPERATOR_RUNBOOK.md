# Owner Command Operator Runbook

The Owner Command Operator turns owner judgment into bounded execution plans. Owner makes judgment; the operator classifies the command, maps it to the existing autonomous system registry, creates exact preflight/proof/rollback steps, executes only safe scoped Level 0/1/2 work, and creates owner/super-admin approval requests for Level 3/4.

This is no god mode. It does not replace the owner, Rachi does not outrank owner authority, and it does not bypass any target autonomous operator. It routes through existing autonomous systems instead of mutating domains directly.

## System

- Edge Function: `owner-command-operator`
- Helper: `_lib/ownerCommandOperator.ts`
- Tables:
  - `owner_command_requests`
  - `owner_command_events`
  - `owner_command_execution_steps`
  - `owner_command_blockers`
- Admin surface: canonical `/admin`, Owner Command Center section
- CLI:
  - `owner-command:classify`
  - `owner-command:plan`
  - `owner-command:dry-run`
  - `owner-command:execute-approved`
  - `owner-command:status`
  - `owner-command:report`

## Command Flow

1. Owner submits a command through owner-authorized UI, CLI, or backend call.
2. The command is sanitized and classified.
3. The command maps to one or more active autonomous systems:
   - media work -> `media_automation`
   - LiveKit/realtime work -> `livekit_operator`
   - money/provider/ledger work -> `money_flow_control`
   - push delivery work -> `notification_delivery_operator`
   - OTA/release work -> `release_ota_operator`
   - owner/security/RLS/approval integrity work -> `security_owner_operator`
   - moderation/safety work -> `moderation_safety_operator`
   - crash/performance/analytics/runtime work -> `observability_runtime_operator`
4. The operator builds an execution plan with allowed scope, forbidden scope, preflight, rollback, proof, validation, target systems, and exact blockers.
5. Level 0/1/2 safe commands may execute only as scoped audit/report work or target-operator-safe actions.
6. Level 3/4 commands create `autonomous_approval_requests` and stop.
7. Approved Level 3/4 commands require fresh preflight, exact scope match, active emergency state, and audit before execution.
8. Level 4 still needs external confirmation where applicable.

## Risk Levels

- Level 0: safe read/report.
- Level 1: safe scoped status/report write.
- Level 2: bounded safe action with audit and rollback/fallback behavior.
- Level 3: owner/super-admin approval required.
- Level 4: owner/super-admin approval plus external confirmation required.

Unknown or ambiguous high-impact commands default to Level 3 or Level 4. Commands that include secret-like payloads are rejected or redacted.

## Forbidden Bypass

Owner Command Operator must not:

- move money without Level 4 approval plus external provider confirmation
- manually grant Premium
- bypass Premium
- publish or rollback OTA without approval
- mutate Remote Config or feature flags without approval
- mutate auth/RLS or owner roles without approval
- ban/restrict users or delete content without approval
- expose private, Premium, or original media
- mutate provider products or live modes
- change LiveKit routing policy
- change R2/media behavior
- print or store secrets, tokens, service-role keys, DB URLs, signed URLs, provider credentials, LiveKit tokens, R2/Cloudflare secrets, or payment secrets
- execute while a target system emergency stop is active
- exceed the exact approved scope

## Audit and Blockers

Every command writes an audit trail:

- `owner_command_requests` stores the owner command plan and status.
- `owner_command_events` stores received/classified/planned/approval/execution/blocker events.
- `owner_command_execution_steps` stores per-target system steps and proof.
- `owner_command_blockers` stores exact blocker and next-action rows.

Blocked commands return exact blockers, not vague failure. Examples:

- `owner_authorization_required`
- `target_system_not_identified`
- `secret_like_command_payload_blocked`
- `approval_request_required`
- `owner_approval_required`
- `approval_expired`
- `external_confirmation_required`
- `fresh_preflight_required`
- `exact_scope_match_required`
- `emergency_stop_or_pause_active`

## Admin

The canonical `/admin` Owner Command Center shows command input, risk level, target systems, blockers, proof report, and event history. The client does not hold owner-command tokens and does not run direct domain mutation. Live execution goes through the `owner-command-operator` function and existing autonomous systems.

## Validation

Required gates:

- `npm run proof:owner-command-operator`
- `npm run proof:owner-command-routing`
- `npm run proof:owner-command-approval-gates`
- `npm run guard:owner-command-operator`
- `npm run proof:autonomous-systems-contract`
- `npm run guard:autonomous-systems-contract`
- `npm run guard:autonomous-operating-model`
- `npx tsc --noEmit`
- `deno check supabase/functions/owner-command-operator/index.ts`
