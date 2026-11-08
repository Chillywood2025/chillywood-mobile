create or replace function public.is_account_deletion_scheduled(p_user_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."account_deletion_requests" deletion
    where deletion."user_id"::text = nullif(btrim(coalesce(p_user_id, '')), '')
      and deletion."status" = 'scheduled'
      and coalesce(deletion."restore_deadline", deletion."delete_after") > timezone('utc'::text, now())
    limit 1
  );
$$;
