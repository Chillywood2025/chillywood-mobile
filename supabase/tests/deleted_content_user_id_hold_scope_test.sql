-- Full migrated disposable PostgreSQL only. No live holds are changed.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select is(private.deleted_content_hold_matches('user_id','abcdef01-0000-4000-8000-000000000001','creator_video','abcdef01-0000-4000-8000-000000000002','abcdef01-0000-4000-8000-000000000001',null,null),true,'user_id holds its exact content owner');
select is(private.deleted_content_hold_matches('user_id','ABCDEF01-0000-4000-8000-000000000001','creator_video','abcdef01-0000-4000-8000-000000000002','abcdef01-0000-4000-8000-000000000001',null,null),true,'UUID casing cannot evade an owner hold');
select is(private.deleted_content_hold_matches('user_id','abcdef01-0000-4000-8000-000000000001',kind,'abcdef01-0000-4000-8000-000000000001','abcdef01-0000-4000-8000-000000000002',null,null),false,kind||' unrelated owner is not held by an ID collision')
from unnest(array['creator_video','social_attachment','platform_brand_asset','profile_post','profile_post_comment','creator_video_comment','chat_message','room_message']) kind;
select is(private.deleted_content_hold_matches('user_id',bad,'creator_video','abcdef01-0000-4000-8000-000000000002','abcdef01-0000-4000-8000-000000000001',null,null),true,'malformed or missing user_id remains fail closed') from unnest(array[null,'','invalid','abcdef01-0000-4000-8000-000000000001x']) bad;
select is(private.deleted_content_hold_matches('user_id','abcdef01-0000-4000-8000-000000000001','creator_video','abcdef01-0000-4000-8000-000000000002',bad,null,null),true,'missing or unknown content owner remains fail closed') from unnest(array[null,'','platform_rachi_official','invalid']) bad;
select is(private.deleted_content_hold_matches(scope,'abcdef01-0000-4000-8000-000000000001','creator_video','abcdef01-0000-4000-8000-000000000002','abcdef01-0000-4000-8000-000000000002',null,null),true,'unknown hold vocabulary remains fail closed') from unnest(array[null,'','USER_ID','future_scope','profile_channel','content_id']) scope;
select is(private.deleted_content_hold_matches('creator_video','parent','creator_video_comment','child','owner','video','parent'),true,'existing parent-content aliases preserved');
select is(private.deleted_content_hold_matches('account','owner','social_attachment','child','owner',null,null),true,'existing account branch preserved');
select ok(not has_function_privilege(role,'private.deleted_content_hold_matches(text,text,text,text,text,text,text)','EXECUTE'),'no new direct matcher access for '||role) from unnest(array['anon','authenticated','service_role']) role;
select ok((select provolatile='i' and not prosecdef and proconfig=array['search_path=""'] from pg_proc where oid='private.deleted_content_hold_matches(text,text,text,text,text,text,text)'::regprocedure),'immutable invoker and empty search path preserved');
select * from finish();
rollback;
