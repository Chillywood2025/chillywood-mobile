# Live Room Moderation Incident Response

Live-room moderation and incident response: Closed for production policy, current backed host controls, LiveKit token authority, and incident-response proof after validation. Staff force-end or deeper live mutation remains limited to backed live-ops paths; unsupported direct staff mutations escalate instead of using unsafe generic room writes.

Account restriction and appeals operations: Closed for current production policy and existing backed enforcement. Restricted, disabled, deleted, scheduled-deletion, and suspended users fail closed for live rooms and LiveKit tokens where backed. Restore does not bypass LiveKit source-of-truth checks, seat approval, participant caps, stale-room handling, or block policy.

Emergency controls, incident response, and kill-switch governance is documented in `docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md`. Live-room harassment and LiveKit emergency actions require exact scope, reason, audit where backed, safe public copy, and post-incident audit review; LiveKit tokens, raw room URLs, raw IPs, reporter identity, and private evidence remain protected.

This document covers Live Watch-Party, Watch-Party Live, Live Stage, Party Room, waiting rooms, shared watch-party player rooms, participant tiles, seat requests, room chat/messages, live reports, stale-room cleanup, and LiveKit token issuing. It does not rewrite room architecture, loosen LiveKit authority, create a staff role, activate money, execute refunds, or change provider products.

LiveKit token issuer remains source of truth for publish authority. Moderator actions cannot grant publish authority accidentally. Host/authorized seat approval remains separate from staff moderation. Blocked, disabled, deleted, scheduled-deletion, and suspended users fail closed. Force-end/remove/mute/revoke actions require exact scope, reason, and audit where backed. Live safety reports route to live-safety queue. Urgent live safety categories escalate differently. Passive viewers remain separate from active publishers. Participant caps remain enforced after moderation actions. Reconnect/refresh does not bypass moderation state. Stale room handling remains protected. Reporter identity remains private. No LiveKit tokens, raw room URLs, signed URLs, raw IPs, provider secrets, tax IDs, bank details, or private provider IDs are exposed.

Chat/call moderation and notification abuse controls do not weaken LiveKit authority. Chi'lly Chat call invites and call/ring notifications are support-safe metadata only; they do not grant publish authority, do not expose LiveKit tokens, do not introduce call recording, and do not give staff access to call audio/video content.

Audit log integrity and privileged action evidence governance: Closed for current repo-side live incident evidence governance. Force-end/remove/mute/revoke actions require exact scope, reason, and audit where backed; LiveKit token request and denial evidence stays sanitized and must not expose LiveKit tokens, raw room URLs, signed URLs, raw IPs, or private evidence.

## Live Moderation Authority Matrix

