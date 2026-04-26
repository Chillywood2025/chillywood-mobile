alter table public."platform_role_memberships"
  drop constraint if exists "platform_role_memberships_role_check";

alter table public."platform_role_memberships"
  add constraint "platform_role_memberships_role_check"
  check (role = any (array['owner'::text, 'operator'::text, 'moderator'::text]));

drop policy if exists "app_configurations_insert_operator" on public."app_configurations";
create policy "app_configurations_insert_owner_or_operator"
  on public."app_configurations"
  for insert
  to "authenticated"
  with check (((auth.uid() IS NOT NULL) AND has_platform_role(ARRAY['owner'::text, 'operator'::text])));

drop policy if exists "app_configurations_update_operator" on public."app_configurations";
create policy "app_configurations_update_owner_or_operator"
  on public."app_configurations"
  for update
  to "authenticated"
  using (((auth.uid() IS NOT NULL) AND has_platform_role(ARRAY['owner'::text, 'operator'::text])))
  with check (((auth.uid() IS NOT NULL) AND has_platform_role(ARRAY['owner'::text, 'operator'::text])));

drop policy if exists "creator_permissions_insert_operator" on public."creator_permissions";
create policy "creator_permissions_insert_owner_or_operator"
  on public."creator_permissions"
  for insert
  to "authenticated"
  with check (((auth.uid() IS NOT NULL) AND has_platform_role(ARRAY['owner'::text, 'operator'::text])));

drop policy if exists "creator_permissions_select_self_or_operator" on public."creator_permissions";
create policy "creator_permissions_select_self_owner_or_operator"
  on public."creator_permissions"
  for select
  to "authenticated"
  using (((auth.uid() IS NOT NULL) AND ((user_id = (auth.uid())::text) OR has_platform_role(ARRAY['owner'::text, 'operator'::text]))));

drop policy if exists "creator_permissions_update_operator" on public."creator_permissions";
create policy "creator_permissions_update_owner_or_operator"
  on public."creator_permissions"
  for update
  to "authenticated"
  using (((auth.uid() IS NOT NULL) AND has_platform_role(ARRAY['owner'::text, 'operator'::text])))
  with check (((auth.uid() IS NOT NULL) AND has_platform_role(ARRAY['owner'::text, 'operator'::text])));

drop policy if exists "safety_reports_select_review_queue" on public."safety_reports";
create policy "safety_reports_select_review_queue"
  on public."safety_reports"
  for select
  to "authenticated"
  using (has_platform_role(ARRAY['owner'::text, 'operator'::text, 'moderator'::text]));
