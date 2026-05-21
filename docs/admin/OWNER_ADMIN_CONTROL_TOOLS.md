# Owner/Admin Control Tools

## Scope
- Adds protected Admin control tools on top of the owner superuser and scoped staff foundation.
- Does not change Live Stage, Watch-Party Live, Player, Chat/call UI, normal Premium gates, or owner invisibility.
- Owner normal access remains unrestricted and is not app-level audited unless Owner manually activates Break Glass.

## Tools
- Audit Explorer reads normalized audit rows through `admin-owner-controls`.
- Permission Templates grant permission-only bundles and never create staff roles.
- Temporary grants use `platform_staff_permission_grants.expires_at` as the server-side source of truth.
- Break Glass is off by default, reason-required, and writes append-only Break Glass audit rows.
- Legal Request Intake stores non-deletable intake records connected to Legal Evidence work.
- Owner Security shows real status where available and unknown/manual where no safe backend proof exists.
- Canary Checks store pass/fail/unknown results; unknown is not success.
- Safety Dashboard shows only real counts and unknown/manual for missing aggregations.

## Access
- Owner can see all tools.
- Audit Explorer and Canary require Owner or `audit_review` / `security_review`.
- Permission Templates require Owner or `staff_permission_templates` / `admin_grants`; Admins cannot template-grant themselves.
- Break Glass requires Owner or `emergency_break_glass`.
- Legal Intake requires Owner or `legal_request_intake` / `legal_review`.
- Owner Security is Owner-only.

## Templates
- Support Agent: `support_inbox`, `user_lookup`
- Moderator: `reports_review`, `content_moderation`
- Senior Moderator: `reports_review`, `content_moderation`, `user_lookup`
- Live Ops Operator: `live_ops`
- Legal Reviewer: `legal_review`, `legal_request_intake`
- Evidence Exporter: `legal_review`, `evidence_export`, `legal_request_intake`
- Creator Support: `creator_support`, `support_inbox`, `user_lookup`

## Safety Notes
- The Edge Function keeps service-role access server-side.
- No secrets are returned to the app.
- Legal Intake has no delete action.
- Canary checks that need unavailable proof accounts, ops health contracts, or Supabase Management API access return unknown/manual required.
- Owner normal functional records, such as active permission grants, may exist because the system needs them; they are not shown as app-level owner audit unless Break Glass is active.
