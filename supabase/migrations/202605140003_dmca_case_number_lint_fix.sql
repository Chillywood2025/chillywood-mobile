-- Lint-only cleanup for DMCA case number generator. No data changes.

create or replace function public."dmca_next_case_number"()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  stamp text := to_char(timezone('utc'::text, now()), 'YYYYMMDD');
  candidate text;
  attempts integer := 0;
begin
  loop
    attempts := attempts + 1;
    candidate := 'DMCA-' || stamp || '-' || upper(substr(replace(gen_random_uuid()::text, '-'::text, ''::text), 1, 6));
    if not exists (select 1 from public."dmca_cases" where "case_number" = candidate) then
      return candidate;
    end if;
    if attempts >= 100 then
      raise exception 'dmca_case_number_unavailable';
    end if;
  end loop;

  return null;
end;
$$;
