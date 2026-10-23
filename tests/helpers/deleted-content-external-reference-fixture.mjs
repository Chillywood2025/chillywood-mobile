import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
export async function externalReferenceFixture(){
 const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('fixture.actor',true),'')::uuid $$;
create function public.whole_app_exact_current_session_authority_internal() returns boolean language sql as $$select nullif(current_setting('fixture.session',true),'')='true'$$;
create table auth.users(id uuid primary key);
create table public.platform_role_memberships(user_id text,role text);
create table public.legal_holds(id uuid primary key default gen_random_uuid(),target_type text,target_id text,status text,placed_by_user_id text,released_by_user_id text);
create table public.profile_posts(id uuid primary key,user_id text,body text,created_at timestamptz default now(),deleted_at timestamptz,updated_at timestamptz);
create table public.profile_post_comments(like public.profile_posts including all);
create table public.creator_video_comments(like public.profile_posts including all);
create table public.chat_messages(id uuid primary key,sender_user_id text,body text,moderation_status text);
create table public.watch_party_room_messages(id uuid primary key,user_id text,text text);
create table public.videos(id uuid primary key,owner_id uuid,title text,description text,storage_provider text,storage_bucket text,storage_object_key text,storage_path text,thumb_storage_path text,playback_url text,thumb_url text,visibility text,scan_status text,updated_at timestamptz,created_at timestamptz,deleted_at timestamptz);
create table public.social_attachments(id uuid primary key,owner_user_id text,surface_type text,surface_id uuid,storage_provider text,storage_bucket text,storage_object_key text,storage_path text,deleted_at timestamptz);
create table public.platform_brand_assets(id uuid primary key,owner_user_id text,deleted_at timestamptz,storage_path text);
create table public.media_upload_reservations(id uuid primary key,surface_type text,storage_provider text,storage_bucket text,storage_object_key text,attached_record_id text,owner_user_id uuid references auth.users on delete cascade,status text,verified_at timestamptz,attached_at timestamptz);
create table public.media_renditions(id uuid default gen_random_uuid(),storage_path text,manifest_path text,public_playback_path text,protected_playback_path text);
create table public.video_renditions(id uuid default gen_random_uuid(),storage_path text,manifest_path text);
create table public.media_scan_jobs(id uuid default gen_random_uuid(),storage_object_key text,status text);
create table public.reference_resolutions(id uuid default gen_random_uuid(),resolved_object_key text);
create table public.json_consumers(id uuid default gen_random_uuid(),metadata jsonb);
create table public.url_consumers(id uuid default gen_random_uuid(),media_url text);
`);

await db.exec(`
alter table media_scan_jobs add column attempt_count integer default 0,add column max_attempts integer default 3,add column target_table text;
alter table videos alter column created_at type timestamp without time zone;
alter table social_attachments add column created_at timestamptz default now();
alter table video_renditions add column video_id uuid, add column owner_id uuid,add column quality_label text,add column storage_bucket text;
alter table media_renditions add column video_id uuid,add column source_type text,add column source_id text;
create table media_transcode_jobs(id uuid,source_type text,source_id text);
create table media_security_audit_events(action text constraint media_security_audit_events_action_check check(action in ('delete_object')));
create schema if not exists private;
create table private.media_object_storage_migration_audit(id bigserial primary key,table_name text,row_id text,source_type text,source_id text,status text,new_storage_provider text,new_storage_bucket text,new_storage_object_key text,row_before jsonb,row_after jsonb,copied_verified_at timestamptz default now());
create function public.has_verified_legacy_media_object_provenance(text,text,text,text,text) returns boolean language sql as $$select true$$;
create function public.revoke_media_object_delivery(text,text,text,text,uuid,text,text,text) returns jsonb language plpgsql as $$begin raise exception 'reservation_path_must_not_be_used';end$$;
`);
for(const file of [
 '20261020141458_deleted_content_retention.sql','20261020141554_deleted_media_reference_retirement.sql',
 '20261020141633_deleted_content_media_expiry.sql','20261020201310_deleted_content_stage_recovery.sql',
 '20261020201322_deleted_content_activation_readiness.sql','20261020201336_deleted_content_delete_intent.sql',
 '20261020201937_deleted_content_terminal_source_cleanup.sql']) {
 try {await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));} catch(e){console.error('migration',file);throw e;}
}
await db.exec(readFileSync('supabase/migrations/20261021134020_deleted_media_legacy_provenance_adapter.sql','utf8'));

 await db.exec(readFileSync('supabase/migrations/20261021134033_supabase_original_copy_receipts.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261023221500_deleted_content_reviewed_external_reference.sql','utf8'));
 return db;
}
