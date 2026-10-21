-- Disabled feature compatibility on native PostgreSQL; rollback-only fixture.
begin isolation level repeatable read;
create extension if not exists pgtap with schema extensions;
select no_plan();
select ok(not (select armed from private.deleted_media_reference_fence),'never-enabled reference fence is unarmed');
select is((select count(*) from private.deleted_media_key_retirements),0::bigint,'no retirement keys exist');
create table public.retirement_inactive_repeatable_read_fixture(id integer primary key,metadata jsonb);
create trigger zzz_deleted_media_reference_guard before insert or update on public.retirement_inactive_repeatable_read_fixture
for each row execute function private.guard_deleted_media_references();
select lives_ok($$insert into public.retirement_inactive_repeatable_read_fixture values(1,'{"unrelated":true}')$$,'disabled repeatable-read insert succeeds');
select lives_ok($$update public.retirement_inactive_repeatable_read_fixture set metadata='{"unrelated":"updated"}' where id=1$$,'disabled repeatable-read update succeeds');
select lives_ok($$insert into public.legal_holds(target_type,target_id,reason,status) values('room_message',gen_random_uuid()::text,'Synthetic inactive preservation','active')$$,'disabled repeatable-read legal hold succeeds');
select lives_ok($$update public.legal_holds set reason='Synthetic inactive preservation updated' where reason='Synthetic inactive preservation'$$,'disabled repeatable-read legal hold update succeeds');
select is((select count(*)::int from pg_trigger where tgrelid='public.legal_holds'::regclass and tgfoid in ('private.guard_platform_brand_retention_hold()'::regprocedure,'private.guard_platform_brand_retention_references()'::regprocedure) and tgenabled in ('O','A')),2,'real metadata-bearing legal hold has both Brand guards');
select is((select count(*)::int from public.legal_holds where reason='Synthetic inactive preservation updated'),1,'unrelated hold UPDATE actually affected its inserted row');
select throws_ok($$insert into public.legal_holds(target_type,target_id,reason,status,metadata) values('room_message',gen_random_uuid()::text,'Unknown metadata counterexample','active','{"unknown":"brand/object.png"}')$$,'25000','brand_retention_read_committed_required','unrelated target cannot bypass generic locator metadata fencing');
select throws_ok($$update public.legal_holds set metadata='{"unknown":true}' where reason='Synthetic inactive preservation updated'$$,'25000','brand_retention_read_committed_required','metadata-bearing UPDATE keeps generic isolation requirement');
select throws_ok($$update public.legal_holds set target_type='account' where reason='Synthetic inactive preservation updated'$$,'25000','brand_retention_read_committed_required','account scope transition stays serialized');
select throws_ok($$update public.legal_holds set target_type='platform_brand_asset' where reason='Synthetic inactive preservation updated'$$,'25000','brand_retention_read_committed_required','Brand scope transition stays serialized');
select throws_ok($$update public.legal_holds set target_type='unknown_scope' where reason='Synthetic inactive preservation updated'$$,'25000','brand_retention_read_committed_required','unknown scope transition stays serialized');
select ok(not exists(select 1 from pg_locks where pid=pg_backend_pid() and locktype='advisory' and classid=176214 and objid=30),'inactive writes acquire no global retirement lock');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='private.deleted_media_reference_fence'::regclass),'private fence forces RLS');
select ok(not has_table_privilege('authenticated','private.deleted_media_reference_fence','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),'consumer has no fence access');
select ok(not has_function_privilege('service_role','private.deleted_media_reference_fence_armed()','EXECUTE'),'service cannot directly call the fence helper');
select * from finish();
rollback;