| Surface / actor | Can join? | Can publish? | Can request seat? | Can approve seat? | Can deny seat? | Can mute? | Can remove? | Can force-end? | Who can act? | Required permission scope | Reason required? | Report/case context required? | Audit required? | Evidence preserved? | Public copy shown | Fail-closed rule |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Live Watch-Party | yes if Premium/access, active room, active membership, not blocked/restricted | host or approved speaker only | viewer can request | host/authorized room flow | host/authorized room flow | host where backed; staff only through backed live ops | host where backed; staff only through backed live ops | Owner/Admin where backed; Moderator only with exact live scope where backed | Host, Owner/Admin, scoped Moderator | `live_ops`, `admin.room.moderate`, `admin.live.force_end` | yes for staff destructive action | yes for report/live safety | yes | yes | live room ended/unavailable | no generic staff publish grant |
| Watch-Party Live | yes if Premium/access, active room, not blocked/restricted | host or approved speaker only | viewer can request camera/mic seat | host/authorized room flow | host/authorized room flow | host where backed; staff only through backed live ops | host where backed; staff only through backed live ops | Owner/Admin where backed; Moderator only with exact live scope where backed | Host, Owner/Admin, scoped Moderator | `live_ops`, `admin.room.moderate`, `admin.live.force_end` | yes for staff destructive action | yes for report/live safety | yes | yes | room ended/unavailable | shared player ownership is unchanged |
| Live Stage | yes if active live room and access passes | host or approved speaker only | viewer can request | host inline card controls | host inline card controls | host inline controls | host inline controls | Owner/Admin where backed | Host, Owner/Admin, scoped Moderator where backed | `live_ops`, `admin.live.force_end` | yes for staff force-end | yes when report-driven | yes | yes | live session unavailable | token issuer can downgrade stale/unapproved speakers |
| Party Room | yes if active room/access | only through Watch-Party Live sidecar after token authority | viewer can request visible seat | host | host | host | host | Owner/Admin where backed | Host, scoped staff where backed | `admin.room.moderate`, `live_ops` | yes for staff action | yes when report-driven | yes | yes | room unavailable | Party Room must not hand off to Live Stage |
| Waiting Room | yes if access checks pass | no publish | n/a | n/a | n/a | n/a | n/a | n/a | access system | n/a | n/a | n/a | access attempt audited where backed | n/a | safe blocked copy | no full room/token before access |
| live participant | active members only | only if host/approved speaker and not muted | yes if listener | host | host | host/backed live ops | host/backed live ops | n/a | Host, scoped staff where backed | `admin.room.moderate`, `live_ops` | yes for staff action | yes when report-driven | yes | yes | participant unavailable | removed/muted state must downgrade publish |
| passive viewer | yes if access passes | no | yes when room allows | no | no | n/a | n/a | no | host/staff cannot turn passive into publisher except host seat flow | n/a | n/a | n/a | token audit | yes | viewer copy | canPublish remains false |
| active publisher/speaker | yes if fresh membership | yes only under token issuer grants | n/a | n/a | can be denied/revoked by host/backed ops | yes | yes | no | host/backed ops | `live_ops`, `admin.room.moderate` | yes for staff action | yes when report-driven | yes | yes | seat unavailable | cap remains 4 active seats |
| host | yes | yes | n/a | yes | yes | yes | yes except First Owner/Owner authority paths | can end own room | host | host room authority | confirmation where destructive | no unless report-driven | room evidence preserved | safe ended copy | host power is room-local only |
| approved speaker | yes | yes if not muted and within cap | n/a | no | no | no | no | no | token issuer | n/a | n/a | n/a | token audit | yes | seated/speaker copy | stale approval is downgraded |
| seat request | yes as signal | no | yes | host/authorized room flow | host/authorized room flow | n/a | n/a | n/a | host | host room authority | no | no | seat-state proof | yes | request pending/denied | request does not grant publish |
| room chat/message | yes if room member and not blocked/restricted | n/a | n/a | n/a | n/a | future exact action | future exact action | n/a | scoped moderation/support staff where backed | `reports_review`, `admin.room_private.view`, `admin.room.moderate` | yes for moderation | yes | yes | yes | message unavailable where backed | report does not auto-delete |
| stale room | no active join | no | no | no | no | n/a | n/a | cleanup only where safe | system/live ops | old-room handling policy | yes for manual ops | incident context | yes | yes | room expired | cannot revive stale publish authority |
| blocked user | no in blocked host/room context | no | no | no | no | n/a | n/a | n/a | block policy/token issuer | n/a | n/a | n/a | denial audit where backed | yes | room unavailable | block denial wins |
| disabled user | no | no | no | no | no | n/a | n/a | n/a | account access policy | n/a | n/a | n/a | token denial audit | yes | account restricted | `is_account_access_restricted` wins |
| deleted/scheduled-deletion user | no | no | no | no | no | n/a | n/a | n/a | account access policy | n/a | n/a | n/a | token denial audit | yes | account unavailable | restricted account denial wins |
| suspended creator | no hosting while restricted | no | no | no | no | n/a | n/a | n/a | account access policy | n/a | n/a | n/a | token denial audit | yes | account restricted | cannot host or mint tokens |

## LiveKit / Token Authority Model

The mobile app never mints LiveKit credentials. `_lib/livekit/token-contract.ts` requests a backend token, and `supabase/functions/livekit-token/index.ts` resolves the effective role and grants. The function checks authenticated user identity, restricted account status, active room state, room surface, fresh membership, host blocks, approved speaker seat state, mute state, and the four-seat active speaker cap before returning `requestedGrants`.

