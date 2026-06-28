-- Let explicit direct-thread members read a thread that contains a platform
-- owner. Direct-thread creation/open restrictions stay in
-- get_or_create_direct_chat_thread; this only fixes readback for real members
-- such as incoming-call receivers.

set check_function_bodies = false;

create or replace function public.can_access_chat_thread(target_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with actor as (
    select nullif((auth.uid())::text, '') as user_id
  ),
  thread_scope as (
    select
      thread."id",
      thread."created_by",
      thread."thread_kind"
    from public."chat_threads" thread
    where thread."id" = target_thread_id
  ),
  actor_membership as (
    select 1
    from public."chat_thread_members" member
    join actor on actor.user_id = member."user_id"
    where member."thread_id" = target_thread_id
    limit 1
  ),
  other_members as (
    select member."user_id"
    from public."chat_thread_members" member
    join actor on actor.user_id is not null
    where member."thread_id" = target_thread_id
      and member."user_id" <> actor.user_id
  )
  select
    actor.user_id is not null
    and exists (select 1 from thread_scope)
    and not public."is_account_access_restricted"(actor.user_id)
    and (
      exists (
        select 1
        from thread_scope thread
        where thread."created_by" = actor.user_id
      )
      or exists (select 1 from actor_membership)
    )
    and not exists (
      select 1
      from other_members other_member
      where public."is_account_access_restricted"(other_member."user_id")
        or public."has_channel_audience_block_between"(actor.user_id, other_member."user_id")
    )
    and (
      not public.chat_thread_has_platform_owner(target_thread_id)
      or public.is_current_platform_owner()
      or (
        exists (select 1 from actor_membership)
        and exists (
          select 1
          from thread_scope thread
          where thread."thread_kind" = 'direct'
        )
      )
    )
  from actor;
$$;

comment on function public.can_access_chat_thread(uuid) is
  'Chat thread read/update gate. Authenticated users can read threads they created or explicitly belong to. Direct threads that contain a platform owner remain member-only and still enforce account restriction and block checks; creation/open-to-owner restrictions remain in direct-thread repair RPCs so incoming call banners resolve only valid readable direct threads.';
