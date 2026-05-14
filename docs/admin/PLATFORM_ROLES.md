# Platform Owner/Admin/Moderator Roles

Last updated: 2026-05-14

Chi'llywood platform staff roles are backed by Supabase, not by client-only email checks.

## Required Bootstrap Roles

- Owner: `rob2008gn@gmail.com`
- Admin: `chillywood92@gmail.com`

Emails are normalized to lowercase before lookup. The database keeps the existing internal role name `operator` for the public-facing Admin role, so `chillywood92@gmail.com` is stored as an active `operator` membership.

The bootstrap path does not create fake auth users or passwords. The existing `has_platform_role` helper can match an active membership by `auth.uid()` or by the signed-in JWT email, so these memberships become effective when a real Supabase auth user signs in with the matching normalized email.

## Role Hierarchy

- Owner has full backed platform/Admin access and can add or remove Admins and Moderators.
- Admin can access backed Admin tools allowed to Admins and can add or remove Moderators.
- Admin cannot add Owners, remove Owners, add Admins, or remove Admins.
- Moderator can access backed moderation review tools only and cannot manage staff.
- Regular users cannot access the Admin route or staff-management RPCs.

At least one active Owner must always remain. Owner grants are intentionally bootstrap/manual only in this lane so a normal Admin UI action cannot accidentally create another Owner.

## Backed Objects

- Role table: `platform_role_memberships`
- Staff audit table: `platform_staff_role_audit`
- General immutable Admin audit table: `platform_admin_audit_logs`
- Role check helper: `has_platform_role(required_roles text[])`
- Staff grant RPC: `admin_grant_platform_role_by_email`
- Staff revoke RPC: `admin_revoke_platform_role_by_email`

Direct insert/update/delete grants on `platform_role_memberships` stay blocked for normal authenticated users. Staff mutations go through security-definer RPCs with server-side hierarchy checks and audit writes.

## Operational Status

Repo-side implementation is present in migration `202605140008_platform_staff_role_management.sql`. Live role truth is complete after that migration is applied to the target Supabase project and the bootstrap rows are visible for the normalized Owner/Admin emails.

This role system does not activate billing, payouts, live money, provider imports, LiveKit backend secrets, SMTP secrets, or any unsafe production action.
