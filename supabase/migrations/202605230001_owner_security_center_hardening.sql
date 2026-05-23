-- Owner Security Center production hardening.
-- Adds explicit device revoke reason storage for owner-only security actions.

alter table if exists public."owner_trusted_devices"
  add column if not exists "revoked_reason" text;

comment on column public."owner_trusted_devices"."revoked_reason" is
  'Owner-supplied reason recorded when device trust is revoked through Owner Security Center.';
