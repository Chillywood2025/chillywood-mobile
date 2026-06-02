set check_function_bodies = false;

create table if not exists public."account_deletion_requests" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null references auth."users"("id") on delete cascade,
  "requester_email" text,
  "status" text not null default 'requested',
  "reason" text,
  "details" text,
  "metadata" jsonb not null default '{}'::jsonb,
  "requested_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  "processed_at" timestamptz,
  constraint "account_deletion_requests_pkey" primary key ("id"),
  constraint "account_deletion_requests_status_check"
    check ("status" in ('requested', 'reviewing', 'verified', 'processing', 'completed', 'canceled', 'rejected')),
  constraint "account_deletion_requests_metadata_object_check"
    check (jsonb_typeof("metadata") = 'object')
);

create index if not exists "account_deletion_requests_user_requested_idx"
  on public."account_deletion_requests" ("user_id", "requested_at" desc);

create index if not exists "account_deletion_requests_status_idx"
  on public."account_deletion_requests" ("status", "requested_at" desc);

create unique index if not exists "account_deletion_requests_one_active_per_user_idx"
  on public."account_deletion_requests" ("user_id")
  where "status" in ('requested', 'reviewing', 'verified', 'processing');

alter table public."account_deletion_requests" enable row level security;

drop policy if exists "account_deletion_requests_select_own_or_authorized" on public."account_deletion_requests";
create policy "account_deletion_requests_select_own_or_authorized"
  on public."account_deletion_requests"
  for select
  to authenticated
  using (
    "user_id" = auth.uid()
    or public.has_platform_role(array['owner'::text])
    or public.has_platform_permission('legal_request_intake')
    or public.has_platform_permission('legal_review')
    or public.has_platform_permission('audit_review')
    or public.has_platform_permission('security_review')
  );

revoke all on table public."account_deletion_requests" from "anon", "authenticated";
grant select on table public."account_deletion_requests" to "authenticated";
grant select, insert, update on table public."account_deletion_requests" to "service_role";
revoke delete on table public."account_deletion_requests" from "service_role";

create or replace function public.submit_account_deletion_request(
  p_reason text default null,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  requester_email text := nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '');
  normalized_reason text := nullif(trim(coalesce(p_reason, '')), '');
  normalized_details text := nullif(trim(coalesce(p_details, '')), '');
  existing_request public."account_deletion_requests"%rowtype;
  created_request public."account_deletion_requests"%rowtype;
begin
  if requesting_user_id is null then
    raise exception 'sign_in_required' using errcode = '28000';
  end if;

  select *
    into existing_request
    from public."account_deletion_requests"
    where "user_id" = requesting_user_id
      and "status" in ('requested', 'reviewing', 'verified', 'processing')
    order by "requested_at" desc
    limit 1;

  if existing_request."id" is not null then
    return jsonb_build_object(
      'id', existing_request."id",
      'status', existing_request."status",
      'requestedAt', existing_request."requested_at",
      'alreadyExists', true,
      'message', 'Deletion request already submitted.'
    );
  end if;

  insert into public."account_deletion_requests" (
    "user_id",
    "requester_email",
    "reason",
    "details",
    "metadata"
  )
  values (
    requesting_user_id,
    requester_email,
    coalesce(normalized_reason, 'User requested account deletion from Settings.'),
    normalized_details,
    jsonb_build_object('source', 'settings')
  )
  returning * into created_request;

  return jsonb_build_object(
    'id', created_request."id",
    'status', created_request."status",
    'requestedAt', created_request."requested_at",
    'alreadyExists', false,
    'message', 'Deletion request submitted.'
  );
end;
$$;

revoke all on function public.submit_account_deletion_request(text, text) from public;
grant execute on function public.submit_account_deletion_request(text, text) to authenticated;

comment on table public."account_deletion_requests" is
  'User-submitted account deletion requests. Normal users can read their own request status through RLS; processing remains Owner/Admin controlled.';

comment on function public.submit_account_deletion_request(text, text) is
  'Creates or returns the signed-in user''s active account deletion request without allowing public account destruction.';
