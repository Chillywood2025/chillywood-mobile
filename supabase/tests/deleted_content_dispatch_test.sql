-- Synthetic rollback-only fairness regression; no provider IO.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
set local timezone='America/Denver';
select is(extract(epoch from (timestamptz '2026-10-20 12:00:00 America/Denver'+interval '720 hours')-timestamptz '2026-10-20 12:00:00 America/Denver'),2592000::numeric,'fixed duration crosses Denver DST in exactly 720 hours');
set local timezone='UTC';
update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,text_expiry_enabled=true;
insert into private.deleted_content_work_dispatch(kind,work_id,next_attempt_at)
select 'text',id,now()+interval '1 day' from private.deleted_content_records
on conflict(kind,work_id) do update set next_attempt_at=excluded.next_attempt_at;
do $$ declare n integer; target uuid; begin
 for n in 1..21 loop
  target:=('d8100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  insert into private.deleted_content_records(id,target_type,target_id,author,content,deletion_kind,deleted_at,expires_at)
  values(target,'room_message',target::text,'synthetic-dispatch','{}','hard',now()-interval '31 days',now()-interval '1 day');
  if n<=20 then
   insert into public.legal_holds(target_type,target_id,reason,status)
   values('room_message',target::text,'Synthetic dispatch blocker','active');
  end if;
 end loop;
end $$;
create temporary table first_dispatch as select public.list_deleted_content_expiry_work() value;
select is(jsonb_array_length(value->'deletionIds'),20,'first batch bounded') from first_dispatch;
select is(public.expire_deleted_content_text(id::uuid)->>'status','held','blocked record remains held')
from first_dispatch,jsonb_array_elements_text(value->'deletionIds') id;
select ok(public.list_deleted_content_expiry_work()->'deletionIds' ? 'd8100000-0000-4000-8000-000000000021','second batch reaches twenty-first record');
select is(public.expire_deleted_content_text('d8100000-0000-4000-8000-000000000021')->>'status','purged','eligible record is processed');
select is((select count(*) from private.deleted_content_records where author='synthetic-dispatch'),20::bigint,'all held records preserved');
update private.deleted_content_work_dispatch set next_attempt_at=now()-interval '1 minute' where kind='text';
select ok(jsonb_array_length(public.list_deleted_content_expiry_work()->'deletionIds')>0,'blocked work remains retryable after lease');
select * from finish();
rollback;
