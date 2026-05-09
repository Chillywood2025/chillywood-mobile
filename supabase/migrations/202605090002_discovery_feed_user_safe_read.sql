create or replace function public.discovery_feed_item_blocked_for_current_user(target_feed_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public."discovery_feed_item_blocks" block
      where block."feed_item_id" = target_feed_item_id
        and block."blocked_user_id" = (auth.uid())::text
    );
$$;

revoke all on function public.discovery_feed_item_blocked_for_current_user(uuid) from public;
grant execute on function public.discovery_feed_item_blocked_for_current_user(uuid) to "authenticated";
grant execute on function public.discovery_feed_item_blocked_for_current_user(uuid) to "service_role";

drop policy if exists "discovery_feed_items_select_public_safe_authenticated"
  on public."discovery_feed_items";
create policy "discovery_feed_items_select_public_safe_authenticated"
  on public."discovery_feed_items"
  for select
  to authenticated
  using (
    "is_publicly_discoverable" = true
    and "visibility" = 'public'
    and "moderation_status" = 'clean'
    and "rights_status" in (
      'creator_owned',
      'chillywood_original',
      'licensed_for_public_stream'
    )
    and public.discovery_feed_item_blocked_for_current_user("id") = false
  );

comment on policy "discovery_feed_items_select_public_safe_authenticated"
  on public."discovery_feed_items"
  is 'D3 user-safe feed read policy: authenticated users may read only public, clean, rights-safe, non-blocked discovery items. No writes or playback access.';
