drop policy if exists beta_feedback_items_select_own on public.beta_feedback_items;
drop policy if exists beta_feedback_items_insert_own on public.beta_feedback_items;

create policy beta_feedback_items_select_own
  on public.beta_feedback_items
  for select
  using (
    auth.uid() is not null
    and reporter_user_id = auth.uid()::text
  );

create policy beta_feedback_items_insert_own
  on public.beta_feedback_items
  for insert
  with check (
    auth.uid() is not null
    and reporter_user_id = auth.uid()::text
  );
