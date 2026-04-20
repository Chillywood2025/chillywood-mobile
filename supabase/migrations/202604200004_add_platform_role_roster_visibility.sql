create policy "platform_role_memberships_select_owner_or_operator"
  on public."platform_role_memberships"
  for select
  to "authenticated"
  using (((auth.uid() IS NOT NULL) AND has_platform_role(ARRAY['owner'::text, 'operator'::text])));
