-- Lightweight creator rights disclosure log.
-- This is a disclosure/audit signal only. It does not grant copyright
-- clearance, licensing, DMCA immunity, or takedown protection.

create table if not exists public."content_rights_disclosures" (
  "id" uuid primary key default gen_random_uuid(),
  "actor_user_id" uuid not null references auth.users("id") on delete cascade,
  "surface" text not null,
  "target_type" text not null,
  "target_id" text not null,
  "contains_third_party_content" boolean not null default false,
  "contains_third_party_music" boolean not null default false,
  "disclosure_note" text,
  "acknowledged_at" timestamptz not null default now(),
  "policy_version" text,
  "source_context" jsonb not null default '{}'::jsonb,
  "security_context_id" uuid references public."security_request_context"("id") on delete set null,
  "created_at" timestamptz not null default now(),
  "cleared_at" timestamptz,
  constraint "content_rights_disclosures_surface_check"
    check ("surface" in (
      'clip_studio',
      'creator_video',
      'live_watch_party',
      'watch_party_live',
      'spectator_child_room',
      'paid_content',
      'replay'
    )),
  constraint "content_rights_disclosures_target_type_check"
    check ("target_type" in (
      'clip',
      'creator_video',
      'watch_party_room',
      'live_room',
      'spectator_child_room',
      'content'
    )),
  constraint "content_rights_disclosures_target_id_check"
    check (length(btrim("target_id")) > 0),
  constraint "content_rights_disclosures_note_length_check"
    check ("disclosure_note" is null or char_length("disclosure_note") <= 500),
  constraint "content_rights_disclosures_source_context_object_check"
    check (jsonb_typeof("source_context") = 'object'),
  constraint "content_rights_disclosures_not_clear_when_active_check"
    check (
      "cleared_at" is null
      or ("contains_third_party_content" = false and "contains_third_party_music" = false)
    )
);

create index if not exists "content_rights_disclosures_actor_created_idx"
  on public."content_rights_disclosures" ("actor_user_id", "created_at" desc);

create index if not exists "content_rights_disclosures_target_created_idx"
  on public."content_rights_disclosures" ("surface", "target_type", "target_id", "created_at" desc);

create index if not exists "content_rights_disclosures_security_context_idx"
  on public."content_rights_disclosures" ("security_context_id");

alter table public."content_rights_disclosures" enable row level security;

drop policy if exists "content_rights_disclosures_select_own_or_audit" on public."content_rights_disclosures";
create policy "content_rights_disclosures_select_own_or_audit"
  on public."content_rights_disclosures"
  for select
  to authenticated
  using (
    "actor_user_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
    or public.has_platform_permission('audit_review')
    or public.has_platform_permission('content_moderation')
    or public.has_platform_permission('reports_review')
  );

revoke all on table public."content_rights_disclosures" from "anon", "authenticated";
grant select on table public."content_rights_disclosures" to "authenticated";
grant select, insert on table public."content_rights_disclosures" to "service_role";

create or replace function public."prevent_content_rights_disclosure_mutation"()
returns trigger
language plpgsql
as $$
begin
  raise exception 'content_rights_disclosures is append-only';
end;
$$;

drop trigger if exists "prevent_content_rights_disclosure_mutation" on public."content_rights_disclosures";
create trigger "prevent_content_rights_disclosure_mutation"
  before update or delete on public."content_rights_disclosures"
  for each row execute function public."prevent_content_rights_disclosure_mutation"();

create or replace function public."record_content_rights_disclosure"(
  p_surface text,
  p_target_type text,
  p_target_id text,
  p_contains_third_party_content boolean default false,
  p_contains_third_party_music boolean default false,
  p_disclosure_note text default null,
  p_policy_version text default 'content-rights-v1',
  p_source_context jsonb default '{}'::jsonb,
  p_security_context_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_target_id text := btrim(coalesce(p_target_id, ''));
  v_note text := nullif(btrim(coalesce(p_disclosure_note, '')), '');
  v_context jsonb := coalesce(p_source_context, '{}'::jsonb);
  v_is_active boolean := coalesce(p_contains_third_party_content, false)
    or coalesce(p_contains_third_party_music, false);
  v_row_id uuid;
begin
  if v_actor_user_id is null then
    raise exception 'sign_in_required';
  end if;

  if v_target_id = '' then
    raise exception 'target_required';
  end if;

  if jsonb_typeof(v_context) <> 'object' then
    raise exception 'source_context_must_be_object';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    v_note := left(v_note, 500);
  end if;

  insert into public."content_rights_disclosures" (
    "actor_user_id",
    "surface",
    "target_type",
    "target_id",
    "contains_third_party_content",
    "contains_third_party_music",
    "disclosure_note",
    "policy_version",
    "source_context",
    "security_context_id",
    "cleared_at"
  )
  values (
    v_actor_user_id,
    p_surface,
    p_target_type,
    v_target_id,
    coalesce(p_contains_third_party_content, false),
    coalesce(p_contains_third_party_music, false),
    v_note,
    nullif(btrim(coalesce(p_policy_version, '')), ''),
    v_context,
    p_security_context_id,
    case when v_is_active then null else now() end
  )
  returning "id" into v_row_id;

  return jsonb_build_object(
    'id', v_row_id,
    'active', v_is_active,
    'surface', p_surface,
    'targetType', p_target_type,
    'targetId', v_target_id
  );
end;
$$;

revoke all on function public."record_content_rights_disclosure"(text, text, text, boolean, boolean, text, text, jsonb, uuid) from public;
grant execute on function public."record_content_rights_disclosure"(text, text, text, boolean, boolean, text, text, jsonb, uuid) to authenticated;

comment on table public."content_rights_disclosures" is
  'Append-only lightweight creator rights disclosure log. This is a disclosure/audit signal only and does not grant copyright clearance, licensing, DMCA immunity, or takedown protection.';

comment on function public."record_content_rights_disclosure"(text, text, text, boolean, boolean, text, text, jsonb, uuid) is
  'Authenticated creator disclosure logger for third-party content/music flags. Does not bypass reports, DMCA, takedowns, source eligibility, or moderation.';
