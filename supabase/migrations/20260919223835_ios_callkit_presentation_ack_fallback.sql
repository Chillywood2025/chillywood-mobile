-- Record device-confirmed CallKit presentation separately from APNs provider
-- acceptance. The acknowledgement capability is random, single-attempt, and
-- stored only as a digest; raw capabilities never enter durable storage.

alter table public."voip_push_delivery_attempts"
  add column if not exists "presentation_ack_token_hash" text,
  add column if not exists "presented_at" timestamp with time zone;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'voip_push_delivery_attempts_presentation_hash_check'
      and conrelid = 'public.voip_push_delivery_attempts'::regclass
  ) then
    alter table public."voip_push_delivery_attempts"
      add constraint "voip_push_delivery_attempts_presentation_hash_check"
      check (
        "presentation_ack_token_hash" is null
        or "presentation_ack_token_hash" ~ '^[0-9a-f]{64}$'
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voip_push_delivery_attempts_presented_requires_hash_check'
      and conrelid = 'public.voip_push_delivery_attempts'::regclass
  ) then
    alter table public."voip_push_delivery_attempts"
      add constraint "voip_push_delivery_attempts_presented_requires_hash_check"
      check ("presented_at" is null or "presentation_ack_token_hash" is not null);
  end if;
end;
$$;

create index if not exists "voip_push_delivery_attempts_presented_idx"
  on public."voip_push_delivery_attempts" using btree ("call_invite_id", "presented_at" desc)
  where "presented_at" is not null;

comment on column public."voip_push_delivery_attempts"."presentation_ack_token_hash" is
  'SHA-256 digest of a one-attempt CallKit presentation capability. The raw capability is delivered only in the exact APNs VoIP payload and is never logged or stored.';

comment on column public."voip_push_delivery_attempts"."presented_at" is
  'Device acknowledgement time recorded only after reportNewIncomingCall succeeds for the exact invite, recipient, and delivery attempt. APNs HTTP 200 alone never populates this field.';

create or replace function public."whole_app_acknowledge_ios_callkit_presentation"(
  "p_attempt_id" uuid,
  "p_call_invite_id" uuid,
  "p_recipient_user_id" uuid,
  "p_capability_hash" text
)
returns boolean
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare
  affected_rows integer := 0;
begin
  if "p_capability_hash" is null
    or "p_capability_hash" !~ '^[0-9a-f]{64}$'
  then
    return false;
  end if;

  update public."voip_push_delivery_attempts" as attempt
  set "presented_at" = clock_timestamp()
  from public."chat_call_invites" as invite
  where attempt."id" = "p_attempt_id"
    and attempt."call_invite_id" = "p_call_invite_id"
    and attempt."recipient_user_id" = "p_recipient_user_id"
    and attempt."presentation_ack_token_hash" = "p_capability_hash"
    and attempt."presented_at" is null
    and invite."id" = attempt."call_invite_id"
    and invite."callee_user_id" = attempt."recipient_user_id"::text
    and invite."status" = 'ringing'
    and invite."expires_at" > clock_timestamp()
    and exists (
      select 1
      from public."chat_thread_members" as membership
      where membership."thread_id" = invite."thread_id"
        and membership."user_id" = attempt."recipient_user_id"::text
    );

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

revoke all on function public."whole_app_acknowledge_ios_callkit_presentation"(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public."whole_app_acknowledge_ios_callkit_presentation"(uuid, uuid, uuid, text)
  to service_role;
