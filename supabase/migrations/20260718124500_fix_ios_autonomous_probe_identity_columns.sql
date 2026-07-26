-- Forward-only fix for the platform recovery probe identity fields omitted from
-- the initial autonomous platform contract. This is status/readback schema only.

alter table public.backup_health_snapshots
  add column if not exists app_version text,
  add column if not exists native_build text,
  add column if not exists bundle_identifier text,
  add column if not exists runtime_version text,
  add column if not exists channel text,
  add column if not exists update_id text,
  add column if not exists distribution_source text,
  add column if not exists provider_environment text,
  add column if not exists data_source text,
  add column if not exists readback_complete boolean not null default false,
  add column if not exists window_start timestamptz,
  add column if not exists window_end timestamptz;

create index if not exists autonomous_identity_adfab0a58090_idx
  on public.backup_health_snapshots (native_build, runtime_version, channel, created_at desc);

comment on column public.backup_health_snapshots.readback_complete is
  'True only when the migration/function/retry/release recovery sources were substantively read.';
