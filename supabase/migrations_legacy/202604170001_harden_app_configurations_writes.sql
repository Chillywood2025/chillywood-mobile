create or replace function public.sanitize_app_configuration(input_config jsonb)
returns jsonb
language sql
immutable
as $$
  select
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                case
                  when jsonb_typeof(coalesce(input_config, '{}'::jsonb)) = 'object'
                    then coalesce(input_config, '{}'::jsonb)
                  else '{}'::jsonb
                end,
                '{branding,appDisplayName}',
                to_jsonb('Chi''llywood'::text),
                true
              ),
              '{branding,watchPartyLabel}',
              to_jsonb('Live Watch-Party'::text),
              true
            ),
            '{branding,liveWaitingRoomTitle}',
            to_jsonb('Live Waiting Room'::text),
            true
          ),
          '{branding,partyWaitingRoomTitle}',
          to_jsonb('Party Waiting Room'::text),
          true
        ),
        '{branding,liveRoomTitle}',
        to_jsonb('Live Room'::text),
        true
      ),
      '{branding,partyRoomTitle}',
      to_jsonb('Party Room'::text),
      true
    );
$$;

create or replace function public.app_configurations_sanitize_before_write()
returns trigger
language plpgsql
as $$
begin
  new.config := public.sanitize_app_configuration(new.config);
  return new;
end;
$$;

drop trigger if exists app_configurations_sanitize_before_write on public.app_configurations;

create trigger app_configurations_sanitize_before_write
before insert or update on public.app_configurations
for each row
execute function public.app_configurations_sanitize_before_write();

update public.app_configurations
set config = public.sanitize_app_configuration(config)
where config_key = 'global';

drop policy if exists app_configurations_insert_policy on public.app_configurations;
drop policy if exists app_configurations_update_policy on public.app_configurations;
drop policy if exists app_configurations_insert_operator on public.app_configurations;
drop policy if exists app_configurations_update_operator on public.app_configurations;

create policy app_configurations_insert_operator
  on public.app_configurations
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and public.has_platform_role(array['operator'])
  );

create policy app_configurations_update_operator
  on public.app_configurations
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