Moderation can never grant publish authority directly. Host seat approval first persists `watch_party_room_memberships`, then the token issuer decides whether the next token can publish. `enforce-participant-state` can disconnect or downgrade stale publish-capable sessions; it does not mint extra publish grants.

## Host Vs Staff Authority

Host controls normal room flow: lock/open room, mute reactions, approve/deny seat requests, seat/demote speakers, mute/unmute participants, remove/restore room participants where the current route supports it, and end the host-owned room flow.

Owner/Admin with exact live/moderation scope can force-end or perform broader live incident actions only where a backed live-ops path exists. Moderator with exact live moderation scope can triage, escalate, and use backed limited live actions only. Moderator cannot override Owner/Admin/First Owner authority, cannot bypass host/seat rules, and cannot grant LiveKit publish authority.

## Force-End / Remove / Mute / Revoke Policy

Force-end, remove, mute, revoke-speaker, deny-seat, and live-safety escalation are destructive or sensitive actions. Staff versions require exact scope, reason, report/case context where report-driven, target, actor, timestamp, before/after state where practical, and audit. Unsupported direct staff actions are disabled or escalated to Owner/Admin/live ops instead of using generic room writes.

Force-end uses safe public copy such as live session unavailable or ended and does not expose internal reasons. Reports do not auto-end rooms and do not auto-ban participants.

## Seat Request Policy

Seat approval remains host/authorized-speaker flow. A seat request is a signal only. Approval persists membership authority before broadcasting local UI state. Denial clears pending state and does not grant LiveKit publish authority. Approved speakers still fail closed when muted, removed, stale, blocked, disabled, deleted, scheduled for deletion, suspended, or over cap.

## Blocked / Restricted User Policy

Blocked users cannot join blocked host/room contexts. Disabled, deactivated, deleted, scheduled-deletion, suspended, and account-restricted users fail closed before LiveKit token issuance. Removed members fail access and fresh-membership checks. Reconnect and refresh use membership state and token refresh rather than trusting stale local UI state.

## Participant Cap / Passive Viewer Policy

The active camera/mic publisher cap remains four. Passive viewers remain separate from active publishers. Moderation actions must not increase publish capacity. Mute, remove, demote, stale membership, and over-cap states downgrade or deny publish. The current proved capacity remains four active camera/mic seats plus the separately proved synthetic passive viewer load.

## Stale Room / Reconnect Safety

Old/stale room handling remains protected. LiveKit token issuance rejects expired rooms before surface-specific handling. Refresh policy remains protected and does not add aggressive polling. Force-ended, stale, inactive, or expired rooms cannot be rejoined as active. Removed/muted participants cannot regain publish authority by reconnecting; token refresh re-evaluates backend membership authority.

## Live Safety Incident Response

Live safety reports route to the live-safety queue. Urgent live safety categories escalate differently: threats/violence, self-harm, minor safety, sexual exploitation, doxxing/privacy, active harassment, fraud/scam, illegal activity, and platform security issues.

Incident ownership:

- Owner/Admin: highest severity, force-end where backed, legal/security escalation, platform-level response.
- Moderator: scoped live triage, report review, escalation, and backed limited live actions.
- Support workflow: user follow-up, appeal/escalation, and access/refund support where relevant.

Evidence is preserved where supported. Reporter identity remains private. Reported users are not notified merely because a live report was filed. Affected room participants may receive safe moderation-action copy after action where policy allows. Appeals and follow-up use the support/escalation workflow.

## UI / Room Control Model

Host controls remain available according to existing policy. Staff live controls must appear only when exact scope and backed action exist. Dangerous controls require confirmation. Destructive/sensitive controls require reason. Report/case context is required where applicable. Unsupported controls are hidden or honestly disabled. UI errors are sanitized and never show raw backend errors, LiveKit tokens, raw room URLs, signed URLs, provider details, raw IPs, tax IDs, bank details, or private provider IDs.

## Launch Status

Live-room moderation and incident response is production-ready as a documented and proved policy for the current app-controlled launch mode. Current backed host controls, token authority, stale-room handling, refresh policy, and report/live-safety queue separation remain intact. Broader staff force-end and exact staff live mutation paths remain future exact backend lanes unless already backed by Live Ops.
