-- Sandbox monetization tester access.
-- This allowlist lets fan/buyer accounts see and complete sandbox-only money
-- proof flows without granting owner/operator, live money, payout, or service
-- role-like privileges.

create table if not exists public."sandbox_monetization_testers" (
  "id" uuid primary key default gen_random_uuid(),
  "user_id" text,
  "email" text,
  "status" text not null default 'active',
  "note" text,
  "expires_at" timestamptz,
  "created_by" text,
  "revoked_at" timestamptz,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "sandbox_monetization_testers_status_check"
    check ("status" in ('active', 'revoked')),
  constraint "sandbox_monetization_testers_identity_check"
    check (nullif(trim(coalesce("user_id", '')), '') is not null or nullif(trim(coalesce("email", '')), '') is not null),
  constraint "sandbox_monetization_testers_email_normalized_check"
    check ("email" is null or "email" = lower(trim("email"))),
  constraint "sandbox_monetization_testers_note_safe_check"
    check (coalesce("note", '') !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|authorization)')
);

create unique index if not exists "sandbox_monetization_testers_active_user_unique"
  on public."sandbox_monetization_testers" ("user_id")
  where "user_id" is not null and "status" = 'active';

create unique index if not exists "sandbox_monetization_testers_active_email_unique"
  on public."sandbox_monetization_testers" (lower("email"))
  where "email" is not null and "status" = 'active';

create index if not exists "sandbox_monetization_testers_lookup_idx"
  on public."sandbox_monetization_testers" ("status", "expires_at", "updated_at" desc);

create or replace function public."touch_sandbox_monetization_tester_updated_at"()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new."updated_at" = timezone('utc'::text, now());
  if new."email" is not null then
    new."email" = lower(trim(new."email"));
  end if;
  if new."user_id" is not null then
    new."user_id" = nullif(trim(new."user_id"), '');
  end if;
  if new."status" = 'revoked' and new."revoked_at" is null then
    new."revoked_at" = timezone('utc'::text, now());
  end if;
  return new;
end;
$$;

drop trigger if exists "touch_sandbox_monetization_testers_updated_at" on public."sandbox_monetization_testers";
create trigger "touch_sandbox_monetization_testers_updated_at"
  before insert or update on public."sandbox_monetization_testers"
  for each row execute function public."touch_sandbox_monetization_tester_updated_at"();

alter table public."sandbox_monetization_testers" enable row level security;

drop policy if exists "sandbox_money_tester_self_select" on public."sandbox_monetization_testers";
create policy "sandbox_money_tester_self_select"
  on public."sandbox_monetization_testers"
  for select
  to authenticated
  using (
    "status" = 'active'
    and ("expires_at" is null or "expires_at" > timezone('utc'::text, now()))
    and (
      "user_id" = auth.uid()::text
      or lower("email") = lower(coalesce(auth.jwt()->>'email', ''))
      or public.has_platform_role(array['owner'::text, 'operator'::text])
    )
  );

drop policy if exists "sandbox_money_tester_owner_operator_manage" on public."sandbox_monetization_testers";
create policy "sandbox_money_tester_owner_operator_manage"
  on public."sandbox_monetization_testers"
  for all
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."sandbox_monetization_testers" from anon, authenticated;
grant select on table public."sandbox_monetization_testers" to authenticated;
grant all on table public."sandbox_monetization_testers" to service_role;

