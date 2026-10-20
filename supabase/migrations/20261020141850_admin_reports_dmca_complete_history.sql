-- Forward-only source repair. Remote history was read at 2026-10-20 02:34 UTC;
-- latest deployed version: 20261019020052. CLI was unavailable in this workspace.
-- No production migration was applied. Existing RPC signatures remain intact.

create index if not exists safety_reports_history_cursor_idx
  on public.safety_reports (created_at desc, id desc);
create index if not exists dmca_cases_history_cursor_idx
  on public.dmca_cases (created_at desc, id desc);
create index if not exists dmca_audit_log_latest_case_idx
  on public.dmca_audit_log (dmca_case_id, created_at desc, id desc);

create or replace function public.admin_parse_history_cursor(p_cursor text, p_scope jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = public
as $$
declare v_cursor jsonb;
begin
  if p_cursor is null then return null; end if;
  begin
    v_cursor := p_cursor::jsonb;
    if jsonb_typeof(v_cursor) is distinct from 'object'
      or v_cursor->'v' is distinct from '1'::jsonb
      or v_cursor->'scope' is distinct from p_scope
      or jsonb_typeof(v_cursor->'createdAt') is distinct from 'string'
      or (v_cursor->>'createdAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
      or jsonb_typeof(v_cursor->'id') is distinct from 'string'
      or coalesce(v_cursor->>'id', '') = ''
      or not isfinite((v_cursor->>'createdAt')::timestamptz) then
      raise exception 'invalid_history_cursor';
    end if;
  exception when others then
    raise exception 'invalid_history_cursor' using errcode = '22023';
  end;
  return v_cursor;
end;
$$;
revoke all on function public.admin_parse_history_cursor(text,jsonb) from public, anon;
grant execute on function public.admin_parse_history_cursor(text,jsonb) to authenticated;

create or replace function public.list_admin_reports_page(
  p_filter text default 'needs_review', p_cursor text default null, p_limit integer default 25
) returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_filter text := lower(trim(coalesce(p_filter, 'needs_review')));
  v_limit integer := greatest(1, least(50, coalesce(p_limit, 25)));
  v_scope jsonb;
  v_cursor jsonb;
  v_result jsonb;
begin
  perform public.admin_reports_assert_reviewer();
  if v_filter not in ('all','needs_review','critical','creator_video','profile_post','player','actioned') then
    raise exception 'invalid_reports_filter' using errcode = '22023';
  end if;
  v_scope := jsonb_build_object('source','reports','filter',v_filter);
  v_cursor := public.admin_parse_history_cursor(p_cursor, v_scope);
  if v_cursor is not null and (v_cursor->>'id') !~ '^[1-9][0-9]{0,18}$' then
    raise exception 'invalid_history_cursor' using errcode = '22023';
  end if;
  with candidates as materialized (
    select report.* from public.safety_reports report
    where (v_cursor is null or (report.created_at, report.id) <
      ((v_cursor->>'createdAt')::timestamptz, (v_cursor->>'id')::bigint))
      and (
        v_filter = 'all'
        or (v_filter = 'needs_review' and report.status in ('needs_review','reviewing'))
        or (v_filter = 'critical' and report.severity in ('critical','high') and report.status not in ('actioned','dismissed'))
        or (v_filter = 'creator_video' and report.target_type in ('creator_video','creator_video_comment'))
        or (v_filter = 'profile_post' and report.target_type in ('profile_post','profile_post_comment'))
        or (v_filter = 'player' and coalesce(report.context->>'sourceSurface','') = 'player')
        or (v_filter = 'actioned' and report.status in ('actioned','dismissed','escalated'))
      )
    order by report.created_at desc, report.id desc limit v_limit + 1
  ), page as materialized (
    select * from candidates order by created_at desc, id desc limit v_limit
  ), boundary as (select * from page order by created_at, id limit 1)
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc, id desc) from page), '[]'::jsonb),
    'hasMore', (select count(*) > v_limit from candidates),
    'nextCursor', case when (select count(*) > v_limit from candidates) then
      (select jsonb_build_object('v',1,'scope',v_scope,'createdAt',created_at,'id',id::text)::text from boundary)
      else null end
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.list_admin_reports_page(text,text,integer) from public, anon;
grant execute on function public.list_admin_reports_page(text,text,integer) to authenticated;

