-- Forward-only completion of the iOS observability review identity contract.
-- These are sanitized status dimensions only; no provider, release, rights, or
-- money action is introduced.

alter table public.observability_required_review_flags
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

create index if not exists autonomous_identity_416b8d1c2f59_idx
  on public.observability_required_review_flags
  (native_build, runtime_version, channel, created_at desc);

comment on column public.observability_required_review_flags.readback_complete is
  'True only when every provider capability required to interpret the observability finding was read.';