create or replace function public."resolve_sandbox_monetization_tester"(
  p_user_id text default null,
  p_email text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is not null and public.has_platform_role(array['owner'::text, 'operator'::text]) then true
    when auth.uid() is not null and public.has_active_beta_access() then true
    when exists (
      select 1
      from public."sandbox_monetization_testers" tester
      where tester."status" = 'active'
        and (tester."expires_at" is null or tester."expires_at" > timezone('utc'::text, now()))
        and (
          (nullif(trim(coalesce(p_user_id, '')), '') is not null and tester."user_id" = trim(p_user_id))
          or (nullif(lower(trim(coalesce(p_email, ''))), '') is not null and tester."email" = lower(trim(p_email)))
          or (tester."user_id" = auth.uid()::text)
          or (tester."email" = lower(coalesce(auth.jwt()->>'email', '')))
        )
    ) then true
    else false
  end;
$$;

create or replace function public."list_sandbox_monetization_testers"()
returns table (
  "id" uuid,
  "userId" text,
  "email" text,
  "status" text,
  "note" text,
  "expiresAt" timestamptz,
  "createdBy" text,
  "revokedAt" timestamptz,
  "createdAt" timestamptz,
  "updatedAt" timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tester."id",
    tester."user_id",
    tester."email",
    tester."status",
    tester."note",
    tester."expires_at",
    tester."created_by",
    tester."revoked_at",
    tester."created_at",
    tester."updated_at"
  from public."sandbox_monetization_testers" tester
  where public.has_platform_role(array['owner'::text, 'operator'::text])
  order by tester."updated_at" desc
  limit 200;
$$;

create or replace function public."grant_sandbox_monetization_tester"(
  p_email text default null,
  p_user_id text default null,
  p_expires_at timestamptz default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := auth.uid()::text;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_user_id text := nullif(trim(coalesce(p_user_id, '')), '');
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_row public."sandbox_monetization_testers"%rowtype;
begin
  if auth.uid() is null or not public.has_platform_role(array['owner'::text, 'operator'::text]) then
    raise exception 'owner_operator_required';
  end if;
  if v_email is null and v_user_id is null then
    raise exception 'tester_identity_required';
  end if;
  if v_note is not null and v_note ~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|authorization)' then
    raise exception 'unsafe_note';
  end if;

  update public."sandbox_monetization_testers"
  set
    "status" = 'revoked',
    "revoked_at" = timezone('utc'::text, now())
  where "status" = 'active'
    and (
      (v_user_id is not null and "user_id" = v_user_id)
      or (v_email is not null and "email" = v_email)
    );

  insert into public."sandbox_monetization_testers" (
    "user_id",
    "email",
    "status",
    "note",
    "expires_at",
    "created_by"
  )
  values (
    v_user_id,
    v_email,
    'active',
    v_note,
    p_expires_at,
    v_actor
  )
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row."id",
    'userId', v_row."user_id",
    'email', v_row."email",
    'status', v_row."status",
    'expiresAt', v_row."expires_at",
    'createdAt', v_row."created_at",
    'sandboxOnly', true,
    'notPayable', true,
    'ownerRoleGranted', false,
    'payoutAccessGranted', false
  );
end;
$$;

create or replace function public."revoke_sandbox_monetization_tester"(
  p_id uuid default null,
  p_email text default null,
  p_user_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_user_id text := nullif(trim(coalesce(p_user_id, '')), '');
  v_count integer := 0;
begin
  if auth.uid() is null or not public.has_platform_role(array['owner'::text, 'operator'::text]) then
    raise exception 'owner_operator_required';
  end if;
  if p_id is null and v_email is null and v_user_id is null then
    raise exception 'tester_identity_required';
  end if;

  update public."sandbox_monetization_testers"
  set
    "status" = 'revoked',
    "revoked_at" = timezone('utc'::text, now())
  where "status" = 'active'
    and (
      (p_id is not null and "id" = p_id)
      or (v_user_id is not null and "user_id" = v_user_id)
      or (v_email is not null and "email" = v_email)
    );

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'revokedCount', v_count,
    'status', 'revoked',
    'sandboxOnly', true,
    'ownerRoleGranted', false,
    'payoutAccessGranted', false
  );
end;
$$;

grant execute on function public."resolve_sandbox_monetization_tester"(text, text) to anon, authenticated, service_role;
grant execute on function public."list_sandbox_monetization_testers"() to authenticated, service_role;
grant execute on function public."grant_sandbox_monetization_tester"(text, text, timestamptz, text) to authenticated, service_role;
grant execute on function public."revoke_sandbox_monetization_tester"(uuid, text, text) to authenticated, service_role;

comment on table public."sandbox_monetization_testers" is
  'Revocable sandbox-only money tester allowlist. Does not grant owner/operator, live money, payout, withdrawal, or service role permissions.';
