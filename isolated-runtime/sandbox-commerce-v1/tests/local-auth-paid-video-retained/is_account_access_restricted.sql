create or replace function public."is_account_access_restricted"(p_user_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  begin
    v_user_id:=nullif(trim(coalesce(p_user_id,'')),'')::uuid;
  exception when others then
    return true;
  end;
  if v_user_id is null then return true; end if;
  return exists (
    select 1 from public."account_deletion_requests" deletion
    where deletion."user_id"=v_user_id
      and deletion."status" in ('scheduled','completed')
  ) or exists (
    select 1 from auth.users auth_user
    where auth_user."id"=v_user_id
      and auth_user."banned_until" is not null
      and auth_user."banned_until">timezone('utc'::text,now())
  );
end;
$$;
