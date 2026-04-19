drop policy if exists creator_permissions_select_policy on public.creator_permissions;
drop policy if exists creator_permissions_insert_policy on public.creator_permissions;
drop policy if exists creator_permissions_update_policy on public.creator_permissions;
drop policy if exists creator_permissions_select_self_or_operator on public.creator_permissions;
drop policy if exists creator_permissions_insert_operator on public.creator_permissions;
drop policy if exists creator_permissions_update_operator on public.creator_permissions;

create policy creator_permissions_select_self_or_operator
  on public.creator_permissions
  for select
  to authenticated
  using (
    auth.uid() is not null
    and (
      user_id = auth.uid()::text
      or public.has_platform_role(array['operator'])
    )
  );

create policy creator_permissions_insert_operator
  on public.creator_permissions
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and public.has_platform_role(array['operator'])
  );

create policy creator_permissions_update_operator
  on public.creator_permissions
  for update
  to authenticated
  using (
    auth.uid() is not null
    and public.has_platform_role(array['operator'])
  )
  with check (
    auth.uid() is not null
    and public.has_platform_role(array['operator'])
  );
