-- Real migration helpers; archive fixtures are synthetic and rollback-only.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select ok(not has_function_privilege('authenticated','private.content_inspection_current_source(text,uuid)','EXECUTE'),'current-row helper remains private');
select ok(not has_function_privilege('authenticated','private.read_deleted_content_inspection(text,uuid)','EXECUTE'),'archive source remains private');
insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
values('c3000000-0000-4000-8000-000000000001','inspection-deleted@example.test',now(),false,false);
insert into public.profile_posts(id,user_id,body,visibility,moderation_status,deleted_at)
values
  ('c5000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','Current hidden text','draft','hidden',null),
  ('c5000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000001','Soft-deleted physical bytes','draft','removed',now()),
  ('c5000000-0000-4000-8000-000000000003','c3000000-0000-4000-8000-000000000001','Expired soft-deleted physical bytes','draft','removed',now()-interval '31 days');
select is(private.content_inspection_source('profile_post','c5000000-0000-4000-8000-000000000001')->'content'->>'body','Current hidden text','hidden moderation is not actual deletion');
select ok(private.content_inspection_source('profile_post','c5000000-0000-4000-8000-000000000002') is null,'soft-deleted physical row cannot bypass unavailable archive');
insert into private.deleted_content_records(target_type,target_id,author,owner_protected,content,deletion_kind,deleted_at,expires_at)
values
  ('profile_post','c5000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001',false,'{"body":"Older deleted copy"}','hard',now(),now()+interval '30 days'),
  ('profile_post','c5000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000001',true,'{"body":"Exact deletion snapshot"}','soft',now(),now()+interval '30 days'),
  ('profile_post','c5000000-0000-4000-8000-000000000003','c3000000-0000-4000-8000-000000000001',false,'{"body":"Expired archive bytes"}','soft',now()-interval '31 days',now()-interval '1 day'),
  ('profile_post','c5000000-0000-4000-8000-000000000004','c3000000-0000-4000-8000-000000000001',false,'{"body":"Hard deletion snapshot"}','hard',now(),now()+interval '30 days');
select ok(private.content_inspection_source('profile_post','c5000000-0000-4000-8000-000000000002') is null,'retention default-off does not expose synthetic record');
-- Only this disposable rollback transaction enables its synthetic archive.
update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true;
select is(private.content_inspection_source('profile_post','c5000000-0000-4000-8000-000000000001')->'content'->>'body','Current hidden text','live current row wins over earlier deleted record');
select is(private.content_inspection_source('profile_post','c5000000-0000-4000-8000-000000000002')->'content'->>'body','Exact deletion snapshot','genuine soft deletion uses immutable archive');
select is(private.content_inspection_source('profile_post','c5000000-0000-4000-8000-000000000004')->'content'->>'body','Hard deletion snapshot','absent source can use eligible hard deletion record');
select ok(private.content_inspection_source('profile_post','c5000000-0000-4000-8000-000000000003') is null,'archive expiry never falls through to still-present deleted bytes');
select ok(private.content_inspection_owner_target('profile_post','c5000000-0000-4000-8000-000000000002'),'immutable Owner protection remains without a current Owner role');
select is(private.content_inspection_source('profile_post','c5000000-0000-4000-8000-000000000002')->>'retainedMediaAvailability','unsupported','archive helper never implies original media is playable');
select ok(not (private.content_inspection_source('profile_post','c5000000-0000-4000-8000-000000000002') ?| array['provider','bucket','objectKey','url']),'no archive storage coordinates escape source projection');
select * from finish();
rollback;
