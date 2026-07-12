# Security / Owner Operator Runbook

Status: `scoped_write_capable_guarded`

Activation: `limited_scheduled_probe`; hardened host timer `chillywood-security-owner-operator-watch-once.timer` runs `watch_once` every fifteen minutes. No auth mutation, RLS mutation, owner-role mutation, or secret rotation automation is active.

## Scope

`security_owner_operator` monitors owner/super-admin role integrity, platform role membership readback, Rachi/operator self-approval prevention, autonomous approval integrity, admin route exposure, secret-scan health, RLS policy health read-only checks, security incident flags, and emergency pause requests.

## Safe Writes

- `security_operator_events`
- `security_health_snapshots`
- `security_required_review_flags`
- `owner_authority_integrity_findings`
- `approval_integrity_findings`
- `secret_scan_findings`
- `security_operator_learning_state`
- autonomous approval requests
- emergency pause request records

Safe writes are findings and review records only. They cannot alter owner authority, auth, RLS, or secrets.

## Forbidden

No autonomous owner role assignment/revocation, auth/RLS mutation, secret rotation, direct user ban/suspension, owner controls exposed to non-owner users, Rachi/operator self-approval, audit deletion, or broad shutdown outside the approved emergency-state path.

## Approval Boundary

Owner-role, auth/RLS, secret rotation, and broad security-control changes require Level 4 owner/super-admin approval. Rachi can request or recommend, but cannot approve itself. Operators cannot self-approve.
