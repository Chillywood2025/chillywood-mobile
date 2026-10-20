-- Full migrated disposable database only; all mutations roll back.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select ok((select not capture_enabled and not media_staging_enabled and not activation_ready from private.deleted_content_retention_settings),'all retention activation flags start disabled');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in
 ('private.deleted_content_records'::regclass,'private.deleted_content_media_stages'::regclass,
  'private.deleted_content_retention_settings'::regclass,'private.deleted_content_retention_events'::regclass)),'retention tables FORCE RLS');
select ok(not has_table_privilege('authenticated','private.deleted_content_records','SELECT'),'no consumer retained text reads');
select ok(not has_table_privilege('service_role','private.deleted_content_retention_events','INSERT'),'no service role audit forgery');
select ok(not has_function_privilege('authenticated','public.stage_deleted_content_media(text,text,text,text,text,uuid)','EXECUTE'),'staging not client callable');
select ok(not has_function_privilege('authenticated','private.read_deleted_content_inspection(text,uuid)','EXECUTE'),'private adapter not client callable');
select is(public.deleted_content_expiry_readiness()->>'physicalDeletionAllowed','false','physical purge fails closed');
select throws_ok($$update private.deleted_content_retention_settings set capture_enabled=true$$,'23514',null,'capture cannot be enabled without explicit readiness');
insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
values('b3000000-0000-4000-8000-000000000001','retention-synthetic@example.test',now(),false,false);
insert into public.profile_posts(id,user_id,body,visibility,moderation_status)
values('b5000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','disabled source','draft','clean');
update public.profile_posts set body='disabled edit' where id='b5000000-0000-4000-8000-000000000001';
select is((select body from public.profile_posts where id='b5000000-0000-4000-8000-000000000001'),'disabled edit','disabled trigger preserves existing updates');
delete from public.profile_posts where id='b5000000-0000-4000-8000-000000000001';
select is((select count(*) from private.deleted_content_records),0::bigint,'disabled deletion captures nothing');
update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true;
insert into public.profile_posts(id,user_id,body,visibility,moderation_status)
values('b5000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000001','original','draft','clean');
update public.profile_posts set body=E'  final <script>inert</script>\n',moderation_status='removed' where id='b5000000-0000-4000-8000-000000000002';
select is((select count(*) from private.deleted_content_records),0::bigint,'edit and reversible moderation create no history');
savepoint deletion_rollback;
delete from public.profile_posts where id='b5000000-0000-4000-8000-000000000002';
rollback to deletion_rollback;
select is((select count(*) from private.deleted_content_records),0::bigint,'deletion transaction rollback removes snapshot and audit');
delete from public.profile_posts where id='b5000000-0000-4000-8000-000000000002';
select is(private.read_deleted_content_inspection('profile_post','b5000000-0000-4000-8000-000000000002')->'content'->>'body',E'  final <script>inert</script>\n','real delete trigger preserves exact final authored body');
select ok((select expires_at=deleted_at+interval '30 days' from private.deleted_content_records where target_id='b5000000-0000-4000-8000-000000000002'),'server clock fixed thirty days');
delete from public.profile_posts where id='b5000000-0000-4000-8000-000000000002';
select is((select count(*) from private.deleted_content_records),1::bigint,'repeated completed delete does not duplicate or extend retention');
select throws_ok($$update private.deleted_content_records set content='{}'$$,'42501','deleted_content_immutable','snapshots immutable');
select is((select count(*) from private.deleted_content_retention_events where operation='capture'),1::bigint,'deletion capture has mutation audit');
insert into public.profile_posts(id,user_id,body,visibility,moderation_status)
values('b5000000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000001','soft source','draft','clean');
update public.profile_posts set deleted_at='2000-01-01',body='soft final' where id='b5000000-0000-4000-8000-000000000003';
select ok((select deleted_at>clock_timestamp()-interval '1 minute' from private.deleted_content_records where target_id='b5000000-0000-4000-8000-000000000003'),'client deletion timestamp cannot backdate retention');
delete from public.profile_posts where id='b5000000-0000-4000-8000-000000000003';
select is((select count(*) from private.deleted_content_records where target_id='b5000000-0000-4000-8000-000000000003'),1::bigint,'soft then hard delete is one event');
insert into private.deleted_content_records(target_type,target_id,author,content,deletion_kind,deleted_at,expires_at)
values('room_message','b5000000-0000-4000-8000-000000000004','synthetic','{}','hard',now()-interval '31 days',now()-interval '1 day');
select ok(private.read_deleted_content_inspection('room_message','b5000000-0000-4000-8000-000000000004') is null,'expiry blocks inspection even while safe physical cleanup is unavailable');
update private.deleted_content_retention_settings set text_expiry_enabled=true;
insert into public.legal_holds(target_type,target_id,reason,status)
values('room_message','b5000000-0000-4000-8000-000000000004','Synthetic legal hold','active');
select is(public.expire_deleted_content_text((select id from private.deleted_content_records where target_id='b5000000-0000-4000-8000-000000000004'))->>'status','held','backed legal hold prevents text purge');
update public.legal_holds set status='released',released_at=clock_timestamp(),release_reason='Synthetic release'
 where target_id='b5000000-0000-4000-8000-000000000004';
select is(public.expire_deleted_content_text((select id from private.deleted_content_records where target_id='b5000000-0000-4000-8000-000000000004'))->>'status','purged','release does not restart expired window');
select throws_ok($$insert into public.legal_holds(target_type,target_id,reason,status) values('room_message','b5000000-0000-4000-8000-000000000004','Synthetic late preservation','active')$$,
 '55000','retention_preservation_unavailable_deletion_already_claimed','hold after irreversible claim never falsely acknowledges preservation');
select * from finish();
rollback;
