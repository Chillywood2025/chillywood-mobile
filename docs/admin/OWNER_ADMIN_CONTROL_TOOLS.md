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
- Canary Checks store pass/fail/manual-required results; manual required is not success.
- Safety Dashboard shows only real counts and unknown/manual for missing aggregations.

## Production Proof
- `admin-owner-controls` is deployed on Supabase project `bmkkhihfbmsnnmcqkoly` as ACTIVE version 10.
- The May 21, 2026 physical Android owner-device proof on `R5CR120QCBF` ran Admin Canary from the Admin Command Center and returned `33 pass`, `0 manual`, and `0 failed`.
- The production proof harness creates or reuses clearly marked `liveops.proof+...` accounts through Supabase Admin/service-role tooling, signs them in server-side only, grants temporary proof roles/permissions only for the run, and verifies no active proof roles/grants remain afterward.
- The canary proves owner normal no-audit behavior by comparing owner-sensitive app-level audit counts before and after normal canary use; owner actions are only app-level audited when Break Glass is active.
- The canary proves admin self-grant denial through the real staff-permission RPC and moderator grant denial through the real role-management RPC.
- The canary proves Legal Evidence restriction for ungranted users/admins and exact-grant access where applicable.
- The canary proves Live Ops remains dry-run with real-action flags disabled through the ops health contract.
- The canary proves Supabase hosted Auth redirect configuration through a server-side management-token secret; token values are never shown in mobile UI, docs, logs, or committed files.
- The legal readiness portion proves the production policy bundle word counts, creator license clause, upload acknowledgement, live/replay acknowledgement, Google Play deletion language, DMCA checklist, support email/path, and public-link-or-bundled fallback.

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
- Canary checks that need unavailable proof accounts, ops health contracts, or Supabase Management API access return manual required, not pass.
- Owner normal functional records, such as active permission grants, may exist because the system needs them; they are not shown as app-level owner audit unless Break Glass is active.