-- Invoker functions retain the existing DMCA RLS policies as well as explicit
-- owner/scoped-operator checks. Aggregation errors propagate to the caller.
create or replace function public.list_admin_dmca_cases_page(
  p_status text default 'all', p_search text default '', p_cursor text default null,
  p_limit integer default 50, p_include_test_cases boolean default false
) returns jsonb language plpgsql stable security invoker set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status,'all')));
  v_search text := lower(trim(coalesce(p_search,'')));
  v_limit integer := greatest(1, least(200, coalesce(p_limit,50)));
  v_include boolean := coalesce(p_include_test_cases,false);
  v_scope jsonb;
  v_cursor jsonb;
  v_result jsonb;
begin
  perform public.dmca_assert_owner_operator();
  if v_status not in ('all','received','needs_more_info','under_review','rejected','rejected_no_action',
    'content_disabled','uploader_notified','counter_notice_received','waiting_rightsholder_response',
    'eligible_for_restore','restored','court_action_notice_received','repeat_infringer_review','closed','preserved_evidence') then
    raise exception 'invalid_dmca_status' using errcode = '22023';
  end if;
  v_scope := jsonb_build_object('source','dmca','status',v_status,'search',v_search,'includeTestCases',v_include);
  v_cursor := public.admin_parse_history_cursor(p_cursor,v_scope);
  if v_cursor is not null and (v_cursor->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'invalid_history_cursor' using errcode = '22023';
  end if;
  with candidates as materialized (
    select cases.* from public.dmca_cases cases
    where (v_status = 'all' or cases.status = v_status)
      and (v_include or not cases.is_test_case)
      and (v_cursor is null or (cases.created_at,cases.id) <
        ((v_cursor->>'createdAt')::timestamptz,(v_cursor->>'id')::uuid))
      and (v_search = '' or exists (
        select 1 from unnest(array[cases.case_number,cases.allegedly_infringing_content_id,
          cases.allegedly_infringing_url,cases.reporter_email,cases.uploader_user_id,cases.status,cases.id::text]) value
        where strpos(lower(coalesce(value,'')),v_search) > 0
      ))
    order by cases.created_at desc, cases.id desc limit v_limit + 1
  ), page as materialized (
    select * from candidates order by created_at desc,id desc limit v_limit
  ), strike_counts as materialized (
    select strikes.user_id,count(*) as active_count from public.dmca_strikes strikes
    where strikes.strike_status='active' and strikes.user_id in (select distinct uploader_user_id from page)
    group by strikes.user_id
  ), enriched as (
    select page.created_at, page.id, to_jsonb(page) || jsonb_build_object(
      'active_strike_count',coalesce(strike_counts.active_count,0),
      'last_action',latest.event_type,'last_action_at',latest.created_at
    ) as item from page left join strike_counts on strike_counts.user_id=page.uploader_user_id
    left join lateral (
      select event_type,created_at from public.dmca_audit_log audit
      where audit.dmca_case_id = page.id order by audit.created_at desc,audit.id desc limit 1
    ) latest on true
  ), boundary as (select * from page order by created_at,id limit 1)
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(item order by created_at desc,id desc) from enriched),'[]'::jsonb),
    'hasMore',(select count(*) > v_limit from candidates),
    'nextCursor',case when (select count(*) > v_limit from candidates) then
      (select jsonb_build_object('v',1,'scope',v_scope,'createdAt',created_at,'id',id::text)::text from boundary)
      else null end
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.list_admin_dmca_cases_page(text,text,text,integer,boolean) from public,anon;
grant execute on function public.list_admin_dmca_cases_page(text,text,text,integer,boolean) to authenticated;

