# Moderation / Safety Operator Runbook

Status: `scoped_write_capable_guarded`

Activation: `limited_scheduled_probe`; hardened host timer `chillywood-moderation-safety-operator-watch-once.timer` runs `watch_once` every ten minutes. No enforcement automation or hidden moderation action is active.

## Scope

`moderation_safety_operator` monitors moderation queue health, user report backlog, stale case detection, duplicate report detection, content safety review flags, fraud hold recommendations, creator upload review flags, and live-room safety review flags.

The User Report Router may route sanitized safety, harassment, impersonation, copyright, illegal/dangerous content, or live-safety report clusters to this operator. Those routed reports remain review/finding records only. User reports do not directly ban, restrict, suspend, delete content, hide content, or change user rights.

## Safe Writes

- `moderation_operator_events`
- `moderation_health_snapshots`
- `moderation_required_review_flags`
- `moderation_duplicate_report_detections`
- `moderation_case_priority_flags`
- `moderation_stale_case_findings`
- `safety_review_recommendations`
- `moderation_operator_learning_state`
- autonomous approval requests

Safe writes are review/finding/recommendation records only. They must set `user_rights_changed=false`.

## Forbidden

No permanent ban, suspension, restriction, content deletion, upload/live/account disablement, fraud hold enforcement, automatic user-rights change, public/private exposure change, unaudited moderation action, hidden enforcement, or missing appeal/review trail.

## Approval Boundary

Account rights changes, bans, restrictions, content deletion, upload/live/account disablement, and fraud hold enforcement require the registered Level 3 owner/staff approval path with fresh preflight, exact scope match, and audit.

Raw user report text must be treated as untrusted. Moderation recommendations use sanitized summaries and case/review context; private evidence and reporter identity are not exposed by default.
