-- Allow server-side resolvers to verify a specific viewer while preserving
-- the default auth.uid() behavior used by RLS policies.

create or replace function public."is_active_chilly_circle_member"(
  p_creator_user_id text,
  p_member_user_id text default (auth.uid())::text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select
      nullif(btrim(coalesce(p_creator_user_id, '')), '') as creator_user_id,
      nullif(btrim(coalesce(p_member_user_id, (auth.uid())::text, '')), '') as member_user_id
  )
  select exists (
    select 1
    from public."user_friendships" friendship_row
    join normalized on true
    where normalized.creator_user_id is not null
      and normalized.member_user_id is not null
      and normalized.creator_user_id <> normalized.member_user_id
      and friendship_row."user_low_id" = least(normalized.creator_user_id, normalized.member_user_id)
      and friendship_row."user_high_id" = greatest(normalized.creator_user_id, normalized.member_user_id)
      and friendship_row."status" = 'active'::text
    limit 1
  );
$$;

revoke all on function public."is_active_chilly_circle_member"(text, text) from public;
grant execute on function public."is_active_chilly_circle_member"(text, text) to authenticated, postgres, service_role;

comment on function public."is_active_chilly_circle_member"(text, text) is
  'Checks active Chi''lly Circle membership. Uses explicit member id for server-side access resolvers and auth.uid() by default for RLS.';