create or replace function public.get_admin_dmca_case_summary(p_include_test_cases boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = public
as $$
declare v_result jsonb;
begin
  perform public.dmca_assert_owner_operator();
  with cases as materialized (
    select cases.status,cases.uploader_user_id from public.dmca_cases cases
    where coalesce(p_include_test_cases,false) or not cases.is_test_case
  ), repeat_uploaders as (
    select user_id from public.dmca_strikes where strike_status = 'active' group by user_id having count(*) >= 3
  ), statuses as (
    select status from unnest(array['received','needs_more_info','under_review','rejected','rejected_no_action',
      'content_disabled','uploader_notified','counter_notice_received','waiting_rightsholder_response',
      'eligible_for_restore','restored','court_action_notice_received','repeat_infringer_review','closed','preserved_evidence']) status
  )
  select jsonb_build_object(
    'total',(select count(*) from cases),
    'open',(select count(*) from cases where status in ('received','needs_more_info','under_review','content_disabled',
      'counter_notice_received','waiting_rightsholder_response','eligible_for_restore','repeat_infringer_review','preserved_evidence')),
    'priority',(select count(*) from cases where status in ('received','needs_more_info','counter_notice_received','eligible_for_restore','repeat_infringer_review')
      or uploader_user_id in (select user_id from repeat_uploaders)),
    'repeatInfringerReview',(select count(*) from cases where status = 'repeat_infringer_review'),
    'byStatus',(select jsonb_object_agg(status,(select count(*) from cases where cases.status = statuses.status)) from statuses)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_admin_dmca_case_summary(boolean) from public,anon;
grant execute on function public.get_admin_dmca_case_summary(boolean) to authenticated;

comment on function public.list_admin_reports_page(text,text,integer) is
  'Reviewer-only deterministic created_at/id history, with existing report projection and filter semantics. Legacy timestamp RPC remains compatible.';
comment on function public.list_admin_dmca_cases_page(text,text,text,integer,boolean) is
  'Existing DMCA authority/RLS; immutable created_at/id pagination, source search and exact strike/latest-action aggregates.';

create or replace function public.list_admin_report_audit_events_page(
  p_report_id bigint, p_cursor text default null, p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_report public.safety_reports;
  v_scope jsonb := jsonb_build_object('source','report-audit','reportId',p_report_id::text);
  v_cursor jsonb;
  v_limit integer := greatest(1,least(100,coalesce(p_limit,100)));
  v_result jsonb;
begin
  perform public.admin_reports_assert_reviewer();
  select * into v_report from public.safety_reports where id=p_report_id;
  if v_report.id is null then raise exception 'admin_report_not_found'; end if;
  v_cursor := public.admin_parse_history_cursor(p_cursor,v_scope);
  if v_cursor is not null and (v_cursor->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'invalid_history_cursor' using errcode = '22023';
  end if;
  with candidates as materialized (
    select audit.* from public.platform_admin_audit_logs audit
    where (audit.metadata->>'report_id'=p_report_id::text or
      (audit.target_type=v_report.target_type and audit.target_id=v_report.target_id and audit.action_category='moderation'))
      and (v_cursor is null or (audit.created_at,audit.id)<((v_cursor->>'createdAt')::timestamptz,(v_cursor->>'id')::uuid))
    order by audit.created_at desc,audit.id desc limit v_limit+1
  ), page as materialized (
    select * from candidates order by created_at desc,id desc limit v_limit
  ), boundary as (select * from page order by created_at,id limit 1)
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]'::jsonb),
    'hasMore',(select count(*)>v_limit from candidates),
    'nextCursor',case when (select count(*)>v_limit from candidates) then
      (select jsonb_build_object('v',1,'scope',v_scope,'createdAt',created_at,'id',id::text)::text from boundary)
      else null end
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.list_admin_report_audit_events_page(bigint,text,integer) from public,anon;
grant execute on function public.list_admin_report_audit_events_page(bigint,text,integer) to authenticated;
